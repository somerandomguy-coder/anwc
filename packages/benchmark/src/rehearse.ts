import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gradeRepair, type GradeResult } from './grade.js';
import { preparePair, readPreparedPairReceipt } from './prepare.js';

export type RehearsalOptions = { sourceRoot: string; output: string; sourceRevision?: string; detectorRevision?: string };

const pExecFile = promisify(execFile);

async function resolveGitHead(sourceRoot: string): Promise<string> {
  try {
    const { stdout } = await pExecFile('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, windowsHide: true });
    return stdout.trim();
  } catch {
    return '0'.repeat(40);
  }
}

export const rehearsalReportSchema = z.object({
  schemaVersion: z.literal('0.3'),
  generatedAt: z.string(),
  sourceRevision: z.string().min(7),
  detectorRevision: z.string().min(7),
  evaluatorHashes: z.object({
    checker: z.string(),
    registry: z.string(),
    sidecar: z.string(),
    grader: z.string()
  }).strict(),
  cases: z.array(z.object({
    fixtureId: z.string(),
    appId: z.string(),
    condition: z.enum(['ordinary', 'anwc-assisted']),
    state: z.enum(['broken', 'repaired', 'deletion']),
    status: z.enum(['passed', 'failed', 'integrity-failed', 'infrastructure-failed']),
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    repairVerified: z.boolean(),
    port: z.number(),
    failingChecks: z.array(z.string()),
    viewports: z.array(z.object({ width: z.number(), height: z.number() })),
    submittedArtifactHash: z.string().optional()
  })),
  summary: z.object({
    totalRuns: z.literal(18),
    brokenFailed: z.number(),
    repairedPassed: z.number(),
    deletionFailed: z.number(),
    allMatched: z.boolean()
  }),
  limitations: z.array(z.string())
}).strict();

export type RehearsalReport = z.infer<typeof rehearsalReportSchema>;

async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
      } else {
        server.close(() => rejectPort(new Error('cannot determine available port')));
      }
    });
    server.on('error', rejectPort);
  });
}

async function replaceSource(path: string, pattern: RegExp | string, replacement: string): Promise<void> {
  const source = await readFile(path, 'utf8');
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`evaluator rehearsal patch did not match in ${path}`);
  await writeFile(path, next, 'utf8');
}

function assertStatus(actual: GradeResult['status'], expected: GradeResult['status'], fixtureId: string, condition: string, stage: string): void {
  if (actual !== expected) throw new Error(`${fixtureId} (${condition}) ${stage} expected ${expected}, received ${actual}`);
}

type Scenario = {
  fixtureId: string;
  appId: string;
  expectedBrokenCheck: string;
  expectedDeletionCheck: string;
  validRepair: { pattern: RegExp | string; replacement: string };
  deletion: { pattern: RegExp | string; replacement: string };
};

const scenarios: Scenario[] = [
  {
    fixtureId: 'shop-blocked-checkout',
    appId: 'shop',
    expectedBrokenCheck: 'checkout-confirms',
    expectedDeletionCheck: 'action-1',
    validRepair: { pattern: '<div className="notice">Cookie choices</div>', replacement: '' },
    deletion: { pattern: '<button onClick={checkout}>Review cart</button>', replacement: '' }
  },
  {
    fixtureId: 'pricing-blocked',
    appId: 'landing',
    expectedBrokenCheck: 'growth-selects',
    expectedDeletionCheck: 'content-1',
    validRepair: { pattern: '{broken && affected && true && <div className="selection-blocker">Limited offer details</div>}', replacement: '' },
    deletion: { pattern: '<p className="eyebrow">Northstar plans</p>', replacement: '' }
  },
  {
    fixtureId: 'dashboard-outside-save',
    appId: 'dashboard',
    expectedBrokenCheck: 'save-in-viewport',
    expectedDeletionCheck: 'content-1',
    validRepair: { pattern: "className={true ? 'outside-save' : ''}", replacement: 'className=""' },
    deletion: { pattern: '<p className="eyebrow">Atlas workspace</p>', replacement: '' }
  }
];

/** Runs the cross-app 18-run rehearsal across all 3 apps and both arms. Patches and reports stay evaluator-side. */
export async function rehearseBenchmark(options: RehearsalOptions): Promise<RehearsalReport> {
  const output = resolve(options.output);
  if (await exists(join(output, 'rehearsal-report.json'))) {
    throw new Error(`rehearsal report already exists: ${join(output, 'rehearsal-report.json')}`);
  }
  await mkdir(output, { recursive: true });

  const sourceRevision = options.sourceRevision ?? await resolveGitHead(options.sourceRoot);
  const detectorRevision = options.detectorRevision ?? sourceRevision;

  const stagingRoot = await mkdtemp(join(tmpdir(), 'anwc-rehearsal-staging-'));
  const cases: RehearsalReport['cases'] = [];
  let receiptEvaluatorHashes: RehearsalReport['evaluatorHashes'] | undefined;

  try {
    for (const scenario of scenarios) {
      const pair = await preparePair({
        sourceRoot: options.sourceRoot,
        output: join(stagingRoot, scenario.fixtureId),
        fixtureId: scenario.fixtureId,
        sourceRevision,
        detectorRevision,
        ordinaryPort: await getAvailablePort(),
        assistedPort: await getAvailablePort(),
        practice: true
      });

    if (!receiptEvaluatorHashes) {
      const receipt = await readPreparedPairReceipt(pair.receipt);
      receiptEvaluatorHashes = receipt.evaluator;
    }

    for (const condition of ['ordinary', 'anwc-assisted'] as const) {
      const subject = condition === 'ordinary' ? pair.ordinary : pair.assisted;
      const mainPath = join(subject, 'examples', scenario.appId, 'src', 'main.tsx');
      const originalSource = await readFile(mainPath, 'utf8');

      // 1. Broken run
      const brokenPort = await getAvailablePort();
      const broken = await gradeRepair({
        receipt: pair.receipt,
        subject,
        condition,
        port: brokenPort,
        output: join(output, `${scenario.fixtureId}-${condition}-broken.json`)
      });
      assertStatus(broken.status, 'failed', scenario.fixtureId, condition, 'broken grade');
      const brokenFailingChecks = broken.checks.filter((check) => check.status === 'fail').map((check) => check.id);
      if (!brokenFailingChecks.includes(scenario.expectedBrokenCheck)) {
        throw new Error(`${scenario.fixtureId} (${condition}) broken grade did not fail expected check ${scenario.expectedBrokenCheck}: found ${brokenFailingChecks.join(', ')}`);
      }
      cases.push({
        fixtureId: scenario.fixtureId,
        appId: scenario.appId,
        condition,
        state: 'broken',
        status: broken.status,
        exitCode: broken.exitCode,
        repairVerified: broken.repairVerified,
        port: brokenPort,
        failingChecks: brokenFailingChecks,
        viewports: broken.checks.map((c) => c.viewport).filter((vp, idx, all) => idx === all.findIndex((cand) => cand.width === vp.width && cand.height === vp.height)),
        submittedArtifactHash: broken.submittedArtifactHash
      });

      // 2. Repaired run
      await replaceSource(mainPath, scenario.validRepair.pattern, scenario.validRepair.replacement);
      const repairedPort = await getAvailablePort();
      const repaired = await gradeRepair({
        receipt: pair.receipt,
        subject,
        condition,
        port: repairedPort,
        output: join(output, `${scenario.fixtureId}-${condition}-repaired.json`)
      });
      assertStatus(repaired.status, 'passed', scenario.fixtureId, condition, 'repaired grade');
      cases.push({
        fixtureId: scenario.fixtureId,
        appId: scenario.appId,
        condition,
        state: 'repaired',
        status: repaired.status,
        exitCode: repaired.exitCode,
        repairVerified: repaired.repairVerified,
        port: repairedPort,
        failingChecks: [],
        viewports: repaired.checks.map((c) => c.viewport).filter((vp, idx, all) => idx === all.findIndex((cand) => cand.width === vp.width && cand.height === vp.height)),
        submittedArtifactHash: repaired.submittedArtifactHash
      });

      // 3. Deletion run (reset to original source first, then apply deletion)
      await writeFile(mainPath, originalSource, 'utf8');
      await replaceSource(mainPath, scenario.deletion.pattern, scenario.deletion.replacement);
      const deletionPort = await getAvailablePort();
      const deletion = await gradeRepair({
        receipt: pair.receipt,
        subject,
        condition,
        port: deletionPort,
        output: join(output, `${scenario.fixtureId}-${condition}-deletion.json`)
      });
      assertStatus(deletion.status, 'failed', scenario.fixtureId, condition, 'deletion grade');
      const deletionFailingChecks = deletion.checks.filter((check) => check.status === 'fail').map((check) => check.id);
      if (!deletionFailingChecks.includes(scenario.expectedDeletionCheck)) {
        throw new Error(`${scenario.fixtureId} (${condition}) deletion grade did not fail expected check ${scenario.expectedDeletionCheck}: found ${deletionFailingChecks.join(', ')}`);
      }
      cases.push({
        fixtureId: scenario.fixtureId,
        appId: scenario.appId,
        condition,
        state: 'deletion',
        status: deletion.status,
        exitCode: deletion.exitCode,
        repairVerified: deletion.repairVerified,
        port: deletionPort,
        failingChecks: deletionFailingChecks,
        viewports: deletion.checks.map((c) => c.viewport).filter((vp, idx, all) => idx === all.findIndex((cand) => cand.width === vp.width && cand.height === vp.height)),
        submittedArtifactHash: deletion.submittedArtifactHash
      });

      // Restore subject back to original source
      await writeFile(mainPath, originalSource, 'utf8');
    }
  }
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

  if (!receiptEvaluatorHashes) {
    throw new Error('evaluator hashes could not be determined during rehearsal');
  }

  const brokenFailed = cases.filter((c) => c.state === 'broken' && c.status === 'failed').length;
  const repairedPassed = cases.filter((c) => c.state === 'repaired' && c.status === 'passed').length;
  const deletionFailed = cases.filter((c) => c.state === 'deletion' && c.status === 'failed').length;

  const report: RehearsalReport = {
    schemaVersion: '0.3',
    generatedAt: new Date().toISOString(),
    sourceRevision,
    detectorRevision,
    evaluatorHashes: receiptEvaluatorHashes,
    cases,
    summary: {
      totalRuns: 18,
      brokenFailed,
      repairedPassed,
      deletionFailed,
      allMatched: cases.length === 18 && brokenFailed === 6 && repairedPassed === 6 && deletionFailed === 6
    },
    limitations: [
      'No model or provider usage was exercised in this automated rehearsal.',
      'The development cases are public and unblinded practice data.',
      'Paint, shape, and transform visibility remain outside ANWC guarantees.'
    ]
  };

  rehearsalReportSchema.parse(report);
  await writeFile(join(output, 'rehearsal-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}
