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
process.exit(result.status ?? 0);
