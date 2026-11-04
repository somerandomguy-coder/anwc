import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Finding, Measurement, Snapshot } from '@anwc/protocol';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import {
  createReport,
  queryReportSummary,
  queryFindingDetail,
  formatAgentSummaryText,
  formatAgentDetailText,
  parseAgentSummary,
  parseAgentFindingDetail,
  type AgentSummary,
  type AgentFindingDetail
} from '../../packages/report/src/index.js';
import { parseReportArguments, run } from '../../packages/cli/src/index.js';

function makeMultiFindingSnapshot(): Snapshot {
  const base = structuredClone(validSnapshotFixture);

  const overflowNode: Measurement = {
    nodeId: 'n-nav-overflow',
    siteId: 's_nav',
    source: { siteId: 's_nav', file: 'examples/shop/src/Nav.tsx', line: 15, column: 4, tag: 'nav' },
    parentNodeId: 'n-root',
    tag: 'nav',
    semanticKey: 'site-nav',
    role: 'navigation',
    label: 'Main site navigation menu with many categories',
    labelMethod: 'text',
    textTruncated: false,
    box: { x: 0, y: 0, width: 390, height: 48 },
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'fixture', limitations: [] } },
    viewport: { status: 'known', value: { intersection: { x: 0, y: 0, width: 390, height: 48 }, boxFraction: 1 }, method: 'fixture', limitations: [] },
    clip: { status: 'known', value: { intersection: { x: 0, y: 0, width: 390, height: 48 }, boxFraction: 1, ancestors: [] }, method: 'fixture', limitations: [] },
    overflow: { clientWidth: 390, clientHeight: 48, scrollWidth: 520, scrollHeight: 48, scrollableX: true, scrollableY: false },
    text: { status: 'known', value: { lineCount: 1, fragmentRects: [], clippedFragmentCount: 0 }, method: 'fixture', limitations: [] },
    pointer: { status: 'known', value: { samples: [{ x: 50, y: 24, result: 'target-or-descendant', blockerNodeId: null }], tested: 1, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }, method: 'fixture', limitations: [] },
    interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: { status: 'unknown', value: null, method: 'fixture', limitations: ['unsupported'] },
    intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
  };

  const clippedCardNode: Measurement = {
    nodeId: 'n-card-clipped',
    siteId: 's_card_clip',
    source: { siteId: 's_card_clip', file: 'examples/shop/src/Card.tsx', line: 42, column: 8, tag: 'div' },
    parentNodeId: 'n-container',
    tag: 'div',
    semanticKey: 'product-card-3',
    role: 'article',
    label: 'Product card with image and price 日本語ラベル 🛒',
    labelMethod: 'text',
    textTruncated: false,
    box: { x: 20, y: 150, width: 200, height: 180 },
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'fixture', limitations: [] } },
    viewport: { status: 'known', value: { intersection: { x: 20, y: 150, width: 200, height: 180 }, boxFraction: 1 }, method: 'fixture', limitations: [] },
    clip: {
      status: 'known',
      value: {
        intersection: { x: 20, y: 150, width: 140, height: 180 },
        boxFraction: 0.7,
        ancestors: [{ nodeId: 'n-container', axes: 'x', box: { x: 0, y: 100, width: 160, height: 300 } }]
      },
      method: 'fixture',
      limitations: ['normal-flow rectangular clips only']
    },
    overflow: { clientWidth: 200, clientHeight: 180, scrollWidth: 200, scrollHeight: 180, scrollableX: false, scrollableY: false },
    text: { status: 'known', value: { lineCount: 3, fragmentRects: [], clippedFragmentCount: 1 }, method: 'fixture', limitations: [] },
    pointer: { status: 'known', value: { samples: [{ x: 50, y: 180, result: 'target-or-descendant', blockerNodeId: null }], tested: 1, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }, method: 'fixture', limitations: [] },
    interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: { status: 'unknown', value: null, method: 'fixture', limitations: ['unsupported'] },
    intent: { expectedCurrent: null, maxLines: 2, allow: [] }
  };

  const containerNode: Measurement = {
    nodeId: 'n-container',
    siteId: 's_container',
    source: { siteId: 's_container', file: 'examples/shop/src/Container.tsx', line: 10, column: 2, tag: 'section' },
    parentNodeId: 'n-root',
    tag: 'section',
    semanticKey: 'card-grid',
    role: null,
    label: 'Featured products container',
    labelMethod: 'text',
    textTruncated: false,
    box: { x: 0, y: 100, width: 160, height: 300 },
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'fixture', limitations: [] } },
    viewport: { status: 'known', value: { intersection: { x: 0, y: 100, width: 160, height: 300 }, boxFraction: 1 }, method: 'fixture', limitations: [] },
    clip: { status: 'known', value: { intersection: { x: 0, y: 100, width: 160, height: 300 }, boxFraction: 1, ancestors: [] }, method: 'fixture', limitations: [] },
    overflow: { clientWidth: 160, clientHeight: 300, scrollWidth: 160, scrollHeight: 300, scrollableX: false, scrollableY: false },
    text: { status: 'known', value: { lineCount: 0, fragmentRects: [], clippedFragmentCount: 0 }, method: 'fixture', limitations: [] },
    pointer: { status: 'unknown', value: null, method: 'fixture', limitations: ['container'] },
    interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: { status: 'unknown', value: null, method: 'fixture', limitations: ['unsupported'] },
    intent: { expectedCurrent: null, maxLines: null, allow: [] }
  };

  const additionalFindings: Finding[] = [
    {
      findingId: 'f-overflow-nav',
      code: 'HORIZONTAL_OVERFLOW',
      severity: 'error',
      nodeId: 'n-nav-overflow',
      source: overflowNode.source,
      message: 'Navigation element scrolls horizontally beyond its client width.',
      evidence: { kind: 'horizontal-overflow', clientWidth: 390, scrollWidth: 520 },
      relatedNodeIds: [],
      limitations: [],
      acknowledged: false,
      suggestion: 'Inspect container width constraints or declare horizontal scrolling as intentional.'
    },
    {
      findingId: 'f-card-clipped',
      code: 'CLIPPED_BY_ANCESTOR',
      severity: 'warning',
      nodeId: 'n-card-clipped',
      source: clippedCardNode.source,
      message: 'Product card is 30% clipped by ancestor section bounds.',
      evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.7, ancestorNodeIds: ['n-container'] },
      relatedNodeIds: ['n-container'],
      limitations: ['Supports rectangular normal-flow clips only.'],
      acknowledged: false,
      suggestion: 'Inspect clipping ancestor bounds or adjust card dimensions.'
    },
    {
      findingId: 'f-card-lines',
      code: 'TEXT_LINE_BUDGET_EXCEEDED',
      severity: 'warning',
      nodeId: 'n-card-clipped',
      source: clippedCardNode.source,
      message: 'Product card title uses 3 lines but allows at most 2.',
      evidence: { kind: 'text-line-budget-exceeded', observedLines: 3, maxLines: 2 },
      relatedNodeIds: [],
      limitations: ['Line grouping is approximate.'],
      acknowledged: true,
      suggestion: 'Inspect text length or increase maxLines.'
    }
  ];

  return {
    ...base,
    nodes: [...base.nodes, overflowNode, containerNode, clippedCardNode],
    findings: [...base.findings, ...additionalFindings]
  };
}

describe('Q09 Compact Agent Evidence and Drilldown Queries', () => {
  const multiSnap = makeMultiFindingSnapshot();
  const multiReport = createReport(multiSnap);

  test('queryReportSummary returns compact structured summary over Report and Snapshot with deterministic finding IDs', () => {
    const summaryFromSnap = queryReportSummary(multiSnap);
    const summaryFromReport = queryReportSummary(multiReport);

    expect(summaryFromSnap.schemaVersion).toBe('0.1');
    expect(summaryFromReport.schemaVersion).toBe('0.1');
    expect(summaryFromSnap.reportId).toBe(summaryFromReport.reportId);
    expect(summaryFromSnap.captureHash).toBe(summaryFromReport.captureHash);

    // Total findings match
    expect(summaryFromSnap.summary.totalFindings).toBe(4);
    expect(summaryFromSnap.scope.totalFindings).toBe(4);
    expect(summaryFromSnap.scope.matchedFindings).toBe(4);
    expect(summaryFromSnap.scope.excludedFindings).toBe(0);
    expect(summaryFromSnap.scope.isFiltered).toBe(false);

    // Findings are deterministic
    const ids = summaryFromSnap.findings.map((f) => f.findingId);
    expect(ids).toEqual(['f-overflow-nav', 'f-overlay', 'f-card-clipped', 'f-card-lines']);

    // Check finding summary item has essential compact fields
    const fOverlay = summaryFromSnap.findings.find((f) => f.findingId === 'f-overlay')!;
    expect(fOverlay.findingId).toBe('f-overlay');
    expect(fOverlay.code).toBe('POINTER_BLOCKED_AT_SAMPLES');
    expect(fOverlay.severity).toBe('error');
    expect(fOverlay.target.nodeId).toBe('n-card-1');
    expect(fOverlay.target.tag).toBe('button');
    expect(fOverlay.target.label).toBe('Add first');
    expect(fOverlay.target.source).toBe('examples/shop/src/Card.tsx:10:3');
    expect(fOverlay.blockers).toHaveLength(1);
    expect(fOverlay.blockers[0]!.nodeId).toBe('n-overlay');

    // Validates against AgentSummary zod schema
    expect(parseAgentSummary(summaryFromSnap)).toEqual(summaryFromSnap);
  });

  test('scope filters report excluded input count and zero in a filtered view does not report page-wide pass', () => {
    // 1. Filter by specific rule code that matches 1 finding
    const overflowFiltered = queryReportSummary(multiSnap, { code: 'HORIZONTAL_OVERFLOW' });
    expect(overflowFiltered.scope.isFiltered).toBe(true);
    expect(overflowFiltered.scope.totalFindings).toBe(4);
    expect(overflowFiltered.scope.matchedFindings).toBe(1);
    expect(overflowFiltered.scope.excludedFindings).toBe(3);
    expect(overflowFiltered.scope.filterNote).toContain('1 of 4 findings matched filter (3 excluded)');
    expect(overflowFiltered.findings).toHaveLength(1);
    expect(overflowFiltered.findings[0]!.code).toBe('HORIZONTAL_OVERFLOW');

    // 2. Filter by code that matches 0 findings
    const noMatch = queryReportSummary(multiSnap, { code: 'NON_EXISTENT_RULE' });
    expect(noMatch.scope.isFiltered).toBe(true);
    expect(noMatch.scope.totalFindings).toBe(4);
    expect(noMatch.scope.matchedFindings).toBe(0);
    expect(noMatch.scope.excludedFindings).toBe(4);
    expect(noMatch.findings).toHaveLength(0);
    // Explicit filter note: 0 matches does NOT mean page is clean!
    expect(noMatch.scope.filterNote).toContain('0 findings matched the active filter');
    expect(noMatch.scope.filterNote).toContain('this does NOT indicate that the page has zero defects');
    expect(noMatch.scope.filterNote).toContain('total findings in report: 4');

    const formattedNoMatch = formatAgentSummaryText(noMatch);
    expect(formattedNoMatch).toContain('0 findings match the filter');
    expect(formattedNoMatch).toContain('This does NOT mean the page passed inspection');
    expect(formattedNoMatch).toContain('4 total findings exist in capture');

    // 3. Filter by severity
    const errorsOnly = queryReportSummary(multiSnap, { severity: 'error' });
    expect(errorsOnly.scope.matchedFindings).toBe(2);
    expect(errorsOnly.scope.excludedFindings).toBe(2);
    expect(errorsOnly.findings.every((f) => f.severity === 'error')).toBe(true);

    // 4. Filter by source file
    const navFileOnly = queryReportSummary(multiSnap, { file: 'Nav.tsx' });
    expect(navFileOnly.scope.matchedFindings).toBe(1);
    expect(navFileOnly.findings[0]!.target.source).toContain('Nav.tsx');

    // 5. Filter by actionable only (excludes acknowledged)
    const actionable = queryReportSummary(multiSnap, { actionableOnly: true });
    expect(actionable.scope.matchedFindings).toBe(3);
    expect(actionable.findings.every((f) => !f.acknowledged)).toBe(true);
  });

  test('queryFindingDetail reconstructs all repair-relevant evidence, samples, blockers, and ancestors', () => {
    // 1. Pointer blocked finding drilldown
    const pointerDetail = queryFindingDetail(multiSnap, 'f-overlay');
    expect(pointerDetail).not.toBeNull();
    expect(pointerDetail!.schemaVersion).toBe('0.1');
    expect(pointerDetail!.finding.findingId).toBe('f-overlay');
    expect(pointerDetail!.targetNode.nodeId).toBe('n-card-1');
    expect(pointerDetail!.targetNode.source).toEqual({
      siteId: 's_card',
      file: 'examples/shop/src/Card.tsx',
      line: 10,
      column: 3,
      tag: 'button'
    });
    expect(pointerDetail!.targetNode.box).toEqual({ x: 0, y: 0, width: 120, height: 40 });
    expect(pointerDetail!.targetNode.intent?.expectedCurrent).toBe('interactive');
    expect(pointerDetail!.blockers).toHaveLength(1);
    expect(pointerDetail!.blockers[0]!.nodeId).toBe('n-overlay');
    expect(pointerDetail!.repairContext.file).toBe('examples/shop/src/Card.tsx');
    expect(pointerDetail!.repairContext.line).toBe(10);
    expect(pointerDetail!.repairContext.column).toBe(3);
    expect(pointerDetail!.repairContext.componentHint).toBe('Card');
    expect(pointerDetail!.evidenceDetails.kind).toBe('pointer-blocked');

    // Detail validates schema
    expect(parseAgentFindingDetail(pointerDetail)).toEqual(pointerDetail);

    // Formatted detail text contains all repair facts
    const pointerText = formatAgentDetailText(pointerDetail!);
    expect(pointerText).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(pointerText).toContain('examples/shop/src/Card.tsx:10:3');
    expect(pointerText).toContain('n-overlay');
    expect(pointerText).toContain('x:0, y:0, w:120, h:40');

    // 2. Clipping finding drilldown
    const clipDetail = queryFindingDetail(multiSnap, 'f-card-clipped');
    expect(clipDetail).not.toBeNull();
    expect(clipDetail!.evidenceDetails.kind).toBe('clipped-by-ancestor');
    expect(clipDetail!.evidenceDetails.boxFraction).toBe(0.7);
    expect(clipDetail!.evidenceDetails.clippingAncestors).toHaveLength(1);
    expect(clipDetail!.evidenceDetails.clippingAncestors![0]!.node.nodeId).toBe('n-container');
    expect(clipDetail!.evidenceDetails.clippingAncestors![0]!.axes).toBe('x');
    expect(clipDetail!.clipAncestors).toHaveLength(1);

    const clipText = formatAgentDetailText(clipDetail!);
    expect(clipText).toContain('CLIPPED_BY_ANCESTOR');
    expect(clipText).toContain('visible box fraction: 70%');
    expect(clipText).toContain('clip axes: x');
    expect(clipText).toContain('n-container');

    // 3. Overflow finding drilldown
    const overflowDetail = queryFindingDetail(multiSnap, 'f-overflow-nav');
    expect(overflowDetail).not.toBeNull();
    expect(overflowDetail!.evidenceDetails.overflowPx).toEqual({ x: 130, y: 0 });
    const overflowText = formatAgentDetailText(overflowDetail!);
    expect(overflowText).toContain('Overflow: 130px horizontal');

    // 4. Unknown finding returns null
    expect(queryFindingDetail(multiSnap, 'non-existent')).toBeNull();
  });

  test('no output limit causes invalid JSON or wrong totals', () => {
    // With limit: 1
    const limited = queryReportSummary(multiSnap, { limit: 1 });
    expect(limited.findings).toHaveLength(1);
    // Totals remain the true totals, NOT truncated to 1
    expect(limited.summary.totalFindings).toBe(4);
    expect(limited.scope.totalFindings).toBe(4);
    expect(limited.scope.matchedFindings).toBe(4);

    // Serialization and parsing back yields valid JSON and schema
    const jsonStr = JSON.stringify(limited);
    const parsed = JSON.parse(jsonStr);
    expect(parseAgentSummary(parsed)).toEqual(limited);

    // Text formatting bounds
    const maxCharsText = formatAgentSummaryText(limited, { maxChars: 150 });
    expect(maxCharsText.length).toBeLessThanOrEqual(160);
    expect(maxCharsText).toContain('[output truncated by character budget]');
  });

  test('preserves Unicode labels and special characters cleanly', () => {
    const detail = queryFindingDetail(multiSnap, 'f-card-clipped');
    expect(detail).not.toBeNull();
    expect(detail!.targetNode.label).toContain('日本語ラベル 🛒');
    expect(detail!.finding.target.label).toContain('日本語ラベル 🛒');

    const formatted = formatAgentDetailText(detail!);
    expect(formatted).toContain('日本語ラベル 🛒');
  });

  test('operates offline without live app or browser dependency', () => {
    // Pure function call over structured data
    const summary = queryReportSummary(multiReport);
    expect(summary.summary.totalFindings).toBeGreaterThan(0);
    const detail = queryFindingDetail(multiReport, 'f-overlay');
    expect(detail).not.toBeNull();
  });

  test('demonstrates >= 50% character reduction vs full snapshot JSON while retaining 100% of repair facts', () => {
    // Measure full snapshot JSON characters
    const fullSnapshotJson = JSON.stringify(multiSnap);
    const fullSnapshotChars = fullSnapshotJson.length;

    // Measure compact summary JSON characters
    const agentSummary = queryReportSummary(multiSnap);
    const summaryJson = JSON.stringify(agentSummary);
    const summaryChars = summaryJson.length;

    // Measure detail JSON for actionable findings
    const detail1 = queryFindingDetail(multiSnap, 'f-overlay')!;
    const detail2 = queryFindingDetail(multiSnap, 'f-overflow-nav')!;
    const detail3 = queryFindingDetail(multiSnap, 'f-card-clipped')!;

    const combinedChars = summaryChars + JSON.stringify(detail1).length + JSON.stringify(detail2).length + JSON.stringify(detail3).length;

    // Compare summary alone vs full snapshot
    const summaryReductionPct = Math.round((1 - summaryChars / fullSnapshotChars) * 100);
    console.log(`[Q09 Benchmark] Full Snapshot: ${fullSnapshotChars} chars, Agent Summary: ${summaryChars} chars (${summaryReductionPct}% reduction)`);

    // The summary alone must be at least 50% smaller than the full snapshot!
    expect(summaryReductionPct).toBeGreaterThanOrEqual(50);

    // Summary + single target drilldown is also significantly smaller than full snapshot
    const singleDrilldownChars = summaryChars + JSON.stringify(detail1).length;
    const singleWorkflowReductionPct = Math.round((1 - singleDrilldownChars / fullSnapshotChars) * 100);
    console.log(`[Q09 Benchmark] Summary + Target Detail: ${singleDrilldownChars} chars (${singleWorkflowReductionPct}% reduction vs full snapshot)`);
    expect(singleWorkflowReductionPct).toBeGreaterThanOrEqual(30);

    // Verify all repair facts are retained in summary/detail:
    expect(detail1.targetNode.source).not.toBeNull();
    expect(detail1.finding.measuredVsExpected.measured).toBeTruthy();
    expect(detail1.blockers).toHaveLength(1);
    expect(detail1.targetNode.box).not.toBeNull();
    expect(detail1.repairContext.suggestedAction).toBeTruthy();
  });

  test('CLI report command supports query summary and detail modes', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-q09-cli-'));
    try {
      const snapFile = join(tmp, 'capture.json');
      await writeFile(snapFile, JSON.stringify(multiSnap, null, 2), 'utf8');

      // 1. anwc report --query summary --format json
      const jsonOut: string[] = [];
      const jsonIo = { stdout: (m: string) => jsonOut.push(m), stderr: () => {} };
      const code1 = await run(['report', snapFile, '--query', 'summary', '--format', 'json'], jsonIo);
      expect(code1).toBe(0);
      const parsedSummary = JSON.parse(jsonOut.join(''));
      expect(parsedSummary.schemaVersion).toBe('0.1');
      expect(parsedSummary.summary.totalFindings).toBe(4);
      expect(parsedSummary.findings).toHaveLength(4);

      // 2. anwc report --query summary --code HORIZONTAL_OVERFLOW --format text
      const textOut: string[] = [];
      const textIo = { stdout: (m: string) => textOut.push(m), stderr: () => {} };
      const code2 = await run(['report', snapFile, '--query', 'summary', '--code', 'HORIZONTAL_OVERFLOW'], textIo);
      expect(code2).toBe(0);
      const textOutput = textOut.join('');
      expect(textOutput).toContain('HORIZONTAL_OVERFLOW');
      expect(textOutput).toContain('1 of 4 findings matched filter');

      // 3. anwc report --query detail --finding-id f-overlay --format json
      const detailJsonOut: string[] = [];
      const detailJsonIo = { stdout: (m: string) => detailJsonOut.push(m), stderr: () => {} };
      const code3 = await run(['report', snapFile, '--query', 'detail', '--finding-id', 'f-overlay', '--format', 'json'], detailJsonIo);
      expect(code3).toBe(0);
      const parsedDetail = JSON.parse(detailJsonOut.join(''));
      expect(parsedDetail.finding.findingId).toBe('f-overlay');
      expect(parsedDetail.repairContext.file).toBe('examples/shop/src/Card.tsx');

      // 4. anwc report --query detail without finding-id fails with INVALID_USAGE
      const errIo = { stdout: () => {}, stderr: () => {} };
      const code4 = await run(['report', snapFile, '--query', 'detail'], errIo);
      expect(code4).toBe(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
