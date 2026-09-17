import { expect, test } from '@playwright/test';
import { runConformanceSuite } from '../conformance/runner.js';

test.describe('Q05 Browser Conformance Corpus', () => {
  test('runs 24+ paired cases across 6 families with zero healthy false positives and verified boundaries', async ({ page }) => {
    test.setTimeout(60_000);

    const report = await runConformanceSuite(page);

    // 1. Minimum 24 cases across 6 families
    expect(report.totalCases).toBeGreaterThanOrEqual(24);
    expect(Object.keys(report.familyBreakdown)).toHaveLength(6);

    // 2. All 6 families must have defective, healthy, and boundary cases
    for (const [family, stats] of Object.entries(report.familyBreakdown)) {
      expect(stats.total).toBeGreaterThanOrEqual(3);
      // Zero healthy false positives: supported healthy controls must not trigger findings
      expect(stats.falsePositives, `Healthy false positives in ${family}`).toBe(0);
      // Zero defective false negatives: defective cases must be caught
      expect(stats.falseNegatives, `Defective false negatives in ${family}`).toBe(0);
    }

    // 3. Oracle and ANWC alignment
    expect(report.passedAll).toBe(true);

    // 4. Large DOM performance boundary verification
    const largeDomCase = report.cases.find((c) => c.id === 'unsupported-largedom-capped')!;
    expect(largeDomCase.complete).toBe(false);
    expect(largeDomCase.skippedNodes).toBeGreaterThan(0);
    expect(largeDomCase.durationMs).toBeLessThan(2_000);

    // 5. Paint visibility is never claimed verified
    for (const result of report.cases) {
      expect(result.paintVisibility).toBe('unknown');
    }
  });
});
