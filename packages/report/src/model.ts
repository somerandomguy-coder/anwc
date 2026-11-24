import { createHash } from 'node:crypto';
import type { Finding, Measurement, Snapshot } from '@anwc/protocol';
import {
  REPORT_SCHEMA_VERSION,
  parseReport,
  type Report,
  type ReportFinding,
  type ReportFindingGroup,
  type ReportNodeRef,
  type ReportSummary
} from './schema.js';

function hashSnapshot(snapshot: Snapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot), 'utf8').digest('hex');
}

/**
 * The partial-capture facts every renderer puts in its header; empty for a complete, settled capture.
 * `nodesObserved` falls back to `inspectedNodes` for captures saved before P05.
 */
export function partialCaptureFacts(report: Report): string[] {
  const { coverage, readiness } = report;
  if (coverage.complete && readiness.settled) return [];
  const truncated = coverage.truncatedNodes ?? 0;
  const facts = [`observed ${coverage.nodesObserved ?? coverage.inspectedNodes} of ${coverage.discoveredNodes} nodes${truncated > 0 ? `, ${truncated} truncated` : ''}`];
  const last = readiness.lastObserved;
  if (last) {
    const more = last.movingCount > last.movingNodeIds.length ? ', ...' : '';
    const moving = last.movingCount === 0
      ? 'no moving element identified'
      : `${last.movingCount} moving element(s)${last.movingNodeIds.length > 0 ? ` [${last.movingNodeIds.join(', ')}${more}]` : ''}`;
    facts.push(`last observed: waiting for ${last.phase}, ${moving}`);
  }
  return facts;
}

/** Heading for an incomplete report with no findings: never a clean result. */
export function noFindingsStatement(report: Report): string {
  return report.coverage.complete && report.readiness.settled
    ? 'No findings recorded.'
    : 'No findings recorded in the part that was observed. This capture is partial or unsettled, so this is not a clean result.';
}

function makeNodeRef(nodeId: string, nodeMap: Map<string, Measurement>): ReportNodeRef {
  const node = nodeMap.get(nodeId);
  if (node) {
    return {
      nodeId: node.nodeId,
      tag: node.tag,
      label: node.label,
      semanticKey: node.semanticKey,
      role: node.role,
      source: node.source,
      box: node.box
    };
  }
  return {
    nodeId,
    tag: 'unknown',
    label: '',
    semanticKey: null,
    role: null,
    source: null,
    box: null
  };
}

function computeMeasuredVsExpected(finding: Finding): { measured: string; expected: string | null } {
  const ev = finding.evidence;
  switch (ev.kind) {
    case 'pointer-blocked':
      return {
        measured: `tested ${ev.tested} sample point${ev.tested === 1 ? '' : 's'}, ${ev.blocked} blocked`,
        expected: '0 blocked sample points (pointer accessible)'
      };
    case 'horizontal-overflow': {
      const overflow = ev.scrollWidth - ev.clientWidth;
      return {
        measured: `scrollWidth ${ev.scrollWidth}px exceeds clientWidth ${ev.clientWidth}px (${overflow}px overflow)`,
        expected: `scrollWidth <= ${ev.clientWidth}px`
      };
    }
    case 'clipped-by-ancestor': {
      const pct = Math.round((1 - ev.boxFraction) * 100);
      return {
        measured: `box is ${pct}% clipped by ancestor bounds`,
        expected: 'box unclipped (boxFraction = 1.0)'
      };
    }
    case 'text-clipped':
      return {
        measured: `${ev.clippedFragmentCount} text fragment(s) clipped across ${ev.lineCount} line(s)`,
        expected: '0 clipped text fragments'
      };
    case 'text-line-budget-exceeded':
      return {
        measured: `observed ${ev.observedLines} rendered line(s)`,
        expected: `at most ${ev.maxLines} line(s)`
      };
    case 'expected-visible-but-hidden':
      return {
        measured: `element hidden (${ev.hiddenReasons.join(', ')})`,
        expected: `element visible (expected: ${ev.expectedCurrent})`
      };
    case 'generic':
      return {
        measured: JSON.stringify(ev.details),
        expected: null
      };
  }
}

function computeSuggestion(finding: Finding, blockers: ReportNodeRef[], clipAncestors: ReportNodeRef[]): string | null {
  if (finding.suggestion) return finding.suggestion;
  const ev = finding.evidence;
  if (ev.kind === 'pointer-blocked' && blockers.length > 0) {
    const primary = blockers[0]!;
    const sourceLoc = primary.source ? ` at ${primary.source.file}:${primary.source.line}:${primary.source.column}` : '';
    return `Inspect blocking element <${primary.tag}> (node ${primary.nodeId})${sourceLoc} to allow pointer access or adjust placement.`;
  }
  if (ev.kind === 'clipped-by-ancestor' && clipAncestors.length > 0) {
    const primary = clipAncestors[0]!;
    const sourceLoc = primary.source ? ` at ${primary.source.file}:${primary.source.line}:${primary.source.column}` : '';
    return `Inspect clipping ancestor <${primary.tag}> (node ${primary.nodeId})${sourceLoc} bounds or overflow behavior.`;
  }
  if (ev.kind === 'horizontal-overflow') {
    return `Inspect container content dimensions to fit within clientWidth ${ev.clientWidth}px.`;
  }
  return null;
}

function findingRank(finding: ReportFinding): number {
  if (finding.acknowledged) return 4;
  if (finding.severity === 'error') return 1;
  if (finding.severity === 'warning') return 2;
  return 3; // info
}

function compareFindings(a: ReportFinding, b: ReportFinding): number {
  const rankDiff = findingRank(a) - findingRank(b);
  if (rankDiff !== 0) return rankDiff;

  const codeDiff = a.code.localeCompare(b.code);
  if (codeDiff !== 0) return codeDiff;

  const aFile = a.target.source?.file ?? '';
  const bFile = b.target.source?.file ?? '';
  const fileDiff = aFile.localeCompare(bFile);
  if (fileDiff !== 0) return fileDiff;

  const aLine = a.target.source?.line ?? 0;
  const bLine = b.target.source?.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;

  const aCol = a.target.source?.column ?? 0;
  const bCol = b.target.source?.column ?? 0;
  if (aCol !== bCol) return aCol - bCol;

  const nodeDiff = a.target.nodeId.localeCompare(b.target.nodeId);
  if (nodeDiff !== 0) return nodeDiff;

  return a.findingId.localeCompare(b.findingId);
}

function compareGroups(a: ReportFindingGroup, b: ReportFindingGroup): number {
  const aFirst = a.findings[0]!;
  const bFirst = b.findings[0]!;
  const rankDiff = findingRank(aFirst) - findingRank(bFirst);
  if (rankDiff !== 0) return rankDiff;

  const aErrors = a.findings.filter((f) => f.severity === 'error' && !f.acknowledged).length;
  const bErrors = b.findings.filter((f) => f.severity === 'error' && !f.acknowledged).length;
  if (aErrors !== bErrors) return bErrors - aErrors;

  const aWarnings = a.findings.filter((f) => f.severity === 'warning' && !f.acknowledged).length;
  const bWarnings = b.findings.filter((f) => f.severity === 'warning' && !f.acknowledged).length;
  if (aWarnings !== bWarnings) return bWarnings - aWarnings;

  return compareFindings(aFirst, bFirst);
}

export function createReport(snapshot: Snapshot): Report {
  const nodeMap = new Map<string, Measurement>(snapshot.nodes.map((node) => [node.nodeId, node]));
  const captureHash = hashSnapshot(snapshot);

  const reportFindings: ReportFinding[] = snapshot.findings.map((finding) => {
    const target = makeNodeRef(finding.nodeId, nodeMap);
    const ev = finding.evidence;
    const blockers = ev.kind === 'pointer-blocked' ? ev.blockerNodeIds.map((id) => makeNodeRef(id, nodeMap)) : [];
    const clipAncestors = ev.kind === 'clipped-by-ancestor' ? ev.ancestorNodeIds.map((id) => makeNodeRef(id, nodeMap)) : [];
    const relatedNodes = finding.relatedNodeIds.map((id) => makeNodeRef(id, nodeMap));
    const measuredVsExpected = computeMeasuredVsExpected(finding);
    const suggestion = computeSuggestion(finding, blockers, clipAncestors);

    return {
      findingId: finding.findingId,
      code: finding.code,
      severity: finding.severity,
      target,
      message: finding.message,
      evidence: finding.evidence,
      measuredVsExpected,
      relatedNodes,
      blockers,
      clipAncestors,
      limitations: [...finding.limitations],
      acknowledged: finding.acknowledged,
      suggestion
    };
  });

  // Group repeated symptoms by directly measured shared blocker or clip ancestor
  // First, group candidate keys
  const blockerGroups = new Map<string, ReportFinding[]>();
  const clipGroups = new Map<string, ReportFinding[]>();
  const independentFindings: ReportFinding[] = [];

  for (const finding of reportFindings) {
    if (finding.blockers.length > 0) {
      const primaryBlocker = finding.blockers[0]!.nodeId;
      const list = blockerGroups.get(primaryBlocker) ?? [];
      list.push(finding);
      blockerGroups.set(primaryBlocker, list);
    } else if (finding.clipAncestors.length > 0) {
      const primaryClip = finding.clipAncestors[0]!.nodeId;
      const list = clipGroups.get(primaryClip) ?? [];
      list.push(finding);
      clipGroups.set(primaryClip, list);
    } else {
      independentFindings.push(finding);
    }
  }

  const groups: ReportFindingGroup[] = [];

  for (const [blockerId, findings] of blockerGroups.entries()) {
    if (findings.length >= 2) {
      const sharedNode = makeNodeRef(blockerId, nodeMap);
      const tag = sharedNode.tag;
      const label = sharedNode.label ? ` "${sharedNode.label}"` : '';
      groups.push({
        groupId: `group-blocker-${blockerId}`,
        relation: {
          kind: 'shared-blocker',
          sharedNodeId: blockerId,
          sharedNode,
          label: `Shared blocker <${tag}>${label} (node ${blockerId})`,
          note: 'Directly measured shared relation; not a proved root cause.'
        },
        findings: [...findings].sort(compareFindings)
      });
    } else {
      independentFindings.push(...findings);
    }
  }

  for (const [clipId, findings] of clipGroups.entries()) {
    if (findings.length >= 2) {
      const sharedNode = makeNodeRef(clipId, nodeMap);
      const tag = sharedNode.tag;
      const label = sharedNode.label ? ` "${sharedNode.label}"` : '';
      groups.push({
        groupId: `group-clip-${clipId}`,
        relation: {
          kind: 'shared-clip-ancestor',
          sharedNodeId: clipId,
          sharedNode,
          label: `Shared clip ancestor <${tag}>${label} (node ${clipId})`,
          note: 'Directly measured shared relation; not a proved root cause.'
        },
        findings: [...findings].sort(compareFindings)
      });
    } else {
      independentFindings.push(...findings);
    }
  }

  for (const finding of independentFindings) {
    groups.push({
      groupId: `group-${finding.findingId}`,
      relation: {
        kind: 'independent',
        sharedNodeId: null,
        sharedNode: null,
        label: `Independent finding: ${finding.code}`,
        note: 'Directly measured relation; not a proved root cause.'
      },
      findings: [finding]
    });
  }

  // Sort groups deterministically
  groups.sort(compareGroups);

  const unacknowledgedErrors = reportFindings.filter((f) => f.severity === 'error' && !f.acknowledged).length;
  const unacknowledgedWarnings = reportFindings.filter((f) => f.severity === 'warning' && !f.acknowledged).length;
  const informational = reportFindings.filter((f) => f.severity === 'info' && !f.acknowledged).length;
  const acknowledged = reportFindings.filter((f) => f.acknowledged).length;
  const actionable = unacknowledgedErrors + unacknowledgedWarnings;

  const truncatedNodes = snapshot.nodes.filter((node) => node.truncated).length;

  let status: ReportSummary['status'] = 'pass';
  if (!snapshot.coverage.complete || !snapshot.readiness.settled) {
    status = 'incomplete';
  } else if (actionable > 0) {
    status = 'fail';
  }

  const summary: ReportSummary = {
    totalFindings: reportFindings.length,
    actionable,
    unacknowledgedErrors,
    unacknowledgedWarnings,
    informational,
    acknowledged,
    groupsCount: groups.length,
    status
  };

  return parseReport({
    schemaVersion: REPORT_SCHEMA_VERSION,
    reportId: `report-${snapshot.captureId}`,
    generatedAt: new Date().toISOString(),
    input: {
      captureId: snapshot.captureId,
      captureHash,
      sessionId: snapshot.sessionId,
      capturedAt: snapshot.capturedAt
    },
    environment: {
      browser: snapshot.environment.browser,
      browserVersion: snapshot.environment.browserVersion,
      compilerVersion: snapshot.environment.compilerVersion,
      runtimeVersion: snapshot.environment.runtimeVersion
    },
    page: {
      url: snapshot.page.url,
      title: snapshot.page.title,
      viewport: { ...snapshot.page.viewport },
      scroll: { ...snapshot.page.scroll },
      devicePixelRatio: snapshot.page.devicePixelRatio,
      visualViewportScale: snapshot.page.visualViewportScale,
      scenario: snapshot.page.scenario
    },
    readiness: {
      settled: snapshot.readiness.settled,
      waitMs: snapshot.readiness.waitMs,
      reasons: [...snapshot.readiness.reasons],
      ...(snapshot.readiness.lastObserved ? { lastObserved: snapshot.readiness.lastObserved } : {})
    },
    coverage: {
      complete: snapshot.coverage.complete,
      discoveredNodes: snapshot.coverage.discoveredNodes,
      inspectedNodes: snapshot.coverage.inspectedNodes,
      skippedNodes: snapshot.coverage.skippedNodes,
      reasons: [...snapshot.coverage.reasons],
      capabilities: [...snapshot.coverage.capabilities],
      unsupportedFeatures: [...snapshot.coverage.unsupportedFeatures],
      ...(snapshot.coverage.nodesObserved !== undefined ? { nodesObserved: snapshot.coverage.nodesObserved } : {}),
      ...(truncatedNodes > 0 ? { truncatedNodes } : {}),
      paintVisibility: 'unknown'
    },
    summary,
    groups
  });
}
