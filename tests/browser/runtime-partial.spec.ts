import { expect, test, type Page } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { parseRawCapture, parseSnapshot, type RawCapture } from '../../packages/protocol/src/index.js';
import { createReport, formatReportText, renderReportHtml, renderReportMarkdown } from '../../packages/report/src/index.js';

async function mount(page: Page, html: string) {
  await page.goto('/');
  await page.evaluate(async () => { await import('/src/test-runtime.ts'); });
  await page.evaluate((markup) => {
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) node.remove();
    document.body.innerHTML = markup;
  }, html);
}

function expectNotClean(raw: RawCapture) {
  const capture = parseRawCapture(raw);
  const findings = diagnose(capture);
  expect(findings).toEqual([]);
  const report = createReport(parseSnapshot({ ...capture, timingsMs: { ...capture.timingsMs, rules: 0 }, findings }));
  expect(report.summary.status).toBe('incomplete');
  expect(formatReportText(report).split('\n')[0]).toMatch(/PARTIAL CAPTURE|UNSETTLED CAPTURE/);
  for (const output of [renderReportHtml(report), renderReportMarkdown(report)]) {
    expect(output).toContain('not a clean result');
    expect(output).toContain(`Observed ${capture.nodes.length} of ${capture.coverage.discoveredNodes} nodes`);
  }
  return capture;
}

const list = '<main data-anwc-key="main"><section data-anwc-key="first"><p>one</p></section><section data-anwc-key="second"><p>two</p><p>three</p></section></main>';

test('a lowered cap marks the nearest captured ancestor of skipped nodes and is never clean', async ({ page }) => {
  await mount(page, list);
  const full = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  expect(full.coverage).toMatchObject({ complete: true, nodesObserved: full.nodes.length });
  expect(full.nodes.some((node) => 'truncated' in node)).toBe(false);
  expect(full.readiness).not.toHaveProperty('lastObserved');

  for (const maxNodes of [1, 2, 4, full.nodes.length - 1]) {
    const capture = expectNotClean(await page.evaluate((max) => window.__ANWC_TEST__!.capture({ maxNodes: max }), maxNodes));
    expect(capture.coverage).toMatchObject({ complete: false, nodesObserved: maxNodes, inspectedNodes: maxNodes });
    expect(capture.nodes.some((node) => node.truncated)).toBe(true);
  }
  // Cap inside the second section: its children are skipped, the finished first section is untouched.
  const upToSecond = full.nodes.findIndex((node) => node.semanticKey === 'second') + 1;
  const cut = await page.evaluate((max) => window.__ANWC_TEST__!.capture({ maxNodes: max }), upToSecond);
  expect(cut.nodes.filter((node) => node.truncated).map((node) => node.semanticKey)).toEqual(['second']);
});

test('a settle timeout records lastObserved and truncates the moving subtree only', async ({ page }) => {
  await mount(page, `<style>@keyframes slide { to { margin-left: 400px; } } #mover { width: 120px; animation: slide .2s linear infinite alternate; }</style>
    <button id="mover" data-anwc-key="mover"><span data-anwc-key="inner">Moving</span></button><p data-anwc-key="still">Still</p>`);
  const capture = expectNotClean(await page.evaluate(() => window.__ANWC_TEST__!.capture({ timeoutMs: 400 })));
  const mover = capture.nodes.find((node) => node.semanticKey === 'mover')!;
  expect(capture.readiness).toMatchObject({ settled: false, lastObserved: { phase: 'geometry', movingCount: 1, movingNodeIds: [mover.nodeId] } });
  expect(capture.nodes.filter((node) => node.truncated).map((node) => node.semanticKey)).toEqual(['mover', 'inner']);
});

test('a pending font truncates every node because no geometry is final', async ({ page }) => {
  await page.route('**/never.woff2', () => undefined);
  await mount(page, '<p data-anwc-key="text" style="font-family: Never">Text</p>');
  await page.evaluate(() => { const face = new FontFace('Never', 'url(/never.woff2)'); document.fonts.add(face); void face.load().catch(() => undefined); });
  const capture = expectNotClean(await page.evaluate(() => window.__ANWC_TEST__!.capture({ timeoutMs: 200 })));
  expect(capture.readiness.lastObserved).toEqual({ phase: 'fonts', stableFrames: 0, movingCount: 0, movingNodeIds: [] });
  expect(capture.nodes.every((node) => node.truncated)).toBe(true);
});

test('visible frames and open shadow roots cut coverage; hidden frames and empty roots do not', async ({ page }) => {
  await mount(page, '<iframe data-anwc-key="shown" srcdoc="<p>x</p>" width="200" height="60"></iframe>');
  const framed = expectNotClean(await page.evaluate(() => window.__ANWC_TEST__!.capture()));
  expect(framed.coverage).toMatchObject({ complete: false, skippedNodes: 0, reasons: ['embedded frame content is not inspected'] });
  expect(framed.nodes.filter((node) => node.truncated).map((node) => node.semanticKey)).toEqual(['shown']);

  await mount(page, '<iframe srcdoc="<p>x</p>" style="display:none"></iframe><div id="empty"></div>');
  await page.evaluate(() => { document.getElementById('empty')!.attachShadow({ mode: 'open' }); });
  const hidden = await page.evaluate(() => window.__ANWC_TEST__!.capture());
  expect(hidden.coverage).toMatchObject({ complete: true, reasons: [] });

  await mount(page, '<div id="host" data-anwc-key="host"></div>');
  await page.evaluate(() => { document.getElementById('host')!.attachShadow({ mode: 'open' }).innerHTML = '<p>shadow</p>'; });
  const shadow = expectNotClean(await page.evaluate(() => window.__ANWC_TEST__!.capture()));
  expect(shadow.coverage.reasons).toEqual(['open shadow root content is not inspected']);
  expect(shadow.nodes.filter((node) => node.truncated).map((node) => node.semanticKey)).toEqual(['host']);
});
