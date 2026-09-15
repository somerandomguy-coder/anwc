import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BenchmarkPlanError, renderRunbook, validateBenchmarkPlan } from './index.js';

function usage(): string {
  return 'Usage: anwc-bench validate PLAN.json | anwc-bench runbook PLAN.json --output FILE.md';
}

export async function run(args: string[], io: Pick<typeof process, 'stdout' | 'stderr'> = process): Promise<number> {
  const [command, planPath, ...rest] = args;
  if (!planPath || !['validate', 'runbook'].includes(command ?? '')) {
    io.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    const plan = validateBenchmarkPlan(JSON.parse(await readFile(planPath, 'utf8')));
    if (command === 'validate') {
      io.stdout.write(`Valid ${plan.kind} benchmark plan: ${plan.runs.length} runs across ${new Set(plan.runs.map((run) => run.pairId)).size} pairs.\n`);
      return 0;
    }
    if (rest[0] !== '--output' || !rest[1] || rest.length !== 2) {
      io.stderr.write(`${usage()}\n`);
      return 2;
    }
    await mkdir(dirname(rest[1]), { recursive: true });
    await writeFile(rest[1], `${renderRunbook(plan)}\n`, 'utf8');
    io.stdout.write(`Wrote runbook to ${rest[1]}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof BenchmarkPlanError || error instanceof SyntaxError || error instanceof Error ? error.message : 'Unexpected benchmark command failure.';
    io.stderr.write(`Benchmark plan error: ${message}\n`);
    return 2;
  }
}

void run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
