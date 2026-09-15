import { describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BenchmarkPlanError, packageSubjectWorkspace, renderResultsSummary, renderRunbook, validateBenchmarkPlan, validateBenchmarkResults, validateSubjectInventory } from '../../packages/benchmark/src/index.js';

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
