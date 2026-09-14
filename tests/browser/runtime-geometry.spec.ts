import { expect, test } from '@playwright/test';
import { parseRawCapture } from '../../packages/protocol/src/index.js';

test('records supported rectangular clips and direct-text layout observations', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>
      #nested { width: 120px; height: 44px; overflow: hidden; border: 2px solid black; }
      #wide { width: 240px; height: 32px; }
      #scroll { width: 120px; height: 44px; overflow: auto; border: 2px solid black; }
      #scrolled { width: 240px; height: 32px; }
      #nowrap { width: 90px; overflow: hidden; white-space: nowrap; }
      #wrap { width: 90px; } #wrap span { font-size: 16px; }
      #healthy { width: 280px; }
      #x-axis { width: 100px; height: 40px; overflow-x: clip; overflow-y: visible; }
      #transformed { width: 100px; overflow: hidden; transform: translateX(1px); }
      #positioned { width: 100px; overflow: hidden; position: relative; }
    </style>
    <main>
      <div id="nested"><div id="wide" data-anwc-key="wide">Wide normal-flow box</div></div>
      <div id="scroll"><div id="scrolled" data-anwc-key="scrolled">Scrolled normal-flow box</div></div>
      <div id="nowrap" data-anwc-key="nowrap">A long single line that is deliberately too wide</div>
      <div id="wrap"><span data-anwc-key="wrapped">Several words that wrap over more than one visual line</span></div>
      <p id="healthy" data-anwc-key="healthy">A healthy paragraph has enough space and should not be clipped by its container.</p>
      <div id="x-axis"><div data-anwc-key="x-axis" style="width:200px;height:80px">Axis-specific clip</div></div>
      <div id="transformed"><div data-anwc-key="transformed">Transform limitation</div></div>
      <div id="positioned"><div data-anwc-key="positioned" style="position:absolute;width:200px">Position limitation</div></div>
    </main>`;
    document.querySelector<HTMLElement>('#scroll')!.scrollLeft = 60;
  });

  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  expect(parseRawCapture(capture).nodes).toHaveLength(capture.nodes.length);
  const byKey = (key: string) => capture.nodes.find((node) => node.semanticKey === key)!;
  const wide = byKey('wide');
  const scrolled = byKey('scrolled');
  const nowrap = byKey('nowrap');
  const wrapped = byKey('wrapped');
  const healthy = byKey('healthy');
  const axis = byKey('x-axis');
  const transformed = byKey('transformed');
  const positioned = byKey('positioned');

  expect(wide.clip.status).toBe('known');
  expect(wide.clip.status === 'known' && wide.clip.value.boxFraction).toBeLessThan(1);
  expect(wide.clip.status === 'known' && wide.clip.value.ancestors.length).toBeGreaterThan(0);
  expect(scrolled.clip.status).toBe('known');
  expect(scrolled.clip.status === 'known' && scrolled.clip.value.boxFraction).toBeLessThan(1);
  expect(nowrap.text).toMatchObject({ status: 'known', value: { lineCount: 1 } });
  expect(nowrap.text.status === 'known' && nowrap.text.value.clippedFragmentCount).toBeGreaterThan(0);
  expect(wrapped.text.status === 'known' && wrapped.text.value.lineCount).toBeGreaterThan(1);
  expect(healthy.text).toMatchObject({ status: 'known', value: { clippedFragmentCount: 0 } });
  expect(axis.clip).toMatchObject({ status: 'known', value: { ancestors: [{ axes: 'x' }] } });
  expect(transformed.clip.status).toBe('unknown');
  expect(positioned.clip.status).toBe('unknown');
});
