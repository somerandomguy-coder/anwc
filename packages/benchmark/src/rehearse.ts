import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gradeRepair, type GradeResult } from './grade.js';
import { preparePair } from './prepare.js';

export type RehearsalOptions = { sourceRoot: string; output: string; sourceRevision: string; detectorRevision: string };
export type RehearsalReport = {
  schemaVersion: '0.2'; sourceRevision: string; detectorRevision: string;
  cases: Array<{ fixtureId: string; broken: GradeResult['status']; repaired: GradeResult['status']; deletion: GradeResult['status']; viewports: Array<{ width: number; height: number }> }>;
  limitations: string[];
};

async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }

async function replaceSource(path: string, pattern: RegExp, replacement: string): Promise<void> {
  const source = await readFile(path, 'utf8');
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`evaluator rehearsal patch did not match ${path}`);
  await writeFile(path, next, 'utf8');
}

function assertStatus(actual: GradeResult['status'], expected: GradeResult['status'], fixtureId: string, stage: string): void {
  if (actual !== expected) throw new Error(`${fixtureId} ${stage} expected ${expected}, received ${actual}`);
}

/** Runs the no-model development rehearsal. Its patches and reports stay evaluator-side. */
export async function rehearseBenchmark(options: RehearsalOptions): Promise<RehearsalReport> {
  const output = resolve(options.output);
  if (await exists(output)) throw new Error(`rehearsal output already exists: ${output}`);
  const cases: RehearsalReport['cases'] = [];
  const scenarios = [
    { fixtureId: 'pricing-blocked', ports: [4511, 4512, 4513], valid: /\{broken && affected && true && <div className="selection-blocker">Limited offer details<\/div>\}/, deletion: /<button data-anwc-expect="interactive" className=\{hidden \? 'hidden-selection' : ''\} onClick=\{\(\) => setSelected\(plan.name\)\}>Choose \{plan.name\}<\/button>/, deletionReplacement: '' },
    { fixtureId: 'dashboard-outside-save', ports: [4521, 4522, 4523], valid: /className=\{true \? 'outside-save' : ''\}/, deletion: /<button\s+data-anwc-expect="interactive" onClick=\{\(\) => setSaved\(true\)\}>Save changes<\/button>/, deletionReplacement: 'null' }
  ] as const;

  for (const scenario of scenarios) {
    const pair = await preparePair({ sourceRoot: options.sourceRoot, output: join(output, scenario.fixtureId), fixtureId: scenario.fixtureId, sourceRevision: options.sourceRevision, detectorRevision: options.detectorRevision, ordinaryPort: scenario.ports[0], assistedPort: scenario.ports[1], practice: true });
    const broken = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: scenario.ports[0], output: join(output, `${scenario.fixtureId}-broken.json`) });
    assertStatus(broken.status, 'failed', scenario.fixtureId, 'broken grade');
    const mainPath = join(pair.ordinary, 'examples', scenario.fixtureId.startsWith('pricing') ? 'landing' : 'dashboard', 'src', 'main.tsx');
    await replaceSource(mainPath, scenario.valid, '');
    const repaired = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: scenario.ports[1], output: join(output, `${scenario.fixtureId}-repaired.json`) });
    assertStatus(repaired.status, 'passed', scenario.fixtureId, 'repaired grade');
    await replaceSource(mainPath, scenario.deletion, scenario.deletionReplacement);
    const deletion = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: scenario.ports[2], output: join(output, `${scenario.fixtureId}-deletion.json`) });
    assertStatus(deletion.status, 'failed', scenario.fixtureId, 'deletion grade');
    cases.push({ fixtureId: scenario.fixtureId, broken: broken.status, repaired: repaired.status, deletion: deletion.status, viewports: broken.checks.map((check) => check.viewport).filter((viewport, index, all) => index === all.findIndex((candidate) => candidate.width === viewport.width && candidate.height === viewport.height)) });
  }
  const report: RehearsalReport = { schemaVersion: '0.2', sourceRevision: options.sourceRevision, detectorRevision: options.detectorRevision, cases, limitations: ['No model or provider usage was exercised.', 'The development cases are public and unblinded.', 'Paint, shape, and transform visibility remain outside ANWC guarantees.'] };
  await writeFile(join(output, 'rehearsal-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}
