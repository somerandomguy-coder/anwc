import { z } from 'zod';

const gitRef = z.string().regex(/^[0-9a-f]{7,64}$/i, 'must be a Git commit SHA');
const nonEmpty = z.string().trim().min(1);

const runSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  pairId: z.string().regex(/^[a-z0-9-]+$/, 'must use lowercase letters, digits, and hyphens'),
  fixtureId: nonEmpty,
  replicate: z.number().int().positive(),
  condition: z.enum(['ordinary', 'anwc-assisted']),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  state: nonEmpty,
  subjectUrl: z.string().url()
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

export class BenchmarkPlanError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'BenchmarkPlanError';
  }
}

function isPlaceholder(value: string): boolean {
  return /^(unset|replace|todo|tbd|example)([-_ ].*)?$/i.test(value.trim());
}

function sameRunSetup(left: BenchmarkRun, right: BenchmarkRun): boolean {
  return left.fixtureId === right.fixtureId
    && left.replicate === right.replicate
    && left.viewport.width === right.viewport.width
    && left.viewport.height === right.viewport.height
    && left.state === right.state
    && left.subjectUrl === right.subjectUrl;
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
    if (!sameRunSetup(pair[0]!, pair[1]!)) issues.push(`pair ${pairId}: fixture, replicate, viewport, state, and subjectUrl must match`);
  }

  if (plan.kind === 'scored') {
    for (const [field, value] of Object.entries(plan.agent)) if (isPlaceholder(value)) issues.push(`agent.${field}: scored plans cannot use placeholder values`);
    if (isPlaceholder(plan.promptId)) issues.push('promptId: scored plans cannot use a placeholder value');
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
    if (isScoredStatus(result.status) && result.wallSeconds === null) issues.push(`results.${result.runId}: scored runs require wallSeconds`);
    if (result.status === 'planned' && (result.wallSeconds !== null || result.scoring.fullSuccess !== null)) issues.push(`results.${result.runId}: planned runs cannot carry outcome data`);
    if (!isScoredStatus(result.status) && result.scoring.fullSuccess !== null) issues.push(`results.${result.runId}: only scored runs may set fullSuccess`);
  }
  for (const id of expectedIds) if (!seen.has(id)) issues.push(`results.runs: missing runId ${id}`);
  if (issues.length > 0) throw new BenchmarkPlanError(issues);
  return results;
}

function row(run: BenchmarkRun): string {
  return `| ${run.pairId} | ${run.condition} | ${run.fixtureId} | ${run.replicate} | ${run.viewport.width}×${run.viewport.height} | ${run.state} | ${run.subjectUrl} |`;
}

/** Creates a non-secret runbook. It intentionally contains no defect answer key or grading logic. */
export function renderRunbook(plan: BenchmarkPlan): string {
  const warning = plan.kind === 'example'
    ? '> **Example only.** Copy this plan, set `kind` to `scored`, replace placeholder agent/prompt data, and freeze the evaluator corpus before running it.\n\n'
    : '> **Scored plan.** Keep this runbook and all logs outside the subject agent workspace.\n\n';
  const tokenLimit = plan.budget.tokenLimit === null ? 'provider/default' : String(plan.budget.tokenLimit);
  return [
    `# ${plan.title} runbook`,
    '',
    warning.trimEnd(),
    '',
    `- App commit: \`${plan.baseline.appCommit}\``,
    `- Detector commit: \`${plan.baseline.detectorCommit}\``,
    `- Browser: ${plan.baseline.browser}`,
    `- Node / package manager: ${plan.baseline.node} / ${plan.baseline.packageManager}`,
    `- Agent: ${plan.agent.provider} / ${plan.agent.model} / ${plan.agent.reasoning}`,
    `- Budget: ${plan.budget.wallMinutes} minutes; token limit ${tokenLimit}`,
    `- Prompt ID: ${plan.promptId}`,
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
  completed: number;
  fullSuccesses: number;
  verifiedRepairs: number;
  regressions: number;
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
  const summaries = new Map<BenchmarkRun['condition'], ConditionSummary>();
  for (const condition of ['ordinary', 'anwc-assisted'] as const) summaries.set(condition, { runs: 0, completed: 0, fullSuccesses: 0, verifiedRepairs: 0, regressions: 0, medianWallSeconds: null, medianCostUsd: null });
  const wallTimes = new Map<BenchmarkRun['condition'], number[]>([['ordinary', []], ['anwc-assisted', []]]);
  const costs = new Map<BenchmarkRun['condition'], number[]>([['ordinary', []], ['anwc-assisted', []]]);
  const completedCounts = new Map<BenchmarkRun['condition'], number>([['ordinary', 0], ['anwc-assisted', 0]]);
  for (const result of results.runs) {
    const run = indexedPlan.get(result.runId)!;
    const summary = summaries.get(run.condition)!;
    summary.runs += 1;
    if (!isScoredStatus(result.status)) continue;
    summary.completed += 1;
    completedCounts.set(run.condition, completedCounts.get(run.condition)! + 1);
    if (result.scoring.fullSuccess) summary.fullSuccesses += 1;
    summary.verifiedRepairs += result.scoring.verifiedRepairs ?? 0;
    summary.regressions += result.scoring.regressions ?? 0;
    if (result.wallSeconds !== null) wallTimes.get(run.condition)!.push(result.wallSeconds);
    if (result.usage.costUsd !== null) costs.get(run.condition)!.push(result.usage.costUsd);
  }
  for (const [condition, summary] of summaries) {
    summary.medianWallSeconds = median(wallTimes.get(condition)!);
    summary.medianCostUsd = costs.get(condition)!.length === completedCounts.get(condition) ? median(costs.get(condition)!) : null;
  }
  return [
    `# ${plan.title} results summary`,
    '',
    '> This is a ledger summary, not a causal conclusion. Preserve individual run rows, failures, exclusions, and evaluator notes alongside it.',
    '',
    '| Condition | Runs | Scored runs | Full successes | Verified repairs | Regressions | Median wall sec | Median cost USD |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...(['ordinary', 'anwc-assisted'] as const).map((condition) => {
      const summary = summaries.get(condition)!;
      return `| ${condition} | ${summary.runs} | ${summary.completed} | ${summary.fullSuccesses} | ${summary.verifiedRepairs} | ${summary.regressions} | ${formatNumber(summary.medianWallSeconds)} | ${formatNumber(summary.medianCostUsd)} |`;
    }),
    '',
    'Unavailable billing remains `NA`; it must not be treated as zero cost.'
  ].join('\n');
}
