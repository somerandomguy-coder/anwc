import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BenchmarkPlanError, checkPreparedPair, checkSubjectWorkspace, gradeRepair, packageSubjectWorkspace, preparePair, renderResultsSummary, renderRunbook, validateBenchmarkPlan, validateBenchmarkResults, type SubjectCondition } from './index.js';

function usage(): string {
  return 'Usage: anwc-bench validate PLAN.json | anwc-bench runbook PLAN.json --output FILE.md | anwc-bench validate-results PLAN.json RESULTS.json | anwc-bench summarize PLAN.json RESULTS.json --output FILE.md | anwc-bench check-subject SUBJECT_PATH --condition ordinary|anwc-assisted | anwc-bench package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted | anwc-bench prepare-pair SOURCE --fixture ID --out DIRECTORY --source-revision SHA --detector-revision SHA [--ordinary-port PORT --assisted-port PORT] | anwc-bench check-pair DIRECTORY | anwc-bench grade --receipt RECEIPT --subject SUBJECT --condition ordinary|anwc-assisted --port PORT --output RESULT.json';
}

export type BenchmarkIo = {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
};

export async function run(args: string[], io: BenchmarkIo = process): Promise<number> {
  const [command, planPath, ...rest] = args;
  if ((!planPath && command !== 'grade') || !['validate', 'runbook', 'validate-results', 'summarize', 'check-subject', 'package-subject', 'prepare-pair', 'check-pair', 'grade'].includes(command ?? '')) {
    io.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    if (command === 'grade') {
      const [receiptFlag, receipt, subjectFlag, subject, conditionFlag, condition, portFlag, port, outputFlag, output] = [planPath, ...rest];
      if (receiptFlag !== '--receipt' || !receipt || subjectFlag !== '--subject' || !subject || conditionFlag !== '--condition' || !['ordinary', 'anwc-assisted'].includes(condition ?? '') || portFlag !== '--port' || !port || outputFlag !== '--output' || !output || rest.length !== 9) { io.stderr.write(`${usage()}\n`); return 2; }
      const result = await gradeRepair({ receipt, subject, condition: condition as SubjectCondition, port: Number(port), output });
      io.stdout.write(`Repair grade: ${result.status}. ${result.checks.length} checks recorded.\n`);
      return result.status === 'passed' ? 0 : 1;
    }
    if (command === 'check-pair') {
      if (rest.length !== 0) { io.stderr.write(`${usage()}\n`); return 2; }
      const issues = await checkPreparedPair(planPath);
      if (issues.length > 0) { io.stderr.write(`Prepared pair is not ready:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`); return 2; }
      io.stdout.write('Prepared pair is ready for agent work.\n');
      return 0;
    }
    if (command === 'prepare-pair') {
      const [fixtureFlag, fixtureId, outFlag, output, sourceFlag, sourceRevision, detectorFlag, detectorRevision, ...ports] = rest;
      let ordinaryPort = 4181;
      let assistedPort = 4182;
      if (fixtureFlag !== '--fixture' || !fixtureId || outFlag !== '--out' || !output || sourceFlag !== '--source-revision' || !sourceRevision || detectorFlag !== '--detector-revision' || !detectorRevision) { io.stderr.write(`${usage()}\n`); return 2; }
      if (ports.length !== 0) {
        if (ports.length !== 4 || ports[0] !== '--ordinary-port' || ports[2] !== '--assisted-port') { io.stderr.write(`${usage()}\n`); return 2; }
        ordinaryPort = Number(ports[1]);
        assistedPort = Number(ports[3]);
      }
      const pair = await preparePair({ sourceRoot: planPath, output, fixtureId, sourceRevision, detectorRevision, ordinaryPort, assistedPort });
      io.stdout.write(`Prepared ordinary subject at ${pair.ordinary} and assisted subject at ${pair.assisted}. Receipt: ${pair.receipt}\n`);
      return 0;
    }
    if (command === 'package-subject') {
      const destination = rest.shift();
      if (!destination || rest[0] !== '--overlay' || !rest[1] || rest[2] !== '--condition' || !['ordinary', 'anwc-assisted'].includes(rest[3] ?? '') || rest.length !== 4) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      await packageSubjectWorkspace({ sourceRoot: planPath, destination, overlayRoot: rest[1], condition: rest[3] as SubjectCondition });
      io.stdout.write(`Packed subject workspace at ${destination}.\n`);
      return 0;
    }
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
      if (rest.length !== 0) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      io.stdout.write(`Valid ${plan.kind} benchmark plan: ${plan.runs.length} runs across ${new Set(plan.runs.map((run) => run.pairId)).size} pairs.\n`);
      return 0;
    }
    if (command === 'runbook') {
      if (rest[0] !== '--output' || !rest[1] || rest.length !== 2) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      await mkdir(dirname(rest[1]), { recursive: true });
      await writeFile(rest[1], `${renderRunbook(plan)}\n`, 'utf8');
      io.stdout.write(`Wrote runbook to ${rest[1]}\n`);
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
    if (command === 'summarize') {
      const resultsPath = rest.shift();
      if (!resultsPath || rest[0] !== '--output' || !rest[1] || rest.length !== 2) {
        io.stderr.write(`${usage()}\n`);
        return 2;
      }
      const results = validateBenchmarkResults(plan, JSON.parse(await readFile(resultsPath, 'utf8')));
      await mkdir(dirname(rest[1]), { recursive: true });
      await writeFile(rest[1], `${renderResultsSummary(plan, results)}\n`, 'utf8');
      io.stdout.write(`Wrote results summary to ${rest[1]}\n`);
      return 0;
    }
    io.stderr.write(`${usage()}\n`);
    return 2;
  } catch (error) {
    const message = error instanceof BenchmarkPlanError || error instanceof SyntaxError || error instanceof Error ? error.message : 'Unexpected benchmark command failure.';
    io.stderr.write(`Benchmark plan error: ${message}\n`);
    return 2;
  }
}

import { fileURLToPath } from 'node:url';

const isDirectExecution = Boolean(
  process.argv[1] && (
    process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('/benchmark/src/main.ts') ||
    process.argv[1].endsWith('/benchmark/src/main.js')
  )
);

if (isDirectExecution) {
  void run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
