import { z } from 'zod';
import {
  diagnosticEvidenceSchema,
  lastObservedSchema,
  rectSchema,
  sourceRefSchema,
  type DiagnosticEvidence,
  type Rect,
  type SourceRef
} from '@anwc/protocol';

export const REPORT_SCHEMA_VERSION = '0.1' as const;

export const reportNodeRefSchema = z.object({
  nodeId: z.string().min(1),
  tag: z.string().min(1),
  label: z.string(),
  semanticKey: z.string().min(1).nullable(),
  role: z.string().min(1).nullable(),
  source: sourceRefSchema.nullable(),
  box: rectSchema.nullable()
}).strict();

export const reportFindingSchema = z.object({
  findingId: z.string().min(1),
  code: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']),
  target: reportNodeRefSchema,
  message: z.string().min(1),
  evidence: diagnosticEvidenceSchema,
  measuredVsExpected: z.object({
    measured: z.string().min(1),
    expected: z.string().nullable()
  }).strict(),
  relatedNodes: z.array(reportNodeRefSchema),
  blockers: z.array(reportNodeRefSchema),
  clipAncestors: z.array(reportNodeRefSchema),
  limitations: z.array(z.string()),
  acknowledged: z.boolean(),
  suggestion: z.string().nullable()
}).strict();

export const reportFindingGroupSchema = z.object({
  groupId: z.string().min(1),
  relation: z.object({
    kind: z.enum(['shared-blocker', 'shared-clip-ancestor', 'independent']),
    sharedNodeId: z.string().nullable(),
    sharedNode: reportNodeRefSchema.nullable(),
    label: z.string().min(1),
    note: z.string().min(1)
  }).strict(),
  findings: z.array(reportFindingSchema)
}).strict();

export const reportSummarySchema = z.object({
  totalFindings: z.number().int().nonnegative(),
  actionable: z.number().int().nonnegative(),
  unacknowledgedErrors: z.number().int().nonnegative(),
  unacknowledgedWarnings: z.number().int().nonnegative(),
  informational: z.number().int().nonnegative(),
  acknowledged: z.number().int().nonnegative(),
  groupsCount: z.number().int().nonnegative(),
  status: z.enum(['pass', 'fail', 'incomplete'])
}).strict();

export const reportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  input: z.object({
    captureId: z.string().min(1),
    captureHash: z.string().min(1),
    sessionId: z.string().min(1),
    capturedAt: z.string().datetime({ offset: true })
  }).strict(),
  environment: z.object({
    browser: z.string().min(1),
    browserVersion: z.string().min(1),
    compilerVersion: z.string().min(1).nullable(),
    runtimeVersion: z.string().min(1)
  }).strict(),
  page: z.object({
    url: z.string().url(),
    title: z.string(),
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
    scroll: z.object({ x: z.number(), y: z.number() }).strict(),
    devicePixelRatio: z.number().positive(),
    visualViewportScale: z.number().positive(),
    scenario: z.string().nullable()
  }).strict(),
  readiness: z.object({
    settled: z.boolean(),
    waitMs: z.number().int().nonnegative(),
    reasons: z.array(z.string()),
    lastObserved: lastObservedSchema.optional()
  }).strict(),
  coverage: z.object({
    complete: z.boolean(),
    discoveredNodes: z.number().int().nonnegative(),
    inspectedNodes: z.number().int().nonnegative(),
    skippedNodes: z.number().int().nonnegative(),
    reasons: z.array(z.string()),
    capabilities: z.array(z.string()),
    unsupportedFeatures: z.array(z.string()),
    nodesObserved: z.number().int().nonnegative().optional(),
    truncatedNodes: z.number().int().nonnegative().optional(),
    paintVisibility: z.literal('unknown')
  }).strict(),
  summary: reportSummarySchema,
  groups: z.array(reportFindingGroupSchema)
}).strict();

export type ReportNodeRef = z.infer<typeof reportNodeRefSchema>;
export type ReportFinding = z.infer<typeof reportFindingSchema>;
export type ReportFindingGroup = z.infer<typeof reportFindingGroupSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type Report = z.infer<typeof reportSchema>;

export function parseReport(input: unknown): Report {
  return reportSchema.parse(input);
}
