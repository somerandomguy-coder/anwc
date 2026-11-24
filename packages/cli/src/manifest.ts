import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Finding, Snapshot } from '@anwc/protocol';
import type { BehaviorEvidence, Verdict, VerdictCounts, VerdictReason } from '@anwc/report';

import type { BaselineComparison } from './baseline.js';

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
  expectedValue: z.string().optional(),
  /**
   * Optional: the `data-anwc-key` of the element whose behavior this assertion proves. Only such
   * assertions are observed around the step, and only they can support a `verified` verdict.
   */
  proves: z.string().min(1).optional()
}).strict().superRefine((assertion, context) => {
  if (assertion.proves !== undefined && /:(focus|hover|active|target|visited)/i.test(assertion.selector)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['selector'], message: `assertion '${assertion.id}': a 'proves' assertion may not depend on :focus, :hover, :active, :target or :visited, which any click changes` });
  }
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

/** P03 verdict on one finding measured in one capture of a checkpoint. */
export interface CheckFindingVerdict {
  capture: string;
  findingId: string;
  code: string;
  severity: Finding['severity'];
  nodeId: string;
  targetKey: string;
  source: Finding['source'];
  verdict: Verdict;
  reason: VerdictReason;
}

/** P03 verdict on a whole checkpoint. `verified` only with `--baseline` and every compared finding verified. */
export interface CheckpointVerdict {
  verdict: Verdict;
  reason: VerdictReason;
  explanation: string;
}

export interface CheckVerdictSummary {
  /** Findings measured in all captures, per verdict. */
  findings: VerdictCounts;
  /** Declared checkpoints per verdict, including those that never ran. */
  checkpoints: VerdictCounts;
  checkpointsNotRun: number;
}

/** Evidence for one `proves` assertion and one capture of the same checkpoint. */
export interface CheckBehaviorEvidence extends BehaviorEvidence {
  capture: string;
  assertion: string;
  /** Index of the observed step in the checkpoint's `steps`; null when none was observed. */
  step: number | null;
}

export interface CheckpointExecutionResult extends CheckpointVerdict {
  name: string;
  passed: boolean;
  steps: StepRecord[];
  assertions: AssertionResult[];
  /** One entry per finding in every capture of this checkpoint, not only the last. */
  findingVerdicts: CheckFindingVerdict[];
  /** Every capture of this checkpoint with the sha256 of its exact JSON bytes. */
  captures: Array<{ name: string; sha256: string }>;
  /** One entry per capture and `proves` assertion; empty when none is declared. */
  behaviorEvidence: CheckBehaviorEvidence[];
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
   * free of layout findings — read `verdictSummary`, each checkpoint's `verdict` and its `findingVerdicts` for that.
   */
  passedAll: boolean;
  verdictSummary: CheckVerdictSummary;
  /** Marks a summary the runner wrote; see `loadBaseline`. Detects edits, not a determined forger. */
  producer: typeof CHECK_PRODUCER;
  /** sha256 of the canonical scenarios (states, steps, assertions); formatting and baseUrl excluded. */
  statesHash: string;
  /** Present only with `--baseline`. */
  baseline?: BaselineComparison;
  /** sha256 of this result without `summaryHash`, as compact JSON. */
  summaryHash: string;
}

export const CHECK_PRODUCER = 'anwc-check/0.1' as const;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, canonical(v)]));
}

/** Hash of what is replayed and asserted. The compared captures' URLs are checked separately. */
export function computeStatesHash(manifest: StateManifest): string {
  return computeManifestHash(JSON.stringify(canonical(manifest.scenarios)));
}

export function computeSummaryHash(result: object): string {
  const { summaryHash: _omitted, ...rest } = result as Record<string, unknown>;
  return computeManifestHash(JSON.stringify(rest));
}

export function computeManifestHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
