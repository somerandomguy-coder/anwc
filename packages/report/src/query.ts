import type { Finding, Measurement, RawCapture, Snapshot, SourceRef } from '@anwc/protocol';
import { createReport } from './model.js';
import type { Report, ReportFinding, ReportNodeRef } from './schema.js';
import {
  type AgentClipAncestorDetail,
  type AgentFindingDetail,
  type AgentFindingSummaryItem,
  type AgentSampleDetail,
  type AgentScope,
  type AgentSummary,
  type AgentTarget,
  type QueryFilter,
  agentFindingDetailSchema,
  agentSummarySchema
} from './query-schema.js';

function isReport(input: unknown): input is Report {
  return (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    'groups' in input &&
    'summary' in input &&
    'input' in input
  );
}

function formatSource(source: SourceRef | null | undefined): string | null {
  if (!source) return null;
  return `${source.file}:${source.line}:${source.column}`;
}

function toAgentTarget(node: ReportNodeRef): AgentTarget {
  return {
    nodeId: node.nodeId,
    tag: node.tag,
    label: node.label,
    semanticKey: node.semanticKey,
    role: node.role,
    source: formatSource(node.source),
    sourceRef: node.source,
    box: node.box
  };
}

function toAgentTargetFromMeasurement(node: Measurement): AgentTarget {
  return {
    nodeId: node.nodeId,
    tag: node.tag,
    label: node.label,
    semanticKey: node.semanticKey,
    role: node.role,
    source: formatSource(node.source),
    sourceRef: node.source,
    box: node.box
  };
}

function toAgentFindingSummaryItem(finding: ReportFinding): AgentFindingSummaryItem {
  return {
    findingId: finding.findingId,
    code: finding.code,
    severity: finding.severity,
    target: toAgentTarget(finding.target),
    message: finding.message,
    measuredVsExpected: {
      measured: finding.measuredVsExpected.measured,
      expected: finding.measuredVsExpected.expected
    },
    blockers: finding.blockers.map(toAgentTarget),
    clipAncestors: finding.clipAncestors.map(toAgentTarget),
    limitations: [...finding.limitations],
    acknowledged: finding.acknowledged,
    suggestion: finding.suggestion
  };
}

function matchesFilter(finding: ReportFinding, filter?: QueryFilter): boolean {
  if (!filter) return true;

  if (filter.findingId && finding.findingId !== filter.findingId) {
    return false;
  }

  if (filter.code && finding.code.toUpperCase() !== filter.code.toUpperCase()) {
    return false;
  }

  if (filter.severity && finding.severity !== filter.severity) {
    return false;
  }

  if (filter.nodeId && finding.target.nodeId !== filter.nodeId) {
    return false;
  }

  if (filter.file) {
    const file = finding.target.source?.file ?? '';
    if (!file.toLowerCase().includes(filter.file.toLowerCase())) {
      return false;
    }
  }

  if (filter.actionableOnly) {
    if (finding.acknowledged || finding.severity === 'info') {
      return false;
    }
  }

  return true;
}

export function queryReportSummary(input: Report | Snapshot, filter?: QueryFilter): AgentSummary {
  const report = isReport(input) ? input : createReport(input);

  const allFindings: ReportFinding[] = [];
  for (const group of report.groups) {
    for (const f of group.findings) {
      allFindings.push(f);
    }
  }

  const isFiltered = Boolean(
    filter &&
      (filter.code ||
        filter.severity ||
        filter.nodeId ||
        filter.findingId ||
        filter.file ||
        filter.actionableOnly)
  );

  const matched = allFindings.filter((f) => matchesFilter(f, filter));
  const totalFindings = allFindings.length;
  const matchedFindings = matched.length;
  const excludedFindings = totalFindings - matchedFindings;

  let filterNote: string | null = null;
  if (isFiltered) {
    if (matchedFindings === 0 && totalFindings > 0) {
      filterNote = `0 findings matched the active filter; this does NOT indicate that the page has zero defects (total findings in report: ${totalFindings}, ${excludedFindings} excluded by filter).`;
    } else {
      filterNote = `${matchedFindings} of ${totalFindings} findings matched filter (${excludedFindings} excluded).`;
    }
  }

  const limited = filter?.limit ? matched.slice(0, filter.limit) : matched;

  const scope: AgentScope = {
    totalFindings,
    matchedFindings,
    excludedFindings,
    isFiltered,
    filter: filter ?? null,
    filterNote
  };

  const agentSummary: AgentSummary = {
    schemaVersion: '0.1',
    reportId: report.reportId,
    captureHash: report.input.captureHash,
    page: {
      url: report.page.url,
      title: report.page.title,
      viewport: { ...report.page.viewport }
    },
    coverage: {
      complete: report.coverage.complete,
      paintVisibility: 'unknown'
    },
    readiness: {
      settled: report.readiness.settled
    },
    summary: { ...report.summary },
    scope,
    findings: limited.map(toAgentFindingSummaryItem)
  };

  return agentSummarySchema.parse(agentSummary);
}

export function queryFindingDetail(input: Report | Snapshot, findingId: string): AgentFindingDetail | null {
  const isSnap = !isReport(input);
  const snapshot: Snapshot | null = isSnap ? (input as Snapshot) : null;
  const report = isSnap ? createReport(input as Snapshot) : (input as Report);

  let targetReportFinding: ReportFinding | null = null;
  for (const group of report.groups) {
    for (const f of group.findings) {
      if (f.findingId === findingId || f.target.nodeId === findingId) {
        targetReportFinding = f;
        break;
      }
    }
    if (targetReportFinding) break;
  }

  if (!targetReportFinding) {
    return null;
  }

  const finding = toAgentFindingSummaryItem(targetReportFinding);

  // Look up target node measurement if snapshot is available
  const nodeMap = snapshot ? new Map(snapshot.nodes.map((n) => [n.nodeId, n])) : null;
  const targetMeasurement = nodeMap?.get(targetReportFinding.target.nodeId);

  const targetNode = {
    nodeId: targetReportFinding.target.nodeId,
    tag: targetReportFinding.target.tag,
    label: targetReportFinding.target.label,
    semanticKey: targetReportFinding.target.semanticKey,
    role: targetReportFinding.target.role,
    source: targetReportFinding.target.source,
    box: targetReportFinding.target.box,
    overflow: targetMeasurement?.overflow ?? null,
    intent: targetMeasurement?.intent ?? null,
    interaction: targetMeasurement?.interaction ?? null
  };

  // Reconstruct evidence details
  const ev = targetReportFinding.evidence;
  let pointerSamples: AgentSampleDetail[] | undefined;
  let clippingAncestors: AgentClipAncestorDetail[] | undefined;
  let boxFraction: number | undefined;
  let clippedIntersection = null;
  let textLines: { observed: number; allowed: number | null; clippedFragments: number } | undefined;
  let overflowPx: { x: number; y: number } | undefined;
  let hiddenReasons: string[] | undefined;

  if (ev.kind === 'pointer-blocked') {
    if (targetMeasurement && targetMeasurement.pointer.status === 'known' && targetMeasurement.pointer.value) {
      pointerSamples = targetMeasurement.pointer.value.samples.map((s) => {
        const blockerNode = s.blockerNodeId && nodeMap ? nodeMap.get(s.blockerNodeId) : null;
        return {
          x: s.x,
          y: s.y,
          result: s.result,
          blockerNodeId: s.blockerNodeId,
          blocker: blockerNode ? toAgentTargetFromMeasurement(blockerNode) : null
        };
      });
    } else {
      // Reconstruct summary sample list from blockers
      pointerSamples = targetReportFinding.blockers.map((b) => ({
        x: targetReportFinding!.target.box ? targetReportFinding!.target.box.x + Math.round(targetReportFinding!.target.box.width / 2) : 0,
        y: targetReportFinding!.target.box ? targetReportFinding!.target.box.y + Math.round(targetReportFinding!.target.box.height / 2) : 0,
        result: 'blocked',
        blockerNodeId: b.nodeId,
        blocker: toAgentTarget(b)
      }));
    }
  } else if (ev.kind === 'clipped-by-ancestor') {
    boxFraction = ev.boxFraction;
    if (targetMeasurement && targetMeasurement.clip.status === 'known' && targetMeasurement.clip.value) {
      clippedIntersection = targetMeasurement.clip.value.intersection;
      clippingAncestors = targetMeasurement.clip.value.ancestors.map((a) => {
        const aNode = nodeMap ? nodeMap.get(a.nodeId) : null;
        return {
          node: aNode
            ? toAgentTargetFromMeasurement(aNode)
            : {
                nodeId: a.nodeId,
                tag: 'element',
                label: '',
                semanticKey: null,
                role: null,
                source: null,
                box: a.box
              },
          axes: a.axes,
          box: a.box
        };
      });
    } else {
      clippingAncestors = targetReportFinding.clipAncestors.map((ca) => ({
        node: toAgentTarget(ca),
        axes: 'xy' as const,
        box: ca.box ?? { x: 0, y: 0, width: 0, height: 0 }
      }));
    }
  } else if (ev.kind === 'horizontal-overflow') {
    overflowPx = {
      x: ev.scrollWidth - ev.clientWidth,
      y: 0
    };
  } else if (ev.kind === 'text-clipped') {
    textLines = {
      observed: ev.lineCount,
      allowed: null,
      clippedFragments: ev.clippedFragmentCount
    };
  } else if (ev.kind === 'text-line-budget-exceeded') {
    textLines = {
      observed: ev.observedLines,
      allowed: ev.maxLines,
      clippedFragments: 0
    };
  } else if (ev.kind === 'expected-visible-but-hidden') {
    hiddenReasons = [...ev.hiddenReasons];
  }

  const file = targetReportFinding.target.source?.file ?? null;
  const line = targetReportFinding.target.source?.line ?? null;
  const column = targetReportFinding.target.source?.column ?? null;
  const componentHint = file ? file.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? null : null;

  const repairContext = {
    file,
    line,
    column,
    componentHint,
    suggestedAction: targetReportFinding.suggestion
  };

  const detail: AgentFindingDetail = {
    schemaVersion: '0.1',
    reportId: report.reportId,
    captureHash: report.input.captureHash,
    finding,
    targetNode,
    evidenceDetails: {
      kind: ev.kind,
      pointerSamples,
      clippingAncestors,
      boxFraction,
      clippedIntersection,
      textLines,
      overflowPx,
      hiddenReasons
    },
    blockers: targetReportFinding.blockers.map(toAgentTarget),
    clipAncestors: targetReportFinding.clipAncestors.map(toAgentTarget),
    relatedNodes: targetReportFinding.relatedNodes.map(toAgentTarget),
    repairContext
  };

  return agentFindingDetailSchema.parse(detail);
}

export function formatAgentSummaryText(summary: AgentSummary, options?: { maxChars?: number }): string {
  const maxChars = options?.maxChars ?? 12_000;
  const lines: string[] = [];

  const status = summary.summary.status.toUpperCase();
  lines.push(
    `ANWC ${summary.schemaVersion} AGENT SUMMARY | Status: ${status} | Viewport: ${summary.page.viewport.width}x${summary.page.viewport.height} | Capture: ${summary.captureHash.slice(0, 8)}`
  );

  const coverage = summary.coverage.complete ? 'complete capture' : 'partial capture';
  const readiness = summary.readiness.settled ? 'settled' : 'unsettled';
  lines.push(`Coverage: ${coverage}, ${readiness} | Paint visibility: unknown | No screenshots`);

  if (summary.scope.isFiltered && summary.scope.filterNote) {
    lines.push(`Scope Filter: ${summary.scope.filterNote}`);
  }

  lines.push(
    `Findings: ${summary.summary.totalFindings} total (${summary.summary.unacknowledgedErrors} errors, ${summary.summary.unacknowledgedWarnings} warnings, ${summary.summary.acknowledged} acknowledged)`
  );
  lines.push('');

  if (summary.findings.length === 0) {
    if (summary.scope.isFiltered) {
      lines.push(
        `0 findings match the filter. Note: This does NOT mean the page passed inspection (${summary.scope.totalFindings} total findings exist in capture).`
      );
    } else {
      lines.push('0 actionable findings observed across inspected rules.');
    }
  } else {
    for (let i = 0; i < summary.findings.length; i++) {
      const f = summary.findings[i]!;
      const tag = `<${f.target.tag}>`;
      const label = f.target.label ? ` "${f.target.label}"` : (f.target.semanticKey ? ` [${f.target.semanticKey}]` : '');
      const source = f.target.source ? ` at ${f.target.source}` : ' (uninstrumented)';

      lines.push(`[${i + 1}] ${f.severity.toUpperCase()} ${f.code} ${tag}${label} (node ${f.target.nodeId})`);
      lines.push(`    source: ${source.trim()}`);
      lines.push(`    message: ${f.message}`);
      lines.push(`    measured: ${f.measuredVsExpected.measured}`);
      if (f.measuredVsExpected.expected) {
        lines.push(`    expected: ${f.measuredVsExpected.expected}`);
      }
      if (f.blockers.length > 0) {
        const blockerStr = f.blockers
          .map((b) => `<${b.tag}>${b.label ? ` "${b.label}"` : ''} (node ${b.nodeId})${b.source ? ` at ${b.source}` : ''}`)
          .join(', ');
        lines.push(`    blockers: ${blockerStr}`);
      }
      if (f.clipAncestors.length > 0) {
        const clipStr = f.clipAncestors
          .map((c) => `<${c.tag}>${c.label ? ` "${c.label}"` : ''} (node ${c.nodeId})${c.source ? ` at ${c.source}` : ''}`)
          .join(', ');
        lines.push(`    clip ancestors: ${clipStr}`);
      }
      if (f.suggestion) {
        lines.push(`    suggestion: ${f.suggestion}`);
      }
      lines.push(`    drilldown: anwc report <file> --query detail --finding-id ${f.findingId}`);
      lines.push('');
    }
  }

  const result = lines.join('\n');
  if (result.length > maxChars) {
    return `${result.slice(0, maxChars - 40)}\n... [output truncated by character budget]`;
  }
  return result;
}

export function formatAgentDetailText(detail: AgentFindingDetail): string {
  const f = detail.finding;
  const t = detail.targetNode;
  const lines: string[] = [
    `ANWC ${detail.schemaVersion} AGENT FINDING DETAIL | Finding: ${f.findingId}`,
    `Severity: ${f.severity.toUpperCase()} | Code: ${f.code}`,
    `Message: ${f.message}`,
    `Target: <${t.tag}>${t.label ? ` "${t.label}"` : ''} (node ${t.nodeId})`,
    `  Source: ${formatSource(t.source) ?? 'unavailable'}`,
    `  Box: ${t.box ? `x:${t.box.x}, y:${t.box.y}, w:${t.box.width}, h:${t.box.height}` : 'no box'}`,
    `Measured: ${f.measuredVsExpected.measured}`,
    `Expected: ${f.measuredVsExpected.expected ?? 'none declared'}`
  ];

  if (detail.evidenceDetails.pointerSamples && detail.evidenceDetails.pointerSamples.length > 0) {
    lines.push('Pointer Hit Samples:');
    for (const s of detail.evidenceDetails.pointerSamples) {
      const hit = s.blocker
        ? `<${s.blocker.tag}>${s.blocker.label ? ` "${s.blocker.label}"` : ''} (node ${s.blocker.nodeId})`
        : s.result;
      lines.push(`  - sample (${s.x}, ${s.y}): ${hit}`);
    }
  }

  if (detail.evidenceDetails.clippingAncestors && detail.evidenceDetails.clippingAncestors.length > 0) {
    lines.push('Clipping Ancestors:');
    for (const ca of detail.evidenceDetails.clippingAncestors) {
      lines.push(
        `  - <${ca.node.tag}> (node ${ca.node.nodeId}) clip axes: ${ca.axes}, box: x:${ca.box.x}, y:${ca.box.y}, w:${ca.box.width}, h:${ca.box.height}`
      );
    }
    if (detail.evidenceDetails.boxFraction !== undefined) {
      lines.push(`  - visible box fraction: ${Math.round(detail.evidenceDetails.boxFraction * 100)}%`);
    }
  }

  if (detail.evidenceDetails.overflowPx) {
    lines.push(`Overflow: ${detail.evidenceDetails.overflowPx.x}px horizontal`);
  }

  if (detail.evidenceDetails.textLines) {
    lines.push(
      `Text Lines: observed ${detail.evidenceDetails.textLines.observed}, max allowed: ${detail.evidenceDetails.textLines.allowed ?? 'none'}, clipped fragments: ${detail.evidenceDetails.textLines.clippedFragments}`
    );
  }

  if (detail.evidenceDetails.hiddenReasons && detail.evidenceDetails.hiddenReasons.length > 0) {
    lines.push(`Hidden Reasons: ${detail.evidenceDetails.hiddenReasons.join(', ')}`);
  }

  if (detail.blockers.length > 0) {
    lines.push('Blockers:');
    for (const b of detail.blockers) {
      lines.push(
        `  - <${b.tag}>${b.label ? ` "${b.label}"` : ''} (node ${b.nodeId})${b.source ? ` at ${b.source}` : ''}`
      );
    }
  }

  if (detail.clipAncestors.length > 0) {
    lines.push('Clip Ancestors:');
    for (const ca of detail.clipAncestors) {
      lines.push(
        `  - <${ca.tag}>${ca.label ? ` "${ca.label}"` : ''} (node ${ca.nodeId})${ca.source ? ` at ${ca.source}` : ''}`
      );
    }
  }

  if (detail.repairContext.suggestedAction) {
    lines.push(`Suggested Action: ${detail.repairContext.suggestedAction}`);
  }

  return lines.join('\n');
}

