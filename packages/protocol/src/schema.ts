import { z } from 'zod';

export const SCHEMA_VERSION = '0.1' as const;
const finite = z.number().finite();
const nonNegative = finite.nonnegative();
const positiveInteger = z.number().int().positive();

export const rectSchema = z.object({
  x: finite, y: finite, width: nonNegative, height: nonNegative
}).strict();

export const sourceRefSchema = z.object({
  siteId: z.string().min(1),
  file: z.string().min(1).refine((value) => !value.includes('\\'), 'file paths use forward slashes'),
  line: positiveInteger,
  column: positiveInteger,
  tag: z.string().min(1)
}).strict();

export const assessmentSchema = <T extends z.ZodTypeAny>(value: T) => z.discriminatedUnion('status', [
  z.object({ status: z.literal('known'), value, method: z.string().min(1), limitations: z.array(z.string()) }).strict(),
  z.object({ status: z.literal('estimated'), value, method: z.string().min(1), limitations: z.array(z.string()) }).strict(),
  z.object({ status: z.literal('unknown'), value: z.null(), method: z.string().min(1), limitations: z.array(z.string()) }).strict()
]);

export const hitSampleSchema = z.object({
  x: finite,
  y: finite,
  result: z.enum(['target-or-descendant', 'blocked', 'no-target']),
  blockerNodeId: z.string().min(1).nullable()
}).strict();

const pointerValueSchema = z.object({
  samples: z.array(hitSampleSchema),
  tested: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  noTarget: z.number().int().nonnegative(),
  blockedSampleFraction: z.number().min(0).max(1)
}).strict();

export const pointerSchema = assessmentSchema(pointerValueSchema).superRefine((assessment, context) => {
  if (assessment.status === 'unknown') return;
  const { samples, tested, blocked, noTarget, blockedSampleFraction } = assessment.value;
  if (tested !== samples.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'tested must equal samples.length', path: ['value', 'tested'] });
  if (blocked !== samples.filter((sample) => sample.result === 'blocked').length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'blocked must equal blocked samples', path: ['value', 'blocked'] });
  if (noTarget !== samples.filter((sample) => sample.result === 'no-target').length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'noTarget must equal no-target samples', path: ['value', 'noTarget'] });
  if (tested > 0 && blockedSampleFraction !== blocked / tested) context.addIssue({ code: z.ZodIssueCode.custom, message: 'blockedSampleFraction must equal blocked/tested', path: ['value', 'blockedSampleFraction'] });
});

const clipValueSchema = z.object({
  intersection: rectSchema.nullable(),
  boxFraction: z.number().min(0).max(1),
  ancestors: z.array(z.object({ nodeId: z.string().min(1), axes: z.enum(['x', 'y', 'xy']), box: rectSchema }).strict())
}).strict();

export const measurementSchema = z.object({
  nodeId: z.string().min(1),
  siteId: z.string().min(1).nullable(),
  source: sourceRefSchema.nullable(),
  parentNodeId: z.string().min(1).nullable(),
  tag: z.string().min(1),
  semanticKey: z.string().min(1).nullable(),
  role: z.string().min(1).nullable(),
  label: z.string(),
  labelMethod: z.enum(['aria-label', 'aria-labelledby', 'text', 'none']),
  textTruncated: z.boolean(),
  box: rectSchema.nullable(),
  render: z.object({
    hasBox: z.boolean(), cssHiddenReasons: z.array(z.string()), effectiveOpacityZero: assessmentSchema(z.boolean())
  }).strict(),
  viewport: assessmentSchema(z.object({ intersection: rectSchema.nullable(), boxFraction: z.number().min(0).max(1) }).strict()),
  clip: assessmentSchema(clipValueSchema),
  overflow: z.object({
    clientWidth: nonNegative, clientHeight: nonNegative, scrollWidth: nonNegative, scrollHeight: nonNegative,
    scrollableX: z.boolean(), scrollableY: z.boolean()
  }).strict().nullable(),
  text: assessmentSchema(z.object({
    lineCount: z.number().int().nonnegative(), fragmentRects: z.array(rectSchema), clippedFragmentCount: z.number().int().nonnegative()
  }).strict()),
  pointer: pointerSchema,
  interaction: z.object({ candidate: z.boolean(), disabled: z.boolean(), inert: z.boolean(), pointerEvents: z.string().min(1) }).strict(),
  paintVisibility: assessmentSchema(z.enum(['painted', 'not-painted'])),
  intent: z.object({
    expectedCurrent: z.enum(['visible', 'interactive']).nullable(), maxLines: positiveInteger.nullable(),
    allow: z.array(z.enum(['horizontal-scroll', 'text-truncation']))
  }).strict(),
  /** P05: this node's subtree or geometry was not fully observed. Present only when true. */
  truncated: z.literal(true).optional()
}).strict().superRefine((node, context) => {
  if (node.source && node.siteId !== node.source.siteId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'siteId must match source.siteId' });
});

export const diagnosticEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('horizontal-overflow'), clientWidth: nonNegative, scrollWidth: nonNegative }).strict(),
  z.object({ kind: z.literal('clipped-by-ancestor'), boxFraction: z.number().min(0).max(1), ancestorNodeIds: z.array(z.string().min(1)) }).strict(),
  z.object({ kind: z.literal('text-clipped'), clippedFragmentCount: z.number().int().nonnegative(), lineCount: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('text-line-budget-exceeded'), observedLines: z.number().int().nonnegative(), maxLines: positiveInteger }).strict(),
  z.object({ kind: z.literal('expected-visible-but-hidden'), hiddenReasons: z.array(z.string()), expectedCurrent: z.enum(['visible', 'interactive']) }).strict(),
  z.object({ kind: z.literal('pointer-blocked'), tested: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), blockerNodeIds: z.array(z.string().min(1)) }).strict(),
  z.object({ kind: z.literal('generic'), details: z.record(z.unknown()) }).strict()
]);

export const findingSchema = z.object({
  findingId: z.string().min(1),
  code: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']),
  nodeId: z.string().min(1),
  source: sourceRefSchema.nullable(),
  message: z.string().min(1),
  evidence: diagnosticEvidenceSchema,
  relatedNodeIds: z.array(z.string().min(1)),
  limitations: z.array(z.string()),
  acknowledged: z.boolean(),
  suggestion: z.string().nullable()
}).strict();

const coverageSchema = z.object({
  complete: z.boolean(), discoveredNodes: z.number().int().nonnegative(), inspectedNodes: z.number().int().nonnegative(), skippedNodes: z.number().int().nonnegative(),
  reasons: z.array(z.string()), capabilities: z.array(z.string()), unsupportedFeatures: z.array(z.string()),
  /** P05: how many nodes the capture actually measured (equals inspectedNodes). Absent in captures saved before P05. */
  nodesObserved: z.number().int().nonnegative().optional()
}).strict().superRefine((coverage, context) => {
  if (coverage.discoveredNodes !== coverage.inspectedNodes + coverage.skippedNodes) context.addIssue({ code: z.ZodIssueCode.custom, message: 'discoveredNodes must equal inspectedNodes + skippedNodes' });
  if (coverage.nodesObserved !== undefined && coverage.nodesObserved !== coverage.inspectedNodes) context.addIssue({ code: z.ZodIssueCode.custom, message: 'nodesObserved must equal inspectedNodes' });
  if (coverage.complete && coverage.skippedNodes > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'complete capture cannot have skipped nodes' });
});

/** P05: what the readiness loop last saw before it gave up. Only on unsettled captures. */
export const lastObservedSchema = z.object({
  phase: z.enum(['fonts', 'geometry']),
  stableFrames: z.number().int().nonnegative(),
  movingCount: z.number().int().nonnegative(),
  movingNodeIds: z.array(z.string().min(1))
}).strict().refine((value) => value.movingNodeIds.length <= value.movingCount, 'movingNodeIds cannot exceed movingCount');

const readinessSchema = z.object({
  settled: z.boolean(), waitMs: z.number().int().nonnegative(), reasons: z.array(z.string()), lastObserved: lastObservedSchema.optional()
}).strict().refine((readiness) => !(readiness.settled && readiness.lastObserved), 'lastObserved is only for unsettled captures');

type PartialEvidence = {
  nodes: Array<{ nodeId: string; truncated?: true | undefined }>;
  coverage: { complete: boolean };
  readiness: { settled: boolean; lastObserved?: { movingNodeIds: string[] } | undefined };
};

/** Truncation evidence must match the capture it is in: a clean capture cannot carry it. */
function checkPartialEvidence(capture: PartialEvidence, context: z.RefinementCtx): void {
  if (capture.coverage.complete && capture.readiness.settled && capture.nodes.some((node) => node.truncated)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'truncated nodes require incomplete coverage or unsettled readiness', path: ['nodes'] });
  }
  const ids = new Set(capture.nodes.map((node) => node.nodeId));
  for (const id of capture.readiness.lastObserved?.movingNodeIds ?? []) {
    if (!ids.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'lastObserved.movingNodeIds must resolve', path: ['readiness', 'lastObserved'] });
  }
}

const captureFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  sessionId: z.string().min(1), captureId: z.string().min(1), capturedAt: z.string().datetime({ offset: true }),
  page: z.object({
    url: z.string().url(), title: z.string(), viewport: z.object({ width: positiveInteger, height: positiveInteger }).strict(),
    scroll: z.object({ x: finite, y: finite }).strict(), devicePixelRatio: finite.positive(), visualViewportScale: finite.positive(), scenario: z.string().min(1).nullable()
  }).strict(),
  environment: z.object({ browser: z.string().min(1), browserVersion: z.string().min(1), compilerVersion: z.string().min(1).nullable(), runtimeVersion: z.string().min(1) }).strict(),
  readiness: readinessSchema,
  coverage: coverageSchema,
  timingsMs: z.object({ capture: nonNegative, serialize: nonNegative }).strict(),
  nodes: z.array(measurementSchema)
};

const rawCaptureBaseSchema = z.object(captureFields).strict();

export const rawCaptureSchema = rawCaptureBaseSchema.superRefine((capture, context) => {
  checkPartialEvidence(capture, context);
  const ids = new Set<string>();
  for (const [index, node] of capture.nodes.entries()) {
    if (ids.has(node.nodeId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'nodeId must be unique', path: ['nodes', index, 'nodeId'] });
    ids.add(node.nodeId);
  }
  for (const [index, node] of capture.nodes.entries()) {
    if (node.parentNodeId && !ids.has(node.parentNodeId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'parentNodeId must resolve', path: ['nodes', index, 'parentNodeId'] });
    if (node.pointer.status !== 'unknown') for (const [sampleIndex, sample] of node.pointer.value.samples.entries()) {
      if (sample.blockerNodeId && !ids.has(sample.blockerNodeId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'blockerNodeId must resolve', path: ['nodes', index, 'pointer', 'value', 'samples', sampleIndex, 'blockerNodeId'] });
    }
  }
});

export const snapshotSchema = rawCaptureBaseSchema.extend({
  timingsMs: z.object({ capture: nonNegative, rules: nonNegative, serialize: nonNegative }).strict(),
  findings: z.array(findingSchema)
}).superRefine((snapshot, context) => {
  checkPartialEvidence(snapshot, context);
  const ids = new Set(snapshot.nodes.map((node) => node.nodeId));
  for (const [index, finding] of snapshot.findings.entries()) {
    if (!ids.has(finding.nodeId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'finding nodeId must resolve', path: ['findings', index, 'nodeId'] });
    for (const related of finding.relatedNodeIds) if (!ids.has(related)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'relatedNodeIds must resolve', path: ['findings', index, 'relatedNodeIds'] });
  }
});

export const instrumentResultSchema = z.object({
  code: z.string(), map: z.unknown().nullable(), sites: z.array(sourceRefSchema),
  diagnostics: z.array(z.object({ code: z.string().min(1), message: z.string().min(1), file: z.string().min(1).nullable(), line: positiveInteger.nullable(), column: positiveInteger.nullable() }).strict())
}).strict();

export const inspectOptionsSchema = z.object({
  url: z.string().url(), viewport: z.object({ width: positiveInteger, height: positiveInteger }).strict().default({ width: 1440, height: 900 }),
  format: z.enum(['text', 'json']).default('text'), output: z.string().min(1).nullable().default(null), limit: positiveInteger.default(40),
  maxChars: positiveInteger.default(12_000), timeoutMs: positiveInteger.default(15_000), readySelector: z.string().min(1).nullable().default(null),
  runtimeOnly: z.boolean().default(false), failOn: z.enum(['error', 'warning', 'none']).default('none')
}).strict();

export type Rect = z.infer<typeof rectSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type Assessment<T> =
  | { status: 'known'; value: T; method: string; limitations: string[] }
  | { status: 'estimated'; value: T; method: string; limitations: string[] }
  | { status: 'unknown'; value: null; method: string; limitations: string[] };
export type Measurement = z.infer<typeof measurementSchema>;
export type DiagnosticEvidence = z.infer<typeof diagnosticEvidenceSchema>;
export type LastObserved = z.infer<typeof lastObservedSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type RawCapture = z.infer<typeof rawCaptureSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type InstrumentResult = z.infer<typeof instrumentResultSchema>;
export type InspectOptions = z.infer<typeof inspectOptionsSchema>;

export function parseRawCapture(input: unknown): RawCapture { return rawCaptureSchema.parse(input); }
export function parseSnapshot(input: unknown): Snapshot { return snapshotSchema.parse(input); }
