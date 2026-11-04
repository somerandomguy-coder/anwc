import { describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NEUTRAL_BRIEFS,
  SIX_RUN_PRACTICE_CONFIG,
  syntheticPracticeReportSchema,
  generatePracticePlan,
  generatePracticeResults,
  generatePracticeSetup,
  renderOperatorRunbook,
  dryRunPractice,
  validateBenchmarkPlan,
  validateBenchmarkResults
} from '../../packages/benchmark/src/index.js';
import { run as runBenchmarkCli } from '../../packages/benchmark/src/main.js';

describe('Q11 operator kit and synthetic six-run practice', () => {
  test('generates valid counterbalanced six-run practice plan and matching results ledger', () => {
    const plan = generatePracticePlan({
      appCommit: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e',
      detectorCommit: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e'
    });
    const validatedPlan = validateBenchmarkPlan(plan);
    expect(validatedPlan.runs).toHaveLength(6);
    expect(validatedPlan.kind).toBe('example');

    // Counterbalanced order: ordinary -> assisted, assisted -> ordinary, ordinary -> assisted
    const conditions = validatedPlan.runs.map((r) => r.condition);
    expect(conditions).toEqual([
      'ordinary',
      'anwc-assisted',
      'anwc-assisted',
      'ordinary',
      'ordinary',
      'anwc-assisted'
    ]);

    // Unique ports across all runs to prevent server conflicts
    const ports = SIX_RUN_PRACTICE_CONFIG.map((r) => r.port);
    expect(new Set(ports).size).toBe(6);
    expect(ports).toEqual([4301, 4302, 4303, 4304, 4305, 4306]);

    // Matching URLs
    validatedPlan.runs.forEach((r, idx) => {
      expect(r.subjectUrl).toBe(`http://127.0.0.1:${ports[idx]}/`);
    });

    // Viewports match fixture requirements
    expect(validatedPlan.runs[0]!.viewport).toEqual({ width: 390, height: 844 });
    expect(validatedPlan.runs[1]!.viewport).toEqual({ width: 390, height: 844 });
    expect(validatedPlan.runs[2]!.viewport).toEqual({ width: 1440, height: 900 });
    expect(validatedPlan.runs[3]!.viewport).toEqual({ width: 1440, height: 900 });
    expect(validatedPlan.runs[4]!.viewport).toEqual({ width: 390, height: 844 });
    expect(validatedPlan.runs[5]!.viewport).toEqual({ width: 390, height: 844 });

    // Results ledger
    const results = generatePracticeResults(validatedPlan);
    const validatedResults = validateBenchmarkResults(validatedPlan, results);
    expect(validatedResults.runs).toHaveLength(6);
    expect(validatedResults.runs.every((r) => r.status === 'planned')).toBe(true);
    expect(validatedResults.runs.every((r) => r.wallSeconds === null)).toBe(true);
  });

  test('neutral task briefs provide fair instructions without revealing seeded defect names or detector codes', () => {
    expect(NEUTRAL_BRIEFS).toHaveLength(3);
    const appIds = NEUTRAL_BRIEFS.map((b) => b.appId);
    expect(appIds).toEqual(['shop', 'landing', 'dashboard']);

    for (const brief of NEUTRAL_BRIEFS) {
      expect(brief.taskHash).toMatch(/^[a-f0-9]{64}$/);
      // Neutrality: no defect names or detector codes disclosed
      expect(brief.taskText).not.toContain('blocked-checkout');
      expect(brief.taskText).not.toContain('selection-blocker');
      expect(brief.taskText).not.toContain('outside-save');
      expect(brief.taskText).not.toContain('POINTER_BLOCKED');
      expect(brief.taskText).not.toContain('OUTSIDE_VIEWPORT');
      expect(brief.taskText).not.toContain('CLIPPED_BY_ANCESTOR');
    }
  });

  test('generatePracticeSetup writes complete operator kit to disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-practice-setup-test-'));
    try {
      const setup = await generatePracticeSetup({
        outputDir: root,
        appCommit: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e',
        detectorCommit: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e'
      });

      const planRaw = JSON.parse(await readFile(setup.planPath, 'utf8'));
      const plan = validateBenchmarkPlan(planRaw);
      expect(plan.runs).toHaveLength(6);

      const resultsRaw = JSON.parse(await readFile(setup.resultsPath, 'utf8'));
      const results = validateBenchmarkResults(plan, resultsRaw);
      expect(results.runs).toHaveLength(6);

      const runbook = await readFile(setup.runbookPath, 'utf8');
      expect(runbook).toContain('ANWC three-app matched practice pilot runbook');
      expect(runbook).toContain('Neutral Task Briefs (for Agents)');
      expect(runbook).toContain('Step-by-Step Operator Procedure');
      expect(runbook).toContain('Step 1: Prepare Isolated Subject Arms');
      expect(runbook).toContain('Step 3: Run Agent Sessions in Counterbalanced Order');
      expect(runbook).toContain('Step 4: Grade Returned Repairs');
      expect(runbook).toContain('Step 5: Import Grades and Record Adjudication');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('dryRunPractice executes synthetic six-run lifecycle with full provenance and negative integrity checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-practice-dryrun-test-'));
    try {
      const report = await dryRunPractice({
        sourceRoot: process.cwd(),
        outputDir: root,
        sourceRevision: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e',
        detectorRevision: '1c5dda30ff0baf11cf848e42485d5afc83c7de0e',
        fast: true
      });

      // Validates against strict schema
      expect(syntheticPracticeReportSchema.parse(report)).toBeDefined();
      expect(report.summary.totalRuns).toBe(6);
      expect(report.summary.repairedPassed).toBe(2);
      expect(report.summary.brokenFailed).toBe(3);
      expect(report.summary.deletionFailed).toBe(1);
      expect(report.summary.allLedgerImportsSucceeded).toBe(true);
      expect(report.summary.allIntegrityChecksPassed).toBe(true);

      // Negative integrity checks passed
      expect(report.negativeIntegrityChecks.wrongReceiptRejected).toBe(true);
      expect(report.negativeIntegrityChecks.duplicateOutputPathRejected).toBe(true);
      expect(report.negativeIntegrityChecks.unrelatedRowsPreserved).toBe(true);

      // Prominent limitations disclosed
      expect(report.limitations.some((l) => l.includes('automated synthetic tooling dry-run'))).toBe(true);
      expect(report.limitations.some((l) => l.includes('Human pilot results (P09) remain pending'))).toBe(true);

      // Artifacts created on disk
      const diskReport = JSON.parse(await readFile(join(root, 'synthetic-practice-report.json'), 'utf8'));
      expect(diskReport.summary.totalRuns).toBe(6);

      const diskMarkdown = await readFile(join(root, 'synthetic-practice-report.md'), 'utf8');
      expect(diskMarkdown).toContain('# ANWC Synthetic Six-Run Practice Report');
      expect(diskMarkdown).toContain('Tooling Acceptance Only.');

      const importedResults = JSON.parse(await readFile(join(root, 'practice-results.imported.json'), 'utf8'));
      expect(importedResults.runs).toHaveLength(6);
      expect(importedResults.runs.every((r: { grade?: unknown }) => r.grade !== undefined)).toBe(true);

      const summaryMarkdown = await readFile(join(root, 'practice-summary.md'), 'utf8');
      expect(summaryMarkdown).toContain('results summary');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('CLI practice-setup and practice-dryrun commands execute cleanly with strict argument validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-practice-cli-test-'));
    try {
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

      // practice-setup missing --out
      let io = ioCapture();
      expect(await runBenchmarkCli(['practice-setup'], io)).toBe(2);
      expect(io.getStderr()).toContain('Usage:');

      // practice-setup with unrecognized flag
      io = ioCapture();
      expect(await runBenchmarkCli(['practice-setup', '--out', join(root, 'setup'), '--invalid-flag'], io)).toBe(2);

      // practice-setup successful
      io = ioCapture();
      const setupDir = join(root, 'setup');
      expect(await runBenchmarkCli(['practice-setup', '--out', setupDir, '--app-commit', '1c5dda30ff0baf11cf848e42485d5afc83c7de0e'], io)).toBe(0);
      expect(io.getStdout()).toContain('Generated 6-run practice setup');

      // practice-dryrun missing --out
      io = ioCapture();
      expect(await runBenchmarkCli(['practice-dryrun'], io)).toBe(2);
      expect(io.getStderr()).toContain('Usage:');

      // practice-dryrun successful fast mode
      io = ioCapture();
      const dryrunDir = join(root, 'dryrun');
      expect(await runBenchmarkCli(['practice-dryrun', '--out', dryrunDir, '--source-revision', '1c5dda30ff0baf11cf848e42485d5afc83c7de0e', '--fast'], io)).toBe(0);
      expect(io.getStdout()).toContain('Synthetic practice dry-run completed (6 runs: 2 passed, 4 failed)');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

