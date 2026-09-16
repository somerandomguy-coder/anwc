import { describe, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkPlanError, allFixtures, extractSourceIntent, fixtureMatrix, checkEvaluatorReceipt, checkPreparedPair, checkSchema, evaluatorSidecarSchema, fixtureCaseSchema, fixtureFor, gradeRepair, hashSourceIntent, materializeFixtureSource, materializeFixtureStyles, packageSubjectWorkspace, preparePair, readPreparedPairReceipt, repairVerified, renderResultsSummary, renderRunbook, taskMarkdown, validateBenchmarkPlan, validateBenchmarkResults, validateSubjectInventory } from '../../packages/benchmark/src/index.js';
import { run as runBenchmarkCli } from '../../packages/benchmark/src/main.js';

const validPlan = () => ({
  schemaVersion: '0.1' as const,
  id: 'pilot',
  kind: 'scored' as const,
  title: 'Pilot',
  baseline: { appCommit: '4c6cafe', detectorCommit: '4c6cafe', browser: 'Chromium', node: '24.18.0', packageManager: 'npm 11.13.0' },
  agent: { provider: 'Provider', model: 'Model', reasoning: 'high' },
  budget: { wallMinutes: 20, tokenLimit: null },
  promptId: 'repair-v1',
  runs: [
    { id: 'pair-a', pairId: 'pair', fixtureId: 'heldout-a', replicate: 1, condition: 'ordinary' as const, viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' },
    { id: 'pair-b', pairId: 'pair', fixtureId: 'heldout-a', replicate: 1, condition: 'anwc-assisted' as const, viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' }
  ]
});

describe('benchmark plan', () => {
  test('validates strict fixture contracts and never counts unsupported required checks as repaired', () => {
    expect(fixtureCaseSchema.parse({ schemaVersion: '0.2', id: 'shop-action', appId: 'shop', route: '/', requirements: ['Keep checkout usable'], viewports: [{ width: 390, height: 844 }], setup: [{ kind: 'click', role: 'button', name: 'Open cart' }], requiredContent: ['Cart'], requiredActions: [{ role: 'button', name: 'Checkout' }] }).id).toBe('shop-action');
    expect(() => fixtureCaseSchema.parse({ schemaVersion: '0.2', id: 'bad', appId: 'shop', route: '/', requirements: ['x'], viewports: [{ width: 1, height: 1 }], setup: [{ kind: 'evaluate', script: 'alert(1)' }], requiredContent: ['x'], requiredActions: [] })).toThrow();
    expect(() => checkSchema.parse({ id: 'bad-check', required: true, kind: 'content', selector: '#copy', text: 'hello', extra: true })).toThrow();
    expect(evaluatorSidecarSchema.parse({ fixtureId: 'shop-action', revision: 'abcdef0', defect: 'Checkout is hidden', baselineChecks: [{ id: 'hidden', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout' }], repairChecks: [{ id: 'usable', required: true, kind: 'action-rendered', role: 'button', name: 'Checkout' }] }).fixtureId).toBe('shop-action');
    expect(repairVerified([{ id: 'usable', required: true, status: 'pass', evidence: {} }, { id: 'optional', required: false, status: 'unsupported', evidence: {} }])).toBe(true);
    expect(repairVerified([{ id: 'usable', required: true, status: 'unsupported', evidence: {} }])).toBe(false);
  });
  test('freezes static source intent semantically rather than by source formatting', () => {
    const first = '<><button data-anwc-expect="interactive" data-anwc-max-lines={2}>Save</button><p data-anwc-max-lines="3">Copy</p></>';
    const equivalent = '<><p data-anwc-max-lines={"3"}>Copy</p>\n<button data-anwc-max-lines={2} data-anwc-expect={"interactive"}>Save</button></>';
    expect(extractSourceIntent(first, 'first.tsx')).toEqual([{ expect: 'interactive', maxLines: '2' }, { maxLines: '3' }]);
    expect(hashSourceIntent(first, 'first.tsx')).toBe(hashSourceIntent(equivalent, 'equivalent.tsx'));
    expect(hashSourceIntent(first, 'first.tsx')).not.toBe(hashSourceIntent(first.replace('max-lines={2}', 'max-lines={3}'), 'changed.tsx'));
    expect(() => hashSourceIntent('<button data-anwc-expect={mode}>Save</button>', 'dynamic.tsx')).toThrow(/unverifiable dynamic data-anwc-expect intent/);
    expect(() => extractSourceIntent('<button data-anwc-max-lines="2">', 'broken.tsx')).toThrow(/cannot parse source intent/);
  });
  test('materializes a neutral fixture into one broken app variant and public task', () => {
    const fixture = fixtureFor('pricing-blocked');
    const source = `const search = new URLSearchParams(location.search);\n  const caseId = (caseIds.find((value) => value === search.get('case')) ?? 'title-overflow') as CaseId;\n  const variant: Variant = search.get('variant') === 'healthy' ? 'healthy' : 'broken';\n  const broken = variant === 'broken';\n  <nav aria-label="Pricing fixture cases"><span data-fixture-navigation>links</span><button>Keep this control</button></nav><main data-anwc-scenario="x" />`;
    const materialized = materializeFixtureSource(source, fixture);
    expect(materialized).toContain('const broken = true');
    expect(materialized).not.toContain('URLSearchParams');
    expect(materialized).toContain('<nav');
    expect(materialized).toContain('Keep this control');
    expect(materialized).not.toContain('data-anwc-scenario');
    expect(materializeFixtureStyles('.title-overflow { color: red }.selection-blocker { color: blue }', fixture)).not.toContain('title-overflow');
    expect(taskMarkdown(fixture)).toContain('Editable paths: examples/landing/src/**');
    expect(taskMarkdown(fixture)).not.toContain('make Growth selectable');
  }, 20_000);
  test('registry freezes all planned app states without copying the shop laboratory switchboard', () => {
    expect(allFixtures()).toHaveLength(18);
    expect(fixtureMatrix()).toHaveLength(72);
    const shop = materializeFixtureSource('', fixtureFor('shop-blocked-checkout'));
    expect(shop).toContain('data-subject="prepared"');
    expect(shop).toContain('Store navigation');
    expect(shop).not.toContain('scenarioFromSearch');
    expect(shop).not.toContain('blocked-checkout');
    const healthyShop = materializeFixtureSource('', fixtureFor('shop-blocked-checkout'), 'healthy');
    expect(healthyShop).toContain('Checkout now');
    expect(materializeFixtureStyles('', fixtureFor('shop-blocked-checkout'), 'healthy')).not.toContain('position:absolute');
  });
  test('committed public matrix stays aligned with the fixture registry', async () => {
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const matrix = JSON.parse(await readFile(join(sourceRoot, 'bench/fixture-matrix.json'), 'utf8')) as { states: string[]; viewports: unknown[]; pairs: Array<{ fixtureId: string; appId: string; route: string; setup: unknown[] }> };
    expect(matrix.states).toEqual(['broken', 'healthy']);
    expect(matrix.viewports).toHaveLength(2);
    expect(matrix.pairs).toHaveLength(18);
    expect(matrix.pairs.map((pair) => pair.fixtureId).sort()).toEqual(allFixtures().map((fixture) => fixture.id).sort());
    expect(matrix.pairs.map((pair) => `${pair.fixtureId}:${pair.appId}:${pair.route}`).sort()).toEqual(allFixtures().map((fixture) => `${fixture.id}:${fixture.appId}:${fixture.route}`).sort());
  });
  test('prepares matching A/B subjects and catches a one-sided app edit before a run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-prepared-pair-'));
    const output = join(root, 'pair');
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output, fixtureId: 'pricing-blocked', ordinaryPort: 4181, assistedPort: 4182, practice: true });
      expect(await checkPreparedPair(output)).toEqual([]);
      const receipt = await readPreparedPairReceipt(pair.receipt);
      expect(receipt.evaluator.grader).toMatch(/^[a-f0-9]{64}$/);
      expect(await checkEvaluatorReceipt({ ...receipt, evaluator: { ...receipt.evaluator, grader: '0'.repeat(64) } }, sourceRoot)).toContain('evaluator grader hash differs from the frozen receipt');
      expect(await readFile(join(pair.ordinary, 'TASK.md'), 'utf8')).toContain('Editable paths: examples/landing/src/**');
      expect(await readFile(join(pair.ordinary, 'examples/landing/src/main.tsx'), 'utf8')).not.toContain('URLSearchParams');
      await writeFile(join(pair.ordinary, 'examples/landing/src/main.tsx'), '\n// changed after preparation\n', { flag: 'a' });
      expect(await checkPreparedPair(output)).toContain('ordinary: application files differ from the frozen receipt');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
  test('grades a broken repair independently and accepts a source-only valid repair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-grade-repair-'));
    const output = join(root, 'pair');
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output, fixtureId: 'pricing-blocked', ordinaryPort: 4391, assistedPort: 4392, practice: true });
      const broken = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4391 });
      expect(broken.status).toBe('failed');
      expect(broken.repairVerified).toBe(false);
      expect(broken.submittedArtifactHash).toMatch(/^[a-f0-9]{64}$/);
      const mainPath = join(pair.ordinary, 'examples/landing/src/main.tsx');
      await writeFile(mainPath, (await readFile(mainPath, 'utf8')).replace(/\{broken && affected && true && <div className="selection-blocker">Limited offer details<\/div>\}/, ''));
      const repaired = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4392 });
      expect(repaired.integrityIssues).toEqual([]);
      expect(repaired.status).toBe('passed');
      expect(repaired.repairVerified).toBe(true);
      expect(repaired.submittedArtifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(repaired.submittedArtifactHash).not.toBe(broken.submittedArtifactHash);
      await writeFile(join(pair.ordinary, 'TASK.md'), '\nchanged task\n', { flag: 'a' });
      const tampered = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4393 });
      expect(tampered.status).toBe('integrity-failed');
      expect(tampered.integrityIssues.join('\n')).toContain('immutable tool, config, or task files differ');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
  test('enforces dirty vs scored receipt boundaries and rejects path traversal in receipt file keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-receipt-schema-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-title', ordinaryPort: 4191, assistedPort: 4192, practice: true });
      const receipt = await readPreparedPairReceipt(pair.receipt);
      expect(receipt.scored).toBe(false);

      // Traversal rejection in applicationFiles and immutableFiles
      const badReceiptPath = join(root, 'bad-receipt.json');
      await writeFile(badReceiptPath, JSON.stringify({ ...receipt, applicationFiles: { '../escape.ts': '0'.repeat(64) } }));
      await expect(readPreparedPairReceipt(badReceiptPath)).rejects.toThrow(/path traversal is not allowed/);

      // Scored receipt with dirty: true rejection
      const dirtyScoredPath = join(root, 'dirty-scored-receipt.json');
      await writeFile(dirtyScoredPath, JSON.stringify({ ...receipt, scored: true, source: { ...receipt.source, dirty: true } }));
      await expect(readPreparedPairReceipt(dirtyScoredPath)).rejects.toThrow(/scored receipt cannot have dirty source state/);

      // Scored preparation rejected on dirty git worktree
      await expect(preparePair({ sourceRoot, output: join(root, 'dirty-scored-pair'), fixtureId: 'pricing-title', ordinaryPort: 4193, assistedPort: 4194 }))
        .rejects.toThrow(/scored preparation requires a clean Git checkout/);

      // Preparation rejected on mismatched revision
      await expect(preparePair({ sourceRoot, output: join(root, 'mismatched-pair'), fixtureId: 'pricing-title', ordinaryPort: 4193, assistedPort: 4194, practice: true, sourceRevision: '0'.repeat(40) }))
        .rejects.toThrow(/does not match HEAD/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  test('refuses certified grading on evaluator version mismatch from a separate evaluator tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-evaluator-tree-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const separateEvaluator = join(root, 'separate-evaluator');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-blocked', ordinaryPort: 4395, assistedPort: 4396, practice: true });

      // Create a separate evaluator tree with altered grader
      await mkdir(join(separateEvaluator, 'packages/benchmark/src/fixtures'), { recursive: true });
      await cp(join(sourceRoot, 'packages/benchmark/src/fixtures'), join(separateEvaluator, 'packages/benchmark/src/fixtures'), { recursive: true });
      await mkdir(join(separateEvaluator, 'packages/benchmark/src'), { recursive: true });
      await cp(join(sourceRoot, 'packages/benchmark/src/grade.ts'), join(separateEvaluator, 'packages/benchmark/src/grade.ts'));
      await writeFile(join(separateEvaluator, 'packages/benchmark/src/grade.ts'), '\n// altered grader\n', { flag: 'a' });

      const result = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4395, evaluatorRoot: separateEvaluator });
      expect(result.status).toBe('integrity-failed');
      expect(result.exitCode).toBe(2);
      expect(result.integrityIssues.join('\n')).toContain('evaluator grader hash differs from the frozen receipt');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  test('rejects symlinked receipts, symlinked subjects, internal symlinks, and overlapping output before staging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-symlink-checks-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-blocked', ordinaryPort: 4397, assistedPort: 4398, practice: true });

      // 1. Output inside subject rejection
      const insideResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4397, output: join(pair.ordinary, 'result.json') });
      expect(insideResult.status).toBe('integrity-failed');
      expect(insideResult.exitCode).toBe(2);
      expect(insideResult.integrityIssues.join('\n')).toContain('grade result output must be outside the submitted subject');

      // 2. Symlinked receipt rejection
      const symlinkedReceipt = join(root, 'symlink-receipt.json');
      await symlink(pair.receipt, symlinkedReceipt);
      const symlinkReceiptResult = await gradeRepair({ receipt: symlinkedReceipt, subject: pair.ordinary, condition: 'ordinary', port: 4397 });
      expect(symlinkReceiptResult.status).toBe('integrity-failed');
      expect(symlinkReceiptResult.exitCode).toBe(2);
      expect(symlinkReceiptResult.integrityIssues.join('\n')).toContain('receipt path cannot be a symbolic link');

      // 3. Symlinked subject root rejection
      const symlinkedSubject = join(root, 'symlink-subject');
      await symlink(pair.ordinary, symlinkedSubject);
      const symlinkSubjectResult = await gradeRepair({ receipt: pair.receipt, subject: symlinkedSubject, condition: 'ordinary', port: 4397 });
      expect(symlinkSubjectResult.status).toBe('integrity-failed');
      expect(symlinkSubjectResult.exitCode).toBe(2);
      expect(symlinkSubjectResult.integrityIssues.join('\n')).toContain('subject directory is an unsupported symbolic link');

      // 4. Internal symlink rejection within subject
      const internalSymlink = join(pair.ordinary, 'examples/landing/src/symlink.tsx');
      await symlink(join(pair.ordinary, 'examples/landing/src/main.tsx'), internalSymlink);
      const internalSymlinkResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4397 });
      expect(internalSymlinkResult.status).toBe('integrity-failed');
      expect(internalSymlinkResult.exitCode).toBe(2);
      expect(internalSymlinkResult.integrityIssues.join('\n')).toContain('unsupported symbolic link');
      await rm(internalSymlink);

      // 5. Existing output and symlinked output in preparePair
      const existingOutput = join(root, 'pair');
      await expect(preparePair({ sourceRoot, output: existingOutput, fixtureId: 'pricing-title', ordinaryPort: 4391, assistedPort: 4392, practice: true }))
        .rejects.toThrow(/pair output already exists or is a symbolic link/);

      const symlinkedOutput = join(root, 'symlink-out');
      await symlink(pair.ordinary, symlinkedOutput);
      await expect(preparePair({ sourceRoot, output: symlinkedOutput, fixtureId: 'pricing-title', ordinaryPort: 4391, assistedPort: 4392, practice: true }))
        .rejects.toThrow(/pair output already exists or is a symbolic link/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  test('rejects occupied port with healthy decoy and never claims repair pass', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-port-collision-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const decoyPort = 4441;
    const decoy = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Healthy Decoy</h1></body></html>');
    });
    await new Promise<void>((resolveListen) => decoy.listen({ host: '127.0.0.1', port: decoyPort, exclusive: true }, () => resolveListen()));

    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-blocked', ordinaryPort: decoyPort, assistedPort: decoyPort + 1, practice: true });
      const result = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: decoyPort });
      expect(result.status).toBe('infrastructure-failed');
      expect(result.exitCode).toBe(3);
      expect(result.stage).toBe('initialization');
      expect(result.repairVerified).toBe(false);
      expect(result.error).toContain(`port ${decoyPort} is unavailable`);
    } finally {
      await new Promise<void>((resolveClose) => decoy.close(() => resolveClose()));
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  test('stalled install and startup timeouts give bounded labelled infrastructure results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-lifecycle-timeouts-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-title', ordinaryPort: 4451, assistedPort: 4452, practice: true });

      // 1. Stalled install timeout
      const installTimeoutResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4451, installTimeoutMs: 1 });
      expect(installTimeoutResult.status).toBe('infrastructure-failed');
      expect(installTimeoutResult.exitCode).toBe(3);
      expect(installTimeoutResult.stage).toBe('install');
      expect(installTimeoutResult.error).toContain('timed out');
      expect(installTimeoutResult.repairVerified).toBe(false);

      // 2. Stalled startup timeout
      const startupTimeoutResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4451, startupTimeoutMs: 1 });
      expect(startupTimeoutResult.status).toBe('infrastructure-failed');
      expect(startupTimeoutResult.exitCode).toBe(3);
      expect(startupTimeoutResult.stage).toBe('server');
      expect(startupTimeoutResult.error).toContain('development server did not become ready');
      expect(startupTimeoutResult.repairVerified).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 45_000);
  test('syntax crash and destructive deletions fail with bounded logs and never verify repair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-lifecycle-failures-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-blocked', ordinaryPort: 4461, assistedPort: 4462, practice: true });

      // 1. Destructive deletion: remove required content while preserving declared intent
      const mainPath = join(pair.ordinary, 'examples/landing/src/main.tsx');
      const originalContent = await readFile(mainPath, 'utf8');
      const deletedContent = originalContent.replace('<p className="eyebrow">Northstar plans</p>', '');
      await writeFile(mainPath, deletedContent);

      const deletedResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4461 });
      expect(deletedResult.status).toBe('failed');
      expect(deletedResult.exitCode).toBe(1);
      expect(deletedResult.repairVerified).toBe(false);
      expect(deletedResult.checks.some((check) => check.status === 'fail')).toBe(true);

      // 2. Syntax crash / invalid source fails with non-zero exit code and never verifies repair
      await writeFile(mainPath, 'export default function App() { return <div><invalid tag unclosed;');
      const syntaxResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4462 });
      expect(syntaxResult.repairVerified).toBe(false);
      expect(['failed', 'integrity-failed', 'infrastructure-failed']).toContain(syntaxResult.status);
      expect([1, 2, 3]).toContain(syntaxResult.exitCode);
      expect(typeof syntaxResult.logs.server).toBe('string');
      expect(typeof syntaxResult.logs.install).toBe('string');

      // 3. Runtime page crash records error into logs.pageErrors
      const crashContent = originalContent.replace('const broken =', 'if (typeof window !== "undefined") setTimeout(() => { throw new Error("runtime-page-crash"); }, 0);\n  const broken =');
      await writeFile(mainPath, crashContent);
      const crashResult = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4463 });
      expect(crashResult.repairVerified).toBe(false);
      expect(crashResult.logs.pageErrors.some((msg) => msg.includes('runtime-page-crash'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
  test('repeated grades leave original files unchanged and release owned processes and ports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-port-release-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const testPort = 4471;
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-blocked', ordinaryPort: testPort, assistedPort: testPort + 1, practice: true });

      const fileBefore = await readFile(join(pair.ordinary, 'examples/landing/src/main.tsx'), 'utf8');
      const taskBefore = await readFile(join(pair.ordinary, 'TASK.md'), 'utf8');

      // Grade 1
      const grade1 = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: testPort });
      expect(grade1.status).toBe('failed');
      expect(grade1.cleanup).toBe('complete');

      // Assert original files remain strictly untouched
      const fileAfter1 = await readFile(join(pair.ordinary, 'examples/landing/src/main.tsx'), 'utf8');
      const taskAfter1 = await readFile(join(pair.ordinary, 'TASK.md'), 'utf8');
      expect(fileAfter1).toBe(fileBefore);
      expect(taskAfter1).toBe(taskBefore);

      // Verify port was released and can immediately be reused without collision
      const grade2 = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: testPort });
      expect(grade2.status).toBe('failed');
      expect(grade2.cleanup).toBe('complete');

      // Assert original files still remain untouched
      const fileAfter2 = await readFile(join(pair.ordinary, 'examples/landing/src/main.tsx'), 'utf8');
      expect(fileAfter2).toBe(fileBefore);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
  async function gradeMaterializedStates(samples: ReadonlyArray<{ fixtureId: string; state: 'broken' | 'healthy'; expected: 'failed' | 'passed'; port: number; appId: 'shop' | 'landing' | 'dashboard' }>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'anwc-materialized-apps-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      for (const sample of samples) {
        const pair = await preparePair({ sourceRoot, output: join(root, `${sample.fixtureId}-${sample.state}`), fixtureId: sample.fixtureId, state: sample.state, ordinaryPort: sample.port, assistedPort: sample.port + 1, practice: true });
        const exported = await readFile(join(pair.ordinary, `examples/${sample.appId}/src/main.tsx`), 'utf8');
        expect(exported).not.toContain('URLSearchParams');
        expect(exported).not.toContain('data-fixture-navigation');
        expect(exported).not.toContain('data-anwc-key');
        const result = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: sample.port });
        expect(result.status, JSON.stringify(result.checks)).toBe(sample.expected);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  test('browser-grades materialized shop states without public switching', async () => {
    await gradeMaterializedStates([
      { fixtureId: 'shop-blocked-checkout', state: 'broken', expected: 'failed', port: 4401, appId: 'shop' },
      { fixtureId: 'shop-blocked-checkout', state: 'healthy', expected: 'passed', port: 4403, appId: 'shop' }
    ]);
  }, 60_000);
  test('browser-grades materialized landing states without public switching', async () => {
    await gradeMaterializedStates([
      { fixtureId: 'pricing-blocked', state: 'broken', expected: 'failed', port: 4409, appId: 'landing' },
      { fixtureId: 'pricing-blocked', state: 'healthy', expected: 'passed', port: 4411, appId: 'landing' }
    ]);
  }, 60_000);
  test('browser-grades materialized dashboard states without public switching', async () => {
    await gradeMaterializedStates([
      { fixtureId: 'dashboard-blocked-input', state: 'broken', expected: 'failed', port: 4405, appId: 'dashboard' },
      { fixtureId: 'dashboard-blocked-input', state: 'healthy', expected: 'passed', port: 4407, appId: 'dashboard' }
    ]);
  }, 90_000);
  test('accepts an alternative CSS-only repair while preserving pricing content and behavior', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-css-repair-'));
    const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    try {
      const pair = await preparePair({ sourceRoot, output: join(root, 'pair'), fixtureId: 'pricing-title', ordinaryPort: 4413, assistedPort: 4414, practice: true });
      expect((await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4413 })).status).toBe('failed');
      const stylesPath = join(pair.ordinary, 'examples/landing/src/styles.css');
      await writeFile(stylesPath, (await readFile(stylesPath, 'utf8')).replace('.title-overflow { display: block; width: 34rem; white-space: nowrap; }', '.title-overflow { display: block; width: 100%; white-space: normal; }'));
      const repaired = await gradeRepair({ receipt: pair.receipt, subject: pair.ordinary, condition: 'ordinary', port: 4414 });
      expect(repaired.integrityIssues).toEqual([]);
      expect(repaired.status).toBe('passed');
      expect(repaired.checks.filter((check) => check.id === 'content-2').every((check) => check.status === 'pass')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
  test('accepts a fair A/B pair and produces a non-secret runbook', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const runbook = renderRunbook(plan);
    expect(runbook).toContain('| pair | ordinary | heldout-a |');
    expect(runbook).toContain('does not score repairs');
  });

  test('rejects incomplete and mismatched pairs', () => {
    const missingCondition = validPlan();
    missingCondition.runs[1]!.condition = 'ordinary';
    expect(() => validateBenchmarkPlan(missingCondition)).toThrow(BenchmarkPlanError);

    const mismatchedViewport = validPlan();
    mismatchedViewport.runs[1]!.viewport.width = 1440;
    expect(() => validateBenchmarkPlan(mismatchedViewport)).toThrow('viewport');
  });

  test('requires a complete result ledger and retains unavailable cost as NA', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'completed', wallSeconds: 42, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: null }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-b', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' }
      ]
    });
    expect(renderResultsSummary(plan, results)).toContain('| ordinary | 1 | 1 | 1 | 1 | 0 | 42 | NA |');
    expect(renderResultsSummary(plan, results)).toContain('| anwc-assisted | 1 | 1 | 0 | 0 | 0 | 1200 | NA |');
    expect(() => validateBenchmarkResults(plan, { ...results, runs: results.runs.slice(0, 1) })).toThrow('missing runId');
  });

  test('rejects answer-bearing or condition-inappropriate subject inventory', () => {
    const ordinaryIssues = validateSubjectInventory({
      files: ['package.json', 'examples/shop/src/main.tsx', 'docs/BENCHMARK.md', 'packages/cli/src/main.ts'],
      publicScenarioReferences: ['examples/shop/src/main.tsx']
    }, 'ordinary');
    expect(ordinaryIssues).toEqual(expect.arrayContaining([
      'subject exposes forbidden docs/ content',
      'subject exposes public scenario switching in examples/shop/src/main.tsx',
      'ordinary subject exposes packages/cli; remove ANWC before the baseline run'
    ]));

    expect(validateSubjectInventory({ files: ['package.json', 'examples/shop/src/main.tsx', 'packages/cli/src/main.ts'], publicScenarioReferences: [] }, 'anwc-assisted')).toEqual([]);
  });

  test('packages a clean ordinary subject only after a private overlay removes scenario setup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite', build: 'vite build', anwc: 'tsx packages/cli/src/main.ts' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const scenario = "?scenario=blocked-checkout";');
      await writeFile(join(source, 'examples/shop/src/scenarios.ts'), 'export const scenarioIds = [];');
      await mkdir(join(overlay, 'examples/shop/src'), { recursive: true });
      await writeFile(join(overlay, 'examples/shop/src/main.tsx'), 'export const app = "subject";');

      await packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' });
      expect(JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')).scripts).toEqual({ dev: 'npm run dev --workspace=@anwc/shop', build: 'vite build' });
      expect(await readFile(join(destination, 'examples/shop/src/main.tsx'), 'utf8')).toContain('subject');
      expect(validateSubjectInventory({ files: ['package.json', 'examples/shop/src/main.tsx'], publicScenarioReferences: [] }, 'ordinary')).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects an overlay attempting to replace root scripts or non-application files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-overlay-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const app = "orig";');
      await writeFile(join(overlay, 'package.json'), JSON.stringify({ scripts: { malicious: 'true' } }));

      await expect(packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' }))
        .rejects.toThrow('overlay attempts to modify non-application file: package.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects path overlap between source, destination, and overlay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-overlap-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const nestedDestination = join(source, 'nested-subject');
    try {
      await mkdir(source, { recursive: true });
      await mkdir(overlay, { recursive: true });
      await writeFile(join(source, 'package.json'), '{}');

      await expect(packageSubjectWorkspace({ sourceRoot: source, destination: nestedDestination, overlayRoot: overlay, condition: 'ordinary' }))
        .rejects.toThrow('destination is inside source root');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('excludes dist, nested tests, test-runtime, and source maps from exported subjects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-benchmark-exclude-'));
    const source = join(root, 'source');
    const overlay = join(root, 'overlay');
    const destination = join(root, 'subject');
    try {
      await mkdir(join(source, 'examples/shop/src'), { recursive: true });
      await mkdir(join(source, 'examples/shop/dist'), { recursive: true });
      await mkdir(join(source, 'examples/shop/tests'), { recursive: true });
      await mkdir(overlay, { recursive: true });

      await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'subject', scripts: { dev: 'vite', build: 'vite build' } }));
      await writeFile(join(source, 'examples/shop/src/main.tsx'), 'export const app = "orig";');
      await writeFile(join(source, 'examples/shop/src/test-runtime.ts'), 'export const bridge = true;');
      await writeFile(join(source, 'examples/shop/src/styles.css.map'), '{"version":3}');
      await writeFile(join(source, 'examples/shop/dist/bundle.js'), 'export const answer = 42;');
      await writeFile(join(source, 'examples/shop/tests/shop.test.ts'), 'test("nested", () => {});');

      await mkdir(join(overlay, 'examples/shop/src'), { recursive: true });
      await writeFile(join(overlay, 'examples/shop/src/main.tsx'), 'export const app = "clean";');

      await packageSubjectWorkspace({ sourceRoot: source, destination, overlayRoot: overlay, condition: 'ordinary' });

      // Verify exclusions
      const inventory = validateSubjectInventory({
        files: ['package.json', 'examples/shop/src/main.tsx'],
        publicScenarioReferences: []
      }, 'ordinary');
      expect(inventory).toEqual([]);

      // Ensure forbidden files are not in destination
      const { existsSync } = await import('node:fs');
      expect(existsSync(join(destination, 'examples/shop/src/test-runtime.ts'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/src/styles.css.map'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/dist'))).toBe(false);
      expect(existsSync(join(destination, 'examples/shop/tests'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('rejects subject inventory containing dist, tests, or test-runtime.ts', () => {
    const issues = validateSubjectInventory({
      files: [
        'package.json',
        'examples/shop/src/main.tsx',
        'dist/bundle.js',
        'tests/unit.test.ts',
        'examples/shop/src/test-runtime.ts',
        'examples/shop/src/app.js.map'
      ],
      publicScenarioReferences: []
    }, 'ordinary');

    expect(issues).toEqual(expect.arrayContaining([
      'subject exposes forbidden dist/ content in dist/bundle.js',
      'subject exposes forbidden tests/ content',
      'subject exposes forbidden runtime test bridge: examples/shop/src/test-runtime.ts',
      'subject exposes forbidden source map: examples/shop/src/app.js.map'
    ]));
  });
});

describe('W02 result accounting and endpoint fairness', () => {
  test('accepts a two-port fair pair with matching route and query', () => {
    const plan = validPlan();
    plan.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    plan.runs[1]!.subjectUrl = 'http://localhost:5173/lab?case=ancestor-clip';
    expect(() => validateBenchmarkPlan(plan)).not.toThrow();
  });

  test('rejects pairs with different routes or queries', () => {
    const planDifferentRoute = validPlan();
    planDifferentRoute.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    planDifferentRoute.runs[1]!.subjectUrl = 'http://127.0.0.1:4175/shop?case=ancestor-clip';
    expect(() => validateBenchmarkPlan(planDifferentRoute)).toThrow('route, and query must match');

    const planDifferentQuery = validPlan();
    planDifferentQuery.runs[0]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=ancestor-clip';
    planDifferentQuery.runs[1]!.subjectUrl = 'http://127.0.0.1:4175/lab?case=horizontal-overflow';
    expect(() => validateBenchmarkPlan(planDifferentQuery)).toThrow('route, and query must match');
  });

  test('ledger with one missing regression count shows NA and tracks graded counts', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 50,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'completed',
          wallSeconds: 60,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.06 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: null, fullSuccess: true },
          notes: ''
        }
      ]
    });
    const summary = renderResultsSummary(plan, results);
    expect(summary).toContain('| anwc-assisted | 1 | 1 | 1 | 1 | NA | 60 | 0.06 |');
    expect(summary).toContain('| ordinary | 1 | 0 | 1 | 0 | 0 | 0 | 1 |');
    expect(summary).toContain('| anwc-assisted | 1 | 0 | 1 | 0 | 0 | 0 | 0 |');
  });

  test('keeps planned, completed, capped, failed, and excluded runs distinct', () => {
    const plan = validPlan();
    for (let i = 2; i <= 5; i++) {
      plan.runs.push(
        { id: `pair-${i}a`, pairId: `pair-${i}`, fixtureId: 'heldout-a', replicate: 1, condition: 'ordinary', viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' },
        { id: `pair-${i}b`, pairId: `pair-${i}`, fixtureId: 'heldout-a', replicate: 1, condition: 'anwc-assisted', viewport: { width: 390, height: 844 }, state: 'initial', subjectUrl: 'http://127.0.0.1:4175/' }
      );
    }
    const validatedPlan = validateBenchmarkPlan(plan);
    const results = validateBenchmarkResults(validatedPlan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        { runId: 'pair-a', status: 'completed', wallSeconds: 30, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.03 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-b', status: 'completed', wallSeconds: 35, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.04 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
        { runId: 'pair-2a', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' },
        { runId: 'pair-2b', status: 'time-capped', wallSeconds: 1200, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 }, scoring: { truePositives: 0, falsePositives: 0, falseNegatives: 1, verifiedRepairs: 0, regressions: 0, fullSuccess: false }, notes: '' },
        { runId: 'pair-3a', status: 'infrastructure-failed', wallSeconds: 5, usage: { inputTokens: 2, cachedInputTokens: null, outputTokens: 1, costUsd: 0.02 }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Network error' },
        { runId: 'pair-3b', status: 'infrastructure-failed', wallSeconds: 5, usage: { inputTokens: 2, cachedInputTokens: null, outputTokens: 1, costUsd: 0.02 }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Network error' },
        { runId: 'pair-4a', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Excluded run' },
        { runId: 'pair-4b', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Excluded run' },
        { runId: 'pair-5a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-5b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    });
    const summary = renderResultsSummary(validatedPlan, results);
    expect(summary).toContain('| ordinary | 5 | 1 | 1 | 1 | 1 | 1 | 2 |');
    expect(summary).toContain('| anwc-assisted | 5 | 1 | 1 | 1 | 1 | 1 | 2 |');
    expect(summary).toContain('| ordinary | 5 | 2 | 1 | 1 | 0 |');
  });

  test('preserves known failed-run costs in expenditure and handles incomplete cost accounting', () => {
    const plan = validateBenchmarkPlan(validPlan());
    const results = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 40,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.10 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'infrastructure-failed',
          wallSeconds: 15,
          usage: { inputTokens: 5, cachedInputTokens: null, outputTokens: 2, costUsd: 0.25 },
          scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null },
          notes: 'Browser process crashed unexpectedly'
        }
      ]
    });
    const summary = renderResultsSummary(plan, results);
    expect(summary).toContain('Known spending: ordinary = $0.10, anwc-assisted = $0.25');

    const resultsWithMissingCost = validateBenchmarkResults(plan, {
      schemaVersion: '0.1',
      planId: 'pilot',
      runs: [
        {
          runId: 'pair-a',
          status: 'completed',
          wallSeconds: 40,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: null },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        },
        {
          runId: 'pair-b',
          status: 'completed',
          wallSeconds: 45,
          usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.20 },
          scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true },
          notes: ''
        }
      ]
    });
    const missingSummary = renderResultsSummary(plan, resultsWithMissingCost);
    expect(missingSummary).toContain('ordinary = $0 (incomplete)');
    expect(missingSummary).toContain('| ordinary | 1 | 1 | 1 | 1 | 0 | 40 | NA |');
  });

  test('validates result constraints for planned, failed, and excluded rows', () => {
    const plan = validateBenchmarkPlan(validPlan());

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('planned runs cannot carry wallSeconds');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: 5, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('planned runs cannot carry usage data');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'infrastructure-failed', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: 1, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: 'Error' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('infrastructure-failed runs cannot carry repair scoring');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'infrastructure-failed', wallSeconds: 10, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '   ' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('require an explanation in notes');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'excluded', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-b', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('require an explanation in notes');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'unknown-run', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('unknown runId unknown-run');

    expect(() => validateBenchmarkResults(plan, {
      schemaVersion: '0.1', planId: 'pilot', runs: [
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' },
        { runId: 'pair-a', status: 'planned', wallSeconds: null, usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, costUsd: null }, scoring: { truePositives: null, falsePositives: null, falseNegatives: null, verifiedRepairs: null, regressions: null, fullSuccess: null }, notes: '' }
      ]
    })).toThrow('duplicate runId pair-a');
  });

  test('escapes pipes and newlines in table cells and headings', () => {
    const plan = validPlan();
    plan.title = 'Title | with pipe\nand newline';
    plan.runs[0]!.state = 'state | A\nstate B';
    plan.runs[1]!.state = 'state | A\nstate B';
    const runbook = renderRunbook(validateBenchmarkPlan(plan));
    expect(runbook).toContain('# Title \\| with pipe and newline runbook');
    expect(runbook).toContain('state \\| A state B');
  });

  test('CLI enforces strict arguments and rejects extraneous arguments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anwc-bench-cli-'));
    const planFile = join(root, 'plan.json');
    const resultsFile = join(root, 'results.json');
    const outFile = join(root, 'output.md');
    try {
      const plan = validPlan();
      await writeFile(planFile, JSON.stringify(plan));
      const results = {
        schemaVersion: '0.1',
        planId: 'pilot',
        runs: [
          { runId: 'pair-a', status: 'completed', wallSeconds: 30, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' },
          { runId: 'pair-b', status: 'completed', wallSeconds: 35, usage: { inputTokens: 10, cachedInputTokens: null, outputTokens: 5, costUsd: 0.05 }, scoring: { truePositives: 1, falsePositives: 0, falseNegatives: 0, verifiedRepairs: 1, regressions: 0, fullSuccess: true }, notes: '' }
        ]
      };
      await writeFile(resultsFile, JSON.stringify(results));

      const ioCapture = () => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        return {
          stdout: { write: (msg: string) => stdout.push(msg) },
          stderr: { write: (msg: string) => stderr.push(msg) },
          getStdout: () => stdout.join(''),
          getStderr: () => stderr.join('')
        };
      };

      let io = ioCapture();
      expect(await runBenchmarkCli(['validate', planFile, 'unexpected-arg'], io)).toBe(2);
      expect(io.getStderr()).toContain('Usage:');

      io = ioCapture();
      expect(await runBenchmarkCli(['validate', planFile], io)).toBe(0);
      expect(io.getStdout()).toContain('Valid scored benchmark plan');

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile, '--output', outFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['runbook', planFile, '--output', outFile], io)).toBe(0);
      expect(await readFile(outFile, 'utf8')).toContain('# Pilot runbook');

      io = ioCapture();
      expect(await runBenchmarkCli(['validate-results', planFile, resultsFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['validate-results', planFile, resultsFile], io)).toBe(0);
      expect(io.getStdout()).toContain('Valid benchmark results');

      io = ioCapture();
      expect(await runBenchmarkCli(['summarize', planFile, resultsFile, '--output', outFile, 'extra'], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['summarize', planFile, resultsFile, '--output', outFile], io)).toBe(0);
      expect(await readFile(outFile, 'utf8')).toContain('# Pilot results summary');

      io = ioCapture();
      expect(await runBenchmarkCli(['not-a-command', planFile], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['grade', '--receipt', planFile], io)).toBe(2);

      io = ioCapture();
      expect(await runBenchmarkCli(['grade', '--receipt', planFile, '--subject', root, '--condition', 'ordinary', '--port', '4399', '--output', outFile, '--evaluator-root'], io)).toBe(2);
      expect(io.getStderr()).toContain('Usage:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
