import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

export const PUBLIC_PACKAGES = [
  'packages/protocol',
  'packages/compiler',
  'packages/runtime',
  'packages/diagnostics',
  'packages/vite-plugin',
  'packages/cli'
];

export async function listTarballFiles(tarballPath) {
  const { stdout } = await pExecFile('tar', ['-tzf', tarballPath], { windowsHide: true });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function auditTarballEntries(packageName, entries) {
  const issues = [];

  for (const entry of entries) {
    if (!entry.startsWith('package/')) {
      issues.push(`entry does not start with package/: ${entry}`);
    }

    const rel = entry.replace(/^package\//, '');
    if (!rel) continue;

    const lower = rel.toLowerCase();
    if (lower.includes('/test/') || lower.includes('/tests/') || lower.endsWith('.test.js') || lower.endsWith('.test.d.ts') || lower.endsWith('.spec.js')) {
      issues.push(`test file leaked into distribution: ${entry}`);
    }
    if (lower.includes('fixture') || lower.includes('benchmark') || lower.includes('evaluator')) {
      issues.push(`evaluator/fixture leaked into distribution: ${entry}`);
    }
    if (lower.includes('examples/') || lower.includes('/shop/') || lower.includes('/landing/') || lower.includes('/dashboard/')) {
      issues.push(`example app code leaked into distribution: ${entry}`);
    }
    if (rel.endsWith('.ts') && !rel.endsWith('.d.ts')) {
      issues.push(`uncompiled TypeScript source leaked into distribution: ${entry}`);
    }
    if (rel.endsWith('.map') || rel.endsWith('.tsbuildinfo')) {
      issues.push(`build artifact leaked into distribution: ${entry}`);
    }
    if (rel.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rel)) {
      issues.push(`absolute path leaked into distribution: ${entry}`);
    }

    const allowed = rel === 'package.json' || rel === 'README.md' || rel.startsWith('dist/');
    if (!allowed) {
      issues.push(`unauthorized file in package distribution: ${entry}`);
    }
  }

  if (!entries.some((e) => e === 'package/dist/index.js')) {
    issues.push('missing required entry package/dist/index.js');
  }
  if (!entries.some((e) => e === 'package/dist/index.d.ts')) {
    issues.push('missing required entry package/dist/index.d.ts');
  }

  if (packageName === '@anwc/cli') {
    if (!entries.some((e) => e === 'package/dist/main.js')) {
      issues.push('missing required cli bin entry package/dist/main.js');
    }
  }

  return issues;
}

export async function packAndAuditPackages(options = {}) {
  const root = options.sourceRoot ? resolve(options.sourceRoot) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const destination = options.destination ? resolve(options.destination) : join(root, 'dist', 'packages');

  await mkdir(destination, { recursive: true });

  const defaultNpmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const rawNpm = process.env.npm_execpath || (existsSync(defaultNpmCli) ? defaultNpmCli : undefined);
  const cmd = rawNpm ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const baseArgs = rawNpm ? [rawNpm.replace(/npx-cli\.js$/, 'npm-cli.js').replace(/npx$/, 'npm')] : [];

  const results = {};

  for (const pkgRel of PUBLIC_PACKAGES) {
    const pkgDir = join(root, pkgRel);
    const { stdout } = await pExecFile(cmd, [...baseArgs, 'pack', '--pack-destination', destination], {
      cwd: pkgDir,
      windowsHide: true,
      shell: process.platform === 'win32' && !rawNpm
    });

    const tarballFileName = stdout.trim().split('\n').pop()?.trim();
    if (!tarballFileName) throw new Error(`npm pack did not output a tarball name for ${pkgRel}`);

    const tarballPath = join(destination, tarballFileName);
    const files = await listTarballFiles(tarballPath);

    const pkgJson = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
    const issues = auditTarballEntries(pkgJson.name, files);

    if (issues.length > 0) {
      throw new Error(`Tarball audit failed for ${pkgJson.name} (${tarballFileName}):\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    }

    results[pkgJson.name] = {
      packageName: pkgJson.name,
      tarballPath,
      files,
      issues
    };
  }

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const destIndex = process.argv.indexOf('--out');
  const destination = destIndex !== -1 ? process.argv[destIndex + 1] : undefined;

  try {
    const results = await packAndAuditPackages({ destination });
    console.log(`Successfully packed and audited ${Object.keys(results).length} packages:`);
    for (const [name, result] of Object.entries(results)) {
      console.log(`  - ${name}: ${result.tarballPath} (${result.files.length} files)`);
    }
  } catch (error) {
    console.error('Packaging failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
