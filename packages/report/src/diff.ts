import { createHash } from 'node:crypto';
import type { Snapshot } from '@anwc/protocol';
import { createReport } from './model.js';
import type { Report, ReportFinding, ReportNodeRef } from './schema.js';
import {
  DIFF_SCHEMA_VERSION,
  type DiffCaptureInfo,
  type DiffCompatibility,
  type DiffReport,
  type DiffSummary,
  type FindingComparison,
  type FindingComparisonStatus,
  type TargetMatch
} from './diff-schema.js';

export interface DiffOptions {
  behaviorCheckPassed?: boolean;
}

function resolveReport(input: Snapshot | Report): Report {
  if ('schemaVersion' in input && input.schemaVersion === '0.1' && 'groups' in input && 'summary' in input) {
    return input as Report;
  }
  return createReport(input as Snapshot);
}

function computeDiffId(beforeHash: string, afterHash: string): string {
  const digest = createHash('sha256').update(`${beforeHash}:${afterHash}`).digest('hex').slice(0, 16);
  return `diff_${digest}`;
}

export function compareRepairs(
  beforeInput: Snapshot | Report,
  afterInput: Snapshot | Report,
  options: DiffOptions = {}
): DiffReport {
  const before = resolveReport(beforeInput);
  const after = resolveReport(afterInput);

  const beforeUrl = new URL(before.page.url);
  const afterUrl = new URL(after.page.url);
  const originMatch = beforeUrl.origin === afterUrl.origin;
  const viewportMatch =
    before.page.viewport.width === after.page.viewport.width &&
    before.page.viewport.height === after.page.viewport.height;
  const scrollMatch =
    before.page.scroll.x === after.page.scroll.x &&
    before.page.scroll.y === after.page.scroll.y;
  const rulesVersionMatch = before.environment.runtimeVersion === after.environment.runtimeVersion;

  const incompatibilityReasons: string[] = [];
  if (!originMatch) incompatibilityReasons.push(`Origin mismatch: '${beforeUrl.origin}' vs '${afterUrl.origin}'.`);
  if (!viewportMatch) {
    incompatibilityReasons.push(
      `Viewport mismatch: ${before.page.viewport.width}x${before.page.viewport.height} vs ${after.page.viewport.width}x${after.page.viewport.height}. Comparison requires matching viewport.`
    );
  }
  if (!scrollMatch) {
    incompatibilityReasons.push(
      `Scroll mismatch: (${before.page.scroll.x}, ${before.page.scroll.y}) vs (${after.page.scroll.x}, ${after.page.scroll.y}).`
    );
  }

  const comparable = incompatibilityReasons.length === 0;

  const compatibility: DiffCompatibility = {
    comparable,
    reasons: incompatibilityReasons,
    viewportMatch,
    scrollMatch,
    originMatch,
    rulesVersionMatch
  };

  const beforeCaptureInfo: DiffCaptureInfo = {
    captureId: before.input.captureId,
    captureHash: before.input.captureHash,
    url: before.page.url,
    viewport: before.page.viewport,
    scroll: before.page.scroll,
    complete: before.coverage.complete,
    inspectedNodes: before.coverage.inspectedNodes,
    actionableFindings: before.summary.actionable
  };

  const afterCaptureInfo: DiffCaptureInfo = {
    captureId: after.input.captureId,
    captureHash: after.input.captureHash,
    url: after.page.url,
    viewport: after.page.viewport,
    scroll: after.page.scroll,
    complete: after.coverage.complete,
    inspectedNodes: after.coverage.inspectedNodes,
    actionableFindings: after.summary.actionable
  };

  const beforeFindings = before.groups.flatMap((g) => g.findings);
  const afterFindings = after.groups.flatMap((g) => g.findings);

  // Collect target nodes from findings
  const beforeTargets = new Map<string, ReportNodeRef>();
  for (const f of beforeFindings) {
    beforeTargets.set(f.target.nodeId, f.target);
  }
  const afterTargets = new Map<string, ReportNodeRef>();
  for (const f of afterFindings) {
    afterTargets.set(f.target.nodeId, f.target);
  }

function toReportNodeRef(node: any): ReportNodeRef {
  return {
    nodeId: node.nodeId,
    tag: node.tag,
    label: node.label,
    semanticKey: node.semanticKey ?? null,
    role: node.role ?? null,
    source: node.source ?? null,
    box: node.box ?? null
  };
}

  // Also collect all nodes from both captures if provided from raw snapshot
  const beforeAllNodes = 'nodes' in (beforeInput as unknown as Record<string, unknown>)
    ? ((beforeInput as unknown as { nodes: any[] }).nodes || []).map(toReportNodeRef)
    : Array.from(beforeTargets.values());
  const afterAllNodes = 'nodes' in (afterInput as unknown as Record<string, unknown>)
    ? ((afterInput as unknown as { nodes: any[] }).nodes || []).map(toReportNodeRef)
    : Array.from(afterTargets.values());

  // Count key occurrences in before and after to detect duplicate keys
  const beforeKeyCounts = new Map<string, number>();
  for (const n of beforeAllNodes) {
    if (n.semanticKey) {
      beforeKeyCounts.set(n.semanticKey, (beforeKeyCounts.get(n.semanticKey) || 0) + 1);
    }
  }
  const afterKeyCounts = new Map<string, number>();
  for (const n of afterAllNodes) {
    if (n.semanticKey) {
      afterKeyCounts.set(n.semanticKey, (afterKeyCounts.get(n.semanticKey) || 0) + 1);
    }
  }

  // Map before target nodes to after nodes
  const targetMatches: TargetMatch[] = [];
  const matchedAfterNodeIds = new Set<string>();

  for (const [beforeNodeId, beforeNode] of beforeTargets.entries()) {
    const key = beforeNode.semanticKey;
    if (key) {
      const bCount = beforeKeyCounts.get(key) || 0;
      const aCount = afterKeyCounts.get(key) || 0;
      if (bCount > 1 || aCount > 1) {
        targetMatches.push({
          targetKey: `key:${key}`,
          strategy: 'ambiguous',
          confidence: 'ambiguous',
          beforeNode,
          afterNode: null,
          notes: `Duplicate author key '${key}' observed (${bCount} before, ${aCount} after). Cannot disambiguate.`
        });
        continue;
      }

      // Unique key
      const afterMatch = afterAllNodes.find((n) => n.semanticKey === key);
      if (afterMatch) {
        matchedAfterNodeIds.add(afterMatch.nodeId);
        targetMatches.push({
          targetKey: `key:${key}`,
          strategy: 'author-key',
          confidence: 'definite',
          beforeNode,
          afterNode: afterMatch
        });
        continue;
      } else {
        // Key missing in after -> target unmounted / removed
        targetMatches.push({
          targetKey: `key:${key}`,
          strategy: 'unmatched',
          confidence: 'none',
          beforeNode,
          afterNode: null,
          notes: `Author key '${key}' not found in after capture (target removed or unmounted).`
        });
        continue;
      }
    }

    // No author key -> source-site and structural heuristic
    if (beforeNode.source) {
      // Look for match with same file and tag and role
      const candidates = afterAllNodes.filter(
        (n) =>
          !matchedAfterNodeIds.has(n.nodeId) &&
          n.source?.file === beforeNode.source?.file &&
          n.tag === beforeNode.tag &&
          n.role === beforeNode.role
      );

      if (candidates.length === 1) {
        const afterMatch = candidates[0]!;
        matchedAfterNodeIds.add(afterMatch.nodeId);
        targetMatches.push({
          targetKey: `source:${beforeNode.source.file}:${beforeNode.tag}:${beforeNode.label.slice(0, 20)}`,
          strategy: 'source-site',
          confidence: 'heuristic',
          beforeNode,
          afterNode: afterMatch,
          notes: `Matched by source module '${beforeNode.source.file}' and tag '${beforeNode.tag}'.`
        });
        continue;
      } else if (candidates.length > 1) {
        targetMatches.push({
          targetKey: `source:${beforeNode.source.file}:${beforeNode.tag}`,
          strategy: 'ambiguous',
          confidence: 'ambiguous',
          beforeNode,
          afterNode: null,
          notes: `Multiple (${candidates.length}) identical candidate elements in '${beforeNode.source.file}'. Ambiguous match.`
        });
        continue;
      }
    }

    // Unmatched
    targetMatches.push({
      targetKey: `node:${beforeNode.nodeId}`,
      strategy: 'unmatched',
      confidence: 'none',
      beforeNode,
      afterNode: null,
      notes: 'No reliable author key or source identity found in after capture.'
    });
  }

  // Compare findings
  const findingComparisons: FindingComparison[] = [];

  for (const bFinding of beforeFindings) {
    const comparisonId = `comp_${bFinding.findingId}`;
    const targetMatch = targetMatches.find((m) => m.beforeNode?.nodeId === bFinding.target.nodeId);

    if (!comparable) {
      findingComparisons.push({
        comparisonId,
        status: 'non-comparable',
        targetKey: targetMatch?.targetKey || `node:${bFinding.target.nodeId}`,
        ruleCode: bFinding.code,
        target: bFinding.target,
        beforeFinding: bFinding,
        afterFinding: null,
        explanation: `Comparison is non-comparable: ${incompatibilityReasons.join(' ')}`,
        targetRetained: false,
        coverageAdequate: false
      });
      continue;
    }

    if (!targetMatch || targetMatch.strategy === 'unmatched' || !targetMatch.afterNode) {
      // Target was removed or unmounted
      findingComparisons.push({
        comparisonId,
        status: 'inconclusive',
        targetKey: targetMatch?.targetKey || `node:${bFinding.target.nodeId}`,
        ruleCode: bFinding.code,
        target: bFinding.target,
        beforeFinding: bFinding,
        afterFinding: null,
        explanation: 'Target element was removed or unmounted in after capture. Deletion cannot masquerade as a verified repair.',
        targetRetained: false,
        coverageAdequate: after.coverage.complete
      });
      continue;
    }

    if (targetMatch.strategy === 'ambiguous') {
      findingComparisons.push({
        comparisonId,
        status: 'inconclusive',
        targetKey: targetMatch.targetKey,
        ruleCode: bFinding.code,
        target: bFinding.target,
        beforeFinding: bFinding,
        afterFinding: null,
        explanation: `Target match is ambiguous (${targetMatch.notes || 'multiple candidate elements'}). Cannot verify repair.`,
        targetRetained: true,
        coverageAdequate: after.coverage.complete
      });
      continue;
    }

    // Matched after target node
    const afterNode = targetMatch.afterNode;
    // Check if the same finding exists on this matched node
    const matchingAfterFinding = afterFindings.find(
      (af) => af.code === bFinding.code && af.target.nodeId === afterNode.nodeId
    );

    if (matchingAfterFinding) {
      findingComparisons.push({
        comparisonId,
        status: 'persistent',
        targetKey: targetMatch.targetKey,
        ruleCode: bFinding.code,
        target: afterNode,
        beforeFinding: bFinding,
        afterFinding: matchingAfterFinding,
        explanation: `Defect persists: finding '${bFinding.code}' is still measured on the target in after capture.`,
        targetRetained: true,
        coverageAdequate: after.coverage.complete
      });
    } else {
      // Finding is absent in after!
      // Verify adequate coverage and behavior
      if (!after.coverage.complete) {
        findingComparisons.push({
          comparisonId,
          status: 'inconclusive',
          targetKey: targetMatch.targetKey,
          ruleCode: bFinding.code,
          target: afterNode,
          beforeFinding: bFinding,
          afterFinding: null,
          explanation: 'Finding is no longer observed, but after capture had incomplete DOM/sampling coverage. Cannot verify repair.',
          targetRetained: true,
          coverageAdequate: false
        });
      } else if (options.behaviorCheckPassed === false) {
        findingComparisons.push({
          comparisonId,
          status: 'inconclusive',
          targetKey: targetMatch.targetKey,
          ruleCode: bFinding.code,
          target: afterNode,
          beforeFinding: bFinding,
          afterFinding: null,
          explanation: 'Finding is no longer observed, but declared behavior assertion failed. Action is not functionally verified.',
          targetRetained: true,
          coverageAdequate: true
        });
      } else {
        findingComparisons.push({
          comparisonId,
          status: 'verified-fixed',
          targetKey: targetMatch.targetKey,
          ruleCode: bFinding.code,
          target: afterNode,
          beforeFinding: bFinding,
          afterFinding: null,
          explanation: `Finding '${bFinding.code}' resolved on target '${targetMatch.targetKey}'. Target retained and verified.`,
          targetRetained: true,
          coverageAdequate: true
        });
      }
    }
  }

  // Check for new findings in after that were not in before (regressions)
  for (const aFinding of afterFindings) {
    // Check if this after finding was already matched to a before finding
    const alreadyCompared = findingComparisons.some((fc) => fc.afterFinding?.findingId === aFinding.findingId);
    if (!alreadyCompared) {
      findingComparisons.push({
        comparisonId: `comp_new_${aFinding.findingId}`,
        status: 'new-finding',
        targetKey: aFinding.target.semanticKey ? `key:${aFinding.target.semanticKey}` : `node:${aFinding.target.nodeId}`,
        ruleCode: aFinding.code,
        target: aFinding.target,
        beforeFinding: null,
        afterFinding: aFinding,
        explanation: `New finding '${aFinding.code}' introduced on target '${aFinding.target.label || aFinding.target.tag}'. Potential regression.`,
        targetRetained: true,
        coverageAdequate: after.coverage.complete
      });
    }
  }

  // Summarize
  const verifiedFixed = findingComparisons.filter((c) => c.status === 'verified-fixed').length;
  const persistent = findingComparisons.filter((c) => c.status === 'persistent').length;
  const newFindings = findingComparisons.filter((c) => c.status === 'new-finding').length;
  const inconclusive = findingComparisons.filter((c) => c.status === 'inconclusive').length;

  let repairIntegrityVerdict: DiffSummary['repairIntegrityVerdict'];
  if (!comparable) {
    repairIntegrityVerdict = 'incompatible-comparison';
  } else if (newFindings > 0) {
    repairIntegrityVerdict = 'regressions-introduced';
  } else if (persistent > 0) {
    repairIntegrityVerdict = 'unresolved-defects';
  } else if (inconclusive > 0) {
    repairIntegrityVerdict = 'inconclusive-evidence';
  } else {
    repairIntegrityVerdict = 'verified-repair';
  }

  const summary: DiffSummary = {
    verifiedFixed,
    persistent,
    newFindings,
    inconclusive,
    totalBefore: beforeFindings.length,
    totalAfter: afterFindings.length,
    repairIntegrityVerdict
  };

  return {
    schemaVersion: DIFF_SCHEMA_VERSION,
    diffId: computeDiffId(before.input.captureHash, after.input.captureHash),
    generatedAt: new Date().toISOString(),
    before: beforeCaptureInfo,
    after: afterCaptureInfo,
    compatibility,
    targetMatches,
    findings: findingComparisons,
    summary
  };
}
