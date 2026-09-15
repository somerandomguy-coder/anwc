import { expect, test } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { parseRawCapture, parseSnapshot } from '../../packages/protocol/src/index.js';

test('uses browser hit testing for full and partial blockers without claiming paint visibility', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>
      .wrap { position: relative; width: 150px; height: 70px; margin: 8px; }
      button { width: 140px; height: 60px; } .overlay { position: absolute; inset: 0; z-index: 2; }
      #partial { width: 70px; background: rgba(0,0,0,.3); } #none { pointer-events: none; background: black; }
      #nested { position: absolute; inset: 0; z-index: 3; background: black; }
    </style><main>
      <div class="wrap"><button data-anwc-key="all">All blocked</button><div class="overlay" data-anwc-key="opaque">Opaque blocker</div></div>
      <div class="wrap"><button data-anwc-key="transparent">Transparent blocked</button><input class="overlay" aria-label="transparent blocker" style="opacity:0"></div>
      <div class="wrap"><button data-anwc-key="partial">Partially blocked</button><div id="partial" class="overlay"></div></div>
      <div class="wrap"><button data-anwc-key="descendant"><span>Child span target</span></button></div>
      <div class="wrap"><button data-anwc-key="disabled" disabled>Disabled target</button></div>
      <div class="wrap" inert><button data-anwc-key="inert">Inert target</button></div>
      <div class="wrap"><button data-anwc-key="paint-none">Pointer passes through</button><div id="none" class="overlay"></div></div>
      <div class="wrap"><button data-anwc-key="stacked">Nested stack</button><div id="nested"></div></div>
      <div class="wrap"><button data-anwc-key="opacity-zero" data-anwc-expect="interactive" style="opacity:0">Opacity zero</button></div>
    </main>`;
  });

  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  parseRawCapture(capture);
  const byKey = (key: string) => capture.nodes.find((node) => node.semanticKey === key)!;
  const all = byKey('all');
  const transparent = byKey('transparent');
  const partial = byKey('partial');
  const descendant = byKey('descendant');
  const disabled = byKey('disabled');
  const inert = byKey('inert');
  const passthrough = byKey('paint-none');
  const stacked = byKey('stacked');
  const opacityZero = byKey('opacity-zero');

  expect(all.pointer).toMatchObject({ status: 'known', value: { tested: 25, blocked: 25 } });
  expect(transparent.pointer).toMatchObject({ status: 'known', value: { blocked: 25 } });
  expect(partial.pointer.status === 'known' && partial.pointer.value.blocked).toBeGreaterThan(0);
  expect(partial.pointer.status === 'known' && partial.pointer.value.blocked).toBeLessThan(partial.pointer.status === 'known' ? partial.pointer.value.tested : 0);
  expect(descendant.pointer).toMatchObject({ status: 'known', value: { blocked: 0 } });
  expect(disabled.interaction.disabled).toBe(true);
  expect(inert.interaction.inert).toBe(true);
  expect(passthrough.pointer).toMatchObject({ status: 'known', value: { blocked: 0 } });
  expect(stacked.pointer).toMatchObject({ status: 'known', value: { blocked: 25 } });
  expect(opacityZero.render.effectiveOpacityZero).toMatchObject({ status: 'known', value: true });
  expect(passthrough.paintVisibility.status).toBe('unknown');

  const findings = diagnose(capture);
  parseSnapshot({ ...capture, timingsMs: { ...capture.timingsMs, rules: 0 }, findings });
  const codes = findings.map((finding) => `${finding.nodeId}:${finding.code}`);
  expect(codes).toContain(`${all.nodeId}:POINTER_BLOCKED_AT_SAMPLES`);
  expect(codes).toContain(`${partial.nodeId}:POINTER_PARTIALLY_BLOCKED`);
  expect(codes).not.toContain(`${disabled.nodeId}:POINTER_BLOCKED_AT_SAMPLES`);
  expect(codes).not.toContain(`${inert.nodeId}:POINTER_BLOCKED_AT_SAMPLES`);
  expect(codes).toContain(`${opacityZero.nodeId}:EXPECTED_VISIBLE_BUT_HIDDEN`);
});

test('samples only visible target area and honors the per-node cap', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>
      body { margin: 0; min-height: 1200px; } button { position: absolute; height: 60px; }
      #partial { left: -60px; top: 20px; width: 140px; }
      #offscreen { left: 20px; top: 600px; width: 140px; }
      #wide { left: 20px; top: 110px; width: 180px; }
      #narrow { left: 250px; top: 110px; width: 1px; height: 1px; padding: 0; border: 0; overflow: hidden; }
    </style>
    <button id="partial" data-anwc-key="partial-offscreen">Partly visible</button>
    <button id="offscreen" data-anwc-key="offscreen">Out of viewport</button>
    <button id="wide" data-anwc-key="wide">Wide target</button>
    <button id="narrow" data-anwc-key="narrow">Narrow</button>`;
  });

  const one = await page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 1 }));
  const five = await page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 5 }));
  const twentyFive = await page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 25 }));
  const byKey = (capture: typeof one, key: string) => capture.nodes.find((node) => node.semanticKey === key)!;

  expect(byKey(one, 'wide').pointer).toMatchObject({ status: 'known', value: { tested: 1 } });
  expect(byKey(five, 'wide').pointer).toMatchObject({ status: 'known', value: { tested: 5 } });
  expect(byKey(twentyFive, 'wide').pointer).toMatchObject({ status: 'known', value: { tested: 25 } });

  const partial = byKey(twentyFive, 'partial-offscreen');
  expect(partial.pointer.status).toBe('known');
  if (partial.pointer.status === 'known') {
    expect(partial.pointer.value.samples).not.toHaveLength(0);
    for (const sample of partial.pointer.value.samples) {
      expect(sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeLessThan(320);
      expect(sample.y).toBeGreaterThanOrEqual(0);
      expect(sample.y).toBeLessThan(240);
    }
  }

  const offscreen = byKey(twentyFive, 'offscreen');
  expect(offscreen.pointer).toMatchObject({
    status: 'unknown',
    limitations: [expect.stringContaining('no pointer samples')]
  });
  const narrow = byKey(twentyFive, 'narrow');
  expect(narrow.pointer.status).toBe('known');
  if (narrow.pointer.status === 'known') expect(narrow.pointer.value.tested).toBeLessThan(25);

  await expect(page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 0 }))).rejects.toThrow('maxSamplesPerNode must be an integer from 1 to 25');
  await expect(page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 26 }))).rejects.toThrow('maxSamplesPerNode must be an integer from 1 to 25');
  await expect(page.evaluate(() => window.__ANWC_TEST__!.capture({ maxSamplesPerNode: 1.5 }))).rejects.toThrow('maxSamplesPerNode must be an integer from 1 to 25');
});
