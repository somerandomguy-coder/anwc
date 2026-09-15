import { describe, expect, test } from 'vitest';
import { BenchmarkPlanError, renderResultsSummary, renderRunbook, validateBenchmarkPlan, validateBenchmarkResults, validateSubjectInventory } from '../../packages/benchmark/src/index.js';

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
});
