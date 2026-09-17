export type ConformanceFamily =
  | 'text'
  | 'clips-scroll'
  | 'pointer-layers'
  | 'state-semantics'
  | 'identity-change'
  | 'unsupported-performance';

export type ConformanceRole = 'defective' | 'healthy' | 'boundary';

export type ConformanceClassification = 'detected-defect' | 'healthy-pass' | 'unsupported';

export interface ConformanceCase {
  id: string;
  family: ConformanceFamily;
  role: ConformanceRole;
  title: string;
  description: string;
  expectedRule: string | null;
  expectedClassification: ConformanceClassification;
  html: string;
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
  anwcPassed: boolean;
  findingsCount: number;
  detectedRules: string[];
  complete: boolean;
  paintVisibility: 'unknown' | 'known';
  inspectedNodes: number;
  skippedNodes: number;
  durationMs: number;
  notes: string;
}

export interface ConformanceMatrixReport {
  schemaVersion: '0.1';
  generatedAt: string;
  totalCases: number;
  defectiveCount: number;
  healthyCount: number;
  boundaryCount: number;
  passedAll: boolean;
  familyBreakdown: Record<
    ConformanceFamily,
    { total: number; passed: number; falsePositives: number; falseNegatives: number }
  >;
  cases: ConformanceResult[];
}
