import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fixtureFor, materializeFixtureSource, materializeFixtureStyles, taskMarkdown } from './fixtures/registry.js';
import { BenchmarkPlanError } from './index.js';
import { checkSubjectWorkspace, packageSubjectWorkspace, type SubjectCondition } from './subject.js';

export type PreparePairOptions = {
  sourceRoot: string;
  output: string;
  fixtureId: string;
  sourceRevision: string;
  detectorRevision: string;
  ordinaryPort: number;
  assistedPort: number;
};

export type PreparedPairReceipt = {
  schemaVersion: '0.2';
  fixtureId: string;
  appId: string;
  sourceRevision: string;
  detectorRevision: string;
  route: string;
  setup: [];
  ports: { ordinary: number; assisted: number };
  applicationFiles: Record<string, string>;
  immutableFiles: { ordinary: Record<string, string>; assisted: Record<string, string> };
  taskHash: string;
};

function normalizedPath(path: string): string {
  return path.split(sep).join('/');
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function hashFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/** Hash application inputs, deliberately excluding generated Vite configuration. */
async function hashApplicationFiles(root: string, appId: string): Promise<Record<string, string>> {
  const appRoot = join(root, 'examples', appId);
  const hashes: Record<string, string> = {};
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && entry.name !== 'vite.config.ts') hashes[normalizedPath(relative(root, full))] = await hashFile(full);
    }
  }
  await visit(appRoot);
  return Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)));
}

/** Inputs an agent may not change: tool/config files, task, and application files outside src/. */
async function hashImmutableFiles(root: string, appId: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const ignoredDirectories = new Set(['node_modules', 'dist', 'build', '.vite', '.cache']);
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const path = normalizedPath(relative(root, full));
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name) && path !== `examples/${appId}/src`) await visit(full);
      } else if (entry.isFile()) {
        hashes[path] = await hashFile(full);
      }
    }
  }
  await visit(root);
  return Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)));
}

function equalHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function readPreparedPairReceipt(path: string): Promise<PreparedPairReceipt> {
  const receiptPath = resolve(path);
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as PreparedPairReceipt;
    if (receipt.schemaVersion !== '0.2' || !receipt.appId || !receipt.applicationFiles || !receipt.immutableFiles) throw new Error('unsupported schema or missing frozen hashes');
    return receipt;
  } catch (error) {
    throw new BenchmarkPlanError([`invalid evaluator receipt: ${receiptPath}: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

/** Ensures a returned agent subject retained its frozen non-application inputs. */
export async function checkReturnedSubject(receipt: PreparedPairReceipt, subject: string, condition: SubjectCondition): Promise<string[]> {
  const root = resolve(subject);
  if (!(await exists(root))) return [`missing ${condition} subject: ${root}`];
  const issues = (await checkSubjectWorkspace(root, condition, receipt.appId, true)).map((issue) => `${condition}: ${issue}`);
  const expected = receipt.immutableFiles[condition === 'ordinary' ? 'ordinary' : 'assisted'];
  const actual = await hashImmutableFiles(root, receipt.appId);
  if (!equalHashes(actual, expected)) {
    const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter((path) => expected[path] !== actual[path]);
    issues.push(`${condition}: immutable tool, config, or task files differ from the frozen receipt: ${changed.join(', ')}`);
  }
  return issues;
}

/** Checks a pair before an agent starts work. W13 permits designated app edits after a repair. */
export async function checkPreparedPair(output: string): Promise<string[]> {
  const root = resolve(output);
  const receiptPath = join(root, 'receipt.json');
  if (!(await exists(receiptPath))) return [`missing evaluator receipt: ${receiptPath}`];
  let receipt: PreparedPairReceipt;
  try { receipt = await readPreparedPairReceipt(receiptPath); } catch (error) { return [error instanceof Error ? error.message : `invalid evaluator receipt: ${receiptPath}`]; }

  const issues: string[] = [];
  for (const condition of ['ordinary', 'anwc-assisted'] as const) {
    const subject = join(root, condition === 'ordinary' ? 'ordinary' : 'assisted');
    if (!(await exists(subject))) { issues.push(`missing ${condition} subject`); continue; }
    issues.push(...await checkReturnedSubject(receipt, subject, condition));
    if (!equalHashes(await hashApplicationFiles(subject, receipt.appId), receipt.applicationFiles)) issues.push(`${condition}: application files differ from the frozen receipt`);
    const taskHash = await hashFile(join(subject, 'TASK.md')).catch(() => 'missing');
    if (taskHash !== receipt.taskHash) issues.push(`${condition}: TASK.md differs from the frozen receipt`);
  }
  return issues;
}

/** Prepares matching, runnable ordinary and ANWC-assisted subject folders. */
export async function preparePair(options: PreparePairOptions): Promise<{ ordinary: string; assisted: string; receipt: string }> {
  const sourceRoot = resolve(options.sourceRoot);
  const output = resolve(options.output);
  const fixture = fixtureFor(options.fixtureId);
  const mainPath = join(sourceRoot, 'examples', fixture.appId, 'src', 'main.tsx');
  const stylesPath = join(sourceRoot, 'examples', fixture.appId, 'src', 'styles.css');
  if (await exists(output)) throw new BenchmarkPlanError([`pair output already exists: ${output}`]);
  if (!(await exists(mainPath)) || !(await exists(stylesPath))) throw new BenchmarkPlanError([`fixture application source is missing: ${mainPath} or ${stylesPath}`]);
  if (!Number.isInteger(options.ordinaryPort) || !Number.isInteger(options.assistedPort) || options.ordinaryPort < 1 || options.assistedPort < 1 || options.ordinaryPort === options.assistedPort) throw new BenchmarkPlanError(['ordinary and assisted ports must be distinct positive integers']);

  const overlay = await mkdtemp(join(tmpdir(), 'anwc-fixture-overlay-'));
  const ordinary = join(output, 'ordinary');
  const assisted = join(output, 'assisted');
  let outputCreated = false;
  try {
    await mkdir(output, { recursive: true });
    outputCreated = true;
    await mkdir(join(overlay, 'examples', fixture.appId, 'src'), { recursive: true });
    await writeFile(join(overlay, 'examples', fixture.appId, 'src', 'main.tsx'), materializeFixtureSource(await readFile(mainPath, 'utf8'), fixture), 'utf8');
    await writeFile(join(overlay, 'examples', fixture.appId, 'src', 'styles.css'), materializeFixtureStyles(await readFile(stylesPath, 'utf8'), fixture), 'utf8');
    await packageSubjectWorkspace({ sourceRoot, destination: ordinary, overlayRoot: overlay, condition: 'ordinary', appId: fixture.appId });
    await packageSubjectWorkspace({ sourceRoot, destination: assisted, overlayRoot: overlay, condition: 'anwc-assisted', appId: fixture.appId });

    const task = taskMarkdown(fixture);
    await Promise.all([writeFile(join(ordinary, 'TASK.md'), task, 'utf8'), writeFile(join(assisted, 'TASK.md'), task, 'utf8')]);
    const applicationFiles = await hashApplicationFiles(ordinary, fixture.appId);
    const assistedApplicationFiles = await hashApplicationFiles(assisted, fixture.appId);
    if (!equalHashes(applicationFiles, assistedApplicationFiles)) {
      const differing = [...new Set([...Object.keys(applicationFiles), ...Object.keys(assistedApplicationFiles)])]
        .filter((path) => applicationFiles[path] !== assistedApplicationFiles[path]);
      throw new BenchmarkPlanError([`prepared application files differ between conditions: ${differing.join(', ')}`]);
    }

    const receiptPath = join(output, 'receipt.json');
    const receipt: PreparedPairReceipt = { schemaVersion: '0.2', fixtureId: fixture.id, appId: fixture.appId, sourceRevision: options.sourceRevision, detectorRevision: options.detectorRevision, route: '/', setup: [], ports: { ordinary: options.ordinaryPort, assisted: options.assistedPort }, applicationFiles, immutableFiles: { ordinary: await hashImmutableFiles(ordinary, fixture.appId), assisted: await hashImmutableFiles(assisted, fixture.appId) }, taskHash: createHash('sha256').update(task).digest('hex') };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    const issues = await checkPreparedPair(output);
    if (issues.length > 0) throw new BenchmarkPlanError(['prepared pair did not pass readiness:', ...issues]);
    return { ordinary, assisted, receipt: receiptPath };
  } catch (error) {
    if (outputCreated) await rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(overlay, { recursive: true, force: true });
  }
}
