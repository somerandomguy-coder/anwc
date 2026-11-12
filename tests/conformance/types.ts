export type ConformanceFamily =
  | 'text'
  | 'clips-scroll'
  | 'pointer-layers'
  | 'state-semantics'
  | 'identity-change'
  | 'unsupported-performance';

export type ConformanceRole = 'defective' | 'healthy' | 'boundary';

export type ConformanceClassification = 'detected-defect' | 'healthy-pass' | 'unsupported';

/**
 * The case-specific signal a boundary case must find in the capture (LAUNCH L3).
 * `key` always names a `data-anwc-key` in the case HTML.
 */
export type BoundarySignal =
  /** Capture is incomplete, nodes were skipped, and `coverage.reasons` names the cap. */
  | { kind: 'coverage-cap'; reason: string }
  /** Readiness did not settle and `readiness.reasons` names why. */
  | { kind: 'readiness-unsettled'; reason: string }
  /** The keyed node's assessment is `unknown` with a limitation containing `limitation`. */
  | { kind: 'assessment-unknown'; key: string; field: 'clip' | 'text' | 'pointer'; limitation: string }
  /** The keyed node is captured without a box instead of with invented geometry. */
  | { kind: 'boxless-node'; key: string }
  /** The keyed node's pointer grid collapsed below the sample budget (sub-pixel geometry). */
  | { kind: 'pointer-sample-collapse'; key: string; sampleBudget: number }
  /** No runtime signal exists yet. Reported as a known gap, never as a pass. */
  | { kind: 'known-gap'; reason: string };

export type ConformanceOutcome = 'pass' | 'fail' | 'known-gap';

export interface ConformanceCase {
  id: string;
  family: ConformanceFamily;
  role: ConformanceRole;
  title: string;
  description: string;
  expectedRule: string | null;
  expectedClassification: ConformanceClassification;
  /** Required for boundary cases, absent otherwise. */
  boundarySignal?: BoundarySignal;
  html: string;
  /**
   * Optional browser-side preparation after the HTML is mounted. `innerHTML`
   * never runs `<script>`, so cases that need DOM APIs (shadow roots, canvas,
   * FontFace) do it here. Must not touch ANWC code.
   */
  setup?: (page: any) => Promise<void>;
  captureOptions?: { maxNodes?: number; timeoutMs?: number };
  oracle: (page: any) => Promise<{ pass: boolean; details: Record<string, unknown> }>;
}

export interface ConformanceResult {
  id: string;
  family: ConformanceFamily;
  role: ConformanceRole;
  oraclePassed: boolean;
  oracleDetails: Record<string, unknown>;
  classification: ConformanceClassification;
  outcome: ConformanceOutcome;
  anwcPassed: boolean;
  findingsCount: number;
  detectedRules: string[];
  /** Boundary cases only: the declared signal, whether it was found, and the negative control. */
  boundary?: {
    signal: BoundarySignal;
    present: boolean;
    evidence: string;
    /** True when the same capture with only this signal removed fails the check. */
    negativeControlFails: boolean;
    /** What the pre-L3 all-node fallback would have said (it is true by design). */
    legacyFallback: boolean;
  };
  /** Stylesheets present at capture time that did not come from the case HTML. */
  foreignStyleSheets: number;
  complete: boolean;
  paintVisibility: 'unknown' | 'known';
  inspectedNodes: number;
  skippedNodes: number;
  durationMs: number;
  notes: string;
}

export interface FamilyStats {
  total: number;
  passed: number;
  failed: number;
  knownGaps: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface ConformanceMatrixReport {
  schemaVersion: '0.2';
  generatedAt: string;
  totalCases: number;
  defectiveCount: number;
  healthyCount: number;
  boundaryCount: number;
  passedCount: number;
  failedCount: number;
  knownGapCount: number;
  knownGapIds: string[];
  /** Every case passed and every oracle passed. False while any known gap remains. */
  passedAll: boolean;
  familyBreakdown: Record<ConformanceFamily, FamilyStats>;
  cases: ConformanceResult[];
}
