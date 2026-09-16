import { z } from 'zod';

const gitRef = z.string().regex(/^[0-9a-f]{7,64}$/i, 'must be a Git commit SHA');
const nonEmpty = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, 'must be a SHA-256 hash');

const runSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  pairId: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  fixtureId: nonEmpty,
  replicate: z.number().int().positive(),
  condition: z.enum(['ordinary', 'anwc-assisted']),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  state: nonEmpty,
  subjectUrl: z.string().url(),
  receiptHash: sha256.optional()
}).strict();

export const benchmarkPlanSchema = z.object({
  schemaVersion: z.literal('0.1'),
  id: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  kind: z.enum(['example', 'scored']),
  title: nonEmpty,
  baseline: z.object({
    appCommit: gitRef,
    detectorCommit: gitRef,
    browser: nonEmpty,
    node: nonEmpty,
    packageManager: nonEmpty
  }).strict(),
  agent: z.object({
    provider: nonEmpty,
    model: nonEmpty,
    reasoning: nonEmpty
  }).strict(),
  budget: z.object({
    wallMinutes: z.number().int().positive(),
    tokenLimit: z.number().int().positive().nullable()
  }).strict(),
  promptId: nonEmpty,
  runs: z.array(runSchema).min(2)
}).strict();

export type BenchmarkPlan = z.infer<typeof benchmarkPlanSchema>;
export type BenchmarkRun = z.infer<typeof runSchema>;

const nullableNonNegative = z.number().nonnegative().nullable();
const resultRunSchema = z.object({
  runId: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  status: z.enum(['planned', 'completed', 'time-capped', 'infrastructure-failed', 'excluded']),
  wallSeconds: nullableNonNegative,
  usage: z.object({ inputTokens: nullableNonNegative, cachedInputTokens: nullableNonNegative, outputTokens: nullableNonNegative, costUsd: nullableNonNegative }).strict(),
  scoring: z.object({
    truePositives: z.number().int().nonnegative().nullable(),
    falsePositives: z.number().int().nonnegative().nullable(),
    falseNegatives: z.number().int().nonnegative().nullable(),
    verifiedRepairs: z.number().int().nonnegative().nullable(),
    regressions: z.number().int().nonnegative().nullable(),
    fullSuccess: z.boolean().nullable()
  }).strict(),
  notes: z.string()
}).strict();

export const benchmarkResultsSchema = z.object({
  schemaVersion: z.literal('0.1'),
  planId: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  runs: z.array(resultRunSchema).min(1)
}).strict();

export type BenchmarkResults = z.infer<typeof benchmarkResultsSchema>;
export {
  type SubjectCondition,
  type SubjectInventory,
  type SubjectPackageOptions,
  inspectSubjectWorkspace,
  validateSubjectInventory,
  checkSubjectWorkspace,
  packageSubjectWorkspace
} from './subject.js';

export class BenchmarkPlanError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'BenchmarkPlanError';
  }
}

function isPlaceholder(value: string): boolean {
  return /^(unset|replace|todo|tbd|example)([-_ ].*)?$/i.test(value.trim());
}

function sameRouteAndQuery(leftUrl: string, rightUrl: string): boolean {
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);
    return left.pathname === right.pathname && left.search === right.search;
  } catch {
    return false;
  }
}

function sameRunSetup(left: BenchmarkRun, right: BenchmarkRun): boolean {
  return left.fixtureId === right.fixtureId
    && left.replicate === right.replicate
    && left.viewport.width === right.viewport.width
    && left.viewport.height === right.viewport.height
    && left.state === right.state
    && sameRouteAndQuery(left.subjectUrl, right.subjectUrl);
}

/** Parses a public plan and rejects unfair or incomplete A/B pair definitions. */
export function validateBenchmarkPlan(input: unknown): BenchmarkPlan {
  const parsed = benchmarkPlanSchema.safeParse(input);
  if (!parsed.success) throw new BenchmarkPlanError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`));

  const plan = parsed.data;
  const issues: string[] = [];
  const ids = new Set<string>();
  const pairs = new Map<string, BenchmarkRun[]>();
  for (const run of plan.runs) {
    if (ids.has(run.id)) issues.push(`runs: duplicate id ${run.id}`);
    ids.add(run.id);
    const group = pairs.get(run.pairId) ?? [];
    group.push(run);
    pairs.set(run.pairId, group);
  }

  for (const [pairId, pair] of pairs) {
    if (pair.length !== 2) {
      issues.push(`pair ${pairId}: requires exactly two runs, ordinary and anwc-assisted`);
      continue;
    }
    const conditions = new Set(pair.map((run) => run.condition));
    if (conditions.size !== 2) issues.push(`pair ${pairId}: requires one ordinary run and one anwc-assisted run`);
    if (!sameRunSetup(pair[0]!, pair[1]!)) issues.push(`pair ${pairId}: fixture, replicate, viewport, state, route, and query must match`);
  }

  if (plan.kind === 'scored') {
    for (const [field, value] of Object.entries(plan.agent)) if (isPlaceholder(value)) issues.push(`agent.${field}: scored plans cannot use placeholder values`);
    if (isPlaceholder(plan.promptId)) issues.push('promptId: scored plans cannot use a placeholder value');
    for (const run of plan.runs) if (!run.receiptHash) issues.push(`runs.${run.id}: scored plans require the frozen receiptHash`);
  }

  if (issues.length > 0) throw new BenchmarkPlanError(issues);
  return plan;
}

function isScoredStatus(status: BenchmarkResults['runs'][number]['status']): boolean {
  return status === 'completed' || status === 'time-capped';
}

/** Validates a non-secret ledger against the exact public plan it claims to score. */
export function validateBenchmarkResults(plan: BenchmarkPlan, input: unknown): BenchmarkResults {
  const parsed = benchmarkResultsSchema.safeParse(input);
  if (!parsed.success) throw new BenchmarkPlanError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'results'}: ${issue.message}`));
  const results = parsed.data;
  const issues: string[] = [];
  if (results.planId !== plan.id) issues.push(`results.planId: expected ${plan.id}`);
  const expectedIds = new Set(plan.runs.map((run) => run.id));
  const seen = new Set<string>();
  for (const result of results.runs) {
    if (!expectedIds.has(result.runId)) issues.push(`results.runs: unknown runId ${result.runId}`);
    if (seen.has(result.runId)) issues.push(`results.runs: duplicate runId ${result.runId}`);
    seen.add(result.runId);

    // Planned runs: no wallSeconds, no usage, no outcome data
    if (result.status === 'planned') {
      if (result.wallSeconds !== null) issues.push(`results.${result.runId}: planned runs cannot carry wallSeconds`);
      const hasUsage = Object.values(result.usage).some((val) => val !== null);
      if (hasUsage) issues.push(`results.${result.runId}: planned runs cannot carry usage data`);
      const hasScoring = Object.values(result.scoring).some((val) => val !== null);
      if (hasScoring) issues.push(`results.${result.runId}: planned runs cannot carry scoring data`);
    }

    // Scored runs (completed or time-capped)
    if (isScoredStatus(result.status) && result.wallSeconds === null) {
      issues.push(`results.${result.runId}: scored runs require wallSeconds`);
    }

    // Failed or excluded runs: no repair scores, require explanation in notes
    if (result.status === 'infrastructure-failed' || result.status === 'excluded') {
      const hasScoring = Object.values(result.scoring).some((val) => val !== null);
      if (hasScoring) issues.push(`results.${result.runId}: ${result.status} runs cannot carry repair scoring`);
      if (!result.notes || result.notes.trim().length === 0) {
        issues.push(`results.${result.runId}: ${result.status} runs require an explanation in notes`);
      }
    }
  }
  for (const id of expectedIds) if (!seen.has(id)) issues.push(`results.runs: missing runId ${id}`);
  if (issues.length > 0) throw new BenchmarkPlanError(issues);
  return results;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
}

function row(run: BenchmarkRun): string {
  return `| ${escapeCell(run.pairId)} | ${escapeCell(run.condition)} | ${escapeCell(run.fixtureId)} | ${run.replicate} | ${run.viewport.width}×${run.viewport.height} | ${escapeCell(run.state)} | ${escapeCell(run.subjectUrl)} |`;
}

/** Creates a non-secret runbook. It intentionally contains no defect answer key or grading logic. */
export function renderRunbook(plan: BenchmarkPlan): string {
  const warning = plan.kind === 'example'
    ? '> **Example only.** Copy this plan, set `kind` to `scored`, replace placeholder agent/prompt data, and freeze the evaluator corpus before running it.\n\n'
    : '> **Scored plan.** Keep this runbook and all logs outside the subject agent workspace.\n\n';
  const tokenLimit = plan.budget.tokenLimit === null ? 'provider/default' : String(plan.budget.tokenLimit);
  return [
    `# ${escapeCell(plan.title)} runbook`,
    '',
    warning.trimEnd(),
    '',
    `- App commit: \`${escapeCell(plan.baseline.appCommit)}\``,
    `- Detector commit: \`${escapeCell(plan.baseline.detectorCommit)}\``,
    `- Browser: ${escapeCell(plan.baseline.browser)}`,
    `- Node / package manager: ${escapeCell(plan.baseline.node)} / ${escapeCell(plan.baseline.packageManager)}`,
    `- Agent: ${escapeCell(plan.agent.provider)} / ${escapeCell(plan.agent.model)} / ${escapeCell(plan.agent.reasoning)}`,
    `- Budget: ${plan.budget.wallMinutes} minutes; token limit ${tokenLimit}`,
    `- Prompt ID: ${escapeCell(plan.promptId)}`,
    '',
    '## Paired runs',
    '',
    '| Pair | Condition | Fixture | Replicate | Viewport | State | Subject URL |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...plan.runs.map(row),
    '',
    '## Evaluator checklist',
    '',
    '1. Create a fresh subject checkout for each run from the app commit. Keep fixture truth, grader code, this runbook, and prior patches outside it.',
    '2. Materialize the selected held-out fixture into that checkout; do not leave a public scenario switch or answer-bearing labels available to the subject agent.',
    '3. Start fresh ordinary and assisted sessions. Give them identical source, viewport/state, prompt, time cap, and ordinary tools. Only the assisted session receives ANWC.',
    '4. Save the patch, elapsed time, usage record, tool log, screenshots used, and any intervention outside the subject checkout. Record unavailable billing as `NA`.',
    '5. Apply each patch to a clean evaluator checkout, run hidden repair/control checks, and record scoring before comparing conditions.',
    '',
    'This runbook does not score repairs. Use the frozen evaluator truth and the policy in `docs/BENCHMARK.md`.'
  ].join('\n');
}

type ConditionSummary = {
  runs: number;
  planned: number;
  completed: number;
  timeCapped: number;
  failed: number;
  excluded: number;
  scored: number;
  graded: number;
  fullSuccesses: number | null;
  verifiedRepairs: number | null;
  regressions: number | null;
  totalCostUsd: number;
  allCostsKnown: boolean;
  medianWallSeconds: number | null;
  medianCostUsd: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function formatNumber(value: number | null): string {
  return value === null ? 'NA' : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Summarizes evaluator-entered counts without attempting to infer or hide unavailable usage. */
export function renderResultsSummary(plan: BenchmarkPlan, results: BenchmarkResults): string {
  const indexedPlan = new Map(plan.runs.map((run) => [run.id, run]));
  const indexedResults = new Map(results.runs.map((run) => [run.runId, run]));
  const summaries = new Map<BenchmarkRun['condition'], ConditionSummary>();
  for (const condition of ['ordinary', 'anwc-assisted'] as const) {
    summaries.set(condition, {
      runs: 0,
      planned: 0,
      completed: 0,
      timeCapped: 0,
      failed: 0,
      excluded: 0,
      scored: 0,
      graded: 0,
      fullSuccesses: 0,
      verifiedRepairs: 0,
      regressions: 0,
      totalCostUsd: 0,
      allCostsKnown: true,
      medianWallSeconds: null,
      medianCostUsd: null
    });
  }

  const wallTimes = new Map<BenchmarkRun['condition'], number[]>([['ordinary', []], ['anwc-assisted', []]]);
  const costs = new Map<BenchmarkRun['condition'], number[]>([['ordinary', []], ['anwc-assisted', []]]);

  for (const result of results.runs) {
    const run = indexedPlan.get(result.runId);
    if (!run) continue;
    const summary = summaries.get(run.condition)!;
    summary.runs += 1;

    if (result.status === 'planned') {
      summary.planned += 1;
    } else if (result.status === 'completed') {
      summary.completed += 1;
      summary.scored += 1;
    } else if (result.status === 'time-capped') {
      summary.timeCapped += 1;
      summary.scored += 1;
    } else if (result.status === 'infrastructure-failed') {
      summary.failed += 1;
    } else if (result.status === 'excluded') {
      summary.excluded += 1;
    }

    if (result.wallSeconds !== null) {
      wallTimes.get(run.condition)!.push(result.wallSeconds);
    }

    if (result.usage.costUsd !== null) {
      costs.get(run.condition)!.push(result.usage.costUsd);
      summary.totalCostUsd += result.usage.costUsd;
    } else if (result.status !== 'planned') {
      summary.allCostsKnown = false;
    }

    if (isScoredStatus(result.status)) {
      const isGraded = result.scoring.fullSuccess !== null && result.scoring.verifiedRepairs !== null && result.scoring.regressions !== null;
      if (isGraded) {
        summary.graded += 1;
        if (summary.fullSuccesses !== null) {
          summary.fullSuccesses += result.scoring.fullSuccess ? 1 : 0;
        }
        if (summary.verifiedRepairs !== null) {
          summary.verifiedRepairs += result.scoring.verifiedRepairs!;
        }
        if (summary.regressions !== null) {
          summary.regressions += result.scoring.regressions!;
        }
      } else {
        if (result.scoring.fullSuccess === null) summary.fullSuccesses = null;
        else if (summary.fullSuccesses !== null) summary.fullSuccesses += result.scoring.fullSuccess ? 1 : 0;

        if (result.scoring.verifiedRepairs === null) summary.verifiedRepairs = null;
        else if (summary.verifiedRepairs !== null) summary.verifiedRepairs += result.scoring.verifiedRepairs!;

        if (result.scoring.regressions === null) summary.regressions = null;
        else if (summary.regressions !== null) summary.regressions += result.scoring.regressions!;
      }
    }
  }

  for (const [condition, summary] of summaries) {
    summary.medianWallSeconds = median(wallTimes.get(condition)!);
    summary.medianCostUsd = summary.allCostsKnown && summary.scored > 0 && costs.get(condition)!.length === summary.scored
      ? median(costs.get(condition)!)
      : null;
    if (summary.scored === 0) {
      summary.fullSuccesses = null;
      summary.verifiedRepairs = null;
      summary.regressions = null;
    }
  }

  // Paired comparisons
  const pairGroups = new Map<string, BenchmarkRun[]>();
  for (const run of plan.runs) {
    const list = pairGroups.get(run.pairId) ?? [];
    list.push(run);
    pairGroups.set(run.pairId, list);
  }

  const pairedTimeDeltas: number[] = [];
  const pairedCostDeltas: number[] = [];

  for (const [, pairRuns] of pairGroups) {
    const ordinaryRun = pairRuns.find((r) => r.condition === 'ordinary');
    const assistedRun = pairRuns.find((r) => r.condition === 'anwc-assisted');
    if (!ordinaryRun || !assistedRun) continue;
    const ordRes = indexedResults.get(ordinaryRun.id);
    const astRes = indexedResults.get(assistedRun.id);
    if (!ordRes || !astRes) continue;

    if (isScoredStatus(ordRes.status) && isScoredStatus(astRes.status)) {
      if (ordRes.wallSeconds !== null && astRes.wallSeconds !== null) {
        pairedTimeDeltas.push(astRes.wallSeconds - ordRes.wallSeconds);
      }
      if (ordRes.usage.costUsd !== null && astRes.usage.costUsd !== null) {
        pairedCostDeltas.push(astRes.usage.costUsd - ordRes.usage.costUsd);
      }
    }
  }

  const medianTimeDelta = median(pairedTimeDeltas);
  const medianCostDelta = median(pairedCostDeltas);

  return [
    `# ${escapeCell(plan.title)} results summary`,
    '',
    '> This is a ledger summary, not a causal conclusion. Preserve individual run rows, failures, exclusions, and evaluator notes alongside it.',
    '',
    '## Status breakdown',
    '',
    '| Condition | Runs | Planned | Completed | Capped | Failed | Excluded | Graded |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...(['ordinary', 'anwc-assisted'] as const).map((condition) => {
      const summary = summaries.get(condition)!;
      return `| ${condition} | ${summary.runs} | ${summary.planned} | ${summary.completed} | ${summary.timeCapped} | ${summary.failed} | ${summary.excluded} | ${summary.graded} |`;
    }),
    '',
    '## Scored outcomes',
    '',
    '| Condition | Runs | Scored runs | Full successes | Verified repairs | Regressions | Median wall sec | Median cost USD |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...(['ordinary', 'anwc-assisted'] as const).map((condition) => {
      const summary = summaries.get(condition)!;
      return `| ${condition} | ${summary.runs} | ${summary.completed + summary.timeCapped} | ${formatNumber(summary.fullSuccesses)} | ${formatNumber(summary.verifiedRepairs)} | ${formatNumber(summary.regressions)} | ${formatNumber(summary.medianWallSeconds)} | ${formatNumber(summary.medianCostUsd)} |`;
    }),
    '',
    '## Paired differences (assisted − ordinary)',
    '',
    `- Eligible paired timing runs: ${pairedTimeDeltas.length}${medianTimeDelta !== null ? ` (median difference: ${formatNumber(medianTimeDelta)}s)` : ' (NA)'}`,
    `- Eligible paired cost runs: ${pairedCostDeltas.length}${medianCostDelta !== null ? ` (median difference: $${formatNumber(medianCostDelta)})` : ' (NA)'}`,
    '',
    '## Expenditure',
    '',
    `- Known spending: ordinary = $${formatNumber(summaries.get('ordinary')!.totalCostUsd)}${summaries.get('ordinary')!.allCostsKnown ? '' : ' (incomplete)'}, anwc-assisted = $${formatNumber(summaries.get('anwc-assisted')!.totalCostUsd)}${summaries.get('anwc-assisted')!.allCostsKnown ? '' : ' (incomplete)'}`,
    '',
    'Unavailable billing remains `NA`; it must not be treated as zero cost.'
  ].join('\n');
}

export { fixtureCaseSchema, evaluatorSidecarSchema, checkSchema, setupStepSchema, applySetup, runChecks, repairVerified, isMutatingCheck, type FixtureCase, type FixtureCheck, type CheckResult } from './fixtures/index.js';
export { allFixtures, fixtureMatrix, fixtureFor, materializeFixtureSource, materializeFixtureStyles, taskMarkdown, type PreparedFixture, type FixtureState, type FixtureMatrixEntry } from './fixtures/registry.js';
export { preparePair, checkPreparedPair, checkReturnedSubject, checkEvaluatorReceipt, readPreparedPairReceipt, extractSourceIntent, hashSourceIntent, type PreparePairOptions, type PreparedPairReceipt, type SourceIntentDeclaration } from './prepare.js';
export { gradeRepair, gradeResultSchema, type GradeOptions, type GradeResult } from './grade.js';
export { rehearseBenchmark, rehearsalReportSchema, type RehearsalOptions, type RehearsalReport } from './rehearse.js';
