import { z } from 'zod';
import { reportFindingSchema, reportNodeRefSchema } from './schema.js';

export const DIFF_SCHEMA_VERSION = '0.1' as const;

export const diffMatchStrategySchema = z.enum([
  'author-key',
  'source-site',
  'semantic-heuristic',
  'ambiguous',
  'unmatched'
]);

export type DiffMatchStrategy = z.infer<typeof diffMatchStrategySchema>;

export const targetMatchSchema = z.object({
  targetKey: z.string().min(1),
  strategy: diffMatchStrategySchema,
  confidence: z.enum(['definite', 'heuristic', 'ambiguous', 'none']),
  beforeNode: reportNodeRefSchema.nullable(),
  afterNode: reportNodeRefSchema.nullable(),
  notes: z.string().optional()
}).strict();

export type TargetMatch = z.infer<typeof targetMatchSchema>;

export const findingComparisonStatusSchema = z.enum([
  'verified-fixed',
  'persistent',
  'new-finding',
  'inconclusive',
  'non-comparable'
]);

export type FindingComparisonStatus = z.infer<typeof findingComparisonStatusSchema>;

export const findingComparisonSchema = z.object({
  comparisonId: z.string().min(1),
  status: findingComparisonStatusSchema,
  targetKey: z.string().min(1),
  ruleCode: z.string().min(1),
  target: reportNodeRefSchema,
  beforeFinding: reportFindingSchema.nullable(),
  afterFinding: reportFindingSchema.nullable(),
  explanation: z.string().min(1),
  targetRetained: z.boolean(),
  coverageAdequate: z.boolean()
}).strict();

export type FindingComparison = z.infer<typeof findingComparisonSchema>;

export const diffCompatibilitySchema = z.object({
  comparable: z.boolean(),
  reasons: z.array(z.string()),
  viewportMatch: z.boolean(),
  scrollMatch: z.boolean(),
  originMatch: z.boolean(),
  rulesVersionMatch: z.boolean()
}).strict();

export type DiffCompatibility = z.infer<typeof diffCompatibilitySchema>;

export const diffSummarySchema = z.object({
  verifiedFixed: z.number().int().nonnegative(),
  persistent: z.number().int().nonnegative(),
  newFindings: z.number().int().nonnegative(),
  inconclusive: z.number().int().nonnegative(),
  totalBefore: z.number().int().nonnegative(),
  totalAfter: z.number().int().nonnegative(),
  repairIntegrityVerdict: z.enum([
    'verified-repair',
    'unresolved-defects',
    'regressions-introduced',
    'inconclusive-evidence',
    'incompatible-comparison'
  ]),
  /** Plain-language reason for the verdict, e.g. "no repair to verify" for an empty baseline. */
  verdictReason: z.string().min(1).optional()
}).strict();

export type DiffSummary = z.infer<typeof diffSummarySchema>;

export const diffCaptureInfoSchema = z.object({
  captureId: z.string().min(1),
  captureHash: z.string().min(1),
  url: z.string().url(),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  scroll: z.object({ x: z.number(), y: z.number() }).strict(),
  complete: z.boolean(),
  inspectedNodes: z.number().int().nonnegative(),
  actionableFindings: z.number().int().nonnegative()
}).strict();

export type DiffCaptureInfo = z.infer<typeof diffCaptureInfoSchema>;

export const diffReportSchema = z.object({
  schemaVersion: z.literal(DIFF_SCHEMA_VERSION),
  diffId: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  before: diffCaptureInfoSchema,
  after: diffCaptureInfoSchema,
  compatibility: diffCompatibilitySchema,
  targetMatches: z.array(targetMatchSchema),
  findings: z.array(findingComparisonSchema),
  summary: diffSummarySchema
}).strict();

export type DiffReport = z.infer<typeof diffReportSchema>;
