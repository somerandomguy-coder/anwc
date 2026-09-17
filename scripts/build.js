import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsx = require.resolve('tsx');
const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(cmd, ['run', 'build', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${tsx}`.trim()
  }
});

if (result.status === 0) {
  const { fileURLToPath } = await import('node:url');
  const cliBundle = fileURLToPath(new URL('../packages/cli/scripts/bundle.js', import.meta.url));
  const bundleResult = spawnSync(process.execPath, [cliBundle], { stdio: 'inherit' });
  if (bundleResult.status !== 0) {
    process.exit(bundleResult.status ?? 1);
  }
}

if (result.status === 0 && process.platform !== 'win32') {
  const { chmodSync, existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const cliBin = fileURLToPath(new URL('../packages/cli/dist/main.js', import.meta.url));
  if (existsSync(cliBin)) {
    try { chmodSync(cliBin, 0o755); } catch { /* ignore */ }
  }
}

process.exit(result.status ?? 0);
