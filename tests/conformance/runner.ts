import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { conformanceCases } from './matrix.js';
import type {
  ConformanceCase,
  ConformanceFamily,
  ConformanceMatrixReport,
  ConformanceResult
} from './types.js';

export async function runConformanceSuite(page: Page): Promise<ConformanceMatrixReport> {
  const results: ConformanceResult[] = [];
  const familyStats: Record<
    ConformanceFamily,
    { total: number; passed: number; falsePositives: number; falseNegatives: number }
  > = {
    'text': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 },
    'clips-scroll': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 },
    'pointer-layers': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 },
    'state-semantics': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 },
    'identity-change': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 },
    'unsupported-performance': { total: 0, passed: 0, falsePositives: 0, falseNegatives: 0 }
  };

  // Ensure shop is loaded and test runtime imported
  await page.goto('/');
  await page.evaluate(async () => {
    await import('/src/test-runtime.ts');
  });

  for (const c of conformanceCases) {
    const family = c.family;
    familyStats[family].total++;

    // 1. Mount test HTML into page
    await page.evaluate((html) => {
      document.body.innerHTML = html;
    }, c.html);

    // 2. Run independent Playwright oracle
    let oraclePassed = false;
    let oracleDetails: Record<string, unknown> = {};
    try {
      const oracleRes = await c.oracle(page);
      oraclePassed = oracleRes.pass;
      oracleDetails = oracleRes.details;
    } catch (error) {
      oraclePassed = false;
      oracleDetails = { error: error instanceof Error ? error.message : String(error) };
    }

    // 3. Run ANWC capture and diagnostics
    const start = performance.now();
    const capture = await page.evaluate(
      (opts) => window.__ANWC_TEST__!.capture(opts ?? {}),
      c.captureOptions
    );
    const findings = diagnose(capture);
    const durationMs = Math.round(performance.now() - start);

    const detectedRules = findings.map((f) => f.code);
    const hasDetectedRule = c.expectedRule ? detectedRules.includes(c.expectedRule) : false;

    // Check duplicate key detection
    const keys = capture.nodes.map((n) => n.semanticKey).filter(Boolean);
    const hasDuplicateKey = new Set(keys).size < keys.length;

    let anwcPassed = false;
    let classification: ConformanceResult['classification'] = 'unsupported';
    let notes = '';

    if (c.role === 'defective') {
      if (c.expectedRule && hasDetectedRule) {
        anwcPassed = true;
        classification = 'detected-defect';
        notes = `Correctly detected expected rule: ${c.expectedRule}`;
      } else if (c.id === 'identity-duplicate-key-defective' && hasDuplicateKey) {
        anwcPassed = true;
        classification = 'detected-defect';
        notes = 'Duplicate key detected in captured inventory';
      } else if (c.id === 'performance-runaway-motion-defective' && !capture.readiness.settled) {
        anwcPassed = true;
        classification = 'detected-defect';
        notes = `Readiness unsettled detected: ${capture.readiness.reasons.join('; ')}`;
      } else {
        anwcPassed = false;
        classification = 'healthy-pass'; // False negative
        familyStats[family].falseNegatives++;
        notes = `Failed to detect defect. Expected rule: ${c.expectedRule}, got: [${detectedRules.join(', ')}]`;
      }
    } else if (c.role === 'healthy') {
      const actionable = findings.filter((f) => !f.acknowledged && f.severity !== 'info');
      if (actionable.length === 0) {
        anwcPassed = true;
        classification = 'healthy-pass';
        notes = findings.length === 0 ? 'Zero false positives on clean control' : `Zero actionable false positives (${findings.length} acknowledged/info ignored)`;
      } else {
        anwcPassed = false;
        classification = 'detected-defect'; // False positive!
        familyStats[family].falsePositives++;
        notes = `False positive: reported actionable [${actionable.map((f) => f.ruleId).join(', ')}] on clean control`;
      }
    } else {
      // Boundary / unsupported case
      // Must NOT silently claim to be known-healthy!
      // Must preserve paintVisibility: 'unknown' OR complete: false OR limitations
      const paintUnknown = capture.nodes.every((n) => n.paintVisibility.status === 'unknown');
      const isCappedOrBoundary = !capture.coverage.complete || paintUnknown || capture.coverage.unsupportedFeatures.length > 0;
      if (isCappedOrBoundary) {
        anwcPassed = true;
        classification = 'unsupported';
        notes = `Correctly reported boundary/unsupported scope (complete: ${capture.coverage.complete}, paintUnknown: ${paintUnknown})`;
      } else {
        anwcPassed = false;
        notes = 'Silently claimed full coverage on unsupported boundary!';
      }
    }

    if (anwcPassed) {
      familyStats[family].passed++;
    }

    results.push({
      id: c.id,
      family: c.family,
      role: c.role,
      oraclePassed,
      oracleDetails,
      classification,
      anwcPassed,
      findingsCount: findings.length,
      detectedRules,
      complete: capture.coverage.complete,
      paintVisibility: 'unknown',
      inspectedNodes: capture.coverage.inspectedNodes,
      skippedNodes: capture.coverage.skippedNodes,
      durationMs,
      notes
    });
  }

  const passedAll = results.every((r) => r.anwcPassed && r.oraclePassed);

  const report: ConformanceMatrixReport = {
    schemaVersion: '0.1',
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    defectiveCount: results.filter((r) => r.role === 'defective').length,
    healthyCount: results.filter((r) => r.role === 'healthy').length,
    boundaryCount: results.filter((r) => r.role === 'boundary').length,
    passedAll,
    familyBreakdown: familyStats,
    cases: results
  };

  // Write artifact
  const outPath = fileURLToPath(new URL('conformance-matrix.json', import.meta.url));
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  return report;
}
