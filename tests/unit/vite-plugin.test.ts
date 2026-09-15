import { describe, expect, test } from 'vitest';
import { build } from 'vite';
import { join } from 'node:path';

describe('ANWC Vite plugin', () => {
  test('does not inject development runtime or source attributes into the production bundle', async () => {
    const result = await build({
      root: join(process.cwd(), 'examples', 'shop'),
      configFile: join(process.cwd(), 'examples', 'shop', 'vite.config.ts'),
      logLevel: 'silent',
      build: { write: false }
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
    const contents = outputs.map((output) => output.type === 'asset' ? String(output.source) : output.code).join('\n');
    expect(contents).not.toContain('virtual:anwc-runtime');
    expect(contents).not.toContain('data-anwc-site');
  });
});
