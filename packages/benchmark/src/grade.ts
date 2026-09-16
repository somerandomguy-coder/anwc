import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { checkReturnedSubject, readPreparedPairReceipt } from './prepare.js';
import { applySetup, repairVerified, runChecks, type CheckResult, type FixtureCheck } from './fixtures/index.js';
import { evaluatorFixtureFor } from './fixtures/evaluator.js';
import { fixtureFor } from './fixtures/registry.js';
import type { SubjectCondition } from './subject.js';

export type GradeOptions = { receipt: string; subject: string; condition: SubjectCondition; port: number; output?: string; cleanInstall?: boolean };
export type GradeResult = {
  schemaVersion: '0.2'; fixtureId: string; condition: SubjectCondition; subject: string;
  status: 'passed' | 'failed' | 'integrity-failed' | 'infrastructure-failed'; repairVerified: boolean;
  checks: Array<CheckResult & { viewport: { width: number; height: number } }>;
  integrityIssues: string[]; error?: string;
};

async function waitForServer(url: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`development server did not become ready: ${lastError}`);
}

async function runNpm(npmCli: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [npmCli, ...args], { cwd, stdio: 'ignore', windowsHide: true });
    child.once('error', rejectRun);
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`npm ${args.join(' ')} exited ${code ?? 'without a code'}`)));
  });
}

async function writeResult(result: GradeResult, output?: string): Promise<void> {
  if (!output) return;
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function preconditionChecks(requiredContent: string[], requiredActions: Array<{ role: string; name: string }>): FixtureCheck[] {
  return [
    ...requiredContent.map((text, index) => ({ id: `content-${index + 1}`, required: true, kind: 'content' as const, selector: 'body', text })),
    ...requiredActions.map((action, index) => ({ id: `action-${index + 1}`, required: true, kind: 'action-rendered' as const, ...action }))
  ];
}

/** Runs evaluator-only behavior checks against a returned repair and always stops its dev server. */
export async function gradeRepair(options: GradeOptions): Promise<GradeResult> {
  const receipt = await readPreparedPairReceipt(options.receipt);
  const integrityIssues = await checkReturnedSubject(receipt, options.subject, options.condition);
  const base = { schemaVersion: '0.2' as const, fixtureId: receipt.fixtureId, condition: options.condition, subject: resolve(options.subject), integrityIssues };
  if (integrityIssues.length > 0) {
    const result: GradeResult = { ...base, status: 'integrity-failed', repairVerified: false, checks: [] };
    await writeResult(result, options.output);
    return result;
  }
  if (!Number.isInteger(options.port) || options.port < 1) throw new Error('grade port must be a positive integer');

  const prepared = fixtureFor(receipt.fixtureId);
  const evaluator = evaluatorFixtureFor(prepared);
  if (evaluator.fixture.appId !== receipt.appId) throw new Error(`receipt app ${receipt.appId} does not match evaluator fixture ${evaluator.fixture.appId}`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is unavailable');
  const url = `http://127.0.0.1:${options.port}${evaluator.fixture.route}`;
  let child: ReturnType<typeof spawn> | undefined;
  const checks: GradeResult['checks'] = [];
  try {
    if (options.cleanInstall !== false) await runNpm(npmCli, ['ci', '--ignore-scripts'], resolve(options.subject));
    const subjectRoot = resolve(options.subject);
    child = spawn(process.execPath, [join(subjectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(options.port)], { cwd: join(subjectRoot, 'examples', receipt.appId), stdio: 'ignore', windowsHide: true });
    await waitForServer(url);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of evaluator.fixture.viewports) {
        const page = await browser.newPage({ viewport });
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 });
          await applySetup(page, evaluator.fixture.setup);
          const results = await runChecks(page, [...preconditionChecks(evaluator.fixture.requiredContent, evaluator.fixture.requiredActions), ...evaluator.repairChecks]);
          checks.push(...results.map((result) => ({ ...result, viewport })));
        } finally { await page.close(); }
      }
    } finally { await browser.close(); }
    const passed = repairVerified(checks);
    const result: GradeResult = { ...base, status: passed ? 'passed' : 'failed', repairVerified: passed, checks };
    await writeResult(result, options.output);
    return result;
  } catch (error) {
    const result: GradeResult = { ...base, status: 'infrastructure-failed', repairVerified: false, checks, error: error instanceof Error ? error.message : String(error) };
    await writeResult(result, options.output);
    return result;
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise<void>((resolveStop) => child!.once('exit', () => resolveStop()));
      child.kill();
      await Promise.race([stopped, new Promise((resolveStop) => setTimeout(resolveStop, 2_000))]);
    }
  }
}
