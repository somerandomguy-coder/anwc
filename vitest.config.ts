import { defineConfig } from 'vitest/config';

const tsxLoader = import.meta.resolve('tsx');

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Several files drive browsers and dev servers; two-core CI machines time out running them together.
    fileParallelism: !process.env.CI,
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${tsxLoader}`.trim()
    }
  }
});
