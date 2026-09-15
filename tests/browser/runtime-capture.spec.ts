import { expect, test } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';

test('captures repeated sites, source-null nodes, mutations, and bounded coverage without mutation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = `
      <main id="app"><button data-anwc-site="s_card">Add one</button><button data-anwc-site="s_card">Add two</button>
      <div id="overlay">Third party blocker</div><div style="display:none"><button id="hidden">Hidden</button></div>
      <button id="zero" style="width:0;height:0;padding:0;border:0">Zero</button><input value="private-input-value" />
    </main><div id="portal"><button>Portal action</button></div>`;
    window.__ANWC_TEST__!.configureRuntime({
      sourceLookup: (siteId) => siteId === 's_card' ? { siteId, file: 'examples/shop/src/Card.tsx', line: 10, column: 3, tag: 'button' } : null
    });
  });

  const before = await page.evaluate(() => ({ html: document.body.innerHTML, scroll: [window.scrollX, window.scrollY], focused: document.activeElement?.id ?? null }));
  const first = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  const after = await page.evaluate(() => ({ html: document.body.innerHTML, scroll: [window.scrollX, window.scrollY], focused: document.activeElement?.id ?? null }));
  expect(after).toEqual(before);
  expect(first.coverage.complete).toBe(true);
  expect(first.nodes.filter((node) => node.siteId === 's_card')).toHaveLength(2);
  expect(first.nodes.filter((node) => node.siteId === 's_card').map((node) => node.source?.file)).toEqual(['examples/shop/src/Card.tsx', 'examples/shop/src/Card.tsx']);
  expect(first.nodes.find((node) => node.label === 'Third party blocker')?.source).toBeNull();
  expect(first.nodes.find((node) => node.label === 'Hidden')?.render.cssHiddenReasons).toContain('display:none');
  expect(first.nodes.find((node) => node.label === 'Zero')?.box).not.toBeNull();
  expect(first.nodes.find((node) => node.label === 'Portal action')?.parentNodeId).not.toBeNull();
  expect(JSON.stringify(first)).not.toContain('private-input-value');

  await page.evaluate(() => { document.querySelector('#app')!.insertAdjacentHTML('beforeend', '<button data-anwc-site="s_card">Added later</button>'); });
  const second = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  expect(second.nodes.filter((node) => node.siteId === 's_card')).toHaveLength(3);
  expect(second.sessionId).toBe(first.sessionId);
  expect(second.nodes.find((node) => node.label === 'Add one')?.nodeId).toBe(first.nodes.find((node) => node.label === 'Add one')?.nodeId);

  const capped = await page.evaluate(() => window.__ANWC_TEST__!.capture({ maxNodes: 2 }));
  expect(capped.coverage).toMatchObject({ complete: false, inspectedNodes: 2 });

  await page.reload();
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  const afterNavigation = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  expect(afterNavigation.sessionId).not.toBe(first.sessionId);
});

test('uses a target computed visibility while preserving display and opacity ancestry', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = `<main>
      <div style="visibility:hidden"><button data-anwc-key="restored" data-anwc-expect="visible" style="visibility:visible">Restored child</button></div>
      <div><button data-anwc-key="hidden-child" data-anwc-expect="visible" style="visibility:hidden">Hidden child</button></div>
      <div style="display:none"><button data-anwc-key="display-ancestor" data-anwc-expect="visible" style="visibility:visible">Display ancestor</button></div>
      <div style="opacity:0"><button data-anwc-key="opacity-ancestor" data-anwc-expect="visible" style="opacity:1">Opacity ancestor</button></div>
      <button data-anwc-key="visible" data-anwc-expect="visible">Visible control</button>
    </main>`;
  });

  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  const byKey = (key: string) => capture.nodes.find((node) => node.semanticKey === key)!;
  expect(byKey('restored').render.cssHiddenReasons).toEqual([]);
  expect(byKey('hidden-child').render.cssHiddenReasons).toEqual(['visibility:hidden']);
  expect(byKey('display-ancestor').render.cssHiddenReasons).toContain('display:none');
  expect(byKey('opacity-ancestor').render.effectiveOpacityZero).toMatchObject({ status: 'known', value: true });
  expect(byKey('visible').render.cssHiddenReasons).toEqual([]);

  const hiddenFindings = diagnose(capture as Parameters<typeof diagnose>[0]).filter((finding) => finding.code === 'EXPECTED_VISIBLE_BUT_HIDDEN');
  expect(hiddenFindings.map((finding) => finding.nodeId)).toEqual(expect.arrayContaining([byKey('hidden-child').nodeId, byKey('display-ancestor').nodeId, byKey('opacity-ancestor').nodeId]));
  expect(hiddenFindings.map((finding) => finding.nodeId)).not.toContain(byKey('restored').nodeId);
  expect(hiddenFindings.map((finding) => finding.nodeId)).not.toContain(byKey('visible').nodeId);
});

test('waits for stable geometry and reports continuous movement as unsettled', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = '<button id="target">Ready target</button>';
    const target = document.querySelector<HTMLButtonElement>('#target')!;
    requestAnimationFrame(() => requestAnimationFrame(() => { target.style.width = '220px'; }));
  });
  const settled = await page.evaluate(() => window.__ANWC_TEST__!.capture({ timeoutMs: 500 }));
  expect(settled.readiness).toMatchObject({ settled: true, reasons: expect.arrayContaining(['fonts ready', 'geometry stable within 1 CSS px for two successive frames']) });

  const unsettled = await page.evaluate(async () => {
    const target = document.querySelector<HTMLButtonElement>('#target')!;
    let running = true;
    let position = 0;
    const move = () => {
      if (!running) return;
      target.style.transform = `translateX(${position++ * 3}px)`;
      requestAnimationFrame(move);
    };
    requestAnimationFrame(move);
    const capture = await window.__ANWC_TEST__!.capture({ timeoutMs: 90 });
    running = false;
    return capture;
  });
  expect(unsettled.readiness).toMatchObject({
    settled: false,
    reasons: expect.arrayContaining(['fonts ready', 'geometry remained unstable before timeout'])
  });
});
