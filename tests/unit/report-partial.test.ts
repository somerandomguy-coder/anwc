import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../../packages/protocol/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { createReport, formatReportText, parseReport, renderReportHtml, renderReportMarkdown } from '../../packages/report/src/index.js';

const base: Snapshot = { ...validSnapshotFixture, findings: [] };
const capped: Snapshot = {
  ...base,
  coverage: { ...base.coverage, complete: false, discoveredNodes: 9, inspectedNodes: 4, skippedNodes: 5, nodesObserved: 4, reasons: ['max node cap reached'] },
  nodes: base.nodes.map((node, index) => index === 0 ? { ...node, truncated: true as const } : node)
};
const unsettled: Snapshot = {
  ...base,
  readiness: { settled: false, waitMs: 300, reasons: ['fonts ready', 'geometry remained unstable before timeout'], lastObserved: { phase: 'geometry', stableFrames: 0, movingCount: 1, movingNodeIds: ['n-card-1'] } }
};
const savedBeforeP05: Snapshot = {
  ...base,
  coverage: { ...base.coverage, complete: false, discoveredNodes: 9, inspectedNodes: 4, skippedNodes: 5, reasons: ['max node cap reached'] }
};

describe('P05: a zero-finding partial capture is never rendered as clean', () => {
  const clean = createReport(base);

  test.each([['capped', capped], ['unsettled', unsettled], ['saved before P05', savedBeforeP05]])('%s', (_, snapshot) => {
    const report = createReport(snapshot);
    expect(report.summary).toMatchObject({ totalFindings: 0, status: 'incomplete' });
    expect(parseReport(JSON.parse(JSON.stringify(report)))).toEqual(report);

    const text = formatReportText(report);
    expect(text.split('\n')[0]).toMatch(/PARTIAL CAPTURE|UNSETTLED CAPTURE/);
    expect(text.split('\n')[0]).toMatch(/observed 4 of [49] nodes/);

    const html = renderReportHtml(report);
    const header = html.slice(html.indexOf('<header class="report-top">'), html.indexOf('</header>'));
    expect(header).toContain('Incomplete or Unsettled Capture');
    expect(header).toMatch(/Observed 4 of [49] nodes/);
    for (const rendered of [html, renderReportMarkdown(report)]) {
      expect(rendered).not.toContain('No findings recorded.');
      expect(rendered).toContain('not a clean result');
      expect(rendered).toMatch(/Observed 4 of [49] nodes/);
    }
  });

  test.each([80, 100, 150, 400])('the partial marker survives --max-chars %i', (maxChars) => {
    for (const snapshot of [capped, unsettled]) expect(formatReportText(createReport(snapshot), { maxChars })).toMatch(/PARTIAL CAPTURE|UNSETTLED CAPTURE/);
    const withFinding = createReport({ ...capped, findings: validSnapshotFixture.findings });
    expect(formatReportText(withFinding, { maxChars })).toContain('PARTIAL CAPTURE');
  });

  test('headers name the truncated count and the last observation', () => {
    expect(formatReportText(createReport(capped))).toContain('observed 4 of 9 nodes, 1 truncated');
    const text = formatReportText(createReport(unsettled));
    expect(text).toContain('last observed: waiting for geometry, 1 moving element(s) [n-card-1]');
    expect(renderReportHtml(createReport(unsettled))).toContain('Last observed: waiting for geometry');
    expect(renderReportMarkdown(createReport(unsettled))).toContain('Last observed: waiting for geometry');
  });

  test('a complete, settled capture carries no partial wording (control)', () => {
    const rendered = [formatReportText(clean), renderReportHtml(clean), renderReportMarkdown(clean)];
    for (const output of rendered) expect(output).not.toMatch(/PARTIAL CAPTURE|UNSETTLED CAPTURE|not a clean result|Observed \d/);
    expect(rendered[1]).toContain('No findings recorded.');
  });
});
