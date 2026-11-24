import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureScope, envelopeSchema, errorEnvelopeSchema, formatNodeRef, parseNodeRef, type Finding, type Measurement, type Snapshot } from '@anwc/protocol';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import {
  createReport,
  queryReportSummary,
  queryFindingDetail,
  formatAgentSummaryText,
  formatAgentDetailText,
  parseAgentSummary,
  parseAgentFindingDetail,
  resolveNodeRef,
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
      const summaryEnvelope = JSON.parse(jsonOut.join(''));
      expect(envelopeSchema.parse(summaryEnvelope)).toMatchObject({ version: '0.1', ok: true, command: 'report' });
      const parsedSummary = summaryEnvelope.data;
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
      const detailEnvelope = JSON.parse(detailJsonOut.join(''));
      expect(envelopeSchema.parse(detailEnvelope)).toMatchObject({ ok: true, command: 'report' });
      const parsedDetail = detailEnvelope.data;
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

describe('P02 capture-scoped references', () => {
  const snap = makeMultiFindingSnapshot();
  const hash = createReport(snap).input.captureHash;
  const ref = (id: string) => formatNodeRef(hash, id)!;

  async function report(input: unknown, ...args: string[]) {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-p02-'));
    try {
      const file = join(tmp, 'capture.json');
      await writeFile(file, JSON.stringify(input), 'utf8');
      const stdout: string[] = [];
      const exit = await run(['report', file, ...args, '--format', 'json'], { stdout: (m) => stdout.push(m), stderr: () => {} });
      return { exit, json: JSON.parse(stdout.join('')) };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  const refusal = (result: { exit: number; json: unknown }) => ({ exit: result.exit, ...errorEnvelopeSchema.parse(result.json).error });

  test('formats and parses refs; a non-hex stored hash yields no scope', () => {
    expect(ref('n34')).toMatch(/^c_[0-9a-f]{8}:n34$/);
    expect(parseNodeRef(ref('n34'))).toEqual({ scope: captureScope(hash), id: 'n34' });
    for (const bad of ['n34', 'c_12:n34', 'c_1234567G:n34', 'c_12345678:', '']) expect(parseNodeRef(bad), bad).toBeNull();
    expect(formatNodeRef('not-a-hash', 'n34')).toBeNull();
  });

  test('summary and detail carry refs, and every printed ref drills back into the same finding', async () => {
    const summary = queryReportSummary(snap);
    for (const f of summary.findings) {
      expect(f.target.nodeRef).toBe(ref(f.target.nodeId));
      const drilled = await report(snap, '--query', 'detail', '--finding-id', f.findingRef!);
      expect(drilled.json.data.finding.findingId).toBe(f.findingId);
      expect(drilled.json.data.targetNode.nodeRef).toBe(f.target.nodeRef);
    }
    expect(formatAgentSummaryText(summary)).toContain(`--finding-id ${ref('f-overlay')}`);
  });

  test('--node-id selects by ref in summary and detail', async () => {
    const filtered = await report(snap, '--node-id', ref('n-nav-overflow'));
    expect(filtered.json.data.findings.map((f: { findingId: string }) => f.findingId)).toEqual(['f-overflow-nav']);
    const detail = await report(snap, '--query', 'detail', '--node-id', ref('n-nav-overflow'));
    expect(detail.json.data.finding.findingId).toBe('f-overflow-nav');
    // A source site with one instance resolves too.
    expect(resolveNodeRef(snap, ref('s_nav'))).toEqual({ status: 'resolved', id: 'n-nav-overflow' });
  });

  test('a bare node id is INVALID_USAGE, as --node-id and as a finding id', async () => {
    expect(refusal(await report(snap, '--query', 'summary', '--node-id', 'n-nav-overflow'))).toMatchObject({ exit: 2, code: 'INVALID_USAGE', details: { kind: 'UNSCOPED_NODE_ID' }, retry: 'safe' });
    expect(refusal(await report(snap, '--query', 'detail', '--finding-id', 'n-nav-overflow'))).toMatchObject({ exit: 2, code: 'INVALID_USAGE', details: { kind: 'FINDING_NOT_FOUND' } });
    expect(queryFindingDetail(snap, 'n-nav-overflow')).toBeNull();
  });

  test('an unknown node is INVALID_USAGE', async () => {
    expect(refusal(await report(snap, '--query', 'summary', '--node-id', ref('n-nope')))).toMatchObject({ exit: 2, code: 'INVALID_USAGE', details: { kind: 'NODE_NOT_FOUND' } });
  });

  test('a re-capture in which .map() instances swapped ids is CAPTURE_STALE, never a different instance', async () => {
    const before = structuredClone(validSnapshotFixture);
    // After HMR the list reordered: n-card-1 is now the sibling instance, with a finding of the same id.
    const after = structuredClone(validSnapshotFixture);
    const [first, second] = [after.nodes[1]!, after.nodes[2]!];
    [first.semanticKey, second.semanticKey] = [second.semanticKey, first.semanticKey];
    [first.label, second.label] = [second.label, first.label];
    after.captureId = 'capture-after-hmr';
    const target = queryReportSummary(before).findings[0]!;
    expect(target.target.semanticKey).toBe('first');
    expect(queryReportSummary(after).findings[0]!.target.semanticKey).toBe('second');
    expect((await report(before, '--query', 'detail', '--node-id', target.target.nodeRef!)).json.data.targetNode.semanticKey).toBe('first');

    for (const [option, value] of [['--node-id', target.target.nodeRef!], ['--finding-id', target.findingRef!]] as const) {
      for (const input of [after, createReport(after)]) {
        expect(refusal(await report(input, '--query', 'detail', option, value)), option).toMatchObject({
          exit: 1, code: 'CAPTURE_STALE', retry: 'safe', recovery: { strategy: 'recapture', retryable: false, requiresFreshCapture: true },
          details: { kind: 'REF_FROM_OTHER_CAPTURE', refScope: captureScope(createReport(before).input.captureHash), captureScope: captureScope(createReport(after).input.captureHash) }
        });
      }
    }
  });

  test('a ref matching several live instances is AMBIGUOUS_TARGET with candidates', async () => {
    // .map() siblings share a source site.
    const site = refusal(await report(snap, '--query', 'detail', '--node-id', ref('s_card')));
    expect(site).toMatchObject({ exit: 1, code: 'AMBIGUOUS_TARGET', recovery: { strategy: 'disambiguate_target' }, details: { kind: 'REF_MATCHES_MULTIPLE_INSTANCES' } });
    expect((site.details as any).candidates.map((c: any) => [c.ref, c.semanticKey])).toEqual([[ref('n-card-1'), 'first'], [ref('n-card-2'), 'second']]);
    // A saved Snapshot with a duplicated node id (the Snapshot schema does not forbid it).
    const duplicated = { ...snap, nodes: [...snap.nodes, structuredClone(snap.nodes.find((n) => n.nodeId === 'n-nav-overflow')!)] };
    const dupRef = formatNodeRef(createReport(duplicated).input.captureHash, 'n-nav-overflow')!;
    expect(refusal(await report(duplicated, '--query', 'detail', '--node-id', dupRef))).toMatchObject({ code: 'AMBIGUOUS_TARGET' });
  });

  test('a node with several findings is refused with finding candidates', async () => {
    const result = refusal(await report(snap, '--query', 'detail', '--node-id', ref('n-card-clipped')));
    expect(result).toMatchObject({ exit: 1, code: 'AMBIGUOUS_TARGET', details: { kind: 'NODE_HAS_MULTIPLE_FINDINGS' } });
    expect((result.details as any).candidates.map((c: any) => c.ref).sort()).toEqual([ref('f-card-clipped'), ref('f-card-lines')].sort());
  });

  test('old saved captures, reports and query results stay viewable', async () => {
    const expected = queryReportSummary(snap);
    // A Snapshot and a Report carry no ref fields, so pre-P02 files are identical in shape.
    expect((await report(createReport(snap), '--query', 'summary')).json.data.findings[0].findingRef).toBe(expected.findings[0]!.findingRef);
    expect((await report(snap, '--query', 'detail', '--finding-id', 'f-overlay')).exit).toBe(0);
    const strip = (value: unknown): unknown => Array.isArray(value) ? value.map(strip)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'nodeRef' && k !== 'findingRef').map(([k, v]) => [k, strip(v)])) : value;
    expect(parseAgentSummary(strip(expected)).findings).toHaveLength(4);
    expect(parseAgentFindingDetail(strip(queryFindingDetail(snap, 'f-overlay'))).finding.findingId).toBe('f-overlay');
    const foreign = createReport(snap);
    foreign.input.captureHash = 'legacy-hash';
    expect((await report(foreign, '--query', 'summary')).json.data.findings[0]).not.toHaveProperty('findingRef');
  });
});
