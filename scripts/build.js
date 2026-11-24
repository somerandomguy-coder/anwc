import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const tsx = require.resolve('tsx');
const tsxUrl = pathToFileURL(tsx).href;

const defaultNpmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const rawNpm = process.env.npm_execpath || (existsSync(defaultNpmCli) ? defaultNpmCli : undefined);
const cmd = rawNpm ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const baseArgs = rawNpm ? [rawNpm.replace(/npx-cli\.js$/, 'npm-cli.js').replace(/npx$/, 'npm')] : [];

// Compile packages in dependency order first. The workspace run below is alphabetical, so in a
// fresh clone `cli` would otherwise compile before the packages it imports exist.
const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--build'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit'
});
if (tsc.error || tsc.status !== 0) {
  if (tsc.error) console.error(tsc.error);
  process.exit(tsc.status ?? 1);
}

const result = spawnSync(cmd, [...baseArgs, 'run', 'build', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  shell: process.platform === 'win32' && !rawNpm,
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${tsxUrl}`.trim()
  }
});

if (result.error || result.status !== 0) {
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}

// Bundle CLI executable
const cliBundle = fileURLToPath(new URL('../packages/cli/scripts/bundle.js', import.meta.url));
const bundleResult = spawnSync(process.execPath, [cliBundle], { stdio: 'inherit' });
if (bundleResult.error || bundleResult.status !== 0) {
  if (bundleResult.error) console.error(bundleResult.error);
  process.exit(bundleResult.status ?? 1);
}

// Build studio static assets into packages/cli/dist/studio
const studioRoot = fileURLToPath(new URL('../packages/studio', import.meta.url));
const studioConfig = fileURLToPath(new URL('../packages/studio/vite.config.ts', import.meta.url));
const { build: viteBuild } = await import('vite');
try {
  await viteBuild({ configFile: studioConfig, root: studioRoot });
} catch (error) {
  console.error('Studio build failed:', error);
  process.exit(1);
}

if (process.platform !== 'win32') {
  const { chmodSync } = await import('node:fs');
  const cliBin = fileURLToPath(new URL('../packages/cli/dist/main.js', import.meta.url));
  if (existsSync(cliBin)) {
    try { chmodSync(cliBin, 0o755); } catch { /* ignore */ }
  }
}

process.exit(0);
