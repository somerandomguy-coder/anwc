import type { Snapshot } from '@anwc/protocol';
import { countVerdicts, verdictFor, VERDICT_REASON_TEXT, type VerdictReason } from '@anwc/report';
import type { AssertionResult, CheckFindingVerdict, CheckpointVerdict, CheckVerdictSummary, ScenarioExecutionResult, StateManifest } from './manifest.js';

/**
 * `check` replays one state without a before capture, so it can never report `verified`
 * (no repair is being compared). It reports what each measured finding and each declared
 * checkpoint shows: `contradicted` with a measured defect or failed assertion, else `unverified`.
 */
export function findingVerdicts(captures: ReadonlyArray<{ name: string; snapshot: Snapshot }>): CheckFindingVerdict[] {
  return captures.flatMap(({ name, snapshot }) => {
    const nodes = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
    return snapshot.findings.map((finding): CheckFindingVerdict => {
      const node = nodes.get(finding.nodeId);
      const reason: VerdictReason = finding.acknowledged ? 'finding_acknowledged'
        : !snapshot.readiness.settled ? 'capture_not_settled'
        : 'finding_present';
      return {
        capture: name,
        findingId: finding.findingId,
        code: finding.code,
        severity: finding.severity,
        nodeId: finding.nodeId,
        targetKey: node?.semanticKey ? `key:${node.semanticKey}` : node?.siteId ? `site:${node.siteId}` : `node:${finding.nodeId}`,
        source: finding.source,
        ...verdictFor(reason)
      };
    });
  });
}

export interface CheckpointEvidence {
  name: string;
  /** True when every step ran (assertions may still have failed). */
  stepsPassed: boolean;
  stepError?: string;
  assertions: readonly AssertionResult[];
  captures: ReadonlyArray<{ name: string; snapshot: Snapshot }>;
  findings: readonly CheckFindingVerdict[];
}

const AMBIGUOUS = /Target is ambiguous|strict mode violation/i;

export function checkpointVerdict(evidence: CheckpointEvidence): CheckpointVerdict {
  const result = (reason: VerdictReason, explanation: string): CheckpointVerdict => ({ ...verdictFor(reason), explanation });

  // Positive evidence of a problem first: it stands whatever else was not checked.
  const failed = evidence.assertions.find((a) => !a.passed && a.error === undefined);
  if (failed) return result('behavior_assertion_failed', `Assertion '${failed.id}' was executed and did not hold.`);
  const present = evidence.findings.filter((f) => f.reason === 'finding_present');
  if (present.length > 0) return result('finding_present', `${present.length} unacknowledged finding(s) are measured in this checkpoint.`);

  const partial = evidence.captures.find((c) => !c.snapshot.coverage.complete);
  if (partial) return result('coverage_reduced', `Capture '${partial.name}' has incomplete coverage; its absence of findings is not evidence.`);
  const moving = evidence.captures.find((c) => !c.snapshot.readiness.settled);
  if (moving) return result('capture_not_settled', `Capture '${moving.name}' was not settled.`);
  if (!evidence.stepsPassed) {
    return AMBIGUOUS.test(evidence.stepError ?? '')
      ? result('target_ambiguous', evidence.stepError!)
      : result('state_not_reproduced', evidence.stepError ?? 'A step failed, so the declared state was not reached.');
  }
  const unexecuted = evidence.assertions.find((a) => !a.passed);
  if (unexecuted) {
    return AMBIGUOUS.test(unexecuted.error ?? '')
      ? result('target_ambiguous', `Assertion '${unexecuted.id}': ${unexecuted.error}`)
      : result('behavior_not_checked', `Assertion '${unexecuted.id}' could not be executed: ${unexecuted.error}`);
  }
  if (evidence.captures.length === 0) return result('coverage_reduced', 'No capture step ran in this checkpoint, so layout was not measured.');
  if (evidence.assertions.length === 0) return result('behavior_not_checked', 'No finding is measured, but the checkpoint declares no behavior assertion.');
  return result('no_baseline', `No unacknowledged finding is measured and ${evidence.assertions.length} assertion(s) held. ${VERDICT_REASON_TEXT.no_baseline}.`);
}

/** Counts verdicts for the whole manifest; declared checkpoints that never ran count as `unverified(state_not_reproduced)`. */
export function summarizeCheckVerdicts(manifest: StateManifest, scenarios: readonly ScenarioExecutionResult[]): CheckVerdictSummary {
  const ran = scenarios.flatMap((s) => s.checkpoints);
  const declared = manifest.scenarios.reduce((total, s) => total + s.checkpoints.length, 0);
  const notRun = Math.max(0, declared - ran.length);
  return {
    findings: countVerdicts(ran.flatMap((c) => c.findingVerdicts)),
    checkpoints: countVerdicts([...ran, ...Array.from({ length: notRun }, () => verdictFor('state_not_reproduced'))]),
    checkpointsNotRun: notRun
  };
}
