import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { gradeResultSchema } from './grade.js';
import { readPreparedPairReceipt, type PreparedPairReceipt } from './prepare.js';
import { BenchmarkPlanError, validateBenchmarkResults, type BenchmarkPlan, type BenchmarkResults } from './index.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const importedGradeSchema = z.object({
  receiptHash: sha256,
  status: z.enum(['passed', 'failed']),
  submittedArtifactHash: sha256.optional()
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
  if (receipt.fixtureId !== run.fixtureId) throw new BenchmarkPlanError([`pilot grade import: receipt fixture ${receipt.fixtureId} does not match run fixture ${run.fixtureId}`]);
  if (receipt.fixtureState !== run.state) throw new BenchmarkPlanError([`pilot grade import: receipt state ${receipt.fixtureState} does not match run state ${run.state}`]);
  if (grade.fixtureId !== receipt.fixtureId || grade.condition !== run.condition) throw new BenchmarkPlanError([`pilot grade import: grade identity does not match run ${runId}`]);
  if (grade.status !== 'passed' && grade.status !== 'failed') throw new BenchmarkPlanError([`pilot grade import: only completed behavioral grades may be imported; received ${grade.status}`]);

  const existing = results.runs.find((candidate) => candidate.runId === runId);
  if (!existing) throw new BenchmarkPlanError([`pilot grade import: ledger is missing runId ${runId}`]);
  if (existing.status !== 'completed' && existing.status !== 'time-capped') throw new BenchmarkPlanError([`pilot grade import: run ${runId} must be completed or time-capped before grading`]);
  if (existing.grade) throw new BenchmarkPlanError([`pilot grade import: run ${runId} already has an imported grade`]);
  if (Object.values(existing.scoring).some((value) => value !== null)) throw new BenchmarkPlanError([`pilot grade import: run ${runId} already has manual scoring; do not overwrite it`]);

  const imported = importedGradeSchema.parse({ receiptHash, status: grade.status, ...(grade.submittedArtifactHash ? { submittedArtifactHash: grade.submittedArtifactHash } : {}) });
  const next = {
    ...results,
    runs: results.runs.map((candidate) => candidate.runId === runId ? {
      ...candidate,
      grade: imported,
      scoring: { ...candidate.scoring, verifiedRepairs: grade.repairVerified ? 1 : 0, fullSuccess: grade.repairVerified }
    } : candidate)
  };
  return validateBenchmarkResults(plan, next);
}

export async function importGradeFiles(options: { plan: BenchmarkPlan; results: BenchmarkResults; runId: string; receiptPath: string; gradePath: string }): Promise<BenchmarkResults> {
  const receiptBytes = await readFile(options.receiptPath);
  const receipt = await readPreparedPairReceipt(options.receiptPath);
  const grade = JSON.parse(await readFile(options.gradePath, 'utf8')) as unknown;
  return importGradeIntoResults(options.plan, options.results, options.runId, hashReceipt(receiptBytes), receipt, grade);
}
