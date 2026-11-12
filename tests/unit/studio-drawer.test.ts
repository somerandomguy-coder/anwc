import { describe, expect, test, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  filterFindings,
  formatSourceReference,
  computeReachabilityMetric,
  extractFindings
} from '../../packages/studio/src/components/drawer-utils.js';
import { FindingCard } from '../../packages/studio/src/components/FindingCard.js';
import { FindingDrawer } from '../../packages/studio/src/components/FindingDrawer.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { createReport } from '../../packages/report/src/index.js';
import type { Finding, Snapshot } from '@anwc/protocol';

describe('Studio Finding Drawer Utilities', () => {
  const baseReport = createReport(validSnapshotFixture);
  // Ensure report.findings compatibility with test brief expectations
  const report = Object.assign(baseReport, {
    findings: validSnapshotFixture.findings
  });

  test('filters findings by severity and category', () => {
    const all = filterFindings(report.findings, 'all');
    expect(all.length).toBe(report.findings.length);

    const pointer = filterFindings(report.findings, 'pointer');
    expect(pointer.every((f) => f.code.includes('POINTER'))).toBe(true);
  });

  test('formats source references with line and column', () => {
    const nodeWithSource = validSnapshotFixture.nodes.find((n) => n.source !== null);
    expect(nodeWithSource).toBeDefined();
    if (nodeWithSource?.source) {
      const formatted = formatSourceReference(nodeWithSource.source);
      expect(formatted).toBe(`${nodeWithSource.source.file}:${nodeWithSource.source.line}`);
    }

    // Handles null / undefined safely
    expect(formatSourceReference(null)).toBe('');
    expect(formatSourceReference(undefined)).toBe('');

    // First node in fixture has no source
    const node = validSnapshotFixture.nodes[0]!;
    if (node.source) {
      const formatted = formatSourceReference(node.source);
      expect(formatted).toBe(`${node.source.file}:${node.source.line}`);
    } else {
      expect(formatSourceReference(node.source)).toBe('');
    }
  });

  test('computes reachability metric for pointer-blocked findings and returns null for others', () => {
    const pointerFinding = validSnapshotFixture.findings[0]!;
    const metric = computeReachabilityMetric(pointerFinding);
    expect(metric).not.toBeNull();
    // Tested: 1, Blocked: 1 -> 0% reachable (1/1 blocked)
    expect(metric?.percent).toBe(0);
    expect(metric?.label).toBe('0% reachable (1/1 blocked)');

    // Multiple samples test
    const partialBlockedFinding: Finding = {
      ...pointerFinding,
      findingId: 'f-partial',
      evidence: {
        kind: 'pointer-blocked',
        tested: 4,
        blocked: 1,
        blockerNodeIds: ['n-overlay']
      }
    };
    const partialMetric = computeReachabilityMetric(partialBlockedFinding);
    expect(partialMetric?.percent).toBe(75);
    expect(partialMetric?.label).toBe('75% reachable (1/4 blocked)');

    // Non-pointer finding
    const overflowFinding: Finding = {
      ...pointerFinding,
      findingId: 'f-overflow',
      code: 'HORIZONTAL_OVERFLOW',
      evidence: {
        kind: 'horizontal-overflow',
        clientWidth: 100,
        scrollWidth: 150
      }
    };
    expect(computeReachabilityMetric(overflowFinding)).toBeNull();
  });

  test('filters critical, clipped, and actionable findings accurately', () => {
    const mockFindings: Finding[] = [
      {
        findingId: 'f-1',
        code: 'POINTER_BLOCKED_AT_SAMPLES',
        severity: 'error',
        nodeId: 'n-1',
        source: null,
        message: 'Blocked',
        evidence: { kind: 'pointer-blocked', tested: 4, blocked: 4, blockerNodeIds: ['n-x'] },
        relatedNodeIds: ['n-x'],
        limitations: [],
        acknowledged: false,
        suggestion: null
      },
      {
        findingId: 'f-2',
        code: 'HORIZONTAL_OVERFLOW',
        severity: 'warning',
        nodeId: 'n-2',
        source: null,
        message: 'Overflow',
        evidence: { kind: 'horizontal-overflow', clientWidth: 100, scrollWidth: 200 },
        relatedNodeIds: [],
        limitations: [],
        acknowledged: false,
        suggestion: null
      },
      {
        findingId: 'f-3',
        code: 'CLIPPED_BY_ANCESTOR',
        severity: 'info',
        nodeId: 'n-3',
        source: null,
        message: 'Clipped',
        evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: ['n-root'] },
        relatedNodeIds: ['n-root'],
        limitations: [],
        acknowledged: false,
        suggestion: null
      },
      {
        findingId: 'f-4',
        code: 'POINTER_BLOCKED_AT_SAMPLES',
        severity: 'error',
        nodeId: 'n-4',
        source: null,
        message: 'Acknowledged blocker',
        evidence: { kind: 'pointer-blocked', tested: 2, blocked: 2, blockerNodeIds: ['n-x'] },
        relatedNodeIds: ['n-x'],
        limitations: [],
        acknowledged: true,
        suggestion: null
      }
    ];

    expect(filterFindings(mockFindings, 'all')).toHaveLength(4);
    // Critical: only severity === 'error'
    const critical = filterFindings(mockFindings, 'critical');
    expect(critical).toHaveLength(2);
    expect(critical.every((f) => f.severity === 'error')).toBe(true);

    // Pointer: only pointer-blocked
    const pointer = filterFindings(mockFindings, 'pointer');
    expect(pointer).toHaveLength(2);
    expect(pointer.every((f) => f.code.includes('POINTER'))).toBe(true);

    // Clipped: overflow and clipped
    const clipped = filterFindings(mockFindings, 'clipped');
    expect(clipped).toHaveLength(2);
    expect(clipped.map((f) => f.findingId).sort()).toEqual(['f-2', 'f-3']);

    // Actionable: unacknowledged errors and warnings (f-1, f-2)
    const actionable = filterFindings(mockFindings, 'actionable');
    expect(actionable).toHaveLength(2);
    expect(actionable.map((f) => f.findingId).sort()).toEqual(['f-1', 'f-2']);
  });

  test('extractFindings handles Snapshot, Report, and raw finding arrays', () => {
    const fromSnapshot = extractFindings(validSnapshotFixture);
    expect(fromSnapshot).toHaveLength(validSnapshotFixture.findings.length);

    const fromReport = extractFindings(baseReport);
    expect(fromReport).toHaveLength(baseReport.groups.flatMap((g) => g.findings).length);

    const raw = [validSnapshotFixture.findings[0]!];
    expect(extractFindings(raw)).toEqual(raw);

    expect(extractFindings(null)).toEqual([]);
    expect(extractFindings(undefined)).toEqual([]);
  });
});

describe('FindingCard Component', () => {
  const finding = validSnapshotFixture.findings[0]!;

  test('renders severity badge, code pill, explanation, and reachability metric', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingCard, {
        finding,
        selected: false,
        targetBox: { x: 0, y: 0, width: 120, height: 40 },
        blockerBoxes: [{ x: 0, y: 0, width: 390, height: 100 }]
      })
    );

    // Severity badge CRITICAL for error
    expect(html).toContain('CRITICAL');
    // Code pill
    expect(html).toContain('POINTER_BLOCKED_AT_SAMPLES');
    // Message
    expect(html).toContain('Illustrative finding');
    // Source link pill
    expect(html).toContain('examples/shop/src/Card.tsx:10');
    // Reachability metric
    expect(html).toContain('0% reachable');
    expect(html).toContain('(1/1 blocked)');
    // Target & Blocker box pills
    expect(html).toContain('120');
    expect(html).toContain('390');
  });

  test('renders WARNING and INFO severities with appropriate badges', () => {
    const warningFinding: Finding = {
      ...finding,
      severity: 'warning',
      code: 'HORIZONTAL_OVERFLOW',
      source: null
    };
    const warningHtml = renderToStaticMarkup(
      React.createElement(FindingCard, { finding: warningFinding })
    );
    expect(warningHtml).toContain('WARNING');
    expect(warningHtml).toContain('uninstrumented');

    const infoFinding: Finding = {
      ...finding,
      severity: 'info',
      code: 'CLIPPED_BY_ANCESTOR',
      source: null
    };
    const infoHtml = renderToStaticMarkup(
      React.createElement(FindingCard, { finding: infoFinding })
    );
    expect(infoHtml).toContain('INFO');
  });

  test('renders selected state styling when selected', () => {
    const selectedHtml = renderToStaticMarkup(
      React.createElement(FindingCard, {
        finding,
        selected: true
      })
    );
    expect(selectedHtml).toContain('data-selected="true"');
    // P11: Tailwind ring classes (never loaded) replaced by the token-styled is-selected class.
    expect(selectedHtml).toContain('is-selected');

    const unselectedHtml = renderToStaticMarkup(
      React.createElement(FindingCard, {
        finding,
        selected: false
      })
    );
    expect(unselectedHtml).toContain('data-selected="false"');
  });
});

describe('FindingDrawer Component', () => {
  const baseReport = createReport(validSnapshotFixture);

  test('renders drawer toggle, count, filter chips, and finding cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDrawer, {
        report: baseReport,
        selectedFindingId: 'f-overlay',
        onSelectFinding: () => {}
      })
    );

    // Header counter and tabs
    expect(html).toContain('Diagnostic Findings');
    expect(html).toContain('Agent Payload (0.1 JSON)');
    // P11: filter chips replaced by rule-category checkboxes, a text filter and "Show all"
    for (const label of ['Pointer', 'Clipping', 'Overflow', 'Text', 'Visibility', 'Other']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-testid="finding-filter"');
    expect(html).toContain('Show all');
    // FindingCard rendered
    expect(html).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(html).toContain('examples/shop/src/Card.tsx:10');
  });

  test('renders collapsed state when defaultExpanded is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDrawer, {
        report: baseReport,
        selectedFindingId: null,
        onSelectFinding: () => {},
        defaultExpanded: false
      })
    );

    // Shows Expand toggle button and the collapsed state (P11: data attribute instead of a Tailwind height class)
    expect(html).toContain('Expand');
    expect(html).toContain('data-expanded="false"');
  });

  test('renders empty state when no findings match the filter', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDrawer, {
        report: baseReport,
        selectedFindingId: null,
        onSelectFinding: () => {},
        defaultCategories: ['clipping'] // No clipping findings in validSnapshotFixture (P11: categories replace filter chips)
      })
    );

    expect(html).toContain('No findings match the active filter');
  });

  test('renders agent JSON payload tab with structured AgentSummary 0.1 schema', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDrawer, {
        report: baseReport,
        selectedFindingId: 'f-overlay',
        onSelectFinding: () => {},
        defaultTab: 'agent-json'
      })
    );

    // Shows Agent JSON Inspector
    expect(html).toContain('Agent Summary (0.1)');
    expect(html).toContain('Copy JSON');
    // Formatted JSON contains schema version and report fields
    expect(html).toContain('&quot;schemaVersion&quot;: &quot;0.1&quot;');
    expect(html).toContain('&quot;reportId&quot;:');
    expect(html).toContain('&quot;captureHash&quot;:');
    expect(html).toContain('Agent Finding Detail');
  });

  test('renders correctly when snapshot is passed directly', () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDrawer, {
        snapshot: validSnapshotFixture,
        selectedFindingId: 'f-overlay',
        onSelectFinding: () => {}
      })
    );

    expect(html).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(html).toContain('Diagnostic Findings');
  });
});
