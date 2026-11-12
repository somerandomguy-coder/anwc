import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { evaluateBoundarySignal, legacyBoundaryFallback, withoutBoundarySignal } from './boundary.js';
import { conformanceCases } from './matrix.js';
import type {
  ConformanceCase,
  ConformanceFamily,
  ConformanceMatrixReport,
  ConformanceResult,
  FamilyStats
} from './types.js';

/** Generated report location: ignored `artifacts/`, never a tracked file. */
export const conformanceArtifactUrl = new URL('../../artifacts/conformance/conformance-matrix.json', import.meta.url);

function emptyStats(): FamilyStats {
  return { total: 0, passed: 0, failed: 0, knownGaps: 0, falsePositives: 0, falseNegatives: 0 };
}

/**
 * Give each case a fresh document: navigate (resets runtime IDs, scroll,
 * timers, animations and routes' side effects), drop every stylesheet the shop
 * put in <head>, clear root attributes, then mount the case HTML.
 */
async function mountIsolated(page: Page, c: ConformanceCase): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    await import('/src/test-runtime.ts');
  });
  await page.evaluate((html) => {
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) node.remove();
    document.adoptedStyleSheets = [];
    for (const root of [document.documentElement, document.body]) {
      for (const name of [...root.getAttributeNames()]) if (name !== 'lang') root.removeAttribute(name);
    }
    document.body.innerHTML = html;
    window.scrollTo(0, 0);
  }, c.html);
  if (c.setup) await c.setup(page);
}

/** Stylesheets not owned by the case markup (i.e. leaked from the host page). */
async function foreignStyleSheetCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.styleSheets].filter((sheet) => !sheet.ownerNode || !document.body.contains(sheet.ownerNode)).length +
    document.adoptedStyleSheets.length
  );
}

export async function runConformanceSuite(page: Page): Promise<ConformanceMatrixReport> {
  const results: ConformanceResult[] = [];
  const familyStats: Record<ConformanceFamily, FamilyStats> = {
    'text': emptyStats(),
    'clips-scroll': emptyStats(),
    'pointer-layers': emptyStats(),
    'state-semantics': emptyStats(),
    'identity-change': emptyStats(),
    'unsupported-performance': emptyStats()
  };

  for (const c of conformanceCases) {
    const family = c.family;
    familyStats[family].total++;

    // 1. Mount test HTML into an isolated document
    await mountIsolated(page, c);

    // 2. Run independent Playwright oracle (never uses ANWC code)
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
    const foreignStyleSheets = await foreignStyleSheetCount(page);

    const detectedRules = findings.map((f) => f.code);
    const hasDetectedRule = c.expectedRule ? detectedRules.includes(c.expectedRule) : false;

    // Check duplicate key detection
    const keys = capture.nodes.map((n) => n.semanticKey).filter(Boolean);
    const hasDuplicateKey = new Set(keys).size < keys.length;

    let outcome: ConformanceResult['outcome'] = 'fail';
    let classification: ConformanceResult['classification'] = 'unsupported';
    let boundary: ConformanceResult['boundary'];
    let notes = '';

    if (c.role === 'defective') {
      if (c.expectedRule && hasDetectedRule) {
        outcome = 'pass';
        classification = 'detected-defect';
        notes = `Correctly detected expected rule: ${c.expectedRule}`;
      } else if (c.id === 'identity-duplicate-key-defective' && hasDuplicateKey) {
        outcome = 'pass';
        classification = 'detected-defect';
        notes = 'Duplicate key detected in captured inventory';
      } else if (c.id === 'performance-runaway-motion-defective' && !capture.readiness.settled) {
        outcome = 'pass';
        classification = 'detected-defect';
        notes = `Readiness unsettled detected: ${capture.readiness.reasons.join('; ')}`;
      } else {
        classification = 'healthy-pass'; // False negative
        familyStats[family].falseNegatives++;
        notes = `Failed to detect defect. Expected rule: ${c.expectedRule}, got: [${detectedRules.join(', ')}]`;
      }
    } else if (c.role === 'healthy') {
      const actionable = findings.filter((f) => !f.acknowledged && f.severity !== 'info');
      if (actionable.length === 0) {
        outcome = 'pass';
        classification = 'healthy-pass';
        notes = findings.length === 0 ? 'Zero false positives on clean control' : `Zero actionable false positives (${findings.length} acknowledged/info ignored)`;
      } else {
        classification = 'detected-defect'; // False positive!
        familyStats[family].falsePositives++;
        notes = `False positive: reported actionable [${actionable.map((f) => `${f.code}: ${f.message}`).join('; ')}] on clean control`;
      }
    } else if (!c.boundarySignal) {
      notes = 'Boundary case declares no boundarySignal';
    } else {
      // Boundary: require the case-specific signal. The all-node paint-unknown
      // fallback is recorded for comparison only and never counts.
      const signal = c.boundarySignal;
      const evaluation = evaluateBoundarySignal(signal, capture);
      const negativeControlFails = !evaluateBoundarySignal(signal, withoutBoundarySignal(signal, capture)).present;
      boundary = { signal, present: evaluation.present, evidence: evaluation.evidence, negativeControlFails, legacyFallback: legacyBoundaryFallback(capture) };
      if (signal.kind === 'known-gap') {
        outcome = 'known-gap';
        notes = `Known gap, not a pass: ${signal.reason}`;
      } else if (evaluation.present && negativeControlFails) {
        outcome = 'pass';
        notes = `Reported ${signal.kind}: ${evaluation.evidence}`;
      } else if (!evaluation.present) {
        notes = `Missing expected ${signal.kind} signal: ${evaluation.evidence}`;
      } else {
        notes = `Signal ${signal.kind} found but survives removal; check is not specific`;
      }
    }

    if (foreignStyleSheets > 0 && outcome === 'pass') {
      outcome = 'fail';
      notes = `Isolation failure: ${foreignStyleSheets} host stylesheet(s) present at capture. ${notes}`;
    }

    if (outcome === 'pass') familyStats[family].passed++;
    else if (outcome === 'known-gap') familyStats[family].knownGaps++;
    else familyStats[family].failed++;

    results.push({
      id: c.id,
      family: c.family,
      role: c.role,
      oraclePassed,
      oracleDetails,
      classification,
      outcome,
      anwcPassed: outcome === 'pass',
      findingsCount: findings.length,
      detectedRules,
      ...(boundary ? { boundary } : {}),
      foreignStyleSheets,
      complete: capture.coverage.complete,
      paintVisibility: capture.nodes.every((n) => n.paintVisibility.status === 'unknown') ? 'unknown' : 'known',
      inspectedNodes: capture.coverage.inspectedNodes,
      skippedNodes: capture.coverage.skippedNodes,
      durationMs,
      notes
    });
  }

  const knownGapIds = results.filter((r) => r.outcome === 'known-gap').map((r) => r.id);
  const report: ConformanceMatrixReport = {
    schemaVersion: '0.2',
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    defectiveCount: results.filter((r) => r.role === 'defective').length,
    healthyCount: results.filter((r) => r.role === 'healthy').length,
    boundaryCount: results.filter((r) => r.role === 'boundary').length,
    passedCount: results.filter((r) => r.outcome === 'pass').length,
    failedCount: results.filter((r) => r.outcome === 'fail').length,
    knownGapCount: knownGapIds.length,
    knownGapIds,
    passedAll: results.every((r) => r.outcome === 'pass' && r.oraclePassed),
    familyBreakdown: familyStats,
    cases: results
  };

  const outPath = fileURLToPath(conformanceArtifactUrl);
  await mkdir(fileURLToPath(new URL('.', conformanceArtifactUrl)), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  return report;
}
