import type { Rect, Snapshot, SourceRef } from '@anwc/protocol';
import { compareRepairs } from './diff.js';
import type { DiffReport, FindingComparisonStatus } from './diff-schema.js';
import { VERDICT_REASON_TEXT, type Verdict, type VerdictCounts, type VerdictReason } from './verdict-schema.js';

/** One row of a before/after verdict list. */
export interface FindingVerdict {
  comparisonId: string;
  verdict: Verdict;
  reason: VerdictReason;
  /** Plain-language reason for a chip or tooltip. */
  reasonText: string;
  /** What was compared and why, for the full explanation. */
  explanation: string;
  status: FindingComparisonStatus;
  code: string;
  severity: 'error' | 'warning' | 'info';
  targetKey: string;
  /** Page text: untrusted data. */
  label: string;
  tag: string;
  source: SourceRef | null;
  /** Null for findings that exist only in the after capture. */
  before: { findingId: string; nodeId: string; box: Rect | null } | null;
  /**
   * The matched element in the after capture. Null when the target is unmounted, ambiguous,
   * unmatched, or the captures are not comparable: draw no after box then.
   * `findingId` is null when the target is retained but the finding is gone.
   */
  after: { findingId: string | null; nodeId: string; box: Rect | null } | null;
}

export interface FindingVerdictList {
  comparable: boolean;
  /** Why the captures are not comparable; empty when they are. */
  incompatibilities: string[];
  counts: VerdictCounts;
  verdicts: FindingVerdict[];
}

/** Lists the verdicts of an existing DiffReport. */
export function findingVerdictsFromDiff(diff: DiffReport): FindingVerdictList {
  return {
    comparable: diff.compatibility.comparable,
    incompatibilities: [...diff.compatibility.reasons],
    counts: { ...diff.summary.verdicts },
    verdicts: diff.findings.map((f): FindingVerdict => {
      // Severity describes the finding under judgment: the before one when there is one.
      const finding = (f.beforeFinding ?? f.afterFinding)!;
      return {
        comparisonId: f.comparisonId,
        verdict: f.verdict,
        reason: f.reason,
        reasonText: VERDICT_REASON_TEXT[f.reason],
        explanation: f.explanation,
        status: f.status,
        code: f.ruleCode,
        severity: finding.severity,
        targetKey: f.targetKey,
        label: f.target.label,
        tag: f.target.tag,
        source: f.target.source,
        before: f.beforeFinding ? { findingId: f.beforeFinding.findingId, nodeId: f.beforeFinding.target.nodeId, box: f.beforeFinding.target.box } : null,
        after: f.targetRetained ? { findingId: f.afterFinding?.findingId ?? null, nodeId: f.target.nodeId, box: f.target.box } : null
      };
    })
  };
}

/**
 * Per-finding verdicts for two Snapshots (pure; runs in a browser bundle like the rest of this
 * package). Two snapshots carry no executed-behavior evidence and this helper deliberately takes
 * no option to claim any, so it never returns `verified`: a disappeared finding is at best
 * `unverified(behavior_not_checked)`. Throws DiffInputError on malformed snapshots.
 */
export function listFindingVerdicts(before: Snapshot, after: Snapshot): FindingVerdictList {
  return findingVerdictsFromDiff(compareRepairs(before, after));
}
