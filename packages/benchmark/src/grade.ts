import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { z } from 'zod';
import { checkEvaluatorReceipt, checkReturnedSubject, readPreparedPairReceipt } from './prepare.js';
import { applySetup, isMutatingCheck, repairVerified, runChecks, type CheckResult, type FixtureCheck } from './fixtures/index.js';
import { evaluatorFixtureFor } from './fixtures/evaluator.js';
import { fixtureFor } from './fixtures/registry.js';
import type { SubjectCondition } from './subject.js';

export type GradeOptions = { receipt: string; subject: string; condition: SubjectCondition; port: number; output?: string; evaluatorRoot?: string; installTimeoutMs?: number; startupTimeoutMs?: number; overallTimeoutMs?: number };
const checkResultSchema = z.object({ id: z.string().min(1), required: z.boolean(), status: z.enum(['pass', 'fail', 'unsupported']), evidence: z.record(z.unknown()) }).strict();
export const gradeResultSchema = z.object({
  schemaVersion: z.literal('0.3'), fixtureId: z.string().min(1), condition: z.enum(['ordinary', 'anwc-assisted']), subject: z.string().min(1),
  status: z.enum(['passed', 'failed', 'integrity-failed', 'infrastructure-failed']), exitCode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), repairVerified: z.boolean(),
  checks: z.array(checkResultSchema.extend({ viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict() })), integrityIssues: z.array(z.string()), stage: z.string().min(1).optional(), error: z.string().min(1).optional(), logs: z.object({ install: z.string(), server: z.string(), pageErrors: z.array(z.string()) }).strict(), cleanup: z.enum(['not-needed', 'complete', 'timed-out'])
}).strict();
export type GradeResult = z.infer<typeof gradeResultSchema>;

const ignored = new Set(['node_modules', 'dist', 'build', '.vite', '.cache', '.turbo', 'artifacts', 'coverage']);
const maxLogChars = 16_000;
function isSameOrSubpath(child: string, parent: string): boolean { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }
function appendLog(current: string, chunk: Buffer | string): string { const next = current + chunk.toString(); return next.length > maxLogChars ? next.slice(next.length - maxLogChars) : next; }
function delay(ms: number): Promise<void> { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }

async function copyForEvaluation(source: string): Promise<string> {
  const root = resolve(source); const staging = await mkdtemp(join(tmpdir(), 'anwc-grade-'));
  async function visit(from: string, to: string): Promise<void> {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const input = join(from, entry.name); const output = join(to, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`submitted subject contains unsupported symbolic link: ${relative(root, input)}`);
      if (entry.isDirectory()) { if (!ignored.has(entry.name)) { await mkdir(output, { recursive: true }); await visit(input, output); } }
      else if (entry.isFile() && !entry.name.endsWith('.log')) { await mkdir(dirname(output), { recursive: true }); await copyFile(input, output); }
    }
  }
  try { await visit(root, staging); return staging; } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', (error) => rejectPort(new Error(`port ${port} is unavailable: ${error.message}`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close((error) => error ? rejectPort(error) : resolvePort()));
  });
}
async function runCommand(file: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolveRun, rejectRun) => {
    let output = ''; let settled = false;
    const child = spawn(file, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (error?: Error): void => { if (settled) return; settled = true; clearTimeout(timer); error ? rejectRun(Object.assign(error, { log: output })) : resolveRun(output); };
    child.stdout?.on('data', (data) => { output = appendLog(output, data); }); child.stderr?.on('data', (data) => { output = appendLog(output, data); });
    child.once('error', (error) => finish(error)); child.once('exit', (code) => code === 0 ? finish() : finish(new Error(`${file} ${args.join(' ')} exited ${code ?? 'without a code'}`)));
    const timer = setTimeout(() => { child.kill(); finish(new Error(`${file} ${args.join(' ')} timed out after ${timeoutMs}ms`)); }, timeoutMs);
  });
}
async function waitForServer(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs; let last = 'no response';
  while (Date.now() < deadline) { if (child.exitCode !== null) throw new Error(`development server exited ${child.exitCode}`); try { const response = await fetch(url, { signal: AbortSignal.timeout(1_000) }); if (response.ok) return; last = `HTTP ${response.status}`; } catch (error) { last = error instanceof Error ? error.message : String(error); } await delay(100); }
  throw new Error(`development server did not become ready: ${last}`);
}
async function stopOwnedProcess(child: ChildProcess | undefined): Promise<'not-needed' | 'complete' | 'timed-out'> {
  if (!child || child.exitCode !== null || !child.pid) return 'not-needed';
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill('SIGTERM');
  return Promise.race([exited.then(() => 'complete' as const), delay(5_000).then(() => 'timed-out' as const)]);
}
async function writeResult(result: GradeResult, output: string | undefined, subject: string): Promise<void> {
  if (!output) return; const destination = resolve(output); if (isSameOrSubpath(destination, resolve(subject))) throw new Error('grade result output must be outside the submitted subject'); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, `${JSON.stringify(gradeResultSchema.parse(result), null, 2)}\n`);
}
function preconditionChecks(requiredContent: string[], requiredActions: Array<{ role: string; name: string }>): FixtureCheck[] { return [...requiredContent.map((text, index) => ({ id: `content-${index + 1}`, required: true, kind: 'content' as const, selector: 'body', text })), ...requiredActions.map((action, index) => ({ id: `action-${index + 1}`, required: true, kind: 'action-rendered' as const, ...action }))]; }

/** Grades a returned repair in a fresh evaluator-owned workspace. */
export async function gradeRepair(options: GradeOptions): Promise<GradeResult> {
  const receipt = await readPreparedPairReceipt(options.receipt); const subject = resolve(options.subject); const logs = { install: '', server: '', pageErrors: [] as string[] };
  const integrityIssues = [...await checkReturnedSubject(receipt, subject, options.condition), ...await checkEvaluatorReceipt(receipt, options.evaluatorRoot)];
  const base = { schemaVersion: '0.3' as const, fixtureId: receipt.fixtureId, condition: options.condition, subject, integrityIssues, logs };
  if (integrityIssues.length > 0) { const result: GradeResult = { ...base, status: 'integrity-failed', exitCode: 2, repairVerified: false, checks: [], cleanup: 'not-needed' }; await writeResult(result, options.output, subject); return result; }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) { const result: GradeResult = { ...base, status: 'integrity-failed', exitCode: 2, repairVerified: false, checks: [], error: 'grade port must be an integer between 1 and 65535', cleanup: 'not-needed' }; await writeResult(result, options.output, subject); return result; }
  const prepared = fixtureFor(receipt.fixtureId); const evaluator = evaluatorFixtureFor(prepared); const checks: GradeResult['checks'] = []; const deadline = Date.now() + (options.overallTimeoutMs ?? 180_000); const remaining = (): number => { const milliseconds = deadline - Date.now(); if (milliseconds <= 0) throw new Error('overall grade timed out'); return milliseconds; }; let stage: string | undefined; let child: ChildProcess | undefined; let cleanup: GradeResult['cleanup'] = 'not-needed'; let activeStage = 'initialization'; let produced: GradeResult | undefined;
  try {
    if (evaluator.fixture.appId !== receipt.appId || evaluator.fixture.route !== receipt.route) throw new Error('receipt fixture does not match evaluator definition');
    await assertPortAvailable(options.port); remaining(); activeStage = 'staging'; stage = await copyForEvaluation(subject);
    const npmCli = process.env.npm_execpath; if (!npmCli) throw new Error('npm_execpath is unavailable');
    activeStage = 'install'; logs.install = await runCommand(process.execPath, [npmCli, 'ci', '--ignore-scripts'], stage, Math.min(options.installTimeoutMs ?? 120_000, remaining()));
    activeStage = 'server'; const serverPath = join(stage, 'node_modules', 'vite', 'bin', 'vite.js'); child = spawn(process.execPath, [serverPath, '--host', '127.0.0.1', '--port', String(options.port), '--strictPort'], { cwd: join(stage, 'examples', receipt.appId), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout?.on('data', (data) => { logs.server = appendLog(logs.server, data); }); child.stderr?.on('data', (data) => { logs.server = appendLog(logs.server, data); });
    const url = `http://127.0.0.1:${options.port}${receipt.route}`; await waitForServer(url, child, Math.min(options.startupTimeoutMs ?? 15_000, remaining()));
    activeStage = 'browser'; const browser = await chromium.launch({ headless: true });
    try {
      const allChecks = [...preconditionChecks(evaluator.fixture.requiredContent, evaluator.fixture.requiredActions), ...evaluator.repairChecks];
      for (const viewport of evaluator.fixture.viewports) {
        const runOnFreshPage = async (requested: FixtureCheck[], applyRecordedSetup: boolean): Promise<void> => { const page = await browser.newPage({ viewport }); page.on('pageerror', (error) => logs.pageErrors.push(error.message)); try { await page.goto(url, { waitUntil: 'networkidle', timeout: Math.min(10_000, remaining()) }); if (applyRecordedSetup) await applySetup(page, evaluator.fixture.setup); checks.push(...(await runChecks(page, requested)).map((result) => ({ ...result, viewport }))); remaining(); } finally { await page.close(); } };
        await runOnFreshPage(allChecks.filter((check) => !isMutatingCheck(check)), false);
        for (const check of allChecks.filter(isMutatingCheck)) await runOnFreshPage([check], true);
      }
    } finally { await browser.close(); }
    const passed = repairVerified(checks); produced = { ...base, stage: activeStage, status: passed ? 'passed' : 'failed', exitCode: passed ? 0 : 1, repairVerified: passed, checks, cleanup: 'not-needed' }; return produced;
  } catch (error) { produced = { ...base, stage: activeStage, status: 'infrastructure-failed', exitCode: 3, repairVerified: false, checks, error: error instanceof Error ? error.message : String(error), cleanup: 'not-needed' }; return produced;
  } finally { cleanup = await stopOwnedProcess(child); if (stage) await rm(stage, { recursive: true, force: true }); if (produced) { produced.cleanup = cleanup; await writeResult(produced, options.output, subject); } }
}
