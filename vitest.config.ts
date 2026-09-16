import { defineConfig } from 'vitest/config';

const tsxLoader = import.meta.resolve('tsx');

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${tsxLoader}`.trim()
    }
  }
});
