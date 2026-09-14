import { join } from 'node:path';
import { parse } from '@babel/parser';
import { describe, expect, test } from 'vitest';
import { instrument } from '../../packages/compiler/src/index.js';

const root = process.cwd();
const filename = join(root, 'fixtures', 'Card.tsx');
const options = { filename, root, mode: 'development' as const };

describe('JSX instrumentation compiler', () => {
  test('adds source ids only to host JSX while preserving ordinary source text', () => {
    const input = `'use client';
const props = { id: 'from-spread' };
export function Card() {
  return <section {...props} id="card"><Button><span onClick={() => 1}>Buy</span></Button><svg><path /></svg><Widget.Item /></section>;
}`;
    const result = instrument(input, options);
    expect(result).not.toBeNull();
    expect(result?.sites.map((site) => site.tag)).toEqual(['section', 'span']);
    expect(result?.code).toContain('<section data-anwc-site="');
    expect(result?.code).toContain('<span data-anwc-site="');
    expect(result?.code).toContain('<svg><path /></svg>');
    expect(result?.code).toContain('onClick={() => 1}');
    parse(result!.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    expect(JSON.parse((result!.map as { toString(): string }).toString()).sources).toEqual(['fixtures/Card.tsx']);
  });

  test('is deterministic across repeat transforms and separates files', () => {
    const input = 'export const A = () => <button>Buy</button>;';
    const first = instrument(input, options)!;
    const second = instrument(first.code, options)!;
    const otherFile = instrument(input, { ...options, filename: join(root, 'fixtures', 'Other.tsx') })!;
    expect(second.code).toBe(first.code);
    expect(second.sites).toEqual(first.sites);
    expect(otherFile.sites[0]?.siteId).not.toBe(first.sites[0]?.siteId);
    expect(instrument(input, { ...options, filename: `${filename}?v=123` })?.sites).toEqual(first.sites);
  });

  test('normalizes Windows paths and diagnoses reserved-attribute collisions', () => {
    const windows = instrument('export const A = () => <button>Buy</button>;', { ...options, filename: filename.replaceAll('/', '\\') })!;
    expect(windows.sites[0]?.file).toBe('fixtures/Card.tsx');

    const collision = instrument('export const A = () => <button data-anwc-site="manual">Buy</button>;', options)!;
    expect(collision.code).not.toContain('data-anwc-site="s_');
    expect(collision.diagnostics[0]?.code).toBe('RESERVED_ATTRIBUTE_COLLISION');
  });

  test('returns null outside development JSX/TSX input', () => {
    expect(instrument('const value = 1;', { ...options, filename: join(root, 'fixture.ts') })).toBeNull();
    expect(instrument('export const A = () => <div />;', { ...options, mode: 'production' })).toBeNull();
  });
});
