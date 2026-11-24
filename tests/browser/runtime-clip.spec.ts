import { expect, test, type Page } from '@playwright/test';

/**
 * Fractional clip boxes against real layout: for every combination of size, page
 * offset, border, overflow value, direction and zoom, a child that exactly fills
 * its scroller's content area must be reported unclipped, and the same child made
 * half a pixel larger must be reported clipped. Runs with real (classic)
 * scrollbars, which Playwright hides by default in headless mode.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function mount(page: Page, html: string) {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate((markup) => {
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) node.remove();
    document.body.innerHTML = `<style>body { margin: 0; }</style>${markup}`;
  }, html);
}

async function fractions(page: Page): Promise<Record<string, number | null>> {
  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  return Object.fromEntries(capture.nodes.filter((node) => node.semanticKey).map((node) => [node.semanticKey!, node.clip.status === 'known' ? node.clip.value.boxFraction : null]));
}

test('exact fits are unclipped and half-pixel overflows are clipped at fractional sizes and offsets', async ({ page }) => {
  const blocks: string[] = [];
  const offsets = [0, 0.3, 0.5, 0.8];
  for (const width of [100, 100.25, 100.4, 100.5, 100.6, 100.9]) for (const offset of offsets) for (const border of [0, 1, 3]) {
    const id = `${width}|${offset}|${border}`;
    for (const overflow of ['hidden', 'clip', 'auto']) {
      blocks.push(`<div style="margin: ${offset}px 0 0 ${offset}px; width: ${width}px; height: 12.4px; border: ${border}px solid; overflow: ${overflow};"><div data-anwc-key="fit|${overflow}|${id}" style="height: 12.4px;"></div></div>`);
    }
    blocks.push(`<div style="margin: ${offset}px 0 0 ${offset}px; width: ${width}px; height: 12.4px; border: ${border}px solid; overflow: hidden;"><div data-anwc-key="over|${id}" style="width: ${width + 0.5}px; height: 12.4px;"></div></div>`);
  }
  await mount(page, blocks.join(''));
  const result = await fractions(page);
  const fit = Object.entries(result).filter(([key]) => key.startsWith('fit|'));
  const over = Object.entries(result).filter(([key]) => key.startsWith('over|'));
  expect(fit).toHaveLength(216);
  expect(over).toHaveLength(72);
  expect(fit.filter(([, fraction]) => fraction !== 1)).toEqual([]);
  expect(over.filter(([, fraction]) => fraction === null || fraction >= 1)).toEqual([]);
});

test('classic scrollbars are excluded from the clip box on the side they occupy', async ({ page }) => {
  const scroller = (key: string, style: string) => `
    <div data-anwc-key="${key}" style="width: 120.4px; height: 40.4px; border: 3px solid; ${style}">
      <div data-anwc-key="${key}-fit" style="height: 10px;"></div>
      <div data-anwc-key="${key}-under" style="width: calc(100% + 10px); height: 10px;"></div>
      <div style="height: 200px;"></div>
    </div>`;
  await mount(page, [
    scroller('ltr', 'overflow: scroll;'),
    scroller('rtl', 'overflow: scroll; direction: rtl;'),
    scroller('auto', 'overflow-x: hidden; overflow-y: auto;'),
    scroller('gutter', 'overflow: hidden; scrollbar-gutter: stable;'),
    scroller('zoom', 'overflow: scroll; zoom: 1.5;'),
    scroller('offset', 'overflow: scroll; margin: 0.7px 0 0 0.7px;')
  ].join(''));
  // Premise: the scrollbars are real in this browser, so the test cannot pass vacuously.
  const bars = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-anwc-key="ltr"]')!;
    return el.offsetWidth - el.clientWidth - 6;
  });
  expect(bars).toBeGreaterThan(5);
  const result = await fractions(page);
  for (const key of ['ltr', 'rtl', 'auto', 'zoom', 'offset']) {
    expect(result[`${key}-fit`], `${key}: content-area child is unclipped`).toBe(1);
    expect(result[`${key}-under`], `${key}: child reaching under the scrollbar is clipped`).toBeLessThan(1);
  }
  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  const clipOf = (key: string) => {
    const node = capture.nodes.find((candidate) => candidate.semanticKey === `${key}-fit`)!;
    return node.clip.status === 'known' ? node.clip.value.ancestors[0]!.box : null;
  };
  const boxOf = (key: string) => capture.nodes.find((candidate) => candidate.semanticKey === key)!.box!;
  expect(clipOf('ltr')!.x - boxOf('ltr').x).toBeCloseTo(3, 1);
  expect(clipOf('rtl')!.x - boxOf('rtl').x).toBeCloseTo(3 + bars, 1);
});

test('agrees with browser hit testing on where an inner scroller cuts', async ({ page }) => {
  await mount(page, ['overflow: scroll', 'overflow: scroll; direction: rtl', 'overflow: hidden; scrollbar-gutter: stable'].map((style, i) => `
    <div style="margin: 10px; width: 120px; height: 60px; border: 3px solid; ${style};"><div data-anwc-key="s${i}" style="width: 300px; height: 200px;"></div></div>`).join(''));
  const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  for (const key of ['s0', 's1', 's2']) {
    const node = capture.nodes.find((candidate) => candidate.semanticKey === key)!;
    const cut = node.clip.status === 'known' ? node.clip.value.intersection! : null;
    expect(cut, key).not.toBeNull();
    const hits = await page.evaluate(({ selector, c }) => {
      const el = document.querySelector(selector)!;
      // Scrollers are not positioned: Chromium hit-tests children across a positioned scroller's right and bottom borders.
      const on = (x: number, y: number) => document.elementFromPoint(x, y) === el;
      const midY = c!.y + c!.height / 2, midX = c!.x + c!.width / 2;
      return {
        inside: [on(c!.x + 1, midY), on(c!.x + c!.width - 1, midY), on(midX, c!.y + 1), on(midX, c!.y + c!.height - 1)],
        outside: [on(c!.x - 1, midY), on(c!.x + c!.width + 1, midY), on(midX, c!.y - 1), on(midX, c!.y + c!.height + 1)]
      };
    }, { selector: `[data-anwc-key="${key}"]`, c: cut });
    expect(hits, key).toEqual({ inside: [true, true, true, true], outside: [false, false, false, false] });
  }
});
