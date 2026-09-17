import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createHash } from 'node:crypto';
import { diagnose } from '@anwc/diagnostics';
import { rawCaptureSchema, snapshotSchema, type RawCapture, type Snapshot } from '@anwc/protocol';
import {
  CHECK_MANIFEST_VERSION,
  computeManifestHash,
  type AssertionResult,
  type Checkpoint,
  type CheckpointExecutionResult,
  type CheckpointStep,
  type CheckRunResult,
  type Scenario,
  type ScenarioExecutionResult,
  type StateManifest,
  type StepRecord
} from './manifest.js';

export interface CheckRunnerOptions {
  manifest: StateManifest;
  manifestRaw: string;
  outputDir?: string;
  runtimeScriptProvider?: () => Promise<string>;
  browser?: Browser;
}

const DEFAULT_STEP_TIMEOUT = 2_000;
const MAX_STEP_TIMEOUT = 10_000;
const SCENARIO_TIMEOUT = 60_000;

function resolveTimeout(requested?: number): number {
  if (!requested) return DEFAULT_STEP_TIMEOUT;
  return Math.min(Math.max(requested, 100), MAX_STEP_TIMEOUT);
}

function resolveSafeUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const target = new URL(path, base);
  // Ensure same origin
  if (target.origin !== base.origin) {
    throw new Error(`Forbidden navigation to cross-origin target '${target.href}'. Must stay within '${base.origin}'.`);
  }
  return target.href;
}

export async function runStateScenario(
  scenario: Scenario,
  baseUrl: string,
  browser: Browser,
  options: {
    outputDir?: string;
    runtimeScriptProvider?: () => Promise<string>;
  } = {}
): Promise<ScenarioExecutionResult> {
  const scenarioStarted = performance.now();
  const context = await browser.newContext({
    viewport: scenario.viewport
  });

  const checkpointResults: CheckpointExecutionResult[] = [];
  let scenarioPassed = true;
  let scenarioError: string | undefined;

  try {
    const page = await context.newPage();

    for (const checkpoint of scenario.checkpoints) {
      if (performance.now() - scenarioStarted > SCENARIO_TIMEOUT) {
        scenarioPassed = false;
        scenarioError = `Scenario exceeded maximum timeout of ${SCENARIO_TIMEOUT}ms.`;
        break;
      }

      const cpResult = await runCheckpoint(checkpoint, page, baseUrl, options);
      checkpointResults.push(cpResult);

      if (!cpResult.passed) {
        scenarioPassed = false;
        scenarioError = cpResult.error || `Checkpoint '${checkpoint.name}' failed.`;
        break;
      }
    }
  } catch (error) {
    scenarioPassed = false;
    scenarioError = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }

  return {
    id: scenario.id,
    title: scenario.title,
    passed: scenarioPassed,
    checkpoints: checkpointResults,
    durationMs: Math.round(performance.now() - scenarioStarted),
    error: scenarioError
  };
}

async function runCheckpoint(
  checkpoint: Checkpoint,
  page: Page,
  baseUrl: string,
  options: {
    outputDir?: string;
    runtimeScriptProvider?: () => Promise<string>;
  }
): Promise<CheckpointExecutionResult> {
  const checkpointStarted = performance.now();
  const stepRecords: StepRecord[] = [];
  const assertionResults: AssertionResult[] = [];
  let checkpointPassed = true;
  let checkpointError: string | undefined;
  let lastCapture: Snapshot | undefined;
  let lastCaptureHash: string | undefined;

  for (const step of checkpoint.steps) {
    const stepStarted = performance.now();
    try {
      if (step.action === 'navigate') {
        const fullUrl = resolveSafeUrl(baseUrl, step.path);
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_STEP_TIMEOUT });
        stepRecords.push({
          action: 'navigate',
          target: step.path,
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      } else if (step.action === 'click') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        const locator = page.locator(step.selector);
        const count = await locator.count();
        if (count > 1) {
          throw new Error(`Selector '${step.selector}' matches ${count} elements. Target is ambiguous.`);
        }
        await locator.click({ timeout: timeoutMs });
        stepRecords.push({
          action: 'click',
          target: step.selector,
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      } else if (step.action === 'fill') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        const locator = page.locator(step.selector);
        const count = await locator.count();
        if (count > 1) {
          throw new Error(`Selector '${step.selector}' matches ${count} elements. Target is ambiguous.`);
        }
        await locator.fill(step.text, { timeout: timeoutMs });
        stepRecords.push({
          action: 'fill',
          target: step.selector,
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      } else if (step.action === 'scroll') {
        if (step.selector) {
          await page.locator(step.selector).evaluate((el, coords) => {
            el.scrollTo(coords.x, coords.y);
          }, { x: step.x, y: step.y });
        } else {
          await page.evaluate((coords) => {
            window.scrollTo(coords.x, coords.y);
          }, { x: step.x, y: step.y });
        }
        // Small delay to allow any scroll rendering
        await page.waitForTimeout(50);
        stepRecords.push({
          action: 'scroll',
          target: step.selector || 'window',
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      } else if (step.action === 'wait-for-selector') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        await page.locator(step.selector).waitFor({
          state: step.state,
          timeout: timeoutMs
        });
        stepRecords.push({
          action: 'wait-for-selector',
          target: step.selector,
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      } else if (step.action === 'capture') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        if (step.readySelector) {
          await page.locator(step.readySelector).waitFor({ state: 'attached', timeout: timeoutMs });
        }
        if (step.runtimeOnly && options.runtimeScriptProvider) {
          const script = await options.runtimeScriptProvider();
          await page.addScriptTag({ content: script });
        }

        // Capture from runtime
        await page.waitForFunction(
          () => Boolean((window as Window & { __ANWC__?: { capture: unknown } }).__ANWC__),
          undefined,
          { timeout: Math.min(timeoutMs, 2_000) }
        );

        const raw = await page.evaluate(async (opts) => {
          const api = (window as Window & { __ANWC__?: { capture: (o: unknown) => Promise<RawCapture> } }).__ANWC__;
          if (!api) throw new Error('ANWC runtime is missing.');
          return api.capture(opts);
        }, { timeoutMs });

        const rawCapture = rawCaptureSchema.parse(raw);
        const findings = diagnose(rawCapture);
        const snapshot = snapshotSchema.parse({
          ...rawCapture,
          timingsMs: { ...rawCapture.timingsMs, rules: 0, serialize: 0 },
          findings
        });

        lastCapture = snapshot;
        const jsonStr = JSON.stringify(snapshot);
        lastCaptureHash = createHash('sha256').update(jsonStr, 'utf8').digest('hex');

        if (options.outputDir) {
          const captureFile = join(options.outputDir, `${step.name}.json`);
          await mkdir(dirname(captureFile), { recursive: true });
          await writeFile(captureFile, jsonStr, 'utf8');
        }

        stepRecords.push({
          action: 'capture',
          target: step.name,
          durationMs: Math.round(performance.now() - stepStarted),
          status: 'passed'
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.toLowerCase().includes('timeout');
      stepRecords.push({
        action: step.action,
        target: 'selector' in step ? step.selector : ('path' in step ? step.path : undefined),
        durationMs: Math.round(performance.now() - stepStarted),
        status: isTimeout ? 'timed-out' : 'failed',
        error: msg
      });
      checkpointPassed = false;
      checkpointError = msg;
      break;
    }
  }

  // Execute behavior assertions if checkpoint steps passed
  if (checkpointPassed) {
    for (const assertion of checkpoint.assertions) {
      try {
        const locator = page.locator(assertion.selector);
        if (assertion.expected === 'visible') {
          const isVis = await locator.isVisible();
          assertionResults.push({
            id: assertion.id,
            description: assertion.description,
            passed: isVis,
            actual: isVis,
            expected: true
          });
          if (!isVis) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: expected '${assertion.selector}' to be visible.`;
          }
        } else if (assertion.expected === 'hidden') {
          const isVis = await locator.isVisible();
          const passed = !isVis;
          assertionResults.push({
            id: assertion.id,
            description: assertion.description,
            passed,
            actual: isVis,
            expected: false
          });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: expected '${assertion.selector}' to be hidden.`;
          }
        } else if (assertion.expected === 'text-contains') {
          const text = await locator.innerText();
          const expected = assertion.expectedValue || '';
          const passed = text.includes(expected);
          assertionResults.push({
            id: assertion.id,
            description: assertion.description,
            passed,
            actual: text,
            expected
          });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: text '${text}' does not contain '${expected}'.`;
          }
        } else if (assertion.expected === 'attribute-equals') {
          const attr = await locator.getAttribute(assertion.attributeName || '');
          const expected = assertion.expectedValue;
          const passed = attr === expected;
          assertionResults.push({
            id: assertion.id,
            description: assertion.description,
            passed,
            actual: attr,
            expected
          });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: attribute '${assertion.attributeName}' value '${attr}' !== '${expected}'.`;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assertionResults.push({
          id: assertion.id,
          description: assertion.description,
          passed: false,
          error: msg
        });
        checkpointPassed = false;
        checkpointError = `Assertion '${assertion.id}' threw: ${msg}`;
      }
    }
  }

  const finalUrl = page.url();
  const finalScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

  return {
    name: checkpoint.name,
    passed: checkpointPassed,
    steps: stepRecords,
    assertions: assertionResults,
    finalUrl,
    finalScroll,
    capture: lastCapture,
    captureHash: lastCaptureHash,
    durationMs: Math.round(performance.now() - checkpointStarted),
    error: checkpointError
  };
}

export async function runCheckSuite(options: CheckRunnerOptions): Promise<CheckRunResult> {
  const startedAt = new Date().toISOString();
  const manifestHash = computeManifestHash(options.manifestRaw);
  const browser = options.browser ?? (await chromium.launch({ headless: true }));
  const shouldCloseBrowser = !options.browser;

  const scenarioResults: ScenarioExecutionResult[] = [];
  try {
    for (const scenario of options.manifest.scenarios) {
      const scenarioRes = await runStateScenario(scenario, options.manifest.baseUrl, browser, {
        outputDir: options.outputDir,
        runtimeScriptProvider: options.runtimeScriptProvider
      });
      scenarioResults.push(scenarioRes);
    }
  } finally {
    if (shouldCloseBrowser) {
      await browser.close();
    }
  }

  const finishedAt = new Date().toISOString();
  const passedScenarios = scenarioResults.filter((s) => s.passed).length;
  const failedScenarios = scenarioResults.filter((s) => !s.passed).length;
  const passedAll = failedScenarios === 0;

  const result: CheckRunResult = {
    schemaVersion: CHECK_MANIFEST_VERSION,
    manifestHash,
    baseUrl: options.manifest.baseUrl,
    startedAt,
    finishedAt,
    totalScenarios: scenarioResults.length,
    passedScenarios,
    failedScenarios,
    scenarios: scenarioResults,
    passedAll
  };

  if (options.outputDir) {
    const runSummaryPath = join(options.outputDir, 'check-summary.json');
    await mkdir(options.outputDir, { recursive: true });
    await writeFile(runSummaryPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}
