import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { BenchmarkPlanError } from './index.js';

const pExecFile = promisify(execFile);

export type SubjectCondition = 'ordinary' | 'anwc-assisted';
export type SubjectInventory = { files: string[]; publicScenarioReferences: string[] };

export type SubjectPackageOptions = {
  sourceRoot: string;
  destination: string;
  overlayRoot: string;
  condition: SubjectCondition;
  appId?: string;
};

const forbiddenSubjectRoots = ['docs', 'bench', 'tests', '.git', 'artifacts', 'coverage'];

const forbiddenDirectoryNames = new Set([
  'node_modules',
  'dist',
  'build',
  '.vite',
  '.cache',
  '.turbo',
  '.git',
  'docs',
  'bench',
  'tests',
  'artifacts',
  'coverage'
]);

const publicScenarioPattern = /scenarioFromSearch|scenarioIds|\?scenario=|data-anwc-scenario/;

function normalizedPath(path: string): string {
  return path.split(sep).join('/');
}

function isSameOrSubpath(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads a candidate subject workspace and returns the inventory used by the leakage gate. */
export async function inspectSubjectWorkspace(root: string): Promise<SubjectInventory> {
  const resolvedRoot = resolve(root);
  const info = await stat(resolvedRoot);
  if (!info.isDirectory()) throw new BenchmarkPlanError([`subject path is not a directory: ${root}`]);

  const files: string[] = [];
  const publicScenarioReferences: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new BenchmarkPlanError([`subject contains unsupported symbolic link: ${normalizedPath(relative(resolvedRoot, absolute))}`]);
      }
      if (entry.isDirectory()) {
        // Record directory entry marker if it is a forbidden directory to prevent deep traversal
        if (entry.name === 'node_modules') {
          files.push(normalizedPath(relative(resolvedRoot, join(absolute, 'package.json'))));
          continue;
        }
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const path = normalizedPath(relative(resolvedRoot, absolute));
      files.push(path);
      if (/^examples\/[^/]+\/src\/.*\.(?:[cm]?[jt]sx?)$/.test(path)) {
        const content = await readFile(absolute, 'utf8');
        if (publicScenarioPattern.test(content)) publicScenarioReferences.push(path);
      }
    }
  }

  await visit(resolvedRoot);
  return { files: files.sort(), publicScenarioReferences: publicScenarioReferences.sort() };
}

/** Applies deterministic leakage checks to a workspace inventory; it is not a host security boundary. */
export function validateSubjectInventory(inventory: SubjectInventory, condition: SubjectCondition, appId = 'shop'): string[] {
  const issues: string[] = [];
  const has = (path: string): boolean => inventory.files.includes(path);

  // Check forbidden root directories
  for (const forbidden of forbiddenSubjectRoots) {
    if (inventory.files.some((path) => path === forbidden || path.startsWith(`${forbidden}/`))) {
      issues.push(`subject exposes forbidden ${forbidden}/ content`);
    }
  }

  // Check forbidden directories anywhere in path
  for (const file of inventory.files) {
    const parts = file.split('/');
    for (const part of parts.slice(0, -1)) {
      if (['node_modules', 'dist', 'build', '.vite', '.cache', '.turbo'].includes(part)) {
        issues.push(`subject exposes forbidden ${part}/ content in ${file}`);
        break;
      }
    }
  }

  // Check forbidden file types and bridges
  for (const file of inventory.files) {
    if (file.endsWith('.map')) {
      issues.push(`subject exposes forbidden source map: ${file}`);
    } else if (file.endsWith('.log')) {
      issues.push(`subject exposes forbidden log file: ${file}`);
    } else if (file.endsWith('.tsbuildinfo')) {
      issues.push(`subject exposes forbidden build info: ${file}`);
    } else if (file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
      issues.push(`subject exposes forbidden test file: ${file}`);
    } else if (file.endsWith('/test-runtime.ts') || file === 'test-runtime.ts') {
      issues.push(`subject exposes forbidden runtime test bridge: ${file}`);
    } else if (file.endsWith('/scenarios.ts') || file === 'scenarios.ts') {
      issues.push(`subject exposes forbidden scenario definitions: ${file}`);
    } else if (file.endsWith('/fixtures.ts') || file === 'fixtures.ts') {
      issues.push(`subject exposes forbidden protocol fixtures: ${file}`);
    }
  }

  for (const required of ['package.json', `examples/${appId}/src/main.tsx`]) {
    if (!has(required)) issues.push(`subject is missing required ${required}`);
  }

  for (const path of inventory.publicScenarioReferences) {
    issues.push(`subject exposes public scenario switching in ${path}`);
  }

  const cliPresent = inventory.files.some((path) => path === 'packages/cli/src/main.ts' || path.startsWith('packages/cli/'));
  if (condition === 'ordinary' && cliPresent) {
    issues.push('ordinary subject exposes packages/cli; remove ANWC before the baseline run');
  }
  if (condition === 'ordinary' && inventory.files.some((path) => path.startsWith('packages/'))) {
    issues.push('ordinary subject exposes packages/; ordinary subject must not contain ANWC packages');
  }

  if (condition === 'anwc-assisted') {
    if (!cliPresent) {
      issues.push('assisted subject is missing packages/cli; provide the ANWC CLI before the assisted run');
    }
  }

  return issues;
}

export async function checkSubjectWorkspace(root: string, condition: SubjectCondition, appId = 'shop', allowInstalledDependencies = false): Promise<string[]> {
  const inventory = await inspectSubjectWorkspace(root);
  return validateSubjectInventory(allowInstalledDependencies
    ? { ...inventory, files: inventory.files.filter((path) => path !== 'node_modules/package.json' && !path.includes('/node_modules/package.json')) }
    : inventory, condition, appId);
}

async function collectFilesRecursively(dir: string, baseDir: string = dir): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && forbiddenDirectoryNames.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new BenchmarkPlanError([`unsupported symbolic link: ${normalizedPath(relative(baseDir, full))}`]);
    }
    if (entry.isDirectory()) {
      results.push(...await collectFilesRecursively(full, baseDir));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Creates a fresh agent-facing workspace from a source repo plus a private overlay.
 * The overlay must materialize one defect and replace public scenario setup before
 * the exported folder is handed to an agent.
 */
export async function packageSubjectWorkspace(options: SubjectPackageOptions): Promise<void> {
  const sourceRoot = resolve(options.sourceRoot);
  const destination = resolve(options.destination);
  const overlayRoot = resolve(options.overlayRoot);
  const appId = options.appId ?? 'shop';

  if (await exists(destination)) {
    throw new BenchmarkPlanError([`destination already exists: ${destination}`]);
  }
  if (!(await exists(sourceRoot))) {
    throw new BenchmarkPlanError([`source root does not exist: ${sourceRoot}`]);
  }
  if (!(await exists(overlayRoot))) {
    throw new BenchmarkPlanError([`private overlay does not exist: ${overlayRoot}`]);
  }

  const sourcePackagePath = join(sourceRoot, 'package.json');
  if (!(await exists(sourcePackagePath))) {
    throw new BenchmarkPlanError([`source root is missing package.json: ${sourceRoot}`]);
  }

  // Path overlap rejections
  if (isSameOrSubpath(destination, sourceRoot)) {
    throw new BenchmarkPlanError([`destination is inside source root: ${destination}`]);
  }
  if (isSameOrSubpath(sourceRoot, destination)) {
    throw new BenchmarkPlanError([`source root is inside destination: ${sourceRoot}`]);
  }
  if (isSameOrSubpath(destination, overlayRoot)) {
    throw new BenchmarkPlanError([`destination is inside overlay root: ${destination}`]);
  }
  if (isSameOrSubpath(overlayRoot, destination)) {
    throw new BenchmarkPlanError([`overlay root is inside destination: ${overlayRoot}`]);
  }

  // Validate overlay files: must only target application files under examples/
  const overlayFiles = await collectFilesRecursively(overlayRoot);
  for (const fullPath of overlayFiles) {
    const rel = normalizedPath(relative(overlayRoot, fullPath));
    if (!rel.startsWith('examples/')) {
      throw new BenchmarkPlanError([`overlay attempts to modify non-application file: ${rel}; overlays are restricted to application files under examples/`]);
    }
    const filename = rel.split('/').pop() ?? '';
    if (filename.endsWith('.map') || filename.endsWith('.log') || filename.endsWith('.tsbuildinfo') || filename.endsWith('.spec.ts') || filename.endsWith('.test.ts') || filename === 'test-runtime.ts' || filename === 'scenarios.ts') {
      throw new BenchmarkPlanError([`overlay contains prohibited file: ${rel}`]);
    }
  }

  // Set up staging directory
  await mkdir(dirname(destination), { recursive: true });
  const stagingDir = join(dirname(destination), `.staging-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(stagingDir, { recursive: true });

  try {
    // 1. Copy only the selected application from examples/
    const appDir = join(sourceRoot, 'examples', appId);
    if (await exists(appDir)) {
      const allExampleFiles = await collectFilesRecursively(appDir);
      for (const fullPath of allExampleFiles) {
        const rel = normalizedPath(relative(sourceRoot, fullPath));
        const parts = rel.split('/');
        // Skip forbidden directories
        if (parts.some((p) => forbiddenDirectoryNames.has(p))) continue;
        const filename = parts[parts.length - 1] ?? '';
        // Skip forbidden or test files
        if (filename.endsWith('.map') || filename.endsWith('.log') || filename.endsWith('.tsbuildinfo') || filename.endsWith('.spec.ts') || filename.endsWith('.test.ts') || filename === 'test-runtime.ts' || filename === 'scenarios.ts') continue;
        // Skip vite.config.ts since condition-specific one is generated
        if (filename === 'vite.config.ts') continue;

        const target = join(stagingDir, rel);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(fullPath, target);
      }
    }

    // 2. If assisted, copy tooling packages (protocol, compiler, runtime, diagnostics, vite-plugin, cli)
    if (options.condition === 'anwc-assisted') {
      const packagesDir = join(sourceRoot, 'packages');
      if (await exists(packagesDir)) {
        const allowedPackages = ['protocol', 'compiler', 'runtime', 'diagnostics', 'vite-plugin', 'cli'];
        for (const pkg of allowedPackages) {
          const pkgPath = join(packagesDir, pkg);
          if (!(await exists(pkgPath))) continue;
          const pkgFiles = await collectFilesRecursively(pkgPath);
          for (const fullPath of pkgFiles) {
            const rel = normalizedPath(relative(sourceRoot, fullPath));
            const parts = rel.split('/');
            if (parts.some((p) => forbiddenDirectoryNames.has(p))) continue;
            const filename = parts[parts.length - 1] ?? '';
            if (filename.endsWith('.map') || filename.endsWith('.log') || filename.endsWith('.tsbuildinfo') || filename.endsWith('.spec.ts') || filename.endsWith('.test.ts') || filename === 'fixtures.ts') continue;

            const target = join(stagingDir, rel);
            await mkdir(dirname(target), { recursive: true });
            await copyFile(fullPath, target);
          }
        }
      }
    }

    // 3. Apply overlay files
    for (const fullPath of overlayFiles) {
      const rel = normalizedPath(relative(overlayRoot, fullPath));
      const target = join(stagingDir, rel);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(fullPath, target);
    }

    // 4. Generate condition-specific configs AFTER overlay
    const sourcePackage = JSON.parse(await readFile(sourcePackagePath, 'utf8')) as {
      name?: string;
      scripts?: Record<string, string>;
      workspaces?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const isShopOnly = options.condition === 'ordinary';
    const scripts: Record<string, string> = {};
    for (const name of ['build', 'typecheck']) {
      if (sourcePackage.scripts?.[name]) scripts[name] = sourcePackage.scripts[name]!;
    }
    // The source root happens to default to the shop example.  An exported
    // subject must always boot the application it actually contains.
    scripts.dev = `npm run dev --workspace=@anwc/${appId}`;
    if (!scripts.build) scripts.build = 'npm run build --workspaces --if-present';
    if (options.condition === 'ordinary' && scripts.dev) {
      scripts.dev = scripts.dev.replace(/NODE_OPTIONS='--import tsx'\s*/g, '');
    }
    if (options.condition === 'anwc-assisted' && sourcePackage.scripts?.anwc) {
      scripts.anwc = sourcePackage.scripts.anwc;
    }

    const workspaces = options.condition === 'anwc-assisted'
      ? ['packages/protocol', 'packages/compiler', 'packages/runtime', 'packages/diagnostics', 'packages/vite-plugin', 'packages/cli', 'examples/*']
      : [`examples/${appId}`];

    const devDependencies: Record<string, string> = {};
    if (sourcePackage.devDependencies) {
      for (const [dep, ver] of Object.entries(sourcePackage.devDependencies)) {
        if (options.condition === 'ordinary' && (dep === 'playwright' || dep === '@playwright/test' || dep === 'tsx' || dep === 'vitest')) {
          continue;
        }
        devDependencies[dep] = ver;
      }
    }

    const exportedPackageJson = {
      ...sourcePackage,
      scripts,
      workspaces,
      ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {})
    };
    await writeFile(join(stagingDir, 'package.json'), `${JSON.stringify(exportedPackageJson, null, 2)}\n`, 'utf8');

    // Base tsconfig
    const baseTsconfig = join(sourceRoot, 'tsconfig.base.json');
    if (await exists(baseTsconfig)) {
      await copyFile(baseTsconfig, join(stagingDir, 'tsconfig.base.json'));
    }

    // Condition-specific tsconfig.json references
    const tsconfigReferences = isShopOnly
      ? [{ path: `./examples/${appId}` }]
      : [
          { path: './packages/protocol' },
          { path: './packages/compiler' },
          { path: './packages/runtime' },
          { path: './packages/diagnostics' },
          { path: './packages/vite-plugin' },
          { path: './packages/cli' },
          { path: `./examples/${appId}` }
        ];
    await writeFile(join(stagingDir, 'tsconfig.json'), `${JSON.stringify({ files: [], references: tsconfigReferences }, null, 2)}\n`, 'utf8');

    // Condition-specific vite.config.ts for the selected application.
    const shopDir = join(stagingDir, 'examples', appId);
      const viteConfigContent = options.condition === 'ordinary'
        ? `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()]\n});\n`
        : `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport { fileURLToPath } from 'node:url';\nimport { anwc } from '@anwc/vite-plugin';\n\nexport default defineConfig({\n  plugins: [anwc({ sourceRoot: fileURLToPath(new URL('../..', import.meta.url)) }), react()]\n});\n`;
      await writeFile(join(shopDir, 'vite.config.ts'), viteConfigContent, 'utf8');

      const shopPkgPath = join(shopDir, 'package.json');
      if (await exists(shopPkgPath)) {
        const shopPkg = JSON.parse(await readFile(shopPkgPath, 'utf8')) as { scripts?: Record<string, string> };
        if (options.condition === 'ordinary' && shopPkg.scripts?.build) {
          const sanitizedBuild = shopPkg.scripts.build.replace(/NODE_OPTIONS='--import tsx'\s*/g, '');
          if (sanitizedBuild !== shopPkg.scripts.build) {
            shopPkg.scripts.build = sanitizedBuild;
            await writeFile(shopPkgPath, `${JSON.stringify(shopPkg, null, 2)}\n`, 'utf8');
          }
        }
      }

    // 5. Generate matching lockfile using npm tool
    try {
      const rawNpmCli = process.env.npm_execpath;
      if (!rawNpmCli) throw new Error('npm_execpath is unavailable');
      const npmCli = rawNpmCli.replace(/npx-cli\.js$/, 'npm-cli.js').replace(/npx$/, 'npm');
      const npmEnv: NodeJS.ProcessEnv = { ...process.env, PATH: process.env.PATH };
      delete npmEnv.NODE_OPTIONS;
      await pExecFile(process.execPath, [npmCli, 'install', '--package-lock-only', '--ignore-scripts'], {
        cwd: stagingDir,
        env: npmEnv
      });
    } catch (npmError: unknown) {
      const detail = npmError instanceof Error ? npmError.message : 'unknown npm failure';
      throw new BenchmarkPlanError([`could not generate a matching package-lock.json: ${detail}`]);
    }

    // 6. Validate finished staging directory with the leakage gate
    const issues = await checkSubjectWorkspace(stagingDir, options.condition, appId);
    if (issues.length > 0) {
      throw new BenchmarkPlanError(['packed subject failed leakage gate:', ...issues]);
    }

    // Atomically move staging to destination
    await rename(stagingDir, destination);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}
