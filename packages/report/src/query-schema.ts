import { z } from 'zod';
import {
  rectSchema,
  sourceRefSchema,
  type Rect,
  type SourceRef
} from '@anwc/protocol';
import { REPORT_SCHEMA_VERSION, reportSummarySchema, type ReportSummary } from './schema.js';

export const queryFilterSchema = z.object({
  code: z.string().optional(),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  nodeId: z.string().optional(),
  findingId: z.string().optional(),
  file: z.string().optional(),
  actionableOnly: z.boolean().optional(),
  limit: z.number().int().positive().optional()
}).strict();

export type QueryFilter = z.infer<typeof queryFilterSchema>;

export const agentScopeSchema = z.object({
  totalFindings: z.number().int().nonnegative(),
  matchedFindings: z.number().int().nonnegative(),
  excludedFindings: z.number().int().nonnegative(),
  isFiltered: z.boolean(),
  filter: queryFilterSchema.nullable(),
  filterNote: z.string().nullable()
}).strict();

export type AgentScope = z.infer<typeof agentScopeSchema>;

export const agentTargetSchema = z.object({
  nodeId: z.string().min(1),
  tag: z.string().min(1),
  label: z.string(),
  semanticKey: z.string().min(1).nullable(),
  role: z.string().min(1).nullable(),
  source: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable().optional(),
  box: rectSchema.nullable()
}).strict();

export type AgentTarget = z.infer<typeof agentTargetSchema>;

export const agentFindingSummaryItemSchema = z.object({
  findingId: z.string().min(1),
  code: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']),
  target: agentTargetSchema,
  message: z.string().min(1),
  measuredVsExpected: z.object({
    measured: z.string().min(1),
    expected: z.string().nullable()
  }).strict(),
  blockers: z.array(agentTargetSchema),
  clipAncestors: z.array(agentTargetSchema),
  limitations: z.array(z.string()),
  acknowledged: z.boolean(),
  suggestion: z.string().nullable()
}).strict();

export type AgentFindingSummaryItem = z.infer<typeof agentFindingSummaryItemSchema>;

export const agentSummarySchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1),
  captureHash: z.string().min(1),
  page: z.object({
    url: z.string(),
    title: z.string(),
    viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict()
  }).strict(),
  coverage: z.object({
    complete: z.boolean(),
    paintVisibility: z.literal('unknown')
  }).strict(),
  readiness: z.object({
    settled: z.boolean()
  }).strict(),
  summary: reportSummarySchema,
  scope: agentScopeSchema,
  findings: z.array(agentFindingSummaryItemSchema)
}).strict();

export type AgentSummary = z.infer<typeof agentSummarySchema>;

export const agentSampleDetailSchema = z.object({
  x: z.number(),
  y: z.number(),
  result: z.string(),
  blockerNodeId: z.string().nullable(),
  blocker: agentTargetSchema.nullable()
}).strict();

export type AgentSampleDetail = z.infer<typeof agentSampleDetailSchema>;

export const agentClipAncestorDetailSchema = z.object({
  node: agentTargetSchema,
  axes: z.enum(['x', 'y', 'xy']),
  box: rectSchema
}).strict();

export type AgentClipAncestorDetail = z.infer<typeof agentClipAncestorDetailSchema>;

export const agentFindingDetailSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  reportId: z.string().min(1),
  captureHash: z.string().min(1),
  finding: agentFindingSummaryItemSchema,
  targetNode: z.object({
    nodeId: z.string().min(1),
    tag: z.string().min(1),
    label: z.string(),
    semanticKey: z.string().min(1).nullable(),
    role: z.string().min(1).nullable(),
    source: sourceRefSchema.nullable(),
    box: rectSchema.nullable(),
    overflow: z.object({
      clientWidth: z.number(),
      clientHeight: z.number(),
      scrollWidth: z.number(),
      scrollHeight: z.number(),
      scrollableX: z.boolean(),
      scrollableY: z.boolean()
    }).nullable().optional(),
    intent: z.object({
      expectedCurrent: z.string().nullable(),
      maxLines: z.number().nullable(),
      allow: z.array(z.string())
    }).nullable().optional(),
    interaction: z.object({
      candidate: z.boolean(),
      disabled: z.boolean(),
      inert: z.boolean(),
      pointerEvents: z.string()
    }).nullable().optional()
  }).strict(),
  evidenceDetails: z.object({
    kind: z.string(),
    pointerSamples: z.array(agentSampleDetailSchema).optional(),
    clippingAncestors: z.array(agentClipAncestorDetailSchema).optional(),
    boxFraction: z.number().optional(),
    clippedIntersection: rectSchema.nullable().optional(),
    textLines: z.object({
      observed: z.number(),
      allowed: z.number().nullable(),
      clippedFragments: z.number()
    }).optional(),
    overflowPx: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    hiddenReasons: z.array(z.string()).optional()
  }).strict(),
  blockers: z.array(agentTargetSchema),
  clipAncestors: z.array(agentTargetSchema),
  relatedNodes: z.array(agentTargetSchema),
  repairContext: z.object({
    file: z.string().nullable(),
    line: z.number().nullable(),
    column: z.number().nullable(),
    componentHint: z.string().nullable(),
    suggestedAction: z.string().nullable()
  }).strict()
}).strict();

export type AgentFindingDetail = z.infer<typeof agentFindingDetailSchema>;

export function parseAgentSummary(input: unknown): AgentSummary {
  return agentSummarySchema.parse(input);
}

export function parseAgentFindingDetail(input: unknown): AgentFindingDetail {
  return agentFindingDetailSchema.parse(input);
}

