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
