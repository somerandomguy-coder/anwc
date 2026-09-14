import { expect, test } from '@playwright/test';

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
