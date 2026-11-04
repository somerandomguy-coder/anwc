import type { Finding, Rect, Snapshot, SourceRef } from '@anwc/protocol';
import type { Report, ReportFinding } from '@anwc/report';

export type AnyFinding = Finding | ReportFinding;

export type FindingFilterType = 'all' | 'critical' | 'pointer' | 'clipped' | 'actionable';

/**
 * Filters findings based on category or severity filter.
 */
export function filterFindings<T extends AnyFinding = Finding>(
  findings: T[] | null | undefined,
  filterType: FindingFilterType
): T[] {
  if (!findings || !Array.isArray(findings)) {
    return [];
  }

  switch (filterType) {
    case 'all':
      return [...findings];
    case 'critical':
      return findings.filter((f) => f.severity === 'error');
    case 'pointer':
      return findings.filter((f) => {
        const codeMatch = f.code.toUpperCase().includes('POINTER');
        const kind = (f.evidence as { kind?: string } | undefined)?.kind;
        return codeMatch || kind === 'pointer-blocked';
      });
    case 'clipped':
      return findings.filter((f) => {
        const codeUpper = f.code.toUpperCase();
        const codeMatch = codeUpper.includes('CLIP') || codeUpper.includes('OVERFLOW');
        const kind = (f.evidence as { kind?: string } | undefined)?.kind;
        const kindMatch = kind === 'clipped-by-ancestor' ||
          kind === 'horizontal-overflow' ||
          kind === 'text-clipped' ||
          kind === 'text-line-budget-exceeded';
        return codeMatch || kindMatch;
      });
    case 'actionable':
      return findings.filter((f) => !f.acknowledged && (f.severity === 'error' || f.severity === 'warning'));
    default:
      return [...findings];
  }
}

/**
 * Formats a source location reference into file:line string.
 * Example: 'examples/shop/src/main.tsx:128'
 */
export function formatSourceReference(source?: SourceRef | null): string {
  if (!source || !source.file) {
    return '';
  }
  if (source.line !== undefined && source.line !== null) {
    return `${source.file}:${source.line}`;
  }
  return source.file;
}

export interface ReachabilityMetric {
  percent: number;
  label: string;
  tested: number;
  blocked: number;
}

/**
 * Computes pointer reachability percentage and label for pointer-blocked findings.
 * Returns null if the finding is not pointer-related.
 */
export function computeReachabilityMetric(
  finding?: AnyFinding | null
): ReachabilityMetric | null {
  if (!finding || !finding.evidence) {
    return null;
  }

  const ev = finding.evidence as { kind?: string; tested?: number; blocked?: number };
  if (ev.kind === 'pointer-blocked' || (typeof ev.tested === 'number' && typeof ev.blocked === 'number')) {
    const tested = Math.max(0, ev.tested ?? 0);
    const blocked = Math.max(0, ev.blocked ?? 0);
    const reachable = Math.max(0, tested - blocked);
    const percent = tested > 0 ? Math.round((reachable / tested) * 100) : 0;
    const label = `${percent}% reachable (${blocked}/${tested} blocked)`;
    return {
      percent,
      label,
      tested,
      blocked
    };
  }

  return null;
}

/**
 * Extracts a flat array of findings from a Report, Snapshot, or raw array.
 */
export function extractFindings(
  input?: Report | Snapshot | AnyFinding[] | null
): AnyFinding[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  if ('groups' in input && Array.isArray((input as Report).groups)) {
    return (input as Report).groups.flatMap((g) => g.findings);
  }
  if ('findings' in input && Array.isArray((input as Snapshot).findings)) {
    return (input as Snapshot).findings;
  }
  return [];
}

/**
 * Formats bounding box rect into concise readable string.
 */
export function formatBox(box?: Rect | null): string {
  if (!box) {
    return 'none';
  }
  return `x:${Math.round(box.x)} y:${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}`;
}
