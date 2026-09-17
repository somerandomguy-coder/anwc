import { describe, expect, test } from 'vitest';
import { conformanceCases } from '../conformance/matrix.js';

describe('Q05 Conformance Matrix Specification', () => {
  test('defines at least 24 paired cases across the 6 required families', () => {
    expect(conformanceCases.length).toBeGreaterThanOrEqual(24);

    const families = new Set(conformanceCases.map((c) => c.family));
    expect(families).toEqual(new Set([
      'text',
      'clips-scroll',
      'pointer-layers',
      'state-semantics',
      'identity-change',
      'unsupported-performance'
    ]));

    // Every family has at least 1 defective, 1 healthy, and 1 boundary case
    for (const fam of families) {
      const casesInFamily = conformanceCases.filter((c) => c.family === fam);
      const roles = new Set(casesInFamily.map((c) => c.role));
      expect(roles.has('defective'), `Family ${fam} missing defective role`).toBe(true);
      expect(roles.has('healthy'), `Family ${fam} missing healthy role`).toBe(true);
      expect(roles.has('boundary'), `Family ${fam} missing boundary role`).toBe(true);
    }
  });

  test('each case has valid HTML, description, and independent oracle function', () => {
    const ids = new Set<string>();
    for (const c of conformanceCases) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.html.length).toBeGreaterThan(0);
      expect(typeof c.oracle).toBe('function');
    }
  });
});
