import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'dist/index.js')],
  outfile: join(root, 'dist/index.js'),
  allowOverwrite: true,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: [
    '@anwc/protocol',
    '@anwc/diagnostics',
    '@anwc/runtime',
    'playwright',
    'esbuild'
  ]
});
