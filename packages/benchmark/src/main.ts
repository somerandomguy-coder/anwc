import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BenchmarkPlanError, checkSubjectWorkspace, renderResultsSummary, renderRunbook, validateBenchmarkPlan, validateBenchmarkResults, type SubjectCondition } from './index.js';

function usage(): string {
  return 'Usage: anwc-bench validate PLAN.json | anwc-bench runbook PLAN.json --output FILE.md | anwc-bench validate-results PLAN.json RESULTS.json | anwc-bench summarize PLAN.json RESULTS.json --output FILE.md | anwc-bench check-subject SUBJECT_PATH --condition ordinary|anwc-assisted';
}

export async function run(args: string[], io: Pick<typeof process, 'stdout' | 'stderr'> = process): Promise<number> {
  const [command, planPath, ...rest] = args;
  if (!planPath || !['validate', 'runbook', 'validate-results', 'summarize', 'check-subject'].includes(command ?? '')) {
    io.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    if (command === 'check-subject') {
      if (rest[0] !== '--condition' || !['ordinary', 'anwc-assisted'].includes(rest[1] ?? '') || rest.length !== 2) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      const issues = await checkSubjectWorkspace(planPath, rest[1] as SubjectCondition);
      if (issues.length > 0) {
        io.stderr.write(`Subject workspace is not ready:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`);
        return 2;
      }
      io.stdout.write(`Subject workspace is ready for the ${rest[1]} condition.\n`);
      return 0;
    }
    const plan = validateBenchmarkPlan(JSON.parse(await readFile(planPath, 'utf8')));
    if (command === 'validate') {
      io.stdout.write(`Valid ${plan.kind} benchmark plan: ${plan.runs.length} runs across ${new Set(plan.runs.map((run) => run.pairId)).size} pairs.\n`);
      return 0;
    }
    if (command === 'validate-results') {
      if (!rest[0] || rest.length !== 1) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      const results = validateBenchmarkResults(plan, JSON.parse(await readFile(rest[0], 'utf8')));
      io.stdout.write(`Valid benchmark results: ${results.runs.length} run records for ${plan.id}.\n`);
      return 0;
    }
    const resultsPath = command === 'summarize' ? rest.shift() : undefined;
    if ((command === 'summarize' && !resultsPath) || rest[0] !== '--output' || !rest[1] || rest.length !== 2) {
      io.stderr.write(`${usage()}\n`);
      return 2;
    }
    await mkdir(dirname(rest[1]), { recursive: true });
    const output = command === 'summarize'
      ? renderResultsSummary(plan, validateBenchmarkResults(plan, JSON.parse(await readFile(resultsPath!, 'utf8'))))
      : renderRunbook(plan);
    await writeFile(rest[1], `${output}\n`, 'utf8');
    io.stdout.write(`Wrote ${command === 'summarize' ? 'results summary' : 'runbook'} to ${rest[1]}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof BenchmarkPlanError || error instanceof SyntaxError || error instanceof Error ? error.message : 'Unexpected benchmark command failure.';
    io.stderr.write(`Benchmark plan error: ${message}\n`);
    return 2;
  }
}

void run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
