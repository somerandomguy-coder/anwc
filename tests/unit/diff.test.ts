import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envelopeOf, errorEnvelopeSchema, snapshotSchema } from '@anwc/protocol';
import type { Finding, Measurement, Snapshot, SourceRef } from '@anwc/protocol';
import {
  compareRepairs,
  createReport,
  DiffInputError,
  formatDiffText,
  parseDiffInput,
  renderDiffHtml,
  renderDiffMarkdown,
  diffReportSchema
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
