import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';
import { z } from 'zod';
import { fixtureFor, materializeFixtureSource, materializeFixtureStyles, taskMarkdown, type FixtureState } from './fixtures/registry.js';
import { BenchmarkPlanError } from './index.js';
import { checkSubjectWorkspace, type SubjectCondition } from './subject.js';

const pExecFile = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const port = z.number().int().min(1).max(65_535);
const pathKey = z.string().min(1).refine((value) => !value.split('/').includes('..') && !value.split('\\').includes('..'), 'path traversal is not allowed');

export type PreparePairOptions = { sourceRoot: string; output: string; fixtureId: string; state?: FixtureState; sourceRevision?: string; detectorRevision?: string; ordinaryPort: number; assistedPort: number; practice?: boolean };

const receiptSchema = z.object({
  schemaVersion: z.literal('0.3'), scored: z.boolean(), fixtureId: z.string().regex(/^[a-z0-9-]+$/), fixtureState: z.enum(['broken', 'healthy']), appId: z.enum(['shop', 'landing', 'dashboard']),
  source: z.object({ revision: z.string().regex(/^[a-f0-9]{40}$/), dirty: z.boolean() }).strict(),
  detector: z.object({ revision: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
  evaluator: z.object({ checker: sha256, registry: sha256, sidecar: sha256, grader: sha256 }).strict(),
  route: z.string().startsWith('/'), setup: z.array(z.record(z.unknown())), viewports: z.array(z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict()).min(1),
  ports: z.object({ ordinary: port, assisted: port }).strict(), editablePaths: z.array(pathKey).min(1),
  toolchain: z.object({ node: z.string().min(1), npm: z.string().min(1), browser: z.string().min(1) }).strict(),
  applicationFiles: z.record(pathKey, sha256), immutableFiles: z.object({ ordinary: z.record(pathKey, sha256), assisted: z.record(pathKey, sha256) }).strict(),
  intentHashes: z.object({ ordinary: sha256, assisted: sha256 }).strict(), taskHash: sha256
}).strict().refine((data) => !data.scored || !data.source.dirty, 'scored receipt cannot have dirty source state');
export type PreparedPairReceipt = z.infer<typeof receiptSchema>;

function normalizedPath(path: string): string { return path.split(sep).join('/'); }
function isSameOrSubpath(child: string, parent: string): boolean { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function hashFile(path: string): Promise<string> { return hash(await readFile(path)); }

async function hashApplicationFiles(root: string, appId: string): Promise<Record<string, string>> {
  const appRoot = join(root, 'examples', appId); const hashes: Record<string, string> = {};
  async function visit(directory: string): Promise<void> { for (const entry of await readdir(directory, { withFileTypes: true })) { const full = join(directory, entry.name); if (entry.isSymbolicLink()) throw new BenchmarkPlanError([`symbolic link is not allowed in application inputs: ${normalizedPath(relative(root, full))}`]); if (entry.isDirectory()) await visit(full); else if (entry.isFile() && entry.name !== 'vite.config.ts') hashes[normalizedPath(relative(root, full))] = await hashFile(full); } }
  await visit(appRoot); return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
}
async function hashImmutableFiles(root: string, appId: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}; const ignored = new Set(['node_modules', 'dist', 'build', '.vite', '.cache', '.turbo']);
  async function visit(directory: string): Promise<void> { for (const entry of await readdir(directory, { withFileTypes: true })) { const full = join(directory, entry.name); const key = normalizedPath(relative(root, full)); if (entry.isSymbolicLink()) throw new BenchmarkPlanError([`symbolic link is not allowed in frozen inputs: ${key}`]); if (entry.isDirectory()) { if (!ignored.has(entry.name) && key !== `examples/${appId}/src`) await visit(full); } else if (entry.isFile()) hashes[key] = await hashFile(full); } }
  await visit(root); return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
}
function equalHashes(left: Record<string, string>, right: Record<string, string>): boolean { return JSON.stringify(left) === JSON.stringify(right); }

export type SourceIntentDeclaration = Readonly<{ expect?: string; maxLines?: string }>;

function jsxAttributeName(attribute: ts.JsxAttribute, file: ts.SourceFile): string {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.getText(file);
}

function staticJsxValue(attribute: ts.JsxAttribute, file: ts.SourceFile, sourcePath: string): string {
  const initializer = attribute.initializer;
  if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
  if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression;
    if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  }
  throw new BenchmarkPlanError([`unverifiable dynamic ${jsxAttributeName(attribute, file)} intent in ${sourcePath}:${file.getLineAndCharacterOfPosition(attribute.getStart(file)).line + 1}`]);
}

/**
 * Extracts only the declarative ANWC contracts from TSX, independent of whitespace,
 * JSX attribute order, and source locations. Dynamic contract values cannot be frozen
 * safely and are rejected rather than silently omitted.
 */
export function extractSourceIntent(source: string, sourcePath = 'main.tsx'): SourceIntentDeclaration[] {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const parseError = (file as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics[0];
  if (parseError) throw new BenchmarkPlanError([`cannot parse source intent in ${sourcePath}:${file.getLineAndCharacterOfPosition(parseError.start ?? 0).line + 1}: ${ts.flattenDiagnosticMessageText(parseError.messageText, ' ')}`]);
  const declarations: SourceIntentDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(node)) {
      const declaration: { expect?: string; maxLines?: string } = {};
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue;
        if (jsxAttributeName(property, file) === 'data-anwc-expect') declaration.expect = staticJsxValue(property, file, sourcePath);
        if (jsxAttributeName(property, file) === 'data-anwc-max-lines') declaration.maxLines = staticJsxValue(property, file, sourcePath);
      }
      if (declaration.expect !== undefined || declaration.maxLines !== undefined) declarations.push(declaration);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return declarations
    .map(({ expect, maxLines }) => ({ ...(expect === undefined ? {} : { expect }), ...(maxLines === undefined ? {} : { maxLines }) }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function hashSourceIntent(source: string, sourcePath?: string): string {
  return hash(JSON.stringify(extractSourceIntent(source, sourcePath)));
}

async function intentHash(root: string, appId: string): Promise<string> {
  const sourcePath = join(root, 'examples', appId, 'src', 'main.tsx');
  return hashSourceIntent(await readFile(sourcePath, 'utf8'), normalizedPath(relative(root, sourcePath)));
}
async function gitState(sourceRoot: string, requested: string | undefined, practice: boolean): Promise<{ revision: string; dirty: boolean }> {
  try {
    const { stdout: revision } = await pExecFile('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, windowsHide: true });
    const { stdout: status } = await pExecFile('git', ['status', '--porcelain'], { cwd: sourceRoot, windowsHide: true });
    const full = revision.trim(); const dirty = status.trim().length > 0;
    if (!/^[a-f0-9]{40}$/.test(full)) throw new Error('HEAD did not resolve to a full commit');
    if (!practice && dirty) throw new Error('scored preparation requires a clean Git checkout');
    if (requested && requested !== full) throw new Error(`requested source revision ${requested} does not match HEAD ${full}`);
    return { revision: full, dirty };
  } catch (error) { throw new BenchmarkPlanError([`cannot verify source Git revision: ${error instanceof Error ? error.message : String(error)}`]); }
}
async function evaluatorHashes(sourceRoot: string): Promise<PreparedPairReceipt['evaluator']> {
  const root = join(sourceRoot, 'packages', 'benchmark', 'src', 'fixtures');
  return { checker: await hashFile(join(root, 'index.ts')), registry: await hashFile(join(root, 'registry.ts')), sidecar: await hashFile(join(root, 'evaluator.ts')), grader: await hashFile(join(sourceRoot, 'packages', 'benchmark', 'src', 'grade.ts')) };
}

export async function readPreparedPairReceipt(path: string): Promise<PreparedPairReceipt> {
  const receiptPath = resolve(path);
  const receiptStat = await lstat(receiptPath).catch(() => undefined);
  if (receiptStat?.isSymbolicLink()) throw new BenchmarkPlanError([`receipt path cannot be a symbolic link: ${receiptPath}`]);
  try {
    const raw: unknown = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (typeof raw === 'object' && raw !== null && (raw as { schemaVersion?: string }).schemaVersion === '0.2') throw new Error('receipt schema 0.2 is historical and uncertified; regenerate from the original pinned source with schema 0.3');
    return receiptSchema.parse(raw);
  } catch (error) { throw new BenchmarkPlanError([`invalid evaluator receipt: ${receiptPath}: ${error instanceof Error ? error.message : String(error)}`]); }
}

/** Ensures evaluator code still matches the sidecar/checker captured at preparation. */
export async function checkEvaluatorReceipt(receipt: PreparedPairReceipt, sourceRoot = process.cwd()): Promise<string[]> {
  const actual = await evaluatorHashes(resolve(sourceRoot)).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  if ('error' in actual) return [`cannot verify evaluator hashes: ${actual.error}`];
  return Object.entries(receipt.evaluator).filter(([key, value]) => actual[key as keyof typeof actual] !== value).map(([key]) => `evaluator ${key} hash differs from the frozen receipt`);
}

/** Ensures a returned agent subject retained frozen inputs while allowing application source edits. */
export async function checkReturnedSubject(receipt: PreparedPairReceipt, subject: string, condition: SubjectCondition): Promise<string[]> {
  const root = resolve(subject);
  const rootStat = await lstat(root).catch(() => undefined);
  if (!rootStat) return [`missing ${condition} subject: ${root}`];
  if (rootStat.isSymbolicLink()) return [`${condition}: subject directory is an unsupported symbolic link: ${root}`];
  let issues: string[] = [];
  try {
    issues = (await checkSubjectWorkspace(root, condition, receipt.appId, true)).map((issue) => `${condition}: ${issue}`);
  } catch (error) {
    if (error instanceof BenchmarkPlanError) return error.issues.map((issue) => `${condition}: ${issue}`);
    return [`${condition}: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (receipt.scored && receipt.source.dirty) {
    issues.push(`${condition}: scored receipt cannot claim dirty source revision`);
  }
  const arm = condition === 'ordinary' ? 'ordinary' : 'assisted';
  const actual = await hashImmutableFiles(root, receipt.appId).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  if ('error' in actual) return [...issues, `${condition}: cannot verify immutable files: ${actual.error}`];
  if (!equalHashes(actual, receipt.immutableFiles[arm])) {
    const changed = [...new Set([...Object.keys(receipt.immutableFiles[arm]), ...Object.keys(actual)])].filter((key) => receipt.immutableFiles[arm][key] !== actual[key]);
    issues.push(`${condition}: immutable tool, config, or task files differ from the frozen receipt: ${changed.join(', ')}`);
  }
  const submittedIntent = await intentHash(root, receipt.appId).catch((error) => `ERROR:${error instanceof Error ? error.message : String(error)}`);
  if (submittedIntent !== receipt.intentHashes[arm]) issues.push(`${condition}: declared source intent differs from the frozen receipt`);
  return issues;
}

export async function checkPreparedPair(output: string): Promise<string[]> {
  const root = resolve(output); const receiptPath = join(root, 'receipt.json'); if (!(await exists(receiptPath))) return [`missing evaluator receipt: ${receiptPath}`];
  let receipt: PreparedPairReceipt; try { receipt = await readPreparedPairReceipt(receiptPath); } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
  const issues: string[] = [];
  for (const condition of ['ordinary', 'anwc-assisted'] as const) { const arm = condition === 'ordinary' ? 'ordinary' : 'assisted'; const subject = join(root, arm); if (!(await exists(subject))) { issues.push(`missing ${condition} subject`); continue; } issues.push(...await checkReturnedSubject(receipt, subject, condition)); if (!equalHashes(await hashApplicationFiles(subject, receipt.appId), receipt.applicationFiles)) issues.push(`${condition}: application files differ from the frozen receipt`); if (await hashFile(join(subject, 'TASK.md')).catch(() => 'missing') !== receipt.taskHash) issues.push(`${condition}: TASK.md differs from the frozen receipt`); }
  return issues;
}

/** Prepares matching, runnable ordinary and ANWC-assisted subjects from a pinned source tree. */
export async function preparePair(options: PreparePairOptions): Promise<{ ordinary: string; assisted: string; receipt: string }> {
  const sourceRoot = resolve(options.sourceRoot); const output = resolve(options.output); const fixture = fixtureFor(options.fixtureId); const state = options.state ?? 'broken'; const practice = options.practice === true;
  const sourceStat = await lstat(sourceRoot).catch(() => undefined);
  if (!sourceStat || !sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new BenchmarkPlanError([`source root must be a non-symlink directory: ${sourceRoot}`]);
  const outputStat = await lstat(output).catch(() => undefined);
  if (outputStat) throw new BenchmarkPlanError([`pair output already exists or is a symbolic link: ${output}`]);
  if (isSameOrSubpath(output, sourceRoot) || isSameOrSubpath(sourceRoot, output)) throw new BenchmarkPlanError([`pair output overlaps source root: ${output}`]);
  if (!Number.isInteger(options.ordinaryPort) || !Number.isInteger(options.assistedPort) || options.ordinaryPort < 1 || options.assistedPort < 1 || options.ordinaryPort > 65_535 || options.assistedPort > 65_535 || options.ordinaryPort === options.assistedPort) throw new BenchmarkPlanError(['ordinary and assisted ports must be distinct ports between 1 and 65535']);
  const sourceState = await gitState(sourceRoot, options.sourceRevision, practice); if (options.detectorRevision && options.detectorRevision !== sourceState.revision) throw new BenchmarkPlanError(['detector revision must match the pinned source revision for this evaluator']);
  const mainPath = join(sourceRoot, 'examples', fixture.appId, 'src', 'main.tsx'); const stylesPath = join(sourceRoot, 'examples', fixture.appId, 'src', 'styles.css');
  if (!(await exists(mainPath)) || !(await exists(stylesPath))) throw new BenchmarkPlanError([`fixture application source is missing: ${mainPath} or ${stylesPath}`]);
  const overlay = await mkdtemp(join(tmpdir(), 'anwc-fixture-overlay-')); const ordinary = join(output, 'ordinary'); const assisted = join(output, 'assisted'); let created = false;
  try {
    await mkdir(output, { recursive: false }); created = true; await mkdir(join(overlay, 'examples', fixture.appId, 'src'), { recursive: true });
    await writeFile(join(overlay, 'examples', fixture.appId, 'src', 'main.tsx'), materializeFixtureSource(await readFile(mainPath, 'utf8'), fixture, state)); await writeFile(join(overlay, 'examples', fixture.appId, 'src', 'styles.css'), materializeFixtureStyles(await readFile(stylesPath, 'utf8'), fixture, state));
    const { packageSubjectWorkspace } = await import('./subject.js');
    await packageSubjectWorkspace({ sourceRoot, destination: ordinary, overlayRoot: overlay, condition: 'ordinary', appId: fixture.appId }); await packageSubjectWorkspace({ sourceRoot, destination: assisted, overlayRoot: overlay, condition: 'anwc-assisted', appId: fixture.appId });
    const task = taskMarkdown(fixture); await Promise.all([writeFile(join(ordinary, 'TASK.md'), task), writeFile(join(assisted, 'TASK.md'), task)]);
    const applicationFiles = await hashApplicationFiles(ordinary, fixture.appId); if (!equalHashes(applicationFiles, await hashApplicationFiles(assisted, fixture.appId))) throw new BenchmarkPlanError(['prepared application files differ between conditions']);
    const receipt: PreparedPairReceipt = { schemaVersion: '0.3', scored: !practice, fixtureId: fixture.id, fixtureState: state, appId: fixture.appId, source: sourceState, detector: { revision: sourceState.revision }, evaluator: await evaluatorHashes(sourceRoot), route: fixture.route, setup: fixture.setup, viewports: fixture.viewports, ports: { ordinary: options.ordinaryPort, assisted: options.assistedPort }, editablePaths: [`examples/${fixture.appId}/src`], toolchain: { node: process.version, npm: process.env.npm_config_user_agent ?? 'unknown', browser: 'playwright' }, applicationFiles, immutableFiles: { ordinary: await hashImmutableFiles(ordinary, fixture.appId), assisted: await hashImmutableFiles(assisted, fixture.appId) }, intentHashes: { ordinary: await intentHash(ordinary, fixture.appId), assisted: await intentHash(assisted, fixture.appId) }, taskHash: hash(task) };
    const receiptPath = join(output, 'receipt.json'); await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`); const issues = await checkPreparedPair(output); if (issues.length > 0) throw new BenchmarkPlanError(['prepared pair did not pass readiness:', ...issues]); return { ordinary, assisted, receipt: receiptPath };
  } catch (error) { if (created) await rm(output, { recursive: true, force: true }); throw error; } finally { await rm(overlay, { recursive: true, force: true }); }
}
