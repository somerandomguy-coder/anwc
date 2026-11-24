import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { diagnose } from '@anwc/diagnostics';
import { snapshotSchema, type Snapshot } from '@anwc/protocol';
import { compareRepairs, countVerdicts, verdictFor, verdictCountsSchema, verdictReasonSchema, verdictSchema, VERDICT_BY_REASON, VERDICT_REASON_TEXT, type VerdictReason } from '@anwc/report';
import { captureNameProblem, CHECK_PRODUCER, computeStatesHash, computeSummaryHash, type CheckpointExecutionResult, type CheckpointVerdict, type ScenarioExecutionResult, type StateManifest } from './manifest.js';
import { CliError } from './output.js';

export interface ReplayedCapture { name: string; snapshot: Snapshot; sha256: string }

interface Problem { reason: VerdictReason; explanation: string }

export interface LoadedBaseline {
  dir: string;
  finishedAt: string | null;
  /** Set when nothing may be compared with this baseline. */
  problem: Problem | null;
  captures: Map<string, ReplayedCapture>;
  /** Step statuses per scenario index and checkpoint index. */
  steps: Map<string, string[]>;
}

const oneReasonOneVerdict = (value: { verdict: string; reason: VerdictReason }, context: z.RefinementCtx) => {
  if (VERDICT_BY_REASON[value.reason] !== value.verdict) context.addIssue({ code: z.ZodIssueCode.custom, message: `reason '${value.reason}' implies verdict '${VERDICT_BY_REASON[value.reason]}'`, path: ['verdict'] });
};

export const baselineFindingSchema = z.object({
  comparisonId: z.string().min(1),
  code: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']),
  targetKey: z.string().min(1),
  /** Page text: untrusted data. */
  label: z.string(),
  verdict: verdictSchema,
  reason: verdictReasonSchema,
  explanation: z.string().min(1),
  /** The step and assertions that proved behavior; present exactly when `verified`. */
  proof: z.object({
    step: z.number().int().nonnegative(),
    action: z.literal('click'),
    assertions: z.array(z.string()).min(1),
    /** How the same step ended in the baseline run. Informative; not part of the rule. */
    baselineStep: z.string()
  }).strict().optional()
}).strict().superRefine((finding, context) => {
  oneReasonOneVerdict(finding, context);
  if ((finding.verdict === 'verified') !== (finding.proof !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: "'verified' and an executed proof imply each other", path: ['proof'] });
});

export const baselineCaptureSchema = z.object({
  scenario: z.string(),
  checkpoint: z.string(),
  capture: z.string(),
  verdict: verdictSchema,
  reason: verdictReasonSchema,
  explanation: z.string().min(1),
  before: z.object({ sha256: z.string() }).strict().nullable(),
  after: z.object({ sha256: z.string() }).strict().nullable(),
  findings: z.array(baselineFindingSchema)
}).strict().superRefine((capture, context) => {
  oneReasonOneVerdict(capture, context);
  if (capture.verdict === 'verified' && (capture.findings.length === 0 || capture.findings.some((f) => f.verdict !== 'verified'))) context.addIssue({ code: z.ZodIssueCode.custom, message: "a 'verified' capture needs findings, all verified", path: ['verdict'] });
});
export type BaselineCapture = z.infer<typeof baselineCaptureSchema>;

export const baselineComparisonSchema = z.object({
  dir: z.string(),
  valid: z.boolean(),
  finishedAt: z.string().nullable(),
  captures: z.array(baselineCaptureSchema),
  findingVerdicts: verdictCountsSchema,
  captureVerdicts: verdictCountsSchema,
  /**
   * True when the baseline is valid, the replay passed, at least one finding is `verified`, and
   * every capture is `verified` or had no finding on either side.
   */
  repairVerified: z.boolean()
}).strict();
export type BaselineComparison = z.infer<typeof baselineComparisonSchema>;

const summarySchema = z.object({
  producer: z.literal(CHECK_PRODUCER),
  statesHash: z.string(),
  summaryHash: z.string(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  scenarios: z.array(z.object({
    checkpoints: z.array(z.object({
      steps: z.array(z.object({ action: z.string(), status: z.string() }).passthrough()),
      captures: z.array(z.object({ name: z.string(), sha256: z.string() }).strict())
    }).passthrough())
  }).passthrough())
}).passthrough();

const invalid = (explanation: string): Problem => ({ reason: 'baseline_invalid', explanation });
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/**
 * Reads and checks an earlier run before anything is replayed. A missing summary is a usage error;
 * anything that does not add up becomes a closed reason, and then no capture is compared at all.
 * The hashes detect edits, stale files and foreign data; they are not a signature.
 */
export async function loadBaseline(dir: string, manifest: StateManifest): Promise<LoadedBaseline> {
  const loaded: LoadedBaseline = { dir, finishedAt: null, problem: null, captures: new Map(), steps: new Map() };
  let text: string;
  try {
    text = await readFile(join(dir, 'check-summary.json'), 'utf8');
  } catch (error) {
    throw new CliError('INVALID_USAGE', `Cannot read 'check-summary.json' in baseline directory '${dir}': ${error instanceof Error ? error.message : String(error)}`, 'BASELINE_UNREADABLE', {
      hint: "Record the baseline first: 'anwc check MANIFEST_FILE --output DIR'."
    });
  }
  const fail = (problem: Problem): LoadedBaseline => ({ ...loaded, problem, captures: new Map() });

  let json: unknown;
  try { json = JSON.parse(text); } catch { return fail(invalid('check-summary.json is not valid JSON.')); }
  const parsed = summarySchema.safeParse(json);
  if (!parsed.success) return fail(invalid('check-summary.json was not written by this version of anwc check.'));
  const summary = parsed.data;
  loaded.finishedAt = summary.finishedAt;
  if (computeSummaryHash(json as object) !== summary.summaryHash) return fail(invalid('check-summary.json was changed after the run that wrote it.'));
  if (summary.statesHash !== computeStatesHash(manifest)) {
    return fail({ reason: 'baseline_manifest_mismatch', explanation: 'The baseline was recorded with different states, steps or assertions.' });
  }

  for (const [s, scenario] of summary.scenarios.entries()) for (const [c, checkpoint] of scenario.checkpoints.entries()) {
    loaded.steps.set(`${s}/${c}`, checkpoint.steps.map((step) => step.status));
    for (const artifact of checkpoint.captures) {
      if (captureNameProblem(artifact.name)) return fail(invalid('check-summary.json names an unsafe capture.'));
      let bytes: Buffer;
      try { bytes = await readFile(join(dir, `${artifact.name}.json`)); } catch { return fail(invalid(`Capture '${artifact.name}.json' is missing from the baseline.`)); }
      if (sha256(bytes) !== artifact.sha256) return fail(invalid(`Capture '${artifact.name}.json' does not match the hash in check-summary.json.`));
      let snapshot: Snapshot;
      try { snapshot = snapshotSchema.parse(JSON.parse(bytes.toString('utf8'))); } catch { return fail(invalid(`Capture '${artifact.name}.json' is not a Snapshot 0.1.`)); }
      // Findings are recomputed: a hand-added defect must not become a repair target.
      if (!isDeepStrictEqual(JSON.parse(JSON.stringify(diagnose(snapshot))), snapshot.findings)) return fail(invalid(`The findings in '${artifact.name}.json' do not follow from its measurements under the current rules.`));
      loaded.captures.set(artifact.name, { name: artifact.name, snapshot, sha256: artifact.sha256 });
    }
  }
  return loaded;
}

export interface BaselineInput {
  manifest: StateManifest;
  baseline: LoadedBaseline;
  scenarios: readonly ScenarioExecutionResult[];
  replayed: ReadonlyMap<string, ReplayedCapture>;
  startedAt: string;
  passedAll: boolean;
}

function compareCapture(before: ReplayedCapture, after: ReplayedCapture, checkpoint: CheckpointExecutionResult, baselineSteps: readonly string[]): Pick<BaselineCapture, 'verdict' | 'reason' | 'explanation' | 'findings'> {
  const browser = (s: Snapshot) => `${s.environment.browser} ${s.environment.browserVersion}`;
  if (browser(before.snapshot) !== browser(after.snapshot)) {
    return { ...verdictFor('state_not_reproduced'), explanation: `Browsers differ: ${browser(before.snapshot)} and ${browser(after.snapshot)}.`, findings: [] };
  }
  const evidence = checkpoint.behaviorEvidence.filter((e) => e.capture === after.name);
  const assertionFailed = checkpoint.assertions.some((a) => !a.passed && a.error === undefined);
  const diff = compareRepairs(before.snapshot, after.snapshot, { behaviorEvidence: evidence, ...(assertionFailed ? { behaviorCheckPassed: false } : {}) });
  const findings = diff.findings.map((f): BaselineCapture['findings'][number] => {
    const proofs = f.verdict === 'verified' ? evidence.filter((e) => e.reason === 'finding_absent_target_retained' && e.action === 'click' && e.nodeId === f.target.nodeId) : [];
    const step = proofs[0]?.step ?? null;
    return {
      comparisonId: f.comparisonId,
      code: f.ruleCode,
      severity: (f.beforeFinding ?? f.afterFinding)!.severity,
      targetKey: f.targetKey,
      label: f.target.label,
      verdict: f.verdict,
      reason: f.reason,
      explanation: f.explanation,
      ...(step !== null ? { proof: { step, action: 'click', assertions: proofs.map((p) => p.assertion), baselineStep: baselineSteps[step] ?? 'not-run' } } : {})
    };
  });
  const result = (reason: VerdictReason, explanation: string) => ({ ...verdictFor(reason), explanation, findings });
  if (!diff.compatibility.comparable) return result('state_not_reproduced', diff.compatibility.reasons.join(' '));
  const worst = findings.find((f) => f.verdict === 'contradicted') ?? findings.find((f) => f.verdict === 'unverified');
  if (worst) return result(worst.reason, worst.explanation);
  if (findings.length > 0) return result('finding_absent_target_retained', `${findings.length} finding(s) verified.`);
  if (!before.snapshot.coverage.complete || !after.snapshot.coverage.complete) return result('coverage_reduced', 'A capture has incomplete coverage.');
  if (!before.snapshot.readiness.settled || !after.snapshot.readiness.settled) return result('capture_not_settled', 'A capture was not settled.');
  return result('no_repair_to_verify', 'Neither capture has a finding.');
}

export function compareWithBaseline(input: BaselineInput): BaselineComparison {
  const { baseline } = input;
  const problem = baseline.problem ?? (baseline.finishedAt === null || Date.parse(baseline.finishedAt) > Date.parse(input.startedAt)
    ? invalid('The baseline run did not finish before this run started.') : null);
  const captures: BaselineCapture[] = [];
  for (const [s, scenario] of input.manifest.scenarios.entries()) for (const [c, checkpoint] of scenario.checkpoints.entries()) {
    const result = input.scenarios[s]?.checkpoints[c];
    for (const step of checkpoint.steps) {
      if (step.action !== 'capture') continue;
      const before = baseline.captures.get(step.name) ?? null;
      const after = result?.captures.some((own) => own.name === step.name) ? input.replayed.get(step.name) ?? null : null;
      const base = {
        scenario: scenario.id, checkpoint: checkpoint.name, capture: step.name,
        before: before ? { sha256: before.sha256 } : null,
        after: after ? { sha256: after.sha256 } : null
      };
      const not = (reason: VerdictReason, explanation: string) => captures.push({ ...base, ...verdictFor(reason), explanation, findings: [] });
      if (problem) not(problem.reason, problem.explanation);
      else if (!after || !result) not('state_not_reproduced', 'This run did not reach the capture.');
      else if (!before) not('no_baseline', 'The baseline run did not reach this capture.');
      else captures.push({ ...base, ...compareCapture(before, after, result, baseline.steps.get(`${s}/${c}`) ?? []) });
    }
  }
  const findingVerdicts = countVerdicts(captures.flatMap((capture) => capture.findings));
  return baselineComparisonSchema.parse({
    dir: baseline.dir,
    valid: problem === null,
    finishedAt: baseline.finishedAt,
    captures,
    findingVerdicts,
    captureVerdicts: countVerdicts(captures),
    repairVerified: problem === null && input.passedAll && findingVerdicts.verified > 0
      && captures.every((capture) => capture.verdict === 'verified' || capture.reason === 'no_repair_to_verify')
  });
}

/** With a baseline, `no_baseline` is replaced by what its captures show; every other checkpoint verdict stands. */
export function baselineCheckpointVerdict(current: CheckpointVerdict, captures: readonly BaselineCapture[]): CheckpointVerdict {
  const decisive = captures.find((c) => c.verdict === 'contradicted')
    ?? captures.find((c) => c.verdict === 'unverified' && c.reason !== 'no_repair_to_verify')
    ?? captures.find((c) => c.verdict === 'verified')
    ?? captures[0];
  if (current.reason !== 'no_baseline' || !decisive) return { verdict: current.verdict, reason: current.reason, explanation: current.explanation };
  return { verdict: decisive.verdict, reason: decisive.reason, explanation: `${decisive.explanation} (${VERDICT_REASON_TEXT[decisive.reason]}.)` };
}
