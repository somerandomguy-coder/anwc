/**
 * Visual encoding for the studio x-ray (Phase 4 P11).
 *
 * Pure functions only: numbering, rule categories, box roles, hit-sample
 * classes, the "why this is reported" line, the legend sentence, the
 * viewport-alignment guard and keyboard mapping. Components render what these
 * return, so the behaviour is testable without a DOM.
 */
import type { Finding, Measurement, Rect, Snapshot, SourceRef } from '@anwc/protocol';
import type { AnyFinding } from './drawer-utils.js';

/* -------------------------------------------------------------------------- */
/* Rule categories                                                             */
/* -------------------------------------------------------------------------- */

export type RuleCategory = 'pointer' | 'clipping' | 'overflow' | 'text' | 'visibility' | 'other';

export const RULE_CATEGORIES: ReadonlyArray<{ id: RuleCategory; label: string }> = [
  { id: 'pointer', label: 'Pointer' },
  { id: 'clipping', label: 'Clipping' },
  { id: 'overflow', label: 'Overflow' },
  { id: 'text', label: 'Text' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'other', label: 'Other' }
];

const CODE_CATEGORY: Record<string, RuleCategory> = {
  POINTER_BLOCKED_AT_SAMPLES: 'pointer',
  POINTER_PARTIALLY_BLOCKED: 'pointer',
  CLIPPED_BY_ANCESTOR: 'clipping',
  HORIZONTAL_OVERFLOW: 'overflow',
  TEXT_CLIPPED: 'text',
  TEXT_LINE_BUDGET_EXCEEDED: 'text',
  EXPECTED_VISIBLE_BUT_HIDDEN: 'visibility',
  OUTSIDE_VIEWPORT: 'visibility',
  UNSUPPORTED_VISIBILITY: 'visibility'
};

/** Maps a finding to one rule category, by code first and evidence kind second. */
export function categorizeFinding(finding: Pick<AnyFinding, 'code' | 'evidence'>): RuleCategory {
  const byCode = CODE_CATEGORY[finding.code];
  if (byCode) return byCode;
  switch (finding.evidence?.kind) {
    case 'pointer-blocked':
      return 'pointer';
    case 'clipped-by-ancestor':
      return 'clipping';
    case 'horizontal-overflow':
      return 'overflow';
    case 'text-clipped':
    case 'text-line-budget-exceeded':
      return 'text';
    case 'expected-visible-but-hidden':
      return 'visibility';
    default:
      return 'other';
  }
}

export function countByCategory(findings: readonly AnyFinding[]): Record<RuleCategory, number> {
  const counts: Record<RuleCategory, number> = { pointer: 0, clipping: 0, overflow: 0, text: 0, visibility: 0, other: 0 };
  for (const f of findings) counts[categorizeFinding(f)] += 1;
  return counts;
}

export const ALL_CATEGORIES: ReadonlySet<RuleCategory> = new Set(RULE_CATEGORIES.map((c) => c.id));

/* -------------------------------------------------------------------------- */
/* Numbering and the shared filter                                             */
/* -------------------------------------------------------------------------- */

/**
 * Assigns 1-based numbers in list order. Numbers are computed over the
 * unfiltered list so a finding keeps its number while filters change.
 */
export function numberFindings(findings: readonly Pick<AnyFinding, 'findingId'>[]): Map<string, number> {
  const numbering = new Map<string, number>();
  for (const f of findings) {
    if (!numbering.has(f.findingId)) numbering.set(f.findingId, numbering.size + 1);
  }
  return numbering;
}

export interface FindingViewFilter {
  categories: ReadonlySet<RuleCategory>;
  query: string;
}

function sourceOf(finding: AnyFinding): SourceRef | null {
  if ('target' in finding && finding.target) return finding.target.source ?? null;
  return 'source' in finding ? finding.source : null;
}

/** Findings that pass the category checkboxes and the text filter, in list order. */
export function applyFindingFilter<T extends AnyFinding>(findings: readonly T[], filter: FindingViewFilter): T[] {
  const q = filter.query.trim().toLowerCase();
  return findings.filter((f) => {
    if (!filter.categories.has(categorizeFinding(f))) return false;
    if (!q) return true;
    const src = sourceOf(f);
    const label = 'target' in f && f.target ? `${f.target.tag} ${f.target.label}` : '';
    const haystack = [f.code, f.message, f.findingId, src?.file ?? '', label].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** The findings whose boxes the overlay draws: the filtered list, or only the isolated one. */
export function overlayFindingIds(visibleIds: readonly string[], isolatedId: string | null): string[] {
  if (isolatedId && visibleIds.includes(isolatedId)) return [isolatedId];
  return [...visibleIds];
}

/* -------------------------------------------------------------------------- */
/* Box roles                                                                   */
/* -------------------------------------------------------------------------- */

export type BoxRole = 'target' | 'blocker' | 'clip' | 'context';

export interface RoleEncoding {
  role: BoxRole;
  label: string;
  /** CSS custom property holding the stroke colour. */
  colorVar: string;
  /** SVG stroke-dasharray; undefined means a solid line. */
  dash: string | undefined;
  /** Human name of the line style, so the legend works without colour. */
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
  strokeWidth: number;
  meaning: string;
}

export const ROLE_ENCODING: Record<BoxRole, RoleEncoding> = {
  target: {
    role: 'target', label: 'Target', colorVar: '--anwc-role-target', dash: undefined, lineStyle: 'solid', strokeWidth: 2.5,
    meaning: 'the element the finding is about'
  },
  blocker: {
    role: 'blocker', label: 'Blocker', colorVar: '--anwc-role-blocker', dash: '8 4', lineStyle: 'dashed', strokeWidth: 2.5,
    meaning: 'an element that a hit-test sample on the target landed on instead'
  },
  clip: {
    role: 'clip', label: 'Clipping ancestor', colorVar: '--anwc-role-clip', dash: '1.5 3.5', lineStyle: 'dotted', strokeWidth: 2.5,
    meaning: 'an ancestor whose overflow rectangle cuts the target'
  },
  context: {
    role: 'context', label: 'Context', colorVar: '--anwc-role-context', dash: '6 3 1.5 3', lineStyle: 'dash-dot', strokeWidth: 1,
    meaning: 'another captured element, drawn for orientation only'
  }
};

export interface RoleBox {
  role: Exclude<BoxRole, 'context'> | 'context';
  nodeId: string;
  box: Rect;
  tag: string;
  label: string;
}

/**
 * Boxes that belong to one finding, each with a role taken from the measured
 * evidence: the finding node is the target, `pointer-blocked.blockerNodeIds`
 * are blockers, `clipped-by-ancestor.ancestorNodeIds` are clipping ancestors,
 * and any other `relatedNodeIds` are context. Nodes without a box are skipped.
 */
export function findingRoleBoxes(snapshot: Snapshot, finding: Finding | AnyFinding): RoleBox[] {
  const nodes = new Map<string, Measurement>(snapshot.nodes.map((n) => [n.nodeId, n]));
  const targetId = 'nodeId' in finding ? finding.nodeId : finding.target.nodeId;
  const roleOf = new Map<string, RoleBox['role']>();
  roleOf.set(targetId, 'target');
  const ev = finding.evidence;
  if (ev.kind === 'pointer-blocked') {
    for (const id of ev.blockerNodeIds) if (!roleOf.has(id)) roleOf.set(id, 'blocker');
  }
  if (ev.kind === 'clipped-by-ancestor') {
    for (const id of ev.ancestorNodeIds) if (!roleOf.has(id)) roleOf.set(id, 'clip');
  }
  const related = 'relatedNodeIds' in finding ? finding.relatedNodeIds : finding.relatedNodes.map((n) => n.nodeId);
  for (const id of related) if (!roleOf.has(id)) roleOf.set(id, 'context');

  const out: RoleBox[] = [];
  for (const [nodeId, role] of roleOf) {
    const node = nodes.get(nodeId);
    if (!node?.box) continue;
    out.push({ role, nodeId, box: node.box, tag: node.tag, label: node.label });
  }
  // Draw order: context under clip under blocker under target.
  const order: Record<RoleBox['role'], number> = { context: 0, clip: 1, blocker: 2, target: 3 };
  return out.sort((a, b) => order[a.role] - order[b.role]);
}

/* -------------------------------------------------------------------------- */
/* Hit samples                                                                 */
/* -------------------------------------------------------------------------- */

export type SampleClass = 'reachable' | 'blocked' | 'clipped' | 'no-hit';

export const SAMPLE_ENCODING: Record<SampleClass, { label: string; colorVar: string; shape: 'dot' | 'cross' | 'ring' | 'square'; meaning: string }> = {
  reachable: { label: 'Reachable', colorVar: '--anwc-sample-reachable', shape: 'dot', meaning: 'the hit test landed on the target or its descendant' },
  blocked: { label: 'Blocked', colorVar: '--anwc-sample-blocked', shape: 'cross', meaning: 'the hit test landed on another element' },
  clipped: { label: 'Clipped', colorVar: '--anwc-sample-clipped', shape: 'ring', meaning: 'the point lies outside the target’s measured clip rectangle' },
  'no-hit': { label: 'No hit', colorVar: '--anwc-sample-nohit', shape: 'square', meaning: 'the hit test returned no element' }
};

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/**
 * Classifies one recorded hit sample. The raw result comes from the browser
 * hit test; "clipped" is derived: the sample point lies outside the target's
 * known clip intersection, so an ancestor's overflow hides that point.
 */
export function classifySample(
  sample: { x: number; y: number; result: string },
  targetNode?: Pick<Measurement, 'clip'> | null
): SampleClass {
  if (sample.result === 'target-or-descendant') return 'reachable';
  const clip = targetNode?.clip;
  if (clip && clip.status !== 'unknown') {
    const inter = clip.value.intersection;
    if (clip.value.ancestors.length > 0 && (inter === null || !inside(inter, sample.x, sample.y))) return 'clipped';
  }
  if (sample.result === 'blocked') return 'blocked';
  return 'no-hit';
}

/* -------------------------------------------------------------------------- */
/* "Why this is reported"                                                      */
/* -------------------------------------------------------------------------- */

export interface NodeInfo {
  tag: string;
  label: string;
  source: SourceRef | null;
}

export type NodeLookup = (nodeId: string) => NodeInfo | undefined;

export function nodeLookupFromSnapshot(snapshot?: Snapshot | null): NodeLookup {
  const nodes = new Map<string, Measurement>((snapshot?.nodes ?? []).map((n) => [n.nodeId, n]));
  return (id) => {
    const n = nodes.get(id);
    return n ? { tag: n.tag, label: n.label, source: n.source } : undefined;
  };
}

function describe(id: string, lookup: NodeLookup, report?: readonly { nodeId: string; tag: string; label: string; source: SourceRef | null }[]): string {
  const fromReport = report?.find((n) => n.nodeId === id);
  const info: NodeInfo | undefined = fromReport ?? lookup(id);
  if (!info || info.tag === 'unknown') return `node ${id}`;
  const label = info.label ? ` "${info.label.length > 40 ? `${info.label.slice(0, 39)}…` : info.label}"` : '';
  const src = info.source ? ` at ${info.source.file}:${info.source.line}` : '';
  return `<${info.tag}>${label}${src}`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * One sentence derived only from the finding's measured evidence (and the
 * nodes it names). It never adds a cause the capture did not measure.
 */
export function whyReported(finding: AnyFinding, lookup: NodeLookup = () => undefined): string {
  const ev = finding.evidence;
  const blockers = 'blockers' in finding ? finding.blockers : undefined;
  const clips = 'clipAncestors' in finding ? finding.clipAncestors : undefined;
  switch (ev.kind) {
    case 'pointer-blocked': {
      const who = ev.blockerNodeIds.length > 0
        ? ev.blockerNodeIds.map((id) => describe(id, lookup, blockers)).join(', ')
        : 'an element outside the captured set';
      return `${ev.blocked} of ${ev.tested} hit-test sample${ev.tested === 1 ? '' : 's'} inside the target landed on ${who} instead of the target.`;
    }
    case 'clipped-by-ancestor': {
      const who = ev.ancestorNodeIds.length > 0
        ? ev.ancestorNodeIds.map((id) => describe(id, lookup, clips)).join(', ')
        : 'an ancestor';
      return `Only ${pct(ev.boxFraction)} of the target box is inside the overflow rectangle of ${who}.`;
    }
    case 'horizontal-overflow':
      return `scrollWidth ${ev.scrollWidth}px is larger than clientWidth ${ev.clientWidth}px, so ${ev.scrollWidth - ev.clientWidth}px of content extends past the box.`;
    case 'text-clipped':
      return `${ev.clippedFragmentCount} direct-text fragment${ev.clippedFragmentCount === 1 ? '' : 's'} across ${ev.lineCount} line${ev.lineCount === 1 ? '' : 's'} fall outside the element's visible area.`;
    case 'text-line-budget-exceeded':
      return `The text renders ${ev.observedLines} lines but its declared budget is ${ev.maxLines}.`;
    case 'expected-visible-but-hidden':
      return `The element is declared ${ev.expectedCurrent} but was measured hidden (${ev.hiddenReasons.join(', ') || 'no reason recorded'}).`;
    case 'generic': {
      const d = ev.details as Record<string, unknown>;
      if (finding.code === 'OUTSIDE_VIEWPORT' && typeof d.boxFraction === 'number') {
        return `${pct(d.boxFraction)} of the element's box intersects the viewport, although the element declares that it is expected to be visible or interactive.`;
      }
      if (finding.code === 'UNSUPPORTED_VISIBILITY') {
        return `The element has a visibility expectation (${String(d.expectedCurrent ?? 'unknown')}) but its clipping could not be measured (method: ${String(d.method ?? 'unknown')}).`;
      }
      const parts = Object.entries(d).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
      return parts.length > 0 ? `Measured ${parts.join(', ')}.` : 'The rule fired without recorded measurement details.';
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Legend sentence                                                             */
/* -------------------------------------------------------------------------- */

export interface LegendContext {
  totalFindings: number;
  visibleFindings: number;
  isolated?: { number: number; code: string; roles: ReadonlySet<BoxRole> } | null;
}

/** One sentence that says what the boxes mean for the current view. */
export function legendSentence(ctx: LegendContext): string {
  if (ctx.totalFindings === 0) {
    return 'This capture has no findings, so only captured elements (context) and hit samples are drawn.';
  }
  if (ctx.visibleFindings === 0) {
    return `No finding matches the current filter, so no finding boxes are drawn; use Show all to reset.`;
  }
  if (ctx.isolated) {
    const parts = ['the solid box is its target'];
    if (ctx.isolated.roles.has('blocker')) parts.push('dashed boxes are where its hit-test samples landed instead');
    if (ctx.isolated.roles.has('clip')) parts.push('dotted boxes are the ancestors that clip it');
    if (ctx.isolated.roles.has('context')) parts.push('dash-dot boxes are related context');
    const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `Showing only finding ${ctx.isolated.number} (${ctx.isolated.code}): ${joined}.`;
  }
  const scope = ctx.visibleFindings === ctx.totalFindings ? `all ${ctx.totalFindings}` : `${ctx.visibleFindings} of ${ctx.totalFindings}`;
  return `Showing ${scope} finding${ctx.totalFindings === 1 ? '' : 's'}: each numbered box is a finding's target and matches the card with the same number.`;
}

/* -------------------------------------------------------------------------- */
/* Viewport alignment guard                                                    */
/* -------------------------------------------------------------------------- */

export interface ViewportSize {
  width: number;
  height: number;
}

export type ViewportAlignment =
  | { aligned: true }
  | { aligned: false; capture: ViewportSize; frame: ViewportSize; message: string };

/**
 * The overlay is drawn in capture coordinates. If the frame shows the page at
 * another size, every box would be misplaced, so the caller must not draw.
 */
export function checkViewportAlignment(capture: ViewportSize, frame?: ViewportSize | null): ViewportAlignment {
  if (!frame) return { aligned: true };
  if (Math.round(capture.width) === Math.round(frame.width) && Math.round(capture.height) === Math.round(frame.height)) {
    return { aligned: true };
  }
  return {
    aligned: false,
    capture,
    frame,
    message:
      `Overlay not drawn: the page is shown at ${frame.width} × ${frame.height} but this capture was taken at ` +
      `${capture.width} × ${capture.height}, so the boxes would be misaligned. Inspect again at this viewport, ` +
      `or switch the viewport back to ${capture.width} × ${capture.height}.`
  };
}

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                    */
/* -------------------------------------------------------------------------- */

export type StudioKeyAction = 'next' | 'prev' | 'focus-filter' | 'clear' | null;

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Tag name of the focused element, e.g. INPUT. */
  targetTag?: string | null;
  targetEditable?: boolean;
}

/** j/k move between findings, `/` focuses the filter, Esc clears. Typing in a field is left alone except Esc. */
export function studioKeyAction(e: KeyLike): StudioKeyAction {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'Escape') return 'clear';
  const tag = (e.targetTag ?? '').toUpperCase();
  const typing = e.targetEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (typing) return null;
  if (e.key === 'j') return 'next';
  if (e.key === 'k') return 'prev';
  if (e.key === '/') return 'focus-filter';
  return null;
}

/** Moves the selection through the visible list; wraps at both ends. */
export function stepFinding(visibleIds: readonly string[], currentId: string | null, delta: 1 | -1): string | null {
  if (visibleIds.length === 0) return null;
  const at = currentId ? visibleIds.indexOf(currentId) : -1;
  if (at === -1) return delta === 1 ? visibleIds[0]! : visibleIds[visibleIds.length - 1]!;
  return visibleIds[(at + delta + visibleIds.length) % visibleIds.length]!;
}
