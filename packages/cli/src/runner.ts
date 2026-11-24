import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createHash } from 'node:crypto';
import { diagnose } from '@anwc/diagnostics';
import { rawCaptureSchema, snapshotSchema, type RawCapture, type Snapshot } from '@anwc/protocol';
import { checkpointVerdict, findingVerdicts, summarizeCheckVerdicts } from './check-verdicts.js';
import {
  CHECK_MANIFEST_VERSION,
  captureNameProblem,
  computeManifestHash,
  stateManifestSchema,
  type AssertionResult,
  type CaptureStateSummary,
  type Checkpoint,
  type CheckpointExecutionResult,
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
  /** Hard wall-clock deadline per scenario. Defaults to 60s; clamped to [1s, 10min]. */
  scenarioTimeoutMs?: number;
}

const DEFAULT_STEP_TIMEOUT = 2_000;
const MAX_STEP_TIMEOUT = 10_000;
const NAVIGATION_TIMEOUT = 10_000;
const ASSERTION_TIMEOUT = 2_000;
/** Extra time allowed after the runtime's readiness budget for measuring and serializing nodes. */
const CAPTURE_MEASURE_MARGIN = 5_000;
const SCROLL_SETTLE_MS = 50;
const DEFAULT_SCENARIO_TIMEOUT = 60_000;
const MIN_SCENARIO_TIMEOUT = 1_000;
const MAX_SCENARIO_TIMEOUT = 600_000;

/** Raised when an operation exceeds its own bound or the scenario deadline. */
export class CheckTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

function resolveTimeout(requested?: number): number {
  if (!requested) return DEFAULT_STEP_TIMEOUT;
  return Math.min(Math.max(requested, 100), MAX_STEP_TIMEOUT);
}

function resolveScenarioTimeout(requested?: number): number {
  if (!requested) return DEFAULT_SCENARIO_TIMEOUT;
  return Math.min(Math.max(requested, MIN_SCENARIO_TIMEOUT), MAX_SCENARIO_TIMEOUT);
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

/** Resolve `<outputDir>/<name>.json`, refusing anything that would land outside outputDir. */
export function resolveCaptureFile(outputDir: string, name: string): string {
  const problem = captureNameProblem(name);
  if (problem) throw new Error(`Unsafe capture name: ${problem}.`);
  const root = resolve(outputDir);
  const file = resolve(root, `${name}.json`);
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes('/') || rel.includes('\\')) {
    throw new Error(`Unsafe capture name '${name}': resolves outside the output directory.`);
  }
  return file;
}

/**
 * A scenario deadline. Every browser operation gets `budget(own)` = min(own bound, time left),
 * and is raced against that bound so a hung page cannot hold the run past the deadline.
 */
class Deadline {
  readonly at: number;
  readonly totalMs: number;
  // No TypeScript parameter properties: Playwright loads sources in Node's strip-only mode.
  constructor(totalMs: number) {
    this.totalMs = totalMs;
    this.at = performance.now() + totalMs;
  }
  remaining(): number {
    return this.at - performance.now();
  }
  budget(ownMs: number, label: string): number {
    const left = Math.floor(this.remaining());
    if (left <= 0) throw new CheckTimeoutError(`Scenario deadline of ${this.totalMs}ms reached before ${label}.`);
    return Math.max(1, Math.min(ownMs, left));
  }
  async bound<T>(label: string, ownMs: number, run: (timeoutMs: number) => Promise<T>): Promise<T> {
    const timeoutMs = this.budget(ownMs, label);
    const scenarioLimited = timeoutMs < ownMs;
    const operation = run(timeoutMs);
    // The losing side of the race must not surface as an unhandled rejection.
    operation.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CheckTimeoutError(scenarioLimited
        ? `Scenario deadline of ${this.totalMs}ms reached during ${label}.`
        : `${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

function isTimeout(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|deadline/i.test(msg);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Reduce a capture to the state that a faithful replay must reproduce exactly. */
export function summarizeCaptureState(snapshot: Snapshot): CaptureStateSummary {
  const url = new URL(snapshot.page.url);
  const identity = new Map<string, string>();
  for (const node of snapshot.nodes) {
    identity.set(node.nodeId, node.semanticKey ? `key:${node.semanticKey}` : node.siteId ? `site:${node.siteId}` : `tag:${node.tag}`);
  }
  const stableKeys = snapshot.nodes
    .map((node) => node.semanticKey ? `key:${node.semanticKey}` : node.siteId ? `site:${node.siteId}` : null)
    .filter((key): key is string => key !== null)
    .sort();
  const nodeStates = snapshot.nodes
    .filter((node) => node.semanticKey || node.siteId)
    .map((node) => `${identity.get(node.nodeId)} hidden=${!node.render.hasBox || node.render.cssHiddenReasons.length > 0} disabled=${node.interaction.disabled} label=${JSON.stringify(node.label)}`)
    .sort();
  const findings = snapshot.findings
    .map((finding) => `${finding.severity} ${finding.code} @ ${identity.get(finding.nodeId) ?? 'unknown-node'}`)
    .sort();
  return {
    location: `${url.pathname}${url.search}${url.hash}`,
    title: snapshot.page.title,
    viewport: snapshot.page.viewport,
    scroll: snapshot.page.scroll,
    scenario: snapshot.page.scenario,
    settled: snapshot.readiness.settled,
    complete: snapshot.coverage.complete,
    nodeCount: snapshot.nodes.length,
    stableKeys,
    nodeStates,
    findings
  };
}

interface RunContext {
  baseUrl: string;
  deadline: Deadline;
  outputDir?: string;
  runtimeScriptProvider?: () => Promise<string>;
}

export async function runStateScenario(
  scenario: Scenario,
  baseUrl: string,
  browser: Browser,
  options: {
    outputDir?: string;
    runtimeScriptProvider?: () => Promise<string>;
    scenarioTimeoutMs?: number;
  } = {}
): Promise<ScenarioExecutionResult> {
  const scenarioStarted = performance.now();
  const deadline = new Deadline(resolveScenarioTimeout(options.scenarioTimeoutMs));
  // A fresh context per scenario: no cookies, localStorage or sessionStorage carry over.
  const context = await browser.newContext({ viewport: scenario.viewport });
  context.setDefaultTimeout(DEFAULT_STEP_TIMEOUT);
  context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

  const checkpointResults: CheckpointExecutionResult[] = [];
  let scenarioPassed = true;
  let scenarioError: string | undefined;
  const run: RunContext = { baseUrl, deadline, outputDir: options.outputDir, runtimeScriptProvider: options.runtimeScriptProvider };

  try {
    const page = await context.newPage();

    for (const checkpoint of scenario.checkpoints) {
      if (deadline.remaining() <= 0) {
        scenarioPassed = false;
        scenarioError = `Scenario deadline of ${deadline.totalMs}ms reached before checkpoint '${checkpoint.name}'.`;
        break;
      }

      // Hard stop: even an operation that ignores its own timeout cannot outlive the deadline.
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const hardStop = new Promise<'deadline'>((resolveStop) => {
        deadlineTimer = setTimeout(() => resolveStop('deadline'), Math.max(0, deadline.remaining()) + 250);
      });
      const pending = runCheckpoint(checkpoint, page, run);
      pending.catch(() => undefined);
      const outcome = await Promise.race([pending, hardStop]);
      clearTimeout(deadlineTimer);

      if (outcome === 'deadline') {
        const message = `Scenario deadline of ${deadline.totalMs}ms reached during checkpoint '${checkpoint.name}'.`;
        checkpointResults.push({
          name: checkpoint.name, passed: false, steps: [], assertions: [], findingVerdicts: [],
          ...checkpointVerdict({ name: checkpoint.name, stepsPassed: false, stepError: message, assertions: [], captures: [], findings: [] }),
          finalUrl: page.url(), finalScroll: { x: 0, y: 0 },
          durationMs: Math.round(performance.now() - scenarioStarted), error: message
        });
        scenarioPassed = false;
        scenarioError = message;
        break;
      }

      checkpointResults.push(outcome);
      if (!outcome.passed) {
        scenarioPassed = false;
        scenarioError = outcome.error || `Checkpoint '${checkpoint.name}' failed.`;
        break;
      }
    }
  } catch (error) {
    scenarioPassed = false;
    scenarioError = error instanceof Error ? error.message : String(error);
  } finally {
    // Closing the context also aborts any operation still pending after a deadline.
    await context.close().catch(() => undefined);
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

async function requireSingleTarget(page: Page, selector: string, run: RunContext): Promise<void> {
  const count = await run.deadline.bound(`counting '${selector}'`, DEFAULT_STEP_TIMEOUT, () => page.locator(selector).count());
  if (count > 1) {
    throw new Error(`Selector '${selector}' matches ${count} elements. Target is ambiguous.`);
  }
}

async function captureStep(
  step: Extract<Checkpoint['steps'][number], { action: 'capture' }>,
  page: Page,
  run: RunContext
): Promise<{ snapshot: Snapshot; json: string; problem?: string }> {
  const timeoutMs = resolveTimeout(step.timeoutMs);
  const { deadline } = run;
  if (step.readySelector) {
    const selector = step.readySelector;
    await deadline.bound(`ready selector '${selector}'`, timeoutMs, (t) => page.locator(selector).waitFor({ state: 'attached', timeout: t }));
  }
  if (step.runtimeOnly && run.runtimeScriptProvider) {
    const provider = run.runtimeScriptProvider;
    await deadline.bound('runtime injection', DEFAULT_STEP_TIMEOUT, async () => {
      const script = await provider();
      await page.addScriptTag({ content: script });
    });
  }

  await deadline.bound('waiting for the ANWC runtime', Math.min(timeoutMs, 2_000), (t) => page.waitForFunction(
    () => Boolean((window as Window & { __ANWC__?: { capture: unknown } }).__ANWC__),
    undefined,
    { timeout: t }
  ));

  const raw = await deadline.bound(`capture '${step.name}'`, timeoutMs + CAPTURE_MEASURE_MARGIN, () => page.evaluate(async (opts) => {
    const api = (window as Window & { __ANWC__?: { capture: (o: unknown) => Promise<RawCapture> } }).__ANWC__;
    if (!api) throw new Error('ANWC runtime is missing.');
    return api.capture(opts);
  }, { timeoutMs }));

  const rawCapture = rawCaptureSchema.parse(raw);
  const findings = diagnose(rawCapture);
  const snapshot = snapshotSchema.parse({
    ...rawCapture,
    timingsMs: { ...rawCapture.timingsMs, rules: 0, serialize: 0 },
    findings
  });

  const problems: string[] = [];
  if (!snapshot.readiness.settled) problems.push(`not settled (${snapshot.readiness.reasons.join('; ') || 'no reason given'})`);
  if (!snapshot.coverage.complete) problems.push(`incomplete coverage (${snapshot.coverage.inspectedNodes}/${snapshot.coverage.discoveredNodes} nodes inspected; ${snapshot.coverage.reasons.join('; ') || 'no reason given'})`);

  return {
    snapshot,
    json: JSON.stringify(snapshot),
    problem: problems.length > 0 ? `Capture '${step.name}' is ${problems.join(' and ')}.` : undefined
  };
}

async function runCheckpoint(checkpoint: Checkpoint, page: Page, run: RunContext): Promise<CheckpointExecutionResult> {
  const checkpointStarted = performance.now();
  const stepRecords: StepRecord[] = [];
  const assertionResults: AssertionResult[] = [];
  const { deadline } = run;
  let checkpointPassed = true;
  let checkpointError: string | undefined;
  let lastCapture: Snapshot | undefined;
  const captures: Array<{ name: string; snapshot: Snapshot }> = [];
  let lastCaptureHash: string | undefined;
  let lastCaptureState: CaptureStateSummary | undefined;

  for (const step of checkpoint.steps) {
    const stepStarted = performance.now();
    const target = step.action === 'capture' ? step.name
      : 'selector' in step && step.selector ? step.selector
      : 'path' in step ? step.path
      : step.action === 'scroll' ? 'window' : undefined;
    const record = (status: StepRecord['status'], error?: string) => stepRecords.push({
      action: step.action,
      target,
      durationMs: Math.round(performance.now() - stepStarted),
      status,
      ...(error ? { error } : {})
    });
    try {
      if (step.action === 'navigate') {
        const fullUrl = resolveSafeUrl(run.baseUrl, step.path);
        await deadline.bound(`navigation to '${step.path}'`, NAVIGATION_TIMEOUT, (t) => page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: t }));
        record('passed');
      } else if (step.action === 'click') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        await requireSingleTarget(page, step.selector, run);
        await deadline.bound(`click on '${step.selector}'`, timeoutMs, (t) => page.locator(step.selector).click({ timeout: t }));
        record('passed');
      } else if (step.action === 'fill') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        await requireSingleTarget(page, step.selector, run);
        await deadline.bound(`fill of '${step.selector}'`, timeoutMs, (t) => page.locator(step.selector).fill(step.text, { timeout: t }));
        record('passed');
      } else if (step.action === 'scroll') {
        const coords = { x: step.x, y: step.y };
        if (step.selector) {
          const selector = step.selector;
          await requireSingleTarget(page, selector, run);
          await deadline.bound(`scroll of '${selector}'`, DEFAULT_STEP_TIMEOUT, (t) => page.locator(selector).evaluate((el, c) => {
            el.scrollTo(c.x, c.y);
          }, coords, { timeout: t }));
        } else {
          await deadline.bound('window scroll', DEFAULT_STEP_TIMEOUT, () => page.evaluate((c) => {
            window.scrollTo(c.x, c.y);
          }, coords));
        }
        // Small delay to allow any scroll rendering
        await deadline.bound('scroll settle', SCROLL_SETTLE_MS + 1_000, () => page.waitForTimeout(SCROLL_SETTLE_MS));
        record('passed');
      } else if (step.action === 'wait-for-selector') {
        const timeoutMs = resolveTimeout(step.timeoutMs);
        await deadline.bound(`wait for '${step.selector}' (${step.state})`, timeoutMs, (t) => page.locator(step.selector).waitFor({ state: step.state, timeout: t }));
        record('passed');
      } else if (step.action === 'capture') {
        const { snapshot, json, problem } = await captureStep(step, page, run);
        lastCapture = snapshot;
        captures.push({ name: step.name, snapshot });
        lastCaptureHash = sha256(json);
        lastCaptureState = summarizeCaptureState(snapshot);

        // The artifact is written even for a partial capture: it is the evidence of the failure.
        if (run.outputDir) {
          const captureFile = resolveCaptureFile(run.outputDir, step.name);
          await mkdir(resolve(run.outputDir), { recursive: true });
          await writeFile(captureFile, json, 'utf8');
        }

        if (problem) throw new Error(problem);
        record('passed');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      record(isTimeout(error) ? 'timed-out' : 'failed', msg);
      checkpointPassed = false;
      checkpointError = msg;
      break;
    }
  }

  const stepsPassed = checkpointPassed;
  const stepError = checkpointError;

  // Execute behavior assertions if checkpoint steps passed
  if (checkpointPassed) {
    for (const assertion of checkpoint.assertions) {
      const base = { id: assertion.id, description: assertion.description };
      const selector = assertion.selector;
      try {
        if (assertion.expected === 'visible' || assertion.expected === 'hidden') {
          const wantVisible = assertion.expected === 'visible';
          // isVisible() is strict: it throws when the selector matches more than one element.
          const isVis = await deadline.bound(`assertion '${assertion.id}'`, ASSERTION_TIMEOUT, () => page.locator(selector).isVisible());
          const passed = isVis === wantVisible;
          assertionResults.push({ ...base, passed, actual: isVis, expected: wantVisible });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: expected '${selector}' to be ${assertion.expected}.`;
          }
        } else if (assertion.expected === 'text-contains') {
          const expected = assertion.expectedValue;
          if (expected === undefined || expected.length === 0) throw new Error("'text-contains' requires a non-empty expectedValue.");
          const text = await deadline.bound(`assertion '${assertion.id}'`, ASSERTION_TIMEOUT, (t) => page.locator(selector).innerText({ timeout: t }));
          const passed = text.includes(expected);
          assertionResults.push({ ...base, passed, actual: text, expected });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: text '${text}' does not contain '${expected}'.`;
          }
        } else if (assertion.expected === 'attribute-equals') {
          const { attributeName, expectedValue: expected } = assertion;
          if (attributeName === undefined || expected === undefined) throw new Error("'attribute-equals' requires attributeName and expectedValue.");
          const attr = await deadline.bound(`assertion '${assertion.id}'`, ASSERTION_TIMEOUT, (t) => page.locator(selector).getAttribute(attributeName, { timeout: t }));
          const passed = attr === expected;
          assertionResults.push({ ...base, passed, actual: attr, expected });
          if (!passed) {
            checkpointPassed = false;
            checkpointError = `Assertion '${assertion.id}' failed: attribute '${attributeName}' value '${attr}' !== '${expected}'.`;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assertionResults.push({ ...base, passed: false, error: msg });
        checkpointPassed = false;
        checkpointError = `Assertion '${assertion.id}' threw: ${msg}`;
      }
    }
  }

  const findings = findingVerdicts(captures);
  const verdict = checkpointVerdict({ name: checkpoint.name, stepsPassed, stepError, assertions: assertionResults, captures, findings });

  const finalUrl = page.url();
  let finalScroll = { x: 0, y: 0 };
  try {
    finalScroll = await deadline.bound('reading final scroll', DEFAULT_STEP_TIMEOUT, () => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })));
  } catch (error) {
    if (checkpointPassed) {
      checkpointPassed = false;
      checkpointError = `Could not read final scroll position: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return {
    name: checkpoint.name,
    passed: checkpointPassed,
    steps: stepRecords,
    assertions: assertionResults,
    findingVerdicts: findings,
    ...verdict,
    finalUrl,
    finalScroll,
    capture: lastCapture,
    captureHash: lastCaptureHash,
    captureState: lastCaptureState,
    stateDigest: lastCaptureState ? sha256(JSON.stringify(lastCaptureState)) : undefined,
    durationMs: Math.round(performance.now() - checkpointStarted),
    error: checkpointError
  };
}

/**
 * Replays every scenario in its own fresh browser context. The manifest is validated (including
 * safe, globally unique capture names) before a browser is launched or any file is written; an
 * invalid manifest throws and writes nothing.
 */
export async function runCheckSuite(options: CheckRunnerOptions): Promise<CheckRunResult> {
  const parsed = stateManifestSchema.safeParse(options.manifest);
  if (!parsed.success) {
    throw new Error(`Invalid check manifest: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}`);
  }
  const manifest = parsed.data;
  if (options.outputDir) {
    // Re-check every target path up front so an unsafe name can never produce a partial write.
    for (const scenario of manifest.scenarios) for (const checkpoint of scenario.checkpoints) for (const step of checkpoint.steps) {
      if (step.action === 'capture') resolveCaptureFile(options.outputDir, step.name);
    }
  }

  const startedAt = new Date().toISOString();
  const manifestHash = computeManifestHash(options.manifestRaw);
  const browser = options.browser ?? (await chromium.launch({ headless: true }));
  const shouldCloseBrowser = !options.browser;

  const scenarioResults: ScenarioExecutionResult[] = [];
  try {
    for (const scenario of manifest.scenarios) {
      const scenarioRes = await runStateScenario(scenario, manifest.baseUrl, browser, {
        outputDir: options.outputDir,
        runtimeScriptProvider: options.runtimeScriptProvider,
        scenarioTimeoutMs: options.scenarioTimeoutMs
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
  // Replay/assertion success only — not a claim that the UI has no layout findings.
  const passedAll = failedScenarios === 0;

  const result: CheckRunResult = {
    schemaVersion: CHECK_MANIFEST_VERSION,
    manifestHash,
    baseUrl: manifest.baseUrl,
    startedAt,
    finishedAt,
    totalScenarios: scenarioResults.length,
    passedScenarios,
    failedScenarios,
    scenarios: scenarioResults,
    passedAll,
    verdictSummary: summarizeCheckVerdicts(manifest, scenarioResults)
  };

  if (options.outputDir) {
    const runSummaryPath = join(options.outputDir, 'check-summary.json');
    await mkdir(options.outputDir, { recursive: true });
    await writeFile(runSummaryPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}
