import { z } from 'zod';

/** P03 per-finding verdict. `verified` is a claim about one finding on one retained target, never "the UI is correct". */
export const verdictSchema = z.enum(['verified', 'unverified', 'contradicted']);
export type Verdict = z.infer<typeof verdictSchema>;

/**
 * Closed reason list; each reason implies exactly one verdict, so a reason can never be relabelled
 * as a different verdict. Adding or moving one is a protocol change (PROTOCOL §9).
 */
export const VERDICT_BY_REASON = {
  finding_absent_target_retained: 'verified',

  target_ambiguous: 'unverified',
  state_not_reproduced: 'unverified',
  coverage_reduced: 'unverified',
  capture_not_settled: 'unverified',
  measurement_unsupported: 'unverified',
  intent_changed: 'unverified',
  target_identity_heuristic: 'unverified',
  target_retention_unknown: 'unverified',
  behavior_not_checked: 'unverified',
  finding_acknowledged: 'unverified',
  no_baseline: 'unverified',

  finding_persists: 'contradicted',
  finding_present: 'contradicted',
  new_finding: 'contradicted',
  target_unmounted: 'contradicted',
  target_hidden: 'contradicted',
  behavior_assertion_failed: 'contradicted'
} as const satisfies Record<string, Verdict>;

export type VerdictReason = keyof typeof VERDICT_BY_REASON;
export const VERDICT_REASONS = Object.keys(VERDICT_BY_REASON) as [VerdictReason, ...VerdictReason[]];
export const verdictReasonSchema = z.enum(VERDICT_REASONS);

/** Short plain-language form of each reason, for renderers and UIs. */
export const VERDICT_REASON_TEXT: Record<VerdictReason, string> = {
  finding_absent_target_retained: 'the finding is gone, the same target is still rendered and measured, and behavior was checked',
  target_ambiguous: 'more than one element could be the target',
  state_not_reproduced: 'the compared or declared page state was not reproduced',
  coverage_reduced: 'the captures do not cover enough to judge',
  capture_not_settled: 'layout was still moving during a capture',
  measurement_unsupported: 'the property behind this finding was not measurable in the after capture',
  intent_changed: 'the declared intent this rule depends on was removed or relaxed',
  target_identity_heuristic: 'the target was matched heuristically, not by a unique author key on the same kind of element',
  target_retention_unknown: 'the evidence does not show whether the target still exists',
  behavior_not_checked: 'no executed behavior check is bound to this result',
  finding_acknowledged: 'the author declared this fact acceptable, so it is not a repair target',
  no_baseline: 'there is no before capture, so no repair can be judged',
  finding_persists: 'the defect is still measured on the target',
  finding_present: 'the defect is measured in this state',
  new_finding: 'the defect appears only in the after capture',
  target_unmounted: 'the target was removed, so its finding disappeared with it',
  target_hidden: 'the target was hidden, so its finding disappeared with it',
  behavior_assertion_failed: 'a declared behavior assertion failed'
};

export const verdictCountsSchema = z.object({
  verified: z.number().int().nonnegative(),
  unverified: z.number().int().nonnegative(),
  contradicted: z.number().int().nonnegative()
}).strict();
export type VerdictCounts = z.infer<typeof verdictCountsSchema>;

/** Builds `{ verdict, reason }` from a reason; the only supported way to produce a verdict. */
export function verdictFor(reason: VerdictReason): { verdict: Verdict; reason: VerdictReason } {
  return { verdict: VERDICT_BY_REASON[reason], reason };
}

export function countVerdicts(items: ReadonlyArray<{ verdict: Verdict }>): VerdictCounts {
  const counts: VerdictCounts = { verified: 0, unverified: 0, contradicted: 0 };
  for (const item of items) counts[item.verdict] += 1;
  return counts;
}
