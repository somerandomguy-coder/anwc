import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Snapshot } from '@anwc/protocol';
import {
  compareRepairs,
  formatDiffText,
  renderDiffHtml,
  renderDiffMarkdown,
  diffReportSchema
} from '../../packages/report/src/index.js';
import { parseDiffArguments, run } from '../../packages/cli/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

function createMockSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const base = structuredClone(validSnapshotFixture);
  return {
    ...base,
    ...overrides,
    page: {
      ...base.page,
      ...(overrides.page || {})
    },
    coverage: {
      ...base.coverage,
      ...(overrides.coverage || {})
    },
    nodes: overrides.nodes || [
      {
        nodeId: 'n1',
        parentId: null,
        tag: 'button',
        label: 'Checkout now',
        semanticKey: 'checkout-action',
        role: 'button',
        source: {
          siteId: 's1',
          file: 'src/main.tsx',
          line: 45,
          column: 12,
          tag: 'button'
        },
        box: { x: 10, y: 10, width: 120, height: 40 },
        computedStyle: {
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          pointerEvents: 'auto',
          zIndex: 'auto',
          position: 'static',
          overflowX: 'visible',
          overflowY: 'visible'
        },
        ancestorClip: {
          status: 'known',
          value: {
            clipped: false,
            visibleRect: { x: 10, y: 10, width: 120, height: 40 },
            clippingNodeId: null,
            reason: null
          },
          method: 'elementFromPoint',
          limitations: []
        },
        pointerAccess: {
          status: 'known',
          value: {
            accessible: false,
            testedSamples: 25,
            blockedSamples: 25,
            firstBlockerNodeId: 'n2',
            allBlockerNodeIds: ['n2']
          },
          method: 'elementFromPoint',
          limitations: []
        },
        textLayout: null
      }
    ],
    findings: overrides.findings || [
      {
        findingId: 'f_checkout_blocked',
        code: 'POINTER_BLOCKED_AT_SAMPLES',
        severity: 'error',
        nodeId: 'n1',
        source: {
          siteId: 's1',
          file: 'src/main.tsx',
          line: 45,
          column: 12,
          tag: 'button'
        },
        message: 'Checkout now has 25/25 pointer samples blocked.',
        evidence: {
          kind: 'pointer-blocked',
          tested: 25,
          blocked: 25,
          blockerNodeIds: ['n2']
        },
        relatedNodeIds: ['n2'],
        limitations: [],
        acknowledged: false,
        suggestion: 'Inspect blocking element.'
      }
    ]
  };
}

describe('Q07 Pure Diff Module and Repair Comparison', () => {
  test('matches CSS fix by author key and marks verified-fixed', () => {
    const before = createMockSnapshot();
    // After repair: finding is gone, node remains intact
    const after = createMockSnapshot({
      findings: []
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
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
    const before = createMockSnapshot();
    // After: lines in file shifted by +50 lines, but same author key
    const after = createMockSnapshot({
      findings: [],
      nodes: [
        {
          ...before.nodes[0]!,
          nodeId: 'n100', // session node ID changed across reloads!
          source: {
            ...before.nodes[0]!.source!,
            line: 95 // shifted!
          }
        }
      ]
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.findings[0]!.status).toBe('verified-fixed');
    expect(diff.targetMatches[0]!.strategy).toBe('author-key');
    expect(diff.targetMatches[0]!.confidence).toBe('definite');
  });

  test('matches keyed list items across reordering without line-number assumption', () => {
    const nodeA = {
      ...createMockSnapshot().nodes[0]!,
      nodeId: 'nA',
      semanticKey: 'item-alpha',
      label: 'Alpha item'
    };
    const nodeB = {
      ...createMockSnapshot().nodes[0]!,
      nodeId: 'nB',
      semanticKey: 'item-beta',
      label: 'Beta item'
    };

    const before = createMockSnapshot({
      nodes: [nodeA, nodeB],
      findings: [
        {
          findingId: 'f_beta_clipped',
          code: 'CONTENT_CLIPPED_BY_ANCESTOR',
          severity: 'error',
          nodeId: 'nB',
          source: nodeB.source,
          message: 'Beta item clipped',
          evidence: {
            kind: 'clipped-by-ancestor',
            boxFraction: 0.5,
            ancestorNodeIds: ['c1']
          },
          relatedNodeIds: ['c1'],
          limitations: [],
          acknowledged: false,
          suggestion: 'Fix ancestor overflow'
        }
      ]
    });

    // In after: items are reversed: [nodeB, nodeA], and finding is resolved
    const after = createMockSnapshot({
      nodes: [{ ...nodeB, nodeId: 'nB_new' }, { ...nodeA, nodeId: 'nA_new' }],
      findings: []
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.findings[0]!.targetKey).toBe('key:item-beta');
    expect(diff.findings[0]!.status).toBe('verified-fixed');
  });

  test.each([undefined, false])('does not certify disappeared findings without passing behavior evidence (%s)', (behaviorCheckPassed) => {
    const diff = compareRepairs(createMockSnapshot(), createMockSnapshot({ findings: [] }), { behaviorCheckPassed });
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');
    expect(diff.findings[0]!.explanation).toMatch(/behavior/);
  });

  test.each(['url', 'scenario', 'runtime', 'scale'])('rejects mismatched capture context: %s', (field) => {
    const before = createMockSnapshot();
    const after = createMockSnapshot({ findings: [] });
    if (field === 'url') after.page.url = `${before.page.url}?healthy=1`;
    if (field === 'scenario') after.page.scenario = 'different-state';
    if (field === 'runtime') after.environment.runtimeVersion = 'different-runtime';
    if (field === 'scale') after.page.visualViewportScale = 2;
    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.compatibility.comparable).toBe(false);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.repairIntegrityVerdict).toBe('incompatible-comparison');
  });

  test('does not certify a repair from an empty or incomplete baseline', () => {
    const empty = createMockSnapshot({ findings: [] });
    expect(compareRepairs(empty, empty, { behaviorCheckPassed: true }).summary.repairIntegrityVerdict).toBe('inconclusive-evidence');
    const before = createMockSnapshot();
    before.coverage.complete = false;
    expect(compareRepairs(before, empty, { behaviorCheckPassed: true }).summary.verifiedFixed).toBe(0);
  });

  test('does not certify an unsettled capture or a heuristic target match', () => {
    const before = createMockSnapshot();
    const after = createMockSnapshot({ findings: [] });
    after.readiness.settled = false;
    expect(compareRepairs(before, after, { behaviorCheckPassed: true }).summary.verifiedFixed).toBe(0);
    after.readiness.settled = true;
    before.nodes[0]!.semanticKey = null;
    after.nodes[0]!.semanticKey = null;
    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.targetMatches[0]!.confidence).toBe('heuristic');
    expect(diff.summary.verifiedFixed).toBe(0);
  });

  test('refuses to certify repair if target was deleted or unmounted (deletion cannot masquerade as fix)', () => {
    const before = createMockSnapshot();
    // In after: finding is gone because checkout button was DELETED from DOM!
    const after = createMockSnapshot({
      nodes: [],
      findings: []
    });

    const diff = compareRepairs(before, after);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.summary.repairIntegrityVerdict).toBe('inconclusive-evidence');

    const fComp = diff.findings[0]!;
    expect(fComp.status).toBe('inconclusive');
    expect(fComp.targetRetained).toBe(false);
    expect(fComp.explanation).toContain('removed or unmounted');
  });

  test('reports ambiguous when duplicate author keys exist', () => {
    const before = createMockSnapshot({
      nodes: [
        { ...createMockSnapshot().nodes[0]!, nodeId: 'n1', semanticKey: 'duplicate-key' },
        { ...createMockSnapshot().nodes[0]!, nodeId: 'n2', semanticKey: 'duplicate-key' }
      ],
      findings: [
        {
          ...createMockSnapshot().findings[0]!,
          nodeId: 'n1'
        }
      ]
    });

    const after = createMockSnapshot({
      nodes: [
        { ...createMockSnapshot().nodes[0]!, nodeId: 'n1_new', semanticKey: 'duplicate-key' },
        { ...createMockSnapshot().nodes[0]!, nodeId: 'n2_new', semanticKey: 'duplicate-key' }
      ],
      findings: []
    });

    const diff = compareRepairs(before, after);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.targetMatches[0]!.strategy).toBe('ambiguous');
  });

  test('reports incompatible comparison when viewports differ', () => {
    const before = createMockSnapshot({
      page: { ...validSnapshotFixture.page, viewport: { width: 1440, height: 900 } }
    });
    const after = createMockSnapshot({
      page: { ...validSnapshotFixture.page, viewport: { width: 390, height: 844 } },
      findings: []
    });

    const diff = compareRepairs(before, after);
    expect(diff.compatibility.comparable).toBe(false);
    expect(diff.compatibility.viewportMatch).toBe(false);
    expect(diff.summary.repairIntegrityVerdict).toBe('incompatible-comparison');
    expect(diff.findings[0]!.status).toBe('non-comparable');
  });

  test('reports inconclusive when after capture has incomplete coverage', () => {
    const before = createMockSnapshot();
    const after = createMockSnapshot({
      coverage: {
        complete: false,
        discoveredNodes: 50,
        inspectedNodes: 20,
        skippedNodes: 30,
        reasons: ['DOM sample capped']
      },
      findings: []
    });

    const diff = compareRepairs(before, after);
    expect(diff.summary.verifiedFixed).toBe(0);
    expect(diff.summary.inconclusive).toBe(1);
    expect(diff.findings[0]!.status).toBe('inconclusive');
    expect(diff.findings[0]!.explanation).toContain('incomplete DOM/sampling coverage');
  });

  test('detects regressions when new findings are introduced in after capture', () => {
    const before = createMockSnapshot();
    // After: original defect is fixed, but a new defect appeared
    const after = createMockSnapshot({
      nodes: [
        before.nodes[0]!,
        {
          ...before.nodes[0]!,
          nodeId: 'nNew',
          semanticKey: 'new-target',
          label: 'Broken banner'
        }
      ],
      findings: [
        {
          findingId: 'f_new_defect',
          code: 'HORIZONTAL_OVERFLOW_DETECTED',
          severity: 'error',
          nodeId: 'nNew',
          source: null,
          message: 'Broken banner overflows horizontally',
          evidence: {
            kind: 'horizontal-overflow',
            clientWidth: 1440,
            scrollWidth: 1600
          },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: 'Fix width'
        }
      ]
    });

    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });
    expect(diff.summary.verifiedFixed).toBe(1);
    expect(diff.summary.newFindings).toBe(1);
    expect(diff.summary.repairIntegrityVerdict).toBe('regressions-introduced');
  });

  test('renders offline HTML, compact Markdown, and formatted Text', () => {
    const before = createMockSnapshot();
    const after = createMockSnapshot({ findings: [] });
    const diff = compareRepairs(before, after, { behaviorCheckPassed: true });

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

      const before = createMockSnapshot();
      const after = createMockSnapshot({ findings: [] });
      await writeFile(bPath, JSON.stringify(before), 'utf8');
      await writeFile(aPath, JSON.stringify(after), 'utf8');

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
