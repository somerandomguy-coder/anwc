import { createHash } from 'node:crypto';
import { snapshotSchema, type Snapshot } from '@anwc/protocol';
import { createReport } from './model.js';
import { reportSchema, type Report, type ReportNodeRef } from './schema.js';
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

export type DiffInput =
  | { kind: 'snapshot'; snapshot: Snapshot; report: Report }
  | { kind: 'report'; snapshot: null; report: Report };

/** Thrown when a diff input matches neither the Snapshot 0.1 nor the Report 0.1 schema. */
export class DiffInputError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'DiffInputError';
    this.issues = issues;
  }
}

function formatIssues(issues: Array<{ path: Array<string | number>; message: string }>, limit = 5): string[] {
  return issues.slice(0, limit).map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`);
}

/**
 * Validates one diff input against the published schemas. Raw captures without findings,
 * hand-written partial objects and other shapes are rejected instead of being coerced.
 */
export function parseDiffInput(input: unknown): DiffInput {
  const snapshotResult = snapshotSchema.safeParse(input);
  if (snapshotResult.success) {
    return { kind: 'snapshot', snapshot: snapshotResult.data, report: createReport(snapshotResult.data) };
  }
  const reportResult = reportSchema.safeParse(input);
  if (reportResult.success) {
    return { kind: 'report', snapshot: null, report: reportResult.data };
  }
  const looksLikeReport = typeof input === 'object' && input !== null && 'groups' in input;
  const issues = formatIssues(looksLikeReport ? reportResult.error.issues : snapshotResult.error.issues);
  throw new DiffInputError(
    `Input does not match Snapshot 0.1 or Report 0.1 schema (${looksLikeReport ? 'Report' : 'Snapshot'} issues: ${issues.join('; ')}).`,
    issues
  );
}

function isDiffInput(input: unknown): input is DiffInput {
  return typeof input === 'object' && input !== null && 'kind' in input && 'report' in input && !('schemaVersion' in input);
}

function computeDiffId(beforeHash: string, afterHash: string): string {
  const digest = createHash('sha256').update(`${beforeHash}:${afterHash}`).digest('hex').slice(0, 16);
  return `diff_${digest}`;
}

export function compareRepairs(
  beforeInput: Snapshot | Report | DiffInput,
  afterInput: Snapshot | Report | DiffInput,
  options: DiffOptions = {}
): DiffReport {
  // Re-validate even pre-parsed inputs: the pure API must not trust caller-built objects.
  const beforeResolved = parseDiffInput(isDiffInput(beforeInput) ? beforeInput.snapshot ?? beforeInput.report : beforeInput);
  const afterResolved = parseDiffInput(isDiffInput(afterInput) ? afterInput.snapshot ?? afterInput.report : afterInput);
  const before = beforeResolved.report;
  const after = afterResolved.report;

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
  if (beforeUrl.href !== afterUrl.href || before.page.scenario !== after.page.scenario) {
    incompatibilityReasons.push('Page URL or declared scenario differs. Reproduce the same state before comparing repairs.');
  }
  if (!rulesVersionMatch) incompatibilityReasons.push('Runtime versions differ. Capture both states with the same runtime.');
  if (before.page.devicePixelRatio !== after.page.devicePixelRatio || before.page.visualViewportScale !== after.page.visualViewportScale) {
    incompatibilityReasons.push('Device pixel ratio or visual viewport scale differs.');
  }
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

  // Snapshots carry every inspected node; Reports only carry finding targets.
  const toReportNodeRef = (node: Snapshot['nodes'][number]): ReportNodeRef => ({
    nodeId: node.nodeId,
    tag: node.tag,
    label: node.label,
    semanticKey: node.semanticKey,
    role: node.role,
    source: node.source,
    box: node.box
  });
  const beforeAllNodes = beforeResolved.snapshot
    ? beforeResolved.snapshot.nodes.map(toReportNodeRef)
    : Array.from(beforeTargets.values());
  const afterAllNodes = afterResolved.snapshot
    ? afterResolved.snapshot.nodes.map(toReportNodeRef)
    : Array.from(afterTargets.values());
  const afterHasNodeInventory = afterResolved.snapshot !== null;

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
          notes: afterHasNodeInventory
            ? `Author key '${key}' not found in after capture (target removed or unmounted).`
            : `Author key '${key}' is not among the after report's finding targets. Reports omit healthy nodes, so retention is unknown.`
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
      notes: afterHasNodeInventory
        ? 'No reliable author key or source identity found in after capture.'
        : "No author key or source identity matched the after report's finding targets. Reports omit healthy nodes, so retention is unknown."
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

    // Ambiguity is checked before the missing-node branch: an ambiguous match also has no
    // afterNode, but the element may still be present, so "removed" would be wrong.
    if (targetMatch?.strategy === 'ambiguous') {
      findingComparisons.push({
        comparisonId,
        status: 'inconclusive',
        targetKey: targetMatch.targetKey,
        ruleCode: bFinding.code,
        target: bFinding.target,
        beforeFinding: bFinding,
        afterFinding: null,
        explanation: `Target match is ambiguous: ${targetMatch.notes || 'multiple candidate elements.'} Which element corresponds to the original target is unknown, so the repair cannot be verified.`,
        targetRetained: false,
        coverageAdequate: after.coverage.complete
      });
      continue;
    }

    if (!targetMatch || targetMatch.strategy === 'unmatched' || !targetMatch.afterNode) {
      findingComparisons.push({
        comparisonId,
        status: 'inconclusive',
        targetKey: targetMatch?.targetKey || `node:${bFinding.target.nodeId}`,
        ruleCode: bFinding.code,
        target: bFinding.target,
        beforeFinding: bFinding,
        afterFinding: null,
        explanation: afterHasNodeInventory
          ? 'Target element was removed or unmounted in after capture. Deletion cannot masquerade as a verified repair.'
          : "Target is not among the after report's finding targets, and Reports omit healthy nodes, so retention is unknown. Diff the after Snapshot to check whether the target still exists.",
        targetRetained: false,
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
      if (!before.coverage.complete || !after.coverage.complete || !before.readiness.settled || !after.readiness.settled) {
        findingComparisons.push({
          comparisonId,
          status: 'inconclusive',
          targetKey: targetMatch.targetKey,
          ruleCode: bFinding.code,
          target: afterNode,
          beforeFinding: bFinding,
          afterFinding: null,
          explanation: 'Finding is no longer observed, but a capture had incomplete DOM/sampling coverage or unsettled readiness. Cannot verify repair.',
          targetRetained: true,
          coverageAdequate: false
        });
      } else if (options.behaviorCheckPassed !== true || targetMatch.confidence !== 'definite') {
        findingComparisons.push({
          comparisonId,
          status: 'inconclusive',
          targetKey: targetMatch.targetKey,
          ruleCode: bFinding.code,
          target: afterNode,
          beforeFinding: bFinding,
          afterFinding: null,
          explanation: options.behaviorCheckPassed === false
            ? 'Finding is no longer observed, but declared behavior assertion failed. Action is not functionally verified.'
            : options.behaviorCheckPassed !== true
            ? 'Finding is no longer observed, but no passing behavior check was supplied. Repair remains unverified.'
            : 'Finding is no longer observed, but target identity is heuristic. Repair remains unverified.',
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
      if (!comparable) {
        findingComparisons.push({
          comparisonId: `comp_new_${aFinding.findingId}`,
          status: 'non-comparable',
          targetKey: aFinding.target.semanticKey ? `key:${aFinding.target.semanticKey}` : `node:${aFinding.target.nodeId}`,
          ruleCode: aFinding.code,
          target: aFinding.target,
          beforeFinding: null,
          afterFinding: aFinding,
          explanation: `Finding '${aFinding.code}' appears only in the after capture, but the captures are not comparable: ${incompatibilityReasons.join(' ')} This is not evidence of a regression.`,
          targetRetained: false,
          coverageAdequate: false
        });
        continue;
      }
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
  let verdictReason: string;
  if (!comparable) {
    repairIntegrityVerdict = 'incompatible-comparison';
    verdictReason = 'Captures are not comparable; neither repairs nor regressions can be inferred.';
  } else if (newFindings > 0) {
    repairIntegrityVerdict = 'regressions-introduced';
    verdictReason = `${newFindings} finding(s) appear only in the after capture of the same reproduced state.`;
  } else if (persistent > 0) {
    repairIntegrityVerdict = 'unresolved-defects';
    verdictReason = `${persistent} finding(s) are still measured on their retained targets.`;
  } else if (inconclusive > 0) {
    repairIntegrityVerdict = 'inconclusive-evidence';
    verdictReason = `${inconclusive} finding comparison(s) lack the evidence needed to verify a repair.`;
  } else if (beforeFindings.length === 0) {
    repairIntegrityVerdict = 'inconclusive-evidence';
    verdictReason = 'The before capture has no findings, so there is no repair to verify.';
  } else if (!before.coverage.complete || !after.coverage.complete || !before.readiness.settled || !after.readiness.settled) {
    repairIntegrityVerdict = 'inconclusive-evidence';
    verdictReason = 'A capture had incomplete coverage or unsettled readiness.';
  } else {
    repairIntegrityVerdict = 'verified-repair';
    verdictReason = `${verifiedFixed} finding(s) resolved on retained targets with a passing behavior check.`;
  }

  const summary: DiffSummary = {
    verifiedFixed,
    persistent,
    newFindings,
    inconclusive,
    totalBefore: beforeFindings.length,
    totalAfter: afterFindings.length,
    repairIntegrityVerdict,
    verdictReason
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
