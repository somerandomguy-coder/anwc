import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { gradeResultSchema } from './grade.js';
import { parsePreparedPairReceipt, type PreparedPairReceipt } from './prepare.js';
import { BenchmarkPlanError, validateBenchmarkResults, type BenchmarkPlan, type BenchmarkResults } from './index.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const importedGradeSchema = z.object({
  receiptHash: sha256,
  gradeHash: sha256,
  runId: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(['passed', 'failed']),
  submittedArtifactHash: sha256,
  expectedChecks: z.number().int().positive()
}).strict();

export type ImportedGrade = z.infer<typeof importedGradeSchema>;
export const hashReceipt = (contents: string | Buffer): string => createHash('sha256').update(contents).digest('hex');

/**
 * Adds one evaluator result to an already recorded human run. It deliberately
 * leaves detection claims and regression counts for blinded human adjudication.
 */
export function importGradeIntoResults(plan: BenchmarkPlan, results: BenchmarkResults, runId: string, receiptHash: string, receipt: PreparedPairReceipt, gradeInput: unknown): BenchmarkResults {
  const grade = gradeResultSchema.parse(gradeInput);
  const run = plan.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new BenchmarkPlanError([`pilot grade import: unknown runId ${runId}`]);
  if (!run.receiptHash) throw new BenchmarkPlanError([`pilot grade import: run ${runId} has no frozen receiptHash`]);
  if (run.receiptHash !== receiptHash) throw new BenchmarkPlanError([`pilot grade import: receipt hash does not match frozen run ${runId}`]);
  if (!receipt.scored || receipt.source.dirty) throw new BenchmarkPlanError(['pilot grade import: scored runs require a clean scored receipt']);
  if (receipt.fixtureId !== run.fixtureId) throw new BenchmarkPlanError([`pilot grade import: receipt fixture ${receipt.fixtureId} does not match run fixture ${run.fixtureId}`]);
  if (receipt.fixtureState !== run.state) throw new BenchmarkPlanError([`pilot grade import: receipt state ${receipt.fixtureState} does not match run state ${run.state}`]);
  if (grade.fixtureId !== receipt.fixtureId || grade.condition !== run.condition) throw new BenchmarkPlanError([`pilot grade import: grade identity does not match run ${runId}`]);
  if (grade.status !== 'passed' && grade.status !== 'failed') throw new BenchmarkPlanError([`pilot grade import: only completed behavioral grades may be imported; received ${grade.status}`]);
  if (grade.schemaVersion !== '0.4' || !grade.provenance) throw new BenchmarkPlanError(['pilot grade import: grade schema 0.3 is historical and lacks required provenance; regrade with schema 0.4']);
  const provenance = grade.provenance;
  if (provenance.receiptHash !== receiptHash || provenance.runId !== runId) throw new BenchmarkPlanError([`pilot grade import: grade provenance does not bind receipt and run ${runId}`]);
  if (provenance.submissionId !== grade.submittedArtifactHash) throw new BenchmarkPlanError(['pilot grade import: grade submission identity does not match submitted artifact hash']);
  if (provenance.receipt.fixtureId !== receipt.fixtureId || provenance.receipt.fixtureState !== receipt.fixtureState || provenance.receipt.scored !== receipt.scored || provenance.receipt.sourceRevision !== receipt.source.revision || provenance.receipt.detectorRevision !== receipt.detector.revision || JSON.stringify(provenance.receipt.evaluator) !== JSON.stringify(receipt.evaluator)) throw new BenchmarkPlanError(['pilot grade import: grade provenance does not match the frozen receipt']);
  if (!receipt.source.revision.startsWith(plan.baseline.appCommit) || !receipt.detector.revision.startsWith(plan.baseline.detectorCommit)) throw new BenchmarkPlanError(['pilot grade import: receipt revisions do not match the frozen plan baseline']);
  if (!provenance.expectedChecks.some((check) => check.viewport.width === run.viewport.width && check.viewport.height === run.viewport.height)) throw new BenchmarkPlanError([`pilot grade import: grade does not cover run viewport ${run.viewport.width}x${run.viewport.height}`]);
  const expected = new Map(provenance.expectedChecks.map((check) => [`${check.id}@${check.viewport.width}x${check.viewport.height}`, check]));
  if (expected.size !== provenance.expectedChecks.length) throw new BenchmarkPlanError(['pilot grade import: grade provenance has duplicate expected checks']);
  if (grade.checks.length !== expected.size) throw new BenchmarkPlanError(['pilot grade import: grade is missing or has extra required check evidence']);
  const observed = new Set<string>();
  for (const check of grade.checks) {
    const key = `${check.id}@${check.viewport.width}x${check.viewport.height}`;
    const expectation = expected.get(key);
    if (!expectation || expectation.required !== check.required || observed.has(key)) throw new BenchmarkPlanError(['pilot grade import: grade check evidence does not match the frozen expected inventory']);
    if (check.required && check.status === 'unsupported') throw new BenchmarkPlanError([`pilot grade import: required check ${check.id} is unsupported`]);
    observed.add(key);
  }
  const actuallyVerified = grade.checks.length > 0 && grade.checks.every((check) => !check.required || check.status === 'pass');
  if (grade.repairVerified !== actuallyVerified || (grade.status === 'passed') !== actuallyVerified || grade.exitCode !== (actuallyVerified ? 0 : 1) || grade.integrityIssues.length !== 0 || grade.cleanup !== 'complete') throw new BenchmarkPlanError(['pilot grade import: grade status, verification, cleanup, or check evidence is contradictory']);

  const existing = results.runs.find((candidate) => candidate.runId === runId);
  if (!existing) throw new BenchmarkPlanError([`pilot grade import: ledger is missing runId ${runId}`]);
  if (existing.status !== 'completed' && existing.status !== 'time-capped') throw new BenchmarkPlanError([`pilot grade import: run ${runId} must be completed or time-capped before grading`]);
  if (existing.grade) throw new BenchmarkPlanError([`pilot grade import: run ${runId} already has an imported grade`]);
  if (Object.values(existing.scoring).some((value) => value !== null)) throw new BenchmarkPlanError([`pilot grade import: run ${runId} already has manual scoring; do not overwrite it`]);

  const gradeHash = hashReceipt(JSON.stringify(grade));
  const imported = importedGradeSchema.parse({ receiptHash, gradeHash, runId, status: grade.status, submittedArtifactHash: grade.submittedArtifactHash!, expectedChecks: provenance.expectedChecks.length });
  const next = {
    ...results,
    runs: results.runs.map((candidate) => candidate.runId === runId ? {
      ...candidate,
      grade: imported,
      scoring: { ...candidate.scoring, verifiedRepairs: grade.repairVerified ? 1 : 0, fullSuccess: null }
    } : candidate)
  };
  return validateBenchmarkResults(plan, next);
}

export async function importGradeFiles(options: { plan: BenchmarkPlan; results: BenchmarkResults; runId: string; receiptPath: string; gradePath: string }): Promise<BenchmarkResults> {
  const receiptBytes = await readFile(options.receiptPath);
  const receipt = parsePreparedPairReceipt(JSON.parse(receiptBytes.toString('utf8')), options.receiptPath);
  const grade = JSON.parse(await readFile(options.gradePath, 'utf8')) as unknown;
  return importGradeIntoResults(options.plan, options.results, options.runId, hashReceipt(receiptBytes), receipt, grade);
}
