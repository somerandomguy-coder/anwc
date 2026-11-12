import { readFileSync } from 'node:fs';

/** Where the detector rules live: every finding code is a string literal passed to `finding()`. */
export const diagnosticsSourceUrl = new URL('../../packages/diagnostics/src/index.ts', import.meta.url);

/** Rule codes named in a diagnostics source text (upper-snake string literals). */
export function ruleCodesIn(source: string): string[] {
  return [...new Set([...source.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)'/g)].map((match) => match[1]!))].sort();
}

export function detectorRuleCodes(): string[] {
  return ruleCodesIn(readFileSync(diagnosticsSourceUrl, 'utf8'));
}
