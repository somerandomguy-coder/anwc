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
      <div class="wrap"><button data-anwc-key="transparent">Transparent blocked</button><div class="overlay" style="background:transparent"></div></div>
      <div class="wrap"><button data-anwc-key="partial">Partially blocked</button><div id="partial" class="overlay"></div></div>
      <div class="wrap"><button data-anwc-key="descendant"><span>Child span target</span></button></div>
      <div class="wrap"><button data-anwc-key="disabled" disabled>Disabled target</button></div>
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
  const passthrough = byKey('paint-none');
  const stacked = byKey('stacked');
  const opacityZero = byKey('opacity-zero');

  expect(all.pointer).toMatchObject({ status: 'known', value: { tested: 25, blocked: 25 } });
  expect(transparent.pointer).toMatchObject({ status: 'known', value: { blocked: 25 } });
  expect(partial.pointer.status === 'known' && partial.pointer.value.blocked).toBeGreaterThan(0);
  expect(partial.pointer.status === 'known' && partial.pointer.value.blocked).toBeLessThan(partial.pointer.status === 'known' ? partial.pointer.value.tested : 0);
  expect(descendant.pointer).toMatchObject({ status: 'known', value: { blocked: 0 } });
  expect(disabled.interaction.disabled).toBe(true);
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
  expect(codes).toContain(`${opacityZero.nodeId}:EXPECTED_VISIBLE_BUT_HIDDEN`);
});
