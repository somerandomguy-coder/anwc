import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { envelopeOf, errorEnvelopeSchema, snapshotSchema } from '@anwc/protocol';
import type { Finding, Measurement, Snapshot, SourceRef } from '@anwc/protocol';
import {
  compareRepairs,
  createReport,
  DiffInputError,
  findingVerdictsFromDiff,
  formatDiffText,
  listFindingVerdicts,
  parseDiffInput,
  renderDiffHtml,
  renderDiffMarkdown,
  diffReportSchema,
  VERDICT_BY_REASON,
  VERDICT_REASONS,
  VERDICT_REASON_TEXT,
  type BehaviorEvidence,
  type VerdictReason
} from '../../packages/report/src/index.js';
import { parseDiffArguments, run } from '../../packages/cli/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

// ---------------------------------------------------------------------------
// Schema-valid protocol fixtures. Every snapshot built here is parsed with the
// published Snapshot schema, so tests cannot pass on shapes the CLI would reject.
// ---------------------------------------------------------------------------

const known = <T>(value: T) => ({ status: 'known' as const, value, method: 'fixture', limitations: [] as string[] });
const unknown = (limitations: string[]) => ({ status: 'unknown' as const, value: null, method: 'fixture', limitations });
const checkoutBox = { x: 10, y: 10, width: 120, height: 40 };
const checkoutSource: SourceRef = { siteId: 's1', file: 'src/main.tsx', line: 45, column: 12, tag: 'button' };

function node(overrides: Partial<Measurement> & Pick<Measurement, 'nodeId'>): Measurement {
  const box = overrides.box ?? checkoutBox;
  return {
    siteId: overrides.source?.siteId ?? null,
    source: null,
    parentNodeId: 'n-root',
    tag: 'div',
    semanticKey: null,
    role: null,
    label: '',
    labelMethod: 'none',
    textTruncated: false,
    box,
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: known(false) },
    viewport: known({ intersection: box, boxFraction: 1 }),
    clip: known({ intersection: box, boxFraction: 1, ancestors: [] }),
    overflow: { clientWidth: 120, clientHeight: 40, scrollWidth: 120, scrollHeight: 40, scrollableX: false, scrollableY: false },
    text: known({ lineCount: 1, fragmentRects: [box], clippedFragmentCount: 0 }),
    pointer: unknown(['not interactive']),
    interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: unknown(['paint visibility is unsupported in v0']),
    intent: { expectedCurrent: null, maxLines: null, allow: [] },
    ...overrides
  };
}

function pointer(blockerNodeId: string | null) {
  const result = blockerNodeId ? ('blocked' as const) : ('target-or-descendant' as const);
  return known({
    samples: [{ x: 70, y: 30, result, blockerNodeId }],
    tested: 1,
    blocked: blockerNodeId ? 1 : 0,
    noTarget: 0,
    blockedSampleFraction: blockerNodeId ? 1 : 0
  });
}

const rootNode = node({ nodeId: 'n-root', parentNodeId: null, tag: 'main', label: 'Shop', labelMethod: 'text' });
const cookieNode = node({ nodeId: 'n2', tag: 'aside', label: 'Cookie notice', labelMethod: 'text', semanticKey: 'cookie-notice' });

function checkoutNode(overrides: Partial<Measurement> = {}, blockerNodeId: string | null = 'n2'): Measurement {
  return node({
    nodeId: 'n1',
    siteId: checkoutSource.siteId,
    source: checkoutSource,
    tag: 'button',
    semanticKey: 'checkout-action',
    role: 'button',
    label: 'Checkout now',
    labelMethod: 'text',
    pointer: pointer(blockerNodeId),
    interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
    intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] },
    ...overrides
  });
}

function blockedFinding(target: Measurement, overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: `f_${target.nodeId}_blocked`,
    code: 'POINTER_BLOCKED_AT_SAMPLES',
    severity: 'error',
    nodeId: target.nodeId,
    source: target.source,
    message: `${target.label} has 1/1 pointer samples blocked.`,
    evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: ['n2'] },
    relatedNodeIds: ['n2'],
    limitations: ['Sampling is not pixel coverage.'],
    acknowledged: false,
    suggestion: 'Inspect blocking element.',
    ...overrides
  };
}

interface SnapshotOverrides {
  nodes?: Measurement[];
  findings?: Finding[];
  page?: Partial<Snapshot['page']>;
  coverage?: Partial<Snapshot['coverage']>;
  readiness?: Partial<Snapshot['readiness']>;
}

/** Builds a schema-valid snapshot. Default: checkout button blocked by the cookie notice. */
function snapshot(overrides: SnapshotOverrides = {}): Snapshot {
  const base = structuredClone(validSnapshotFixture);
  const checkout = checkoutNode();
  const nodes = overrides.nodes ?? [rootNode, checkout, cookieNode];
  const result: Snapshot = {
    ...base,
    page: { ...base.page, ...overrides.page },
    readiness: { ...base.readiness, ...overrides.readiness },
    coverage: {
      ...base.coverage,
      discoveredNodes: nodes.length,
      inspectedNodes: nodes.length,
      skippedNodes: 0,
      ...overrides.coverage
    },
    nodes: structuredClone(nodes),
    findings: structuredClone(overrides.findings ?? [blockedFinding(checkout)])
  };
  return snapshotSchema.parse(result);
}

/** The same page after a CSS repair: checkout retained and no longer blocked. */
function repaired(overrides: SnapshotOverrides = {}): Snapshot {
  return snapshot({ nodes: [rootNode, checkoutNode({}, null), cookieNode], findings: [], ...overrides });
}

describe('Q07 Pure Diff Module and Repair Comparison', () => {
  test('matches CSS fix by author key and marks verified-fixed', () => {
    const diff = compareRepairs(snapshot(), repaired(), { behaviorCheckPassed: true });
    diffReportSchema.parse(diff);

    expect(diff.compatibility.comparable).toBe(true);
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.summary.persistent).toBe(0);
    expect(diff.summary.newFindings).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('verified-repair');

    const fComp = diff.findings[0]!;
    expect(fComp.status).toBe('verified-fixed');
    expect(fComp.targetKey).toBe('key:checkout-action');
    expect(fComp.targetRetained).toBe(true);
  });

  test('matches across source line shift via author key or module identity', () => {
    const after = repaired({
      nodes: [
        rootNode,
        // session node ID changed across reloads and the source line shifted
        checkoutNode({ nodeId: 'n100', source: { ...checkoutSource, line: 95 } }, null),
        cookieNode
      ]
    });

    const diff = compareRepairs(snapshot(), after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.findings[0]!.status).toBe('verified-fixed');
    expect(diff.targetMatches[0]!.strategy).toBe('author-key');
    expect(diff.targetMatches[0]!.confidence).toBe('definite');
  });

  test('matches keyed list items across reordering without line-number assumption', () => {
    const container = node({ nodeId: 'c1', tag: 'ul', label: 'Items' });
    const item = (nodeId: string, key: string, label: string) =>
      node({ nodeId, parentNodeId: 'c1', tag: 'li', semanticKey: key, label, labelMethod: 'text', source: { ...checkoutSource, siteId: 's_item', tag: 'li' }, siteId: 's_item' });
    const nodeA = item('nA', 'item-alpha', 'Alpha item');
    const nodeB = item('nB', 'item-beta', 'Beta item');

    const before = snapshot({
      nodes: [rootNode, container, nodeA, nodeB],
      findings: [
        {
          findingId: 'f_beta_clipped',
          code: 'CONTENT_CLIPPED_BY_ANCESTOR',
          severity: 'error',
          nodeId: 'nB',
          source: nodeB.source,
          message: 'Beta item clipped',
          evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: ['c1'] },
          relatedNodeIds: ['c1'],
          limitations: [],
          acknowledged: false,
          suggestion: 'Fix ancestor overflow'
        }
      ]
    });

    // In after: items are reversed and the finding is resolved
    const after = snapshot({
      nodes: [rootNode, container, { ...nodeB, nodeId: 'nB_new' }, { ...nodeA, nodeId: 'nA_new' }],
      findings: []
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.findings[0]!.targetKey).toBe('key:item-beta');
    expect(diff.findings[0]!.status).toBe('verified-fixed');
  });

  test.each([undefined, false])('does not certify disappeared findings without passing behavior evidence (%s)', (behaviorCheckPassed) => {
    const diff = compareRepairs(snapshot(), repaired(), { behaviorCheckPassed });
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');
    expect(diff.findings[0]!.explanation).toMatch(/behavior/);
  });

  test.each(['url', 'scenario', 'runtime', 'scale'])('rejects mismatched capture context: %s', (field) => {
    const before = snapshot();
    const after = repaired();
    if (field === 'url') after.page.url = `${before.page.url}?healthy=1`;
    if (field === 'scenario') after.page.scenario = 'different-state';
    if (field === 'runtime') after.environment.runtimeVersion = 'different-runtime';
    if (field === 'scale') after.page.visualViewportScale = 2;
    snapshotSchema.parse(after);
    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.compatibility.comparable).toBe(false);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('incompatible-comparison');
  });

  test('does not certify a repair from an empty or incomplete baseline', () => {
    const empty = repaired();
    const emptyDiff = compareRepairs(empty, empty, { behaviorCheckPassed: true });
    expect(emptyDiff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');
    expect(emptyDiff.summary.verdictReason).toMatch(/no repair to verify/);
    expect(formatDiffText(emptyDiff)).toContain('no repair to verify');
    const before = snapshot({ coverage: { complete: false } });
    expect(compareRepairs(before, empty, { behaviorCheckPassed: true }).summary.verifiedFixed).toBe(0);
  });

  test('does not certify an unsettled capture or a heuristic target match', () => {
    const before = snapshot();
    const after = repaired({ readiness: { settled: false } });
    expect(compareRepairs(before, after, { behaviorCheckPassed: true }).summary.verifiedFixed).toBe(0);

    const unkeyedBefore = snapshot({ nodes: [rootNode, checkoutNode({ semanticKey: null }), cookieNode] });
    const unkeyedAfter = repaired({ nodes: [rootNode, checkoutNode({ semanticKey: null }, null), cookieNode] });
    const diff = compareRepairs(unkeyedBefore, unkeyedAfter, { behaviorCheckPassed: true });
    expect(diff.targetMatches[0]!.confidence).toBe('heuristic');
    expect(diff.summary.verifiedFixed).toBe(0);
  });

  test('refuses to certify repair if target was deleted or unmounted (deletion cannot masquerade as fix)', () => {
    // In after: finding is gone because the checkout button was DELETED from the DOM
    const after = snapshot({ nodes: [rootNode, cookieNode], findings: [] });

    const diff = compareRepairs(snapshot(), after);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');

    const fComp = diff.findings[0]!;
    expect(fComp.status).toBe('inconclusive');
    expect(fComp.targetRetained).toBe(false);
    expect(fComp.explanation).toContain('removed or unmounted');
  });

  test('reports ambiguous when duplicate author keys exist', () => {
    const dupA = checkoutNode({ semanticKey: 'duplicate-key' });
    const dupB = checkoutNode({ nodeId: 'n3', semanticKey: 'duplicate-key' });
    const before = snapshot({ nodes: [rootNode, dupA, dupB, cookieNode], findings: [blockedFinding(dupA)] });
    const after = snapshot({
      nodes: [rootNode, { ...dupA, nodeId: 'n1_new' }, { ...dupB, nodeId: 'n3_new' }, cookieNode],
      findings: []
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.targetMatches[0]!.strategy).toBe('ambiguous');
    // The duplicate key, not a deletion, is the reason: both elements are still present.
    const explanation = diff.findings[0]!.explanation;
    expect(explanation).toMatch(/ambiguous/i);
    expect(explanation).toContain("Duplicate author key 'duplicate-key' observed (2 before, 2 after)");
    expect(explanation).not.toMatch(/removed or unmounted/);
  });

  test('reports incompatible comparison when viewports differ', () => {
    const before = snapshot({ page: { viewport: { width: 1440, height: 900 } } });
    const after = repaired({ page: { viewport: { width: 390, height: 844 } } });

    const diff = compareRepairs(before, after);
    expect(diff.compatibility.comparable).toBe(false);
    expect(diff.compatibility.viewportMatch).toBe(false);
    expect(diff.summary.repairIntegrityVerdict).toBe('incompatible-comparison');
    expect(diff.findings[0]!.status).toBe('non-comparable');
  });

  test('reports inconclusive when after capture has incomplete coverage', () => {
    const after = repaired({
      coverage: { complete: false, discoveredNodes: 50, inspectedNodes: 20, skippedNodes: 30, reasons: ['DOM sample capped'] }
    });

    const diff = compareRepairs(snapshot(), after);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.findings[0]!.status).toBe('inconclusive');
    expect(diff.findings[0]!.explanation).toContain('incomplete DOM/sampling coverage');
  });

  test('detects regressions when new findings are introduced in after capture', () => {
    const banner = node({ nodeId: 'nNew', semanticKey: 'new-target', label: 'Broken banner', labelMethod: 'text' });
    const after = repaired({
      nodes: [rootNode, checkoutNode({}, null), cookieNode, banner],
      findings: [
        {
          findingId: 'f_new_defect',
          code: 'HORIZONTAL_OVERFLOW_DETECTED',
          severity: 'error',
          nodeId: 'nNew',
          source: null,
          message: 'Broken banner overflows horizontally',
          evidence: { kind: 'horizontal-overflow', clientWidth: 1440, scrollWidth: 1600 },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: 'Fix width'
        }
      ]
    });

    const diff = compareRepairs(snapshot(), after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.summary.newFindings).toBe(1);
    expect(diff.summary.repairIntegrityVerdict).toBe('regressions-introduced');
  });

  test('renders offline HTML, compact Markdown, and formatted Text', () => {
    const diff = compareRepairs(snapshot(), repaired(), { behaviorCheckPassed: true });

    const html = renderDiffHtml(diff);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('ANWC Repair Comparison');
    expect(html).toContain('Verified Fixed');
    expect(html).not.toContain('https://'); // Fully offline!

    const md = renderDiffMarkdown(diff);
    expect(md).toContain('# ANWC Repair Diff: **Verified Repair**');
    expect(md).toContain('| Verified Fixed | 1 |');

    const text = formatDiffText(diff);
    expect(text).toContain('ANWC Repair Comparison:');
    expect(text).toContain('Verdict: VERIFIED-REPAIR');
    expect(text).toContain('[FIXED]');
  });

  test('CLI parses diff arguments and executes anwc diff command', async () => {
    expect(parseDiffArguments(['diff', 'b.json', 'a.json', '--format', 'markdown', '--output', 'out.md'])).toEqual({
      beforeFile: 'b.json',
      afterFile: 'a.json',
      format: 'markdown',
      output: 'out.md'
    });

    expect(() => parseDiffArguments(['diff', 'b.json'])).toThrow('Usage: anwc diff');

    const tmp = await mkdtemp(join(tmpdir(), 'anwc-cli-diff-'));
    try {
      const bPath = join(tmp, 'before.json');
      const aPath = join(tmp, 'after.json');
      const outHtml = join(tmp, 'diff.html');

      await writeFile(bPath, JSON.stringify(snapshot()), 'utf8');
      await writeFile(aPath, JSON.stringify(repaired()), 'utf8');

      const stdout: string[] = [];
      const stderr: string[] = [];
      const io = { stdout: (m: string) => stdout.push(m), stderr: (m: string) => stderr.push(m) };

      const exit = await run(['diff', bPath, aPath, '--format', 'html', '--output', outHtml], io);
      // CLI snapshots carry no independent behavior assertion result.
      expect(exit).toBe(1);
      expect(stderr).toEqual([]);

      const savedHtml = await readFile(outHtml, 'utf8');
      expect(savedHtml).toContain('ANWC Repair Comparison');
      expect(savedHtml).toContain('Inconclusive');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('L2 diff input validation and honest explanations', () => {
  // The pre-L2 hand-written mock shape: parentId/computedStyle/ancestorClip are not protocol fields.
  const legacyMock = {
    ...structuredClone(validSnapshotFixture),
    nodes: [{ nodeId: 'n1', parentId: null, tag: 'button', label: 'Checkout now', semanticKey: 'checkout-action', computedStyle: { display: 'block' } }],
    findings: []
  };
  const { findings: _omit, ...rawCaptureLike } = structuredClone(validSnapshotFixture);

  async function runDiff(before: unknown, after: unknown, format: 'text' | 'json') {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-cli-diff-invalid-'));
    try {
      const bPath = join(tmp, 'before.json');
      const aPath = join(tmp, 'after.json');
      await writeFile(bPath, JSON.stringify(before), 'utf8');
      await writeFile(aPath, JSON.stringify(after), 'utf8');
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exit = await run(['diff', bPath, aPath, '--format', format], { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) });
      return { exit, stdout: stdout.join(''), stderr: stderr.join('') };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  test.each([
    ['legacy hand-written mock', legacyMock],
    ['raw capture without findings', rawCaptureLike],
    ['JSON array', []],
    ['JSON null', null],
    ['report missing groups', { ...createReport(validSnapshotFixture), groups: undefined }]
  ])('CLI rejects malformed before input (%s) with INVALID_USAGE exit 2', async (_label, malformed) => {
    const result = await runDiff(malformed, snapshot(), 'text');
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^ANWC INVALID_USAGE: Before capture file '.*before\.json' does not match Snapshot 0\.1 or Report 0\.1 schema\./);
  });

  test('CLI reports a stable JSON error envelope for malformed after input', async () => {
    const result = await runDiff(snapshot(), legacyMock, 'json');
    expect(result.exit).toBe(2);
    const envelope = errorEnvelopeSchema.parse(JSON.parse(result.stdout));
    expect(envelope).toMatchObject({ version: '0.1', ok: false, command: 'diff' });
    expect(envelope.error.code).toBe('INVALID_USAGE');
    expect(envelope.error.retry).toBe('safe');
    expect(envelope.error.message).toMatch(/^After capture file '.*after\.json' does not match Snapshot 0\.1 or Report 0\.1 schema\./);
    const details = envelope.error.details as { kind: string; issues: string[] };
    expect(details.kind).toBe('INPUT_SCHEMA_MISMATCH');
    expect(details.issues.length).toBeGreaterThan(0);
    expect(envelope.error.recovery?.hint).toContain('anwc inspect');
  });

  test('CLI accepts schema-valid Report inputs and never verifies without behavior evidence', async () => {
    const result = await runDiff(createReport(snapshot()), createReport(repaired()), 'json');
    expect(result.exit).toBe(1);
    const envelope = envelopeOf(diffReportSchema).parse(JSON.parse(result.stdout));
    if (!envelope.ok) throw new Error(`diff failed: ${envelope.error.code}`);
    const diff = diffReportSchema.parse(envelope.data);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');
    // Reports omit healthy nodes: absence from the after report is not proof of deletion.
    expect(diff.findings[0]!.explanation).toMatch(/retention is unknown/);
    expect(diff.findings[0]!.explanation).not.toMatch(/removed or unmounted/);
  });

  test('pure API rejects malformed input instead of coercing it', () => {
    expect(() => parseDiffInput(legacyMock)).toThrow(DiffInputError);
    expect(() => compareRepairs(legacyMock as unknown as Snapshot, snapshot())).toThrow(DiffInputError);
    expect(parseDiffInput(snapshot()).kind).toBe('snapshot');
    expect(parseDiffInput(createReport(snapshot())).kind).toBe('report');
  });

  test('new findings across incompatible pages are not described as regressions', () => {
    const banner = node({ nodeId: 'nNew', semanticKey: 'other-page-banner', label: 'Other page banner', labelMethod: 'text' });
    const after = snapshot({
      page: { url: 'http://127.0.0.1:4173/other-page' },
      nodes: [rootNode, banner],
      findings: [{
        findingId: 'f_other_page',
        code: 'HORIZONTAL_OVERFLOW_DETECTED',
        severity: 'error',
        nodeId: 'nNew',
        source: null,
        message: 'Other page banner overflows horizontally',
        evidence: { kind: 'horizontal-overflow', clientWidth: 390, scrollWidth: 600 },
        relatedNodeIds: [],
        limitations: [],
        acknowledged: false,
        suggestion: null
      }]
    });

    const diff = compareRepairs(snapshot(), after, { behaviorCheckPassed: true });
    diffReportSchema.parse(diff);
    expect(diff.summary.repairIntegrityVerdict).toBe('incompatible-comparison');
    expect(diff.summary.newFindings).toBe(0);
    const added = diff.findings.find((f) => f.afterFinding?.findingId === 'f_other_page')!;
    expect(added.status).toBe('non-comparable');
    expect(added.explanation).toContain('not evidence of a regression');
    expect(added.explanation).not.toMatch(/Potential regression/);
    expect(renderDiffHtml(diff)).not.toContain('<span class="badge badge-regression">');
  });
});

describe('P03 per-finding verdicts', () => {
  const finding = (target: Measurement, code: string, evidence: Finding['evidence'], overrides: Partial<Finding> = {}): Finding =>
    blockedFinding(target, { findingId: `f_${target.nodeId}_${code}`, code, evidence, relatedNodeIds: [], ...overrides });
  const beforeWith = (target: Measurement, f: Finding) => snapshot({ nodes: [rootNode, target, cookieNode], findings: [f] });
  const afterWith = (target: Measurement, findings: Finding[] = []) => snapshot({ nodes: [rootNode, target, cookieNode], findings });
  const hidden = { render: { hasBox: false, cssHiddenReasons: ['display:none'], effectiveOpacityZero: known(false) }, box: null, pointer: unknown(['no box']) };
  const overBudget = checkoutNode({ intent: { expectedCurrent: 'interactive', maxLines: 1, allow: [] } }, null);
  const budgetFinding = finding(overBudget, 'TEXT_LINE_BUDGET_EXCEEDED', { kind: 'text-line-budget-exceeded', observedLines: 2, maxLines: 1 });
  const scrolls = checkoutNode({ intent: { expectedCurrent: null, maxLines: null, allow: ['horizontal-scroll'] } }, null);
  const acknowledged = finding(scrolls, 'HORIZONTAL_OVERFLOW', { kind: 'horizontal-overflow', clientWidth: 100, scrollWidth: 200 }, { acknowledged: true, severity: 'info' });
  const unkeyed = (blocker: string | null) => checkoutNode({ semanticKey: null }, blocker);
  const duplicate = [checkoutNode(), checkoutNode({ nodeId: 'n3' })];

  /** Every case is run with behavior passing, i.e. the most permissive input: only the named reason blocks it. */
  const cases: Array<[VerdictReason, string, () => [Snapshot, Snapshot]]> = [
    ['finding_absent_target_retained', 'CSS repair of a keyed target', () => [snapshot(), repaired()]],
    ['target_unmounted', 'keyed target deleted', () => [snapshot(), snapshot({ nodes: [rootNode, cookieNode], findings: [] })]],
    ['target_retention_unknown', 'unkeyed target without a candidate', () => [beforeWith(unkeyed('n2'), blockedFinding(unkeyed('n2'))), snapshot({ nodes: [rootNode, cookieNode], findings: [] })]],
    ['target_ambiguous', 'duplicate author keys', () => [snapshot({ nodes: [rootNode, ...duplicate, cookieNode] }), snapshot({ nodes: [rootNode, ...duplicate, cookieNode], findings: [] })]],
    ['state_not_reproduced', 'different URL', () => [snapshot(), repaired({ page: { url: 'http://127.0.0.1:4173/other' } })]],
    ['state_not_reproduced', 'different viewport', () => [snapshot(), repaired({ page: { viewport: { width: 1440, height: 900 } } })]],
    ['coverage_reduced', 'incomplete after capture', () => [snapshot(), repaired({ coverage: { complete: false } })]],
    ['coverage_reduced', 'incomplete before capture', () => [snapshot({ coverage: { complete: false } }), repaired()]],
    ['coverage_reduced', 'target missing from an incomplete capture', () => [snapshot(), snapshot({ nodes: [rootNode, cookieNode], findings: [], coverage: { complete: false } })]],
    ['coverage_reduced', 'after capture lost a capability', () => [snapshot(), repaired({ coverage: { capabilities: ['rectangles'] } })]],
    ['capture_not_settled', 'unsettled after capture', () => [snapshot(), repaired({ readiness: { settled: false } })]],
    ['capture_not_settled', 'persisting finding in a moving layout', () => [snapshot(), snapshot({ readiness: { settled: false } })]],
    ['measurement_unsupported', 'pointer not sampled any more', () => [snapshot(), afterWith(checkoutNode({ pointer: unknown(['outside viewport']) }))]],
    ['measurement_unsupported', 'target disabled', () => [snapshot(), afterWith(checkoutNode({ interaction: { candidate: true, disabled: true, inert: false, pointerEvents: 'auto' } }, null))]],
    ['measurement_unsupported', 'clip model no longer applies', () => {
      const f = finding(checkoutNode({}, null), 'CLIPPED_BY_ANCESTOR', { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: [] });
      return [beforeWith(checkoutNode({}, null), f), afterWith(checkoutNode({ clip: unknown(['transform']) }, null))];
    }],
    ['measurement_unsupported', 'text emptied', () => [beforeWith(overBudget, budgetFinding), afterWith({ ...overBudget, text: known({ lineCount: 0, fragmentRects: [], clippedFragmentCount: 0 }) })]],
    ['intent_changed', 'line budget removed', () => [beforeWith(overBudget, budgetFinding), afterWith(checkoutNode({}, null))]],
    ['intent_changed', 'line budget raised', () => [beforeWith(overBudget, budgetFinding), afterWith({ ...overBudget, intent: { expectedCurrent: 'interactive', maxLines: 3, allow: [] } })]],
    ['intent_changed', 'visibility expectation removed', () => {
      const target = checkoutNode(hidden);
      const f = finding(target, 'EXPECTED_VISIBLE_BUT_HIDDEN', { kind: 'expected-visible-but-hidden', hiddenReasons: ['display:none'], expectedCurrent: 'interactive' });
      return [beforeWith(target, f), afterWith({ ...target, intent: { expectedCurrent: null, maxLines: null, allow: [] } })];
    }],
    ['target_hidden', 'target hidden with CSS', () => [snapshot(), afterWith(checkoutNode(hidden))]],
    ['target_identity_heuristic', 'no author key', () => [beforeWith(unkeyed('n2'), blockedFinding(unkeyed('n2'))), afterWith(unkeyed(null))]],
    ['target_identity_heuristic', 'author key moved to another element kind', () => [snapshot(), afterWith(checkoutNode({ tag: 'a', role: 'link' }, null))]],
    ['finding_persists', 'still blocked', () => [snapshot(), snapshot()]],
    ['finding_persists', 'fully blocked becomes partially blocked', () => [snapshot(), afterWith(checkoutNode(), [blockedFinding(checkoutNode(), { findingId: 'f_partial', code: 'POINTER_PARTIALLY_BLOCKED' })])]],
    ['finding_persists', 'silenced afterwards', () => [beforeWith(scrolls, { ...acknowledged, acknowledged: false }), afterWith(scrolls, [acknowledged])]],
    ['finding_acknowledged', 'acknowledged on both sides', () => [beforeWith(scrolls, acknowledged), afterWith(scrolls, [acknowledged])]],
    ['new_finding', 'regression', () => [afterWith(checkoutNode({}, null)), snapshot()]]
  ];

  test.each(cases)('%s: %s', (reason, _label, make) => {
    const [before, after] = make();
    const diff = diffReportSchema.parse(compareRepairs(before, after, { behaviorCheckPassed: true }));
    const comparison = diff.findings[0]!;
    expect(comparison.reason).toBe(reason);
    expect(comparison.verdict).toBe(VERDICT_BY_REASON[reason]);
    expect(diff.summary.verdicts[comparison.verdict]).toBeGreaterThan(0);
    const { verified, unverified, contradicted } = diff.summary.verdicts;
    expect(verified + unverified + contradicted).toBe(diff.findings.length);
    if (reason !== 'finding_absent_target_retained') expect(diff.summary.verifiedFixed).toBe(0);
    // Text, Markdown and HTML carry the verdict (incompatible text/Markdown print counts only).
    const counts = `${verified} verified, ${unverified} unverified, ${contradicted} contradicted`;
    expect(formatDiffText(diff)).toContain(counts);
    expect(renderDiffMarkdown(diff)).toContain(counts);
    const html = renderDiffHtml(diff);
    expect(html).toContain(`>${comparison.verdict}</span> <code>${reason}</code>`);
    if (diff.compatibility.comparable) {
      expect(formatDiffText(diff)).toContain(`Verdict: ${comparison.verdict}(${reason})`);
      expect(renderDiffMarkdown(diff)).toContain(`\`${comparison.verdict}\` (\`${reason}\`)`);
    }
  });

  test('behavior evidence decides between unverified, contradicted and verified', () => {
    const reasonFor = (behaviorCheckPassed?: boolean) => compareRepairs(snapshot(), repaired(), { behaviorCheckPassed }).findings[0]!.reason;
    expect(reasonFor(undefined)).toBe('behavior_not_checked');
    expect(reasonFor(false)).toBe('behavior_assertion_failed');
    expect(reasonFor(true)).toBe('finding_absent_target_retained');
  });

  test('supplied behavior evidence is bound to one capture, node, action and rule; the boolean cannot override it', () => {
    const after = repaired();
    const proof: BehaviorEvidence = { sessionId: after.sessionId, captureId: after.captureId, nodeId: 'n1', semanticKey: 'checkout-action', action: 'click', reason: 'finding_absent_target_retained', explanation: 'clicked' };
    const reasonFor = (evidence: BehaviorEvidence[], behaviorCheckPassed?: boolean) => compareRepairs(snapshot(), after, { behaviorEvidence: evidence, behaviorCheckPassed }).findings[0]!.reason;
    expect(reasonFor([proof])).toBe('finding_absent_target_retained');
    expect(reasonFor([], true)).toBe('behavior_not_checked');
    expect(reasonFor([proof], false)).toBe('behavior_assertion_failed');
    for (const patch of [{ sessionId: 'other' }, { captureId: 'other' }, { nodeId: 'n2' }, { nodeId: null }, { semanticKey: 'cookie-notice' }]) expect(reasonFor([{ ...proof, ...patch }], true)).toBe('behavior_not_checked');
    expect(reasonFor([{ ...proof, action: 'fill' }], true)).toBe('behavior_not_provable');
    for (const reason of ['behavior_not_checked', 'behavior_target_mismatch', 'behavior_unchanged', 'behavior_step_failed'] as const) expect(reasonFor([{ ...proof, reason }], true)).toBe(reason);
    // A second, always-true assertion does not cancel a real proof.
    expect(reasonFor([{ ...proof, reason: 'behavior_unchanged' }, proof])).toBe('finding_absent_target_retained');
  });

  test('a Report after input never verifies, even when the target is retained through another finding', () => {
    const other = finding(checkoutNode({}, null), 'TEXT_CLIPPED', { kind: 'text-clipped', clippedFragmentCount: 1, lineCount: 1 });
    const diff = compareRepairs(snapshot(), createReport(afterWith(checkoutNode({}, null), [other])), { behaviorCheckPassed: true });
    expect(diff.findings[0]).toMatchObject({ targetRetained: true, verdict: 'unverified', reason: 'measurement_unsupported' });
  });

  test('a finding after an incomplete baseline is not called new', () => {
    const diff = compareRepairs(snapshot({ nodes: [rootNode, checkoutNode({}, null), cookieNode], findings: [], coverage: { complete: false } }), snapshot());
    expect(diff.findings[0]).toMatchObject({ verdict: 'unverified', reason: 'coverage_reduced' });
  });

  test('only one reason maps to verified and the schema rejects relabelled or unsupported verdicts', () => {
    expect(VERDICT_REASONS.filter((r) => VERDICT_BY_REASON[r] === 'verified')).toEqual(['finding_absent_target_retained']);
    expect(Object.keys(VERDICT_REASON_TEXT).sort()).toEqual([...VERDICT_REASONS].sort());
    const diff = compareRepairs(snapshot(), snapshot({ nodes: [rootNode, cookieNode], findings: [] }));
    const tamper = (patch: object) => diffReportSchema.safeParse({ ...diff, findings: [{ ...diff.findings[0]!, ...patch }] }).success;
    expect(tamper({})).toBe(true);
    expect(tamper({ verdict: 'verified' })).toBe(false);
    expect(tamper({ verdict: 'verified', reason: 'finding_absent_target_retained' })).toBe(false);
    expect(tamper({ verdict: 'verified', reason: 'finding_absent_target_retained', status: 'verified-fixed' })).toBe(false);
    expect(tamper({ reason: 'because' })).toBe(false);
  });

  // One CLI diff per reason. The CLI has no behavior evidence, so a clean disappearance is
  // behavior_not_checked; `verified`, heuristic identity and failed behavior sit behind that gate.
  const apiOnly: VerdictReason[] = ['finding_absent_target_retained', 'target_identity_heuristic'];
  const cliCases: typeof cases = [
    ...cases.filter(([reason]) => !apiOnly.includes(reason)),
    ['behavior_not_checked', 'clean disappearance', () => [snapshot(), repaired()]]
  ];
  test.each(cliCases)('CLI diff reports %s: %s', async (reason, _label, make) => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-cli-verdict-'));
    try {
      const [before, after] = make();
      await writeFile(join(tmp, 'b.json'), JSON.stringify(before), 'utf8');
      await writeFile(join(tmp, 'a.json'), JSON.stringify(after), 'utf8');
      const stdout: string[] = [];
      const exit = await run(['diff', join(tmp, 'b.json'), join(tmp, 'a.json'), '--format', 'json'], { stdout: (m) => stdout.push(m), stderr: () => {} });
      expect(exit).toBe(1);
      const envelope = envelopeOf(diffReportSchema).parse(JSON.parse(stdout.join('')));
      if (!envelope.ok) throw new Error(envelope.error.code);
      const diff = diffReportSchema.parse(envelope.data);
      expect(diff.findings[0]).toMatchObject({ reason, verdict: VERDICT_BY_REASON[reason] });
      expect(diff.summary.verdicts.verified).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('the CLI diff has no option that supplies or switches on verification', () => {
    for (const flag of ['--verified', '--behavior', '--behavior-check-passed', '--assume-verified']) {
      expect(() => parseDiffArguments(['diff', 'b.json', 'a.json', flag, 'true'])).toThrow(/Unknown or invalid option/);
    }
  });

  test('listFindingVerdicts lists rows for a UI, offers no after box for unmounted, ambiguous or incompatible targets, and never verifies', () => {
    const fixed = listFindingVerdicts(snapshot(), repaired());
    expect(fixed.counts).toEqual({ verified: 0, unverified: 1, contradicted: 0 });
    expect(fixed.verdicts[0]).toMatchObject({ reason: 'behavior_not_checked', reasonText: VERDICT_REASON_TEXT.behavior_not_checked, code: 'POINTER_BLOCKED_AT_SAMPLES', severity: 'error', targetKey: 'key:checkout-action', before: { nodeId: 'n1' }, after: { nodeId: 'n1', findingId: null, box: checkoutBox } });

    const deleted = listFindingVerdicts(snapshot(), snapshot({ nodes: [rootNode, cookieNode], findings: [] }));
    expect(deleted.verdicts[0]).toMatchObject({ verdict: 'contradicted', reason: 'target_unmounted', after: null });
    const ambiguous = listFindingVerdicts(snapshot({ nodes: [rootNode, ...duplicate, cookieNode] }), snapshot({ nodes: [rootNode, ...duplicate, cookieNode], findings: [] }));
    expect(ambiguous.verdicts[0]).toMatchObject({ reason: 'target_ambiguous', after: null });
    const other = listFindingVerdicts(snapshot(), repaired({ page: { url: 'http://127.0.0.1:4173/other' } }));
    expect(other).toMatchObject({ comparable: false, verdicts: [{ reason: 'state_not_reproduced', after: null }] });
    expect(other.incompatibilities.length).toBeGreaterThan(0);

    const added = listFindingVerdicts(repaired(), snapshot());
    expect(added.verdicts[0]).toMatchObject({ reason: 'new_finding', before: null, after: { findingId: 'f_n1_blocked' } });
    expect(findingVerdictsFromDiff(compareRepairs(snapshot(), repaired(), { behaviorCheckPassed: true })).counts.verified).toBe(1);
    expect(() => listFindingVerdicts(legacyInput, snapshot())).toThrow(DiffInputError);
  });
  const legacyInput = { schemaVersion: '0.1' } as unknown as Snapshot;

  test('listFindingVerdicts runs from a browser bundle with the studio crypto alias', async () => {
    const bundled = await build({
      stdin: { contents: "export { listFindingVerdicts } from './packages/report/src/verdict.ts';", resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent',
      alias: { 'node:crypto': join(process.cwd(), 'packages/studio/src/crypto-shim.ts') }
    });
    const code = bundled.outputFiles[0]!.text;
    expect(code).not.toMatch(/from "node:/);
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as { listFindingVerdicts: typeof listFindingVerdicts };
    expect(module.listFindingVerdicts(snapshot(), repaired()).verdicts[0]!.reason).toBe('behavior_not_checked');
  });
});
