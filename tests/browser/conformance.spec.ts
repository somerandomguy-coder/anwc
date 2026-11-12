import { expect, test } from '@playwright/test';
import { runConformanceSuite } from '../conformance/runner.js';
import { conformanceCases } from '../conformance/matrix.js';

const expectedKnownGaps = conformanceCases
  .filter((c) => c.boundarySignal?.kind === 'known-gap')
  .map((c) => c.id);

test.describe('Q05 Browser Conformance Corpus', () => {
  test('runs every defective, healthy and boundary case with isolated documents and case-specific boundary signals', async ({ page }) => {
    test.setTimeout(180_000);

    const report = await runConformanceSuite(page);

    // 1. Actual counts by role (cases, not pairs)
    expect(report.totalCases).toBe(conformanceCases.length);
    expect(report.defectiveCount + report.healthyCount + report.boundaryCount).toBe(report.totalCases);
    expect(report.defectiveCount).toBe(conformanceCases.filter((c) => c.role === 'defective').length);
    expect(report.healthyCount).toBe(conformanceCases.filter((c) => c.role === 'healthy').length);
    expect(report.boundaryCount).toBe(conformanceCases.filter((c) => c.role === 'boundary').length);
    expect(Object.keys(report.familyBreakdown)).toHaveLength(6);

    // 2. Every independent oracle confirms its case's premise
    for (const result of report.cases) {
      expect(result.oraclePassed, `Oracle failed for ${result.id}: ${JSON.stringify(result.oracleDetails)}`).toBe(true);
    }

    // 3. Isolation: no host-page stylesheet survives into any case
    for (const result of report.cases) {
      expect(result.foreignStyleSheets, `Host stylesheets leaked into ${result.id}`).toBe(0);
    }

    // 4. No failures; known gaps are listed exactly and are not counted as passes
    for (const [family, stats] of Object.entries(report.familyBreakdown)) {
      expect(stats.falsePositives, `Healthy false positives in ${family}`).toBe(0);
      expect(stats.falseNegatives, `Defective false negatives in ${family}`).toBe(0);
    }
    const failures = report.cases.filter((r) => r.outcome === 'fail').map((r) => `${r.id}: ${r.notes}`);
    expect(failures).toEqual([]);
    expect(report.knownGapIds).toEqual(expectedKnownGaps);
    expect(report.passedCount).toBe(report.totalCases - expectedKnownGaps.length);
    expect(report.passedAll).toBe(expectedKnownGaps.length === 0);

    // 5. Each passing boundary case found its own signal, and removing that signal fails the check
    for (const result of report.cases.filter((r) => r.role === 'boundary' && r.outcome === 'pass')) {
      expect(result.boundary?.present, `${result.id}: ${result.boundary?.evidence}`).toBe(true);
      expect(result.boundary?.negativeControlFails, `${result.id} negative control`).toBe(true);
    }

    // 6. Large DOM performance boundary
    const largeDomCase = report.cases.find((c) => c.id === 'unsupported-largedom-capped')!;
    expect(largeDomCase.complete).toBe(false);
    expect(largeDomCase.skippedNodes).toBeGreaterThan(0);
    expect(largeDomCase.durationMs).toBeLessThan(2_000);

    // 7. Paint visibility is never claimed verified (measured from the capture)
    for (const result of report.cases) {
      expect(result.paintVisibility).toBe('unknown');
    }
  });
});
