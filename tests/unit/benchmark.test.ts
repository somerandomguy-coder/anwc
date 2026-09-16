import { describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BenchmarkPlanError, checkSchema, evaluatorSidecarSchema, fixtureCaseSchema, fixtureFor, materializeFixtureSource, packageSubjectWorkspace, repairVerified, renderResultsSummary, renderRunbook, taskMarkdown, validateBenchmarkPlan, validateBenchmarkResults, validateSubjectInventory } from '../../packages/benchmark/src/index.js';
import { run as runBenchmarkCli } from '../../packages/benchmark/src/main.js';

const validPlan = () => ({
  schemaVersion: '0.1' as const,
  id: 'pilot',
  kind: 'scored' as const,
  title: 'Pilot',
  baseline: { appCommit: '4c6cafe', detectorCommit: '4c6cafe', browser: 'Chromium', node: '24.18.0', packageManager: 'npm 11.13.0' },
  agent: { provider: 'Provider', model: 'Model', reasoning: 'high' },
  budget: { wallMinutes: 20, tokenLimit: null },
  promptId: 'repair-v1',
  runs: [
    { id: 'pair-a', pairId: 'pair', fixtureId: 'heldout-a', replicate: 1, condition: 'ordinary' as const, viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' },
    { id: 'pair-b', pairId: 'pair', fixtureId: 'heldout-a', replicate: 1, condition: 'anwc-assisted' as const, viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' }
  ]
});

describe('benchmark plan', () => {
  test('validates strict fixture contracts and never counts unsupported required checks as repaired', () => {
    expect(fixtureCaseSchema.parse({ schemaVersion: '0.2', id: 'shop-action', appId: 'shop', route: '/', requirements: ['Keep checkout usable'], viewports: [{ width: 390, height: 844 }], setup: [{ kind: 'click', role: 'button', name: 'Open cart' }], requiredContent: ['Cart'], requiredActions: [{ role: 'button', name: 'Checkout' }] }).id).toBe('shop-action');
    expect(() => fixtureCaseSchema.parse({ schemaVersion: '0.2', id: 'bad', appId: 'shop', route: '/', requirements: ['x'], viewports: [{ width: 1, height: 1 }], setup: [{ kind: 'evaluate', script: 'alert(1)' }], requiredContent: ['x'], requiredActions: [] })).toThrow();
    expect(() => checkSchema.parse({ id: 'bad-check', required: true, kind: 'content', selector: '#copy', text: 'hello', extra: true })).toThrow();
    expect(evaluatorSidecarSchema.parse({ fixtureId: 'shop-action', revision: 'abcdef0', defect: 'Checkout is hidden', baselineChecks: [{ id: 'hidden', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout' }], repairChecks: [{ id: 'usable', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout' }] }).fixtureId).toBe('shop-action');
    expect(repairVerified([{ id: 'usable', required: true, status: 'pass', evidence: {} }, { id: 'optional', required: false, status: 'unsupported', evidence: {} }])).toBe(true);
    expect(repairVerified([{ id: 'usable', required: true, status: 'unsupported', evidence: {} }])).toBe(false);
  });
  test('materializes a neutral fixture into one broken app variant and public task', () => {
    const fixture = fixtureFor('pricing-blocked');
    const source = `const search = new URLSearchParams(location.search);\n  const caseId = (caseIds.find((value) => value === search.get('case')) ?? 'title-overflow') as CaseId;\n  const variant: Variant = search.get('variant') === 'healthy' ? 'healthy' : 'broken';\n  <nav aria-label="Pricing fixture cases">links</nav><main data-anwc-scenario="x" />`;
    const materialized = materializeFixtureSource(source, fixture);
    expect(materialized).toContain("const caseId: CaseId = 'blocked-selection'");
    expect(materialized).toContain("const variant: Variant = 'broken'");
    expect(materialized).not.toContain('URLSearchParams');
    expect(materialized).not.toContain('<nav');
    expect(materialized).not.toContain('data-anwc-scenario');
    expect(taskMarkdown(fixture)).toContain('make Growth selectable');
  });
  test('accepts a fair A/B pair and produces a non-secret runbook', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const runbook = renderRunbook(plan);
    expect(runbook).toContain('| pair | ordinary | heldout-a |');
    expect(runbook).toContain('does not score repairs');
  });

  test('rejects incomplete and mismatched pairs', () => {
    const missingCondition = validPlan();
    missingCondition.runs[1]!.condition = 'ordinary';
    expect(() => validateBenchmarkPlan(missingCondition)).toThrow(BenchmarkPlanError);

    const mismatchedViewport = validPlan();
    mismatchedViewport.runs[1]!.viewport.width = 1440;
    expect(() => validateBenchmarkPlan(mismatchedViewport)).toThrow('viewport');
  });

  test('requires a complete result ledger and retains unavailable cost as NA', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'completed', wallSeconds: 42, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: null }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-b', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' }
      ]
    });
    expect(renderResultsSummary(plan, results)).toContain('| ordinary | 1 | 1 | 1 | 1 | 0 | 42 | NA |');
    expect(renderResultsSummary(plan, results)).toContain('| anwc-assisted | 1 | 1 | 0 | 0 | 0 | 1200 | NA |');
    expect(() => validateBenchmarkResults(plan, { ...results, runs: results.runs.slice(0, 1) })).toThrow('missing runId');
  });

  test('rejects answer-bearing or condition-inappropriate subject inventory', () => {
    const ordinaryIssues = validateSubjectInventory({
      files: ['package.json', 'examples/shop/src/main.tsx', 'docs/BENCHMARK.md', 'packages/cli/src/main.ts'],
      publicScenarioReferences: ['examples/shop/src/main.tsx']
    }, 'ordinary');
    expect(ordinaryIssues).toEqual(expect.arrayContaining([
      'subject exposes forbidden docs/ content',
      'subject exposes public scenario switching in examples/shop/src/main.tsx',
      'ordinary subject exposes packages/cli; remove ANWC before the baseline run'
    ]));

    expect(validateSubjectInventory({ files: ['package.json', 'examples/shop/src/main.tsx', 'packages/cli/src/main.ts'], publicScenarioReferences: [] }, 'anwc-assisted')).toEqual([]);
  });

  test('packages a clean ordinary subject only after a private overlay removes scenario setup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite', build: 'vite build', anwc: 'tsx packages/cli/src/main.ts' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const scenario = "?scenario=blocked-checkout";');
      await writeFile(join(source, 'examples/shop/src/scenarios.ts'), 'export const scenarioIds = [];');
      await mkdir(join(overlay, 'examples/shop/src'), { recursive: true });
      await writeFile(join(overlay, 'examples/shop/src/main.tsx'), 'export const app = "subject";');

      await packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' });
      expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).scripts).toEqual({ dev: 'vite', build: 'vite build' });
      expect(await readFile(join(destination, 'examples/shop/src/main.tsx'), 'utf8')).toContain('subject');
      expect(validateSubjectInventory({ files: ['package.json', 'examples/shop/src/main.tsx'], publicScenarioReferences: [] }, 'ordinary')).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects an overlay attempting to replace root scripts or non-application files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-overlay-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const app = "orig";');
      await writeFile(join(overlay, 'package.json'), JSON.stringify({ scripts: { malicious: 'true' } }));

      await expect(packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' }))
        .rejects.toThrow('overlay attempts to modify non-application file: package.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects path overlap between source, destination, and overlay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-overlap-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const nestedDestination = join(source, 'nested-subject');
    try {
      await mkdir(source, { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), '{}');

      await expect(packageSubjectWorkspace({ sourceRoot: source, destination: nestedDestination, overlayRoot: overlay, condition: 'ordinary' }))
        .rejects.toThrow('destination is inside source root');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('excludes dist, nested tests, test-runtime, and source maps from exported subjects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-exclude-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(join(source, 'examples/shop/dist'), { recursive: true });
      await mkdir(join(source, 'examples/shop/tests'), { recursive: true });
      await mkdir(overlay, { recursive: true });

      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite', build: 'vite build' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const app = "orig";');
      await writeFile(join(source, 'examples/shop/src/test-runtime.ts'), 'export const bridge = true;');
      await writeFile(join(source, 'examples/shop/src/styles.css.map'), '{"version":3}');
      await writeFile(join(source, 'examples/shop/dist/bundle.js'), 'export const answer = 42;');
      await writeFile(join(source, 'examples/shop/tests/shop.test.ts'), 'test("nested", () => {});');

      await mkdir(join(overlay, 'examples/shop/src'), { recursive: true });
      await writeFile(join(overlay, 'examples/shop/src/main.tsx'), 'export const app = "clean";');

      await packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' });

      // Verify exclusions
      const inventory = validateSubjectInventory({
        files: ['package.json', 'examples/shop/src/main.tsx'],
        publicScenarioReferences: []
      }, 'ordinary');
      expect(inventory).toEqual([]);

      // Ensure forbidden files are not in destination
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(destination, 'examples/shop/src/test-runtime.ts'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/src/styles.css.map'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/dist'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/tests'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects subject inventory containing dist, tests, or test-runtime.ts', () => {
    const issues = validateSubjectInventory({
      files: [
        'package.json',
        'examples/shop/src/main.tsx',
        'dist/bundle.js',
        'tests/unit.test.ts',
        'examples/shop/src/test-runtime.ts',
        'examples/shop/src/app.js.map'
      ],
      publicScenarioReferences: []
    }, 'ordinary');

    expect(issues).toEqual(expect.arrayContaining([
      'subject exposes forbidden dist/ content in dist/bundle.js',
      'subject exposes forbidden tests/ content',
      'subject exposes forbidden runtime test bridge: examples/shop/src/test-runtime.ts',
      'subject exposes forbidden source map: examples/shop/src/app.js.map'
    ]));
  });
});

describe('W02 result accounting and endpoint fairness', () => {
  test('accepts a two-port fair pair with matching route and query', () => {
    const plan = validPlan();
    plan.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    plan.runs[1]!.subjectUrl = 'http://localhost:5173/lab?case=ancestor-clip';
    expect(() => validateBenchmarkPlan(plan)).not.toThrow();
  });

  test('rejects pairs with different routes or queries', () => {
    const planDifferentRoute = validPlan();
    planDifferentRoute.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    planDifferentRoute.runs[1]!.subjectUrl = 'http://127.0.0.1:4175/shop?case=ancestor-clip';
    expect(() => validateBenchmarkPlan(planDifferentRoute)).toThrow('route, and query must match');

    const planDifferentQuery = validPlan();
    planDifferentQuery.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    planDifferentQuery.runs[1]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=horizontal-overflow';
    expect(() => validateBenchmarkPlan(planDifferentQuery)).toThrow('route, and query must match');
  });

  test('ledger with one missing regression count shows NA and tracks graded counts', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 50,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'completed',
          wallSeconds: 60,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.06 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: null, fullSuccess: true },
          notes: ''
        }
      ]
    });
    const summary = renderResultsSummary(plan, results);
    expect(summary).toContain('| anwc-assisted | 1 | 1 | 1 | 1 | NA | 60 | 0.06 |');
    expect(summary).toContain('| ordinary | 1 | 0 | 1 | 0 | 0 | 0 | 1 |');
    expect(summary).toContain('| anwc-assisted | 1 | 0 | 1 | 0 | 0 | 0 | 0 |');
  });

  test('keeps planned, completed, capped, failed, and excluded runs distinct', () => {
    const plan = validPlan();
    for (let i = 2; i <= 5; i++) {
      plan.runs.push(
        { id: `pair-${i}a`, pairId: `pair-${i}`, fixtureId: 'heldout-a', replicate: 1, condition: 'ordinary', viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' },
        { id: `pair-${i}b`, pairId: `pair-${i}`, fixtureId: 'heldout-a', replicate: 1, condition: 'anwc-assisted', viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' }
      );
    }
    const validatedPlan = validateBenchmarkPlan(plan);
    const results = validateBenchmarkResults(validatedPlan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        { runId: 'pair-a', status: 'completed', wallSeconds: 30, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.03 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-b', status: 'completed', wallSeconds: 35, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.04 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-2a', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' },
        { runId: 'pair-2b', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' },
        { runId: 'pair-3a', status: 'infrastructure-failed', wallSeconds: 5, usage: { inputTokens: 2, cachedInputTokens: null, outputTokens: 1, costUsd: 0.02 }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Network error' },
        { runId: 'pair-3b', status: 'infrastructure-failed', wallSeconds: 5, usage: { inputTokens: 2, cachedInputTokens: null, outputTokens: 1, costUsd: 0.02 }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Network error' },
        { runId: 'pair-4a', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Excluded run' },
        { runId: 'pair-4b', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Excluded run' },
        { runId: 'pair-5a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-5b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    });
    const summary = renderResultsSummary(validatedPlan, results);
    expect(summary).toContain('| ordinary | 5 | 1 | 1 | 1 | 1 | 1 | 2 |');
    expect(summary).toContain('| anwc-assisted | 5 | 1 | 1 | 1 | 1 | 1 | 2 |');
    expect(summary).toContain('| ordinary | 5 | 2 | 1 | 1 | 0 |');
  });

  test('preserves known failed-run costs in expenditure and handles incomplete cost accounting', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 40,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'infrastructure-failed',
          wallSeconds: 15,
          usage: { inputTokens: 5, cachedInputTokens: null, outputTokens: 2, costUsd: 0.25 },
          scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null },
          notes: 'Browser process crashed unexpectedly'
        }
      ]
    });
    const summary = renderResultsSummary(plan, results);
    expect(summary).toContain('Known spending: ordinary = $0.10, anwc-assisted = $0.25');

    const resultsWithMissingCost = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 40,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: null },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'completed',
          wallSeconds: 45,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.20 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        }
      ]
    });
    const missingSummary = renderResultsSummary(plan, resultsWithMissingCost);
    expect(missingSummary).toContain('ordinary = $0 (incomplete)');
    expect(missingSummary).toContain('| ordinary | 1 | 1 | 1 | 1 | 0 | 40 | NA |');
  });

  test('validates result constraints for planned, failed, and excluded rows', () => {
    const plan = validateBenchmarkPlan(validPlan());

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('planned runs cannot carry wallSeconds');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: 5, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('planned runs cannot carry usage data');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'infrastructure-failed', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: 1, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Error' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('infrastructure-failed runs cannot carry repair scoring');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'infrastructure-failed', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '   ' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('require an explanation in notes');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('require an explanation in notes');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'unknown-run', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('unknown runId unknown-run');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('duplicate runId pair-a');
  });

  test('escapes pipes and newlines in table cells and headings', () => {
    const plan = validPlan();
    plan.title = 'Title | with pipe\nand newline';
    plan.runs[0]!.state = 'state | A\nstate B';
    plan.runs[1]!.state = 'state | A\nstate B';
    const runbook = renderRunbook(validateBenchmarkPlan(plan));
    expect(runbook).toContain('# Title \\| with pipe and newline runbook');
    expect(runbook).toContain('state \\| A state B');
  });

  test('CLI enforces strict arguments and rejects extraneous arguments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-bench-cli-'));
    const planFile = join(root, 'plan.json');
    const resultsFile = join(root, 'results.json');
    const outFile = join(root, 'output.md');
    try {
      const plan = validPlan();
      await writeFile(planFile, JSON.stringify(plan));
      const results = {
        schemaVersion: '0.1',
        planId: 'pilot',
        runs: [
          { runId: 'pair-a', status: 'completed', wallSeconds: 30, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
          { runId: 'pair-b', status: 'completed', wallSeconds: 35, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' }
        ]
      };
      await writeFile(resultsFile, JSON.stringify(results));

      const ioCapture = () => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        return {
          stdout: { write: (msg: string) => stdout.push(msg) },
          stderr: { write: (msg: string) => stderr.push(msg) },
          getStdout: () => stdout.join(''),
          getStderr: () => stderr.join('')
        };
      };

      let io = ioCapture();
      expect(await runBenchmarkCli(['validate', planFile, 'unexpected-arg'], io)).toBe(2);
      expect(io.getStderr()).toContain('Usage:');

      io = ioCapture();
      expect(await runBenchmarkCli(['validate', planFile], io)).toBe(0);
      expect(io.getStdout()).toContain('Valid scored benchmark plan');

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile, '--output', outFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile, '--output', outFile], io)).toBe(0);
      expect(await readFile(outFile, 'utf8')).toContain('# Pilot runbook');

      io = ioCapture();
      expect(await runBenchmarkCli(['validate-results', planFile, resultsFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['validate-results', planFile, resultsFile], io)).toBe(0);
      expect(io.getStdout()).toContain('Valid benchmark results');

      io = ioCapture();
      expect(await runBenchmarkCli(['summarize', planFile, resultsFile, '--output', outFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['summarize', planFile, resultsFile, '--output', outFile], io)).toBe(0);
      expect(await readFile(outFile, 'utf8')).toContain('# Pilot results summary');

      io = ioCapture();
      expect(await runBenchmarkCli(['not-a-command', planFile], io)).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
