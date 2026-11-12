import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Snapshot } from '@anwc/protocol';

export const CHECK_MANIFEST_VERSION = '0.1' as const;

/**
 * Capture names become file names (`<outputDir>/<name>.json`), so they must be a single safe
 * path segment: ASCII letters, digits, '.', '_' and '-', starting with a letter or digit, at most
 * 100 characters, not ending in '.', and not a Windows reserved device name. Uniqueness is checked
 * case-insensitively across the whole manifest because common file systems are case-insensitive.
 */
export const SAFE_CAPTURE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
/** File names the runner writes itself; captures may not take them. */
export const RESERVED_CAPTURE_NAMES = ['check-summary'] as const;

export function captureNameProblem(name: string): string | undefined {
  if (!SAFE_CAPTURE_NAME.test(name)) return `capture name '${name}' must match ${SAFE_CAPTURE_NAME.source} (one safe file-name segment, no path separators)`;
  if (name.endsWith('.')) return `capture name '${name}' must not end with '.'`;
  if (WINDOWS_RESERVED_NAME.test(name)) return `capture name '${name}' is a reserved device name on Windows`;
  if ((RESERVED_CAPTURE_NAMES as readonly string[]).includes(name.toLowerCase())) return `capture name '${name}' is reserved for the run summary`;
  return undefined;
}

const captureNameSchema = z.string().min(1).superRefine((name, context) => {
  const problem = captureNameProblem(name);
  if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

export const checkpointStepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('navigate'),
    path: z.string().min(1)
  }).strict(),
  z.object({
    action: z.literal('click'),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('fill'),
    selector: z.string().min(1),
    text: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('scroll'),
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    selector: z.string().min(1).optional()
  }).strict(),
  z.object({
    action: z.literal('wait-for-selector'),
    selector: z.string().min(1),
    state: z.enum(['attached', 'visible', 'detached', 'hidden']).default('visible'),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('capture'),
    name: captureNameSchema,
    readySelector: z.string().min(1).optional(),
    runtimeOnly: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional()
  }).strict()
]);

export type CheckpointStep = z.infer<typeof checkpointStepSchema>;

export const behaviorAssertionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  selector: z.string().min(1),
  expected: z.enum(['visible', 'hidden', 'text-contains', 'attribute-equals']),
  attributeName: z.string().min(1).optional(),
  expectedValue: z.string().optional()
}).strict().superRefine((assertion, context) => {
  // An omitted value must never silently become '' (which every text contains).
  if (assertion.expected === 'text-contains' && (assertion.expectedValue === undefined || assertion.expectedValue.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedValue'], message: `assertion '${assertion.id}': 'text-contains' requires a non-empty expectedValue` });
  }
  if (assertion.expected === 'attribute-equals') {
    if (assertion.attributeName === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['attributeName'], message: `assertion '${assertion.id}': 'attribute-equals' requires attributeName` });
    if (assertion.expectedValue === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedValue'], message: `assertion '${assertion.id}': 'attribute-equals' requires expectedValue (use "" to require an empty attribute)` });
  }
});

export type BehaviorAssertion = z.infer<typeof behaviorAssertionSchema>;

export const checkpointSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(checkpointStepSchema).min(1),
  assertions: z.array(behaviorAssertionSchema).default([])
}).strict();

export type Checkpoint = z.infer<typeof checkpointSchema>;

export const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }).strict().default({ width: 1440, height: 900 }),
  checkpoints: z.array(checkpointSchema).min(1)
}).strict();

export type Scenario = z.infer<typeof scenarioSchema>;

export const stateManifestSchema = z.object({
  schemaVersion: z.literal(CHECK_MANIFEST_VERSION),
  baseUrl: z.string().url(),
  scenarios: z.array(scenarioSchema).min(1)
}).strict().superRefine((manifest, context) => {
  // Capture names share one output directory, so they must be unique across all scenarios.
  const seen = new Map<string, string>();
  manifest.scenarios.forEach((scenario, s) => scenario.checkpoints.forEach((checkpoint, c) => checkpoint.steps.forEach((step, i) => {
    if (step.action !== 'capture') return;
    const folded = step.name.toLowerCase();
    const where = `${scenario.id}/${checkpoint.name}`;
    const previous = seen.get(folded);
    if (previous) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['scenarios', s, 'checkpoints', c, 'steps', i, 'name'], message: `capture name '${step.name}' in ${where} duplicates a capture in ${previous} (names are compared case-insensitively)` });
    } else {
      seen.set(folded, where);
    }
  })));
});

export type StateManifest = z.infer<typeof stateManifestSchema>;

export interface StepRecord {
  action: string;
  target?: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'timed-out';
  error?: string;
}

export interface AssertionResult {
  id: string;
  description: string;
  passed: boolean;
  actual?: string | boolean | null;
  expected?: string | boolean;
  error?: string;
}

/**
 * The reproducible part of a capture: what should be identical when the same checkpoint is
 * replayed in a fresh browser context. Excludes per-run values (sessionId, captureId,
 * capturedAt, timings, readiness wait, browser user agent, per-capture node ids).
 */
export interface CaptureStateSummary {
  /** Path, query and hash of the captured page (origin omitted). */
  location: string;
  title: string;
  viewport: { width: number; height: number };
  scroll: { x: number; y: number };
  scenario: string | null;
  settled: boolean;
  complete: boolean;
  nodeCount: number;
  /** Sorted `key:<semanticKey>` / `site:<siteId>` identities of captured nodes (duplicates kept). */
  stableKeys: string[];
  /**
   * Sorted per-node state for nodes with a stable identity:
   * `<identity> hidden=<bool> disabled=<bool> label=<JSON label>`. Geometry is excluded.
   */
  nodeStates: string[];
  /** Sorted `<severity> <code> @ <stable anchor>` for every finding. */
  findings: string[];
}

export interface CheckpointExecutionResult {
  name: string;
  passed: boolean;
  steps: StepRecord[];
  assertions: AssertionResult[];
  finalUrl: string;
  finalScroll: { x: number; y: number };
  capture?: Snapshot;
  /**
   * sha256 of the exact capture JSON bytes (as written to `<outputDir>/<name>.json`). This is an
   * artifact identity: it differs between runs because captures carry session ids and timestamps.
   * Compare `stateDigest` to check that a replay reproduced the same state.
   */
  captureHash?: string;
  /** Reproducible state of the last capture in this checkpoint. */
  captureState?: CaptureStateSummary;
  /** sha256 of `captureState`; equal across faithful replays of the same checkpoint. */
  stateDigest?: string;
  durationMs: number;
  error?: string;
}

export interface ScenarioExecutionResult {
  id: string;
  title: string;
  passed: boolean;
  checkpoints: CheckpointExecutionResult[];
  durationMs: number;
  error?: string;
}

export interface CheckRunResult {
  schemaVersion: typeof CHECK_MANIFEST_VERSION;
  manifestHash: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  scenarios: ScenarioExecutionResult[];
  /**
   * True when every scenario replayed: every step ran within its deadline, every capture was
   * settled and complete, and every behavior assertion held. It is NOT a statement that the UI is
   * free of layout findings — read each capture's `findings` (or `captureState.findings`) for that.
   */
  passedAll: boolean;
}

export function computeManifestHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
