import { describe, expect, test } from 'vitest';
import { validSnapshotFixture, partialRawCaptureFixture } from '../../packages/protocol/test/fixtures.js';
import {
  createReport,
  formatReportText,
  parseReport,
  renderReportHtml,
  renderReportMarkdown,
  reportSchema,
  MIN_TEXT_BUDGET,
  type Report,
  type ReportFinding
} from '../../packages/report/src/index.js';
import type { Snapshot } from '@anwc/protocol';

describe('Report Model 0.1', () => {
  test('transforms snapshot into valid Report 0.1 schema with traceable input and hash', () => {
    const report = createReport(validSnapshotFixture);
    const parsed = parseReport(report);

    expect(parsed.schemaVersion).toBe('0.1');
    expect(parsed.reportId).toBe(`report-${validSnapshotFixture.captureId}`);
    expect(parsed.input.captureId).toBe(validSnapshotFixture.captureId);
    expect(parsed.input.captureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.summary.totalFindings).toBe(1);
    expect(parsed.summary.unacknowledgedErrors).toBe(1);
    expect(parsed.summary.actionable).toBe(1);
    expect(parsed.summary.status).toBe('fail');
    expect(parsed.coverage.paintVisibility).toBe('unknown');

    // Finding targets resolve correctly to snapshot nodes
    const finding = parsed.groups[0]!.findings[0]!;
    expect(finding.target.nodeId).toBe('n-card-1');
    expect(finding.target.tag).toBe('button');
    expect(finding.target.label).toBe('Add first');
    expect(finding.blockers).toHaveLength(1);
    expect(finding.blockers[0]!.nodeId).toBe('n-overlay');
  });

  test('reports with zero findings on partial or unsettled captures remain visibly incomplete', () => {
    const partialSnapshot: Snapshot = {
      ...validSnapshotFixture,
      findings: [],
      coverage: {
        ...validSnapshotFixture.coverage,
        complete: false,
        inspectedNodes: 3,
        skippedNodes: 1,
        reasons: ['node cap reached']
      }
    };

    const partialReport = createReport(partialSnapshot);
    expect(partialReport.summary.totalFindings).toBe(0);
    expect(partialReport.summary.actionable).toBe(0);
    expect(partialReport.summary.status).toBe('incomplete');

    const formatted = formatReportText(partialReport);
    expect(formatted).toContain('0 actionable findings for inspected rules');
    expect(formatted).toContain('INCOMPLETE CAPTURE');
    expect(formatted).toContain('node cap reached');

    const unsettledSnapshot: Snapshot = {
      ...validSnapshotFixture,
      findings: [],
      readiness: {
        settled: false,
        waitMs: 500,
        reasons: ['pending font loading']
      }
    };

    const unsettledReport = createReport(unsettledSnapshot);
    expect(unsettledReport.summary.status).toBe('incomplete');
    const unsettledText = formatReportText(unsettledReport);
    expect(unsettledText).toContain('INCOMPLETE CAPTURE');
    expect(unsettledText).toContain('unsettled');
    expect(unsettledText).toContain('pending font loading');

    // Clean settled complete capture shows pass without incomplete warning
    const cleanSnapshot: Snapshot = {
      ...validSnapshotFixture,
      findings: []
    };
    const cleanReport = createReport(cleanSnapshot);
    expect(cleanReport.summary.status).toBe('pass');
    const cleanText = formatReportText(cleanReport);
    expect(cleanText).not.toContain('INCOMPLETE CAPTURE');
    expect(cleanText).toContain('0 actionable findings for inspected rules');
  });

  test('groups repeated symptoms by shared directly measured blocker preserving every affected instance', () => {
    const multiBlockedSnapshot: Snapshot = {
      ...validSnapshotFixture,
      findings: [
        {
          findingId: 'f-1',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-card-1',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 10, column: 3, tag: 'button' },
          message: 'Button 1 blocked',
          evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: ['n-overlay'] },
          relatedNodeIds: ['n-overlay'],
          limitations: ['sampled hit test'],
          acknowledged: false,
          suggestion: null
        },
        {
          findingId: 'f-2',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-card-2',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 20, column: 3, tag: 'button' },
          message: 'Button 2 blocked',
          evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: ['n-overlay'] },
          relatedNodeIds: ['n-overlay'],
          limitations: ['sampled hit test'],
          acknowledged: false,
          suggestion: null
        },
        {
          findingId: 'f-3',
          code: 'HORIZONTAL_OVERFLOW',
          severity: 'warning',
          nodeId: 'n-root',
          source: null,
          message: 'Root overflow',
          evidence: { kind: 'horizontal-overflow', clientWidth: 390, scrollWidth: 450 },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        }
      ]
    };

    const report = createReport(multiBlockedSnapshot);
    expect(report.summary.totalFindings).toBe(3);
    expect(report.summary.groupsCount).toBe(2); // 1 shared blocker group + 1 independent group

    const blockerGroup = report.groups.find((g) => g.relation.kind === 'shared-blocker');
    expect(blockerGroup).toBeDefined();
    expect(blockerGroup!.relation.sharedNodeId).toBe('n-overlay');
    expect(blockerGroup!.relation.note).toBe('Directly measured shared relation; not a proved root cause.');
    // Invariant: every single affected runtime instance is preserved!
    expect(blockerGroup!.findings).toHaveLength(2);
    expect(blockerGroup!.findings.map((f) => f.findingId).sort()).toEqual(['f-1', 'f-2']);

    const formatted = formatReportText(report);
    expect(formatted).toContain('RELATION Shared blocker <div');
    expect(formatted).toContain('[2 affected instances]');
    expect(formatted).toContain('Directly measured shared relation; not a proved root cause.');
  });

  test('survives uninstrumented blocker without crash and labels source unavailable', () => {
    const uninstrumentedBlockerSnapshot: Snapshot = {
      ...validSnapshotFixture,
      nodes: [
        ...validSnapshotFixture.nodes,
        {
          nodeId: 'uninstrumented-ad',
          siteId: null,
          source: null,
          parentNodeId: null,
          tag: 'iframe',
          semanticKey: null,
          role: null,
          label: '',
          labelMethod: 'none',
          textTruncated: false,
          box: { x: 0, y: 0, width: 300, height: 250 },
          render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'fixture', limitations: [] } },
          viewport: { status: 'known', value: { intersection: { x: 0, y: 0, width: 300, height: 250 }, boxFraction: 1 }, method: 'fixture', limitations: [] },
          clip: { status: 'known', value: { intersection: null, boxFraction: 1, ancestors: [] }, method: 'fixture', limitations: [] },
          overflow: null,
          text: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          pointer: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
          paintVisibility: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          intent: { expectedCurrent: null, maxLines: null, allow: [] }
        }
      ],
      findings: [
        {
          findingId: 'f-external',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-card-1',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 10, column: 3, tag: 'button' },
          message: 'Blocked by third party iframe',
          evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: ['uninstrumented-ad'] },
          relatedNodeIds: ['uninstrumented-ad'],
          limitations: ['cross-origin'],
          acknowledged: false,
          suggestion: null
        }
      ]
    };

    const report = createReport(uninstrumentedBlockerSnapshot);
    expect(report.groups[0]!.findings[0]!.blockers[0]!.source).toBeNull();
    const formatted = formatReportText(report);
    expect(formatted).toContain('blocker: <iframe> (node uninstrumented-ad)');
  });

  test('deterministic ordering places unacknowledged errors before warnings, info, and acknowledged', () => {
    const orderingSnapshot: Snapshot = {
      ...validSnapshotFixture,
      findings: [
        {
          findingId: 'f-ack-error',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-card-1',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 5, column: 1, tag: 'button' },
          message: 'Ack error',
          evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: [] },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: true,
          suggestion: null
        },
        {
          findingId: 'f-info',
          code: 'TEXT_LINE_BUDGET_EXCEEDED',
          severity: 'info',
          nodeId: 'n-card-1',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 8, column: 1, tag: 'button' },
          message: 'Info finding',
          evidence: { kind: 'text-line-budget-exceeded', observedLines: 3, maxLines: 2 },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        },
        {
          findingId: 'f-warning',
          code: 'HORIZONTAL_OVERFLOW',
          severity: 'warning',
          nodeId: 'n-root',
          source: null,
          message: 'Warning finding',
          evidence: { kind: 'horizontal-overflow', clientWidth: 390, scrollWidth: 420 },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        },
        {
          findingId: 'f-unack-error-b',
          code: 'CLIPPED_BY_ANCESTOR',
          severity: 'error',
          nodeId: 'n-card-2',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 30, column: 1, tag: 'button' },
          message: 'Unack error B',
          evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: [] },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        },
        {
          findingId: 'f-unack-error-a',
          code: 'CLIPPED_BY_ANCESTOR',
          severity: 'error',
          nodeId: 'n-card-1',
          source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 20, column: 1, tag: 'button' },
          message: 'Unack error A',
          evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: [] },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        }
      ]
    };

    const report = createReport(orderingSnapshot);
    const orderedIds = report.groups.flatMap((g) => g.findings.map((f) => f.findingId));

    // f-unack-error-a (line 20) before f-unack-error-b (line 30) -> then warning -> then info -> then acknowledged
    expect(orderedIds).toEqual([
      'f-unack-error-a',
      'f-unack-error-b',
      'f-warning',
      'f-info',
      'f-ack-error'
    ]);
  });

  test('repair suggestions reference measured relations without inventing CSS properties', () => {
    const report = createReport(validSnapshotFixture);
    const finding = report.groups[0]!.findings[0]!;
    // Suggestion must not contain invented CSS property assignments like z-index or pointer-events: none
    if (finding.suggestion) {
      expect(finding.suggestion).not.toMatch(/z-index\s*:\s*\d+/);
      expect(finding.suggestion).not.toMatch(/!important/);
    }
  });

  test('structural character budgeting strictly guarantees output never exceeds maxChars and never truncates footer', () => {
    // Construct a snapshot with 15 findings
    const findings: Snapshot['findings'] = Array.from({ length: 15 }, (_, index) => ({
      findingId: `f-${index}`,
      code: 'POINTER_BLOCKED_AT_SAMPLES',
      severity: 'error',
      nodeId: 'n-card-1',
      source: { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 10 + index, column: 3, tag: 'button' },
      message: `Finding item ${index} with specific details and measured description`,
      evidence: { kind: 'pointer-blocked', tested: 10, blocked: 10, blockerNodeIds: ['n-overlay'] },
      relatedNodeIds: ['n-overlay'],
      limitations: ['sampled hit test limitation notice'],
      acknowledged: false,
      suggestion: `Inspect blocker at line ${10 + index}`
    }));

    const snapshot: Snapshot = {
      ...validSnapshotFixture,
      findings
    };

    const report = createReport(snapshot);

    // Test a range of budgets: 120, 300, 500, 800, 1500, 5000
    const budgets = [120, 200, 300, 500, 800, 1200, 2000, 5000, 10000];
    for (const budget of budgets) {
      const formatted = formatReportText(report, { maxChars: budget });
      expect(formatted.length).toBeLessThanOrEqual(budget);

      // Invariant: footer is present when budget >= 500
      if (budget >= 500) {
        expect(formatted).toContain('paint visibility unknown | no screenshots captured');
        expect(formatted).toContain('Drilldown: re-run with --format json');
      }
    }

    // When limit is hit, omission is accurately accounted
    const limitFormatted = formatReportText(report, { limit: 3, maxChars: 10_000 });
    expect(limitFormatted).toContain('3 findings | 12 omitted');
    expect(limitFormatted).toContain('Note: 12 finding(s) omitted');
  });

  test('handles control characters, Unicode, and huge labels without breaking layout', () => {
    const weirdSnapshot: Snapshot = {
      ...validSnapshotFixture,
      nodes: [
        ...validSnapshotFixture.nodes,
        {
          nodeId: 'n-weird',
          siteId: null,
          source: null,
          parentNodeId: null,
          tag: 'button',
          semanticKey: null,
          role: null,
          label: 'Special \u0000\u001b control chars and Chinese 购物车 and Emoji 🚀 ' + 'A'.repeat(500),
          labelMethod: 'text',
          textTruncated: false,
          box: { x: 0, y: 0, width: 100, height: 50 },
          render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'fixture', limitations: [] } },
          viewport: { status: 'known', value: { intersection: null, boxFraction: 1 }, method: 'fixture', limitations: [] },
          clip: { status: 'known', value: { intersection: null, boxFraction: 1, ancestors: [] }, method: 'fixture', limitations: [] },
          overflow: null,
          text: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          pointer: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
          paintVisibility: { status: 'unknown', value: null, method: 'fixture', limitations: [] },
          intent: { expectedCurrent: null, maxLines: null, allow: [] }
        }
      ],
      findings: [
        {
          findingId: 'f-weird',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-weird',
          source: null,
          message: 'Message with \u0007 bell character',
          evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: [] },
          relatedNodeIds: [],
          limitations: [],
          acknowledged: false,
          suggestion: null
        }
      ]
    };

    const report = createReport(weirdSnapshot);
    const text = formatReportText(report);

    // Control characters are escaped
    expect(text).not.toContain('\u0000');
    expect(text).not.toContain('\u001b');
    expect(text).not.toContain('\u0007');
    expect(text).toContain('\\u0000');
    expect(text).toContain('\\u001b');
    expect(text).toContain('\\u0007');

    // Unicode is preserved
    expect(text).toContain('购物车');
    expect(text).toContain('🚀');

    // Huge label is bounded with ellipsis
    expect(text).toContain('...');
  });

  test('renders offline single-file HTML report with escaped text, diagram, and filters', () => {
    const maliciousSnapshot: Snapshot = {
      ...validSnapshotFixture,
      page: {
        ...validSnapshotFixture.page,
        url: 'http://127.0.0.1:4175/shop?token=secret123&user=admin',
        title: '<script>alert("xss")</script>'
      },
      nodes: validSnapshotFixture.nodes.map((n) =>
        n.nodeId === 'n-card-1'
          ? {
              ...n,
              label: '<img src=x onerror=alert(1)>',
              box: { x: 50, y: 100, width: 200, height: 60 },
              source: {
                siteId: 's_btn',
                file: 'C:/Users/Nam/Projects/Deploying/SWE/anwc/examples/shop/src/main.tsx',
                line: 42,
                column: 5,
                tag: 'button'
              }
            }
          : n.nodeId === 'n-overlay'
          ? {
              ...n,
              box: { x: 40, y: 90, width: 220, height: 80 }
            }
          : n
      ),
      findings: [
        {
          findingId: 'f-1',
          code: 'POINTER_BLOCKED_AT_SAMPLES',
          severity: 'error',
          nodeId: 'n-card-1',
          source: {
            siteId: 's_btn',
            file: 'C:/Users/Nam/Projects/Deploying/SWE/anwc/examples/shop/src/main.tsx',
            line: 42,
            column: 5,
            tag: 'button'
          },
          message: 'Target was occluded by <script>malicious</script>',
          evidence: {
            kind: 'pointer-blocked',
            tested: 25,
            blocked: 25,
            blockerNodeIds: ['n-overlay']
          },
          relatedNodeIds: ['n-overlay'],
          limitations: ['sampled 25 points only'],
          acknowledged: false,
          suggestion: 'Fix z-index'
        }
      ]
    };

    const report = createReport(maliciousSnapshot);
    const html = renderReportHtml(report);

    // Completely self-contained: no external scripts or stylesheets
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toMatch(/<script\s+src=/i);

    // Untrusted input is strictly escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>malicious</script>');
    expect(html).toContain('&lt;script&gt;malicious&lt;/script&gt;');

    // Viewport geometry SVG diagram exists with SVG elements
    expect(html).toContain('<svg viewBox="0 0 390 844"');
    expect(html).toContain('<rect x="0" y="0" width="390" height="844"');
    expect(html).toContain('<circle cx=');

    // Interactive filter buttons and details tags exist
    expect(html).toContain('class="filter-btn');
    expect(html).toContain('details class="evidence-details"');
    expect(html).toContain('summary>Raw Diagnostic Evidence');

    // Test redaction option
    const redactedHtml = renderReportHtml(report, { redact: true });
    expect(redactedHtml).toContain('[REDACTED EXPORT]');
    expect(redactedHtml).not.toContain('token=secret123');
    expect(redactedHtml).not.toContain('user=admin');
    expect(redactedHtml).not.toContain('C:/Users/Nam');
  });

  test('renders compact Markdown report with clean tables, escaped pipes, and warnings', () => {
    const report = createReport(validSnapshotFixture);
    const md = renderReportMarkdown(report);

    expect(md).toContain('# ANWC UI Repair Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('| Severity | Count |');
    expect(md).toContain('| Unacknowledged Errors | 1 |');
    expect(md).toContain('## Findings (1)');
    expect(md).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(md).toContain('- **Target:** `<button>`');

    // Incomplete capture renders warning banner
    const incompleteSnapshot: Snapshot = {
      ...validSnapshotFixture,
      readiness: { settled: false, waitMs: 1000, reasons: ['network busy'] }
    };
    const incompleteReport = createReport(incompleteSnapshot);
    const incompleteMd = renderReportMarkdown(incompleteReport);
    expect(incompleteMd).toContain('> [!WARNING]');
    expect(incompleteMd).toContain('Incomplete or Unsettled Capture:');
    expect(incompleteMd).toContain('network busy');

    // Redaction mode adds note and strips query parameters
    const querySnapshot: Snapshot = {
      ...validSnapshotFixture,
      page: {
        ...validSnapshotFixture.page,
        url: 'http://localhost:3000/app?auth=token123'
      }
    };
    const redactedMd = renderReportMarkdown(createReport(querySnapshot), { redact: true });
    expect(redactedMd).toContain('[REDACTED EXPORT]');
    expect(redactedMd).not.toContain('auth=token123');
    expect(redactedMd).toContain('http://localhost:3000/app');
  });
});
