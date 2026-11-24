import type { Assessment, LastObserved, Measurement, RawCapture, SourceRef } from '@anwc/protocol';
import { observeAncestorClip } from './clipping.js';
import { observePointer } from './hit-test.js';
import { observeText } from './text.js';

export type CaptureOptions = {
  maxNodes?: number;
  maxSamplesPerNode?: number;
  textLimit?: number;
  timeoutMs?: number;
};

export type RuntimeConfiguration = {
  sourceLookup?: (siteId: string) => SourceRef | null;
  runtimeVersion?: string;
};

type RuntimeState = {
  sessionId: string;
  nextNodeNumber: number;
  nextCaptureNumber: number;
  ids: WeakMap<Element, string>;
  configuration: RuntimeConfiguration;
};

const states = new WeakMap<Document, RuntimeState>();
const defaultLimits = { maxNodes: 1_500, maxSamplesPerNode: 25, textLimit: 160, timeoutMs: 1_000 };
const nonInspectableTags = new Set(['base', 'head', 'link', 'meta', 'noscript', 'script', 'style', 'template', 'title']);

function identifier(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function stateFor(document: Document): RuntimeState {
  const existing = states.get(document);
  if (existing) return existing;
  const next: RuntimeState = {
    sessionId: identifier('session'),
    nextNodeNumber: 1,
    nextCaptureNumber: 1,
    ids: new WeakMap(),
    configuration: { runtimeVersion: '0.0.0' }
  };
  states.set(document, next);
  return next;
}

function nodeId(element: Element, state: RuntimeState): string {
  const existing = state.ids.get(element);
  if (existing) return existing;
  const next = `n${state.nextNodeNumber++}`;
  state.ids.set(element, next);
  return next;
}

function known<T>(value: T, method: string, limitations: string[] = []): Assessment<T> {
  return { status: 'known', value, method, limitations };
}

function unknown<T>(method: string, limitations: string[]): Assessment<T> {
  return { status: 'unknown', value: null, method, limitations };
}

function toRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function intersection(a: DOMRect, b: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } | null {
  const left = Math.max(a.left, b.x);
  const top = Math.max(a.top, b.y);
  const right = Math.min(a.right, b.x + b.width);
  const bottom = Math.min(a.bottom, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxFraction(box: DOMRect, visible: { width: number; height: number } | null): number {
  const area = box.width * box.height;
  if (area <= 0 || !visible) return 0;
  return (visible.width * visible.height) / area;
}

function normalizedText(value: string, limit: number): { label: string; truncated: boolean } {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > limit ? { label: compact.slice(0, limit), truncated: true } : { label: compact, truncated: false };
}

function labelFor(element: Element, limit: number): Pick<Measurement, 'label' | 'labelMethod' | 'textTruncated'> {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const text = normalizedText(ariaLabel, limit);
    return { label: text.label, textTruncated: text.truncated, labelMethod: 'aria-label' };
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const joined = labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
    const text = normalizedText(joined, limit);
    return { label: text.label, textTruncated: text.truncated, labelMethod: text.label ? 'aria-labelledby' : 'none' };
  }
  const text = normalizedText(element.textContent ?? '', limit);
  return { label: text.label, textTruncated: text.truncated, labelMethod: text.label ? 'text' : 'none' };
}

/** Whether `content-visibility` applies: it needs a principal box that size containment applies to. */
function contentVisibilityApplies(display: string): boolean {
  if (display === 'none' || display === 'contents' || display === 'inline' || display.startsWith('ruby')) return false;
  return !display.startsWith('table-') || display === 'table-cell' || display === 'table-caption';
}

function renderState(element: Element): Measurement['render'] {
  const hidden: string[] = [];
  let opacityZero = false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none') hidden.push('display:none');
    if (Number(style.opacity) === 0) opacityZero = true;
    // Skips the contents of a box, never the box itself. Not inherited, so a descendant cannot undo it.
    if (current !== element && style.contentVisibility === 'hidden' && contentVisibilityApplies(style.display)) hidden.push('content-visibility:hidden');
  }
  // `visibility` inherits, but a descendant can explicitly restore `visible`.
  // The target's computed value already reflects that CSS inheritance/override rule.
  const visibility = getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') hidden.push(`visibility:${visibility}`);
  return {
    hasBox: element.getClientRects().length > 0,
    cssHiddenReasons: [...new Set(hidden)],
    effectiveOpacityZero: known(opacityZero, 'computed-style-ancestry')
  };
}

function isInteractiveCandidate(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (['button', 'select', 'textarea', 'summary'].includes(tag)) return true;
  if (tag === 'a' && element.hasAttribute('href')) return true;
  if (tag === 'input' && (element as HTMLInputElement).type !== 'hidden') return true;
  const role = element.getAttribute('role');
  return role === 'button' || role === 'link' || role === 'checkbox' || role === 'menuitem' || element.hasAttribute('onclick');
}

function isDisabled(element: Element): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}

function isInert(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.hasAttribute('inert')) return true;
  }
  try {
    const modals = element.ownerDocument.querySelectorAll('dialog:modal');
    if (modals.length > 0 && ![...modals].some((dialog) => dialog.contains(element))) {
      return true;
    }
  } catch {
    // If dialog:modal selector is unsupported by browser engine, ignore
  }
  return false;
}

function sourceFor(element: Element, lookup: RuntimeConfiguration['sourceLookup']): { siteId: string | null; source: SourceRef | null } {
  const siteId = element.getAttribute('data-anwc-site');
  return { siteId, source: siteId && lookup ? lookup(siteId) : null };
}

function nearestCapturedParent(element: Element, selected: Set<Element>, state: RuntimeState): string | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) if (selected.has(parent)) return nodeId(parent, state);
  return null;
}

function discoverElements(document: Document): Element[] {
  return [...document.querySelectorAll('*')].filter((element) => !nonInspectableTags.has(element.tagName.toLowerCase()) && !element.hasAttribute('data-anwc-internal'));
}

function measure(element: Element, selected: Set<Element>, state: RuntimeState, textLimit: number, maxSamplesPerNode: number): Measurement {
  const rect = element.getBoundingClientRect();
  const hasBox = element.getClientRects().length > 0;
  const box = hasBox ? toRect(rect) : null;
  const viewport = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const visible = hasBox ? intersection(rect, viewport) : null;
  const { label, labelMethod, textTruncated } = labelFor(element, textLimit);
  const { siteId, source } = sourceFor(element, state.configuration.sourceLookup);
  const clip = observeAncestorClip(element, box, (candidate) => selected.has(candidate) ? nodeId(candidate, state) : null);
  const role = element.getAttribute('role');
  const semanticKey = element.getAttribute('data-anwc-key');
  const expected = element.getAttribute('data-anwc-expect');
  const maxLinesRaw = element.getAttribute('data-anwc-max-lines');
  const maxLines = maxLinesRaw && /^\d+$/.test(maxLinesRaw) && Number(maxLinesRaw) > 0 ? Number(maxLinesRaw) : null;
  const allow = (element.getAttribute('data-anwc-allow') ?? '').split(/\s+/).filter((value): value is 'horizontal-scroll' | 'text-truncation' => value === 'horizontal-scroll' || value === 'text-truncation');
  const interaction = { candidate: isInteractiveCandidate(element), disabled: isDisabled(element), inert: isInert(element), pointerEvents: getComputedStyle(element).pointerEvents };

  return {
    nodeId: nodeId(element, state), siteId, source, parentNodeId: nearestCapturedParent(element, selected, state),
    tag: element.tagName.toLowerCase(), semanticKey, role, label, labelMethod, textTruncated, box,
    render: renderState(element),
    viewport: known({ intersection: visible, boxFraction: hasBox ? boxFraction(rect, visible) : 0 }, 'viewport-rectangle'),
    clip,
    overflow: hasBox ? {
      clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
      scrollableX: element.scrollWidth > element.clientWidth, scrollableY: element.scrollHeight > element.clientHeight
    } : null,
    text: observeText(element, clip),
    pointer: observePointer(element, box, interaction.candidate, selected, (candidate) => nodeId(candidate, state), maxSamplesPerNode),
    interaction,
    paintVisibility: unknown('v0', ['Paint visibility is unsupported in v0.']),
    intent: { expectedCurrent: expected === 'visible' || expected === 'interactive' ? expected : null, maxLines, allow }
  };
}

type GeometryObservation = Map<Element, { x: number; y: number; width: number; height: number }>;

function readinessCandidates(): Element[] {
  return discoverElements(document).filter((element) => isInteractiveCandidate(element) || element.hasAttribute('data-anwc-expect'));
}

function observeGeometry(): GeometryObservation {
  return new Map(readinessCandidates().map((element) => {
    const rect = element.getBoundingClientRect();
    return [element, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
  }));
}

/** Elements that appeared, disappeared or moved/resized by more than 1 CSS px between two frames. */
function movingElements(before: GeometryObservation, after: GeometryObservation): Element[] {
  const moving = [...before.keys()].filter((element) => !after.has(element));
  for (const [element, next] of after) {
    const previous = before.get(element);
    if (!previous || Math.abs(next.x - previous.x) > 1 || Math.abs(next.y - previous.y) > 1 || Math.abs(next.width - previous.width) > 1 || Math.abs(next.height - previous.height) > 1) moving.push(element);
  }
  return moving;
}

function nextFrameBefore(deadline: number): Promise<boolean> {
  return new Promise((resolve) => {
    let frame = 0;
    const remaining = Math.max(0, deadline - performance.now());
    const timeout = window.setTimeout(() => { cancelAnimationFrame(frame); resolve(false); }, remaining);
    frame = requestAnimationFrame(() => { clearTimeout(timeout); resolve(performance.now() <= deadline); });
  });
}

function fontsReadyBefore(deadline: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => finish(false), Math.max(0, deadline - performance.now()));
    const finish = (ready: boolean) => { clearTimeout(timeout); resolve(ready); };
    void document.fonts.ready.then(() => finish(true), () => finish(false));
  });
}

type Readiness = {
  settled: boolean;
  waitMs: number;
  reasons: string[];
  /** Unsettled only: what was last seen. `moving` is empty when no movement was observed before the timeout. */
  last?: { phase: LastObserved['phase']; stableFrames: number; moving: Element[] };
};

async function waitForReadiness(timeoutMs: number): Promise<Readiness> {
  const started = performance.now();
  const deadline = started + timeoutMs;
  const finish = (reasons: string[], last?: Readiness['last']): Readiness => ({
    settled: last === undefined, waitMs: Math.round(performance.now() - started), reasons, ...(last ? { last } : {})
  });
  const fonts = { phase: 'fonts' as const, stableFrames: 0, moving: [] };
  if (!document.fonts) return finish(['font readiness API is unavailable'], fonts);

  const fontsReady = await fontsReadyBefore(deadline);
  if (!fontsReady) return finish(['font readiness did not complete before timeout'], fonts);

  let previous = observeGeometry();
  let stableFrames = 0;
  let moving: Element[] = [];
  while (stableFrames < 2) {
    if (!await nextFrameBefore(deadline)) return finish(['fonts ready', 'geometry remained unstable before timeout'], { phase: 'geometry', stableFrames, moving });
    const current = observeGeometry();
    const moved = movingElements(previous, current);
    if (moved.length > 0) moving = moved;
    stableFrames = moved.length === 0 ? stableFrames + 1 : 0;
    previous = current;
  }
  return finish(['fonts ready', 'geometry stable within 1 CSS px for two successive frames']);
}

const MAX_MOVING_IDS = 20;

/** Why the content behind this element cannot be inspected, if it is an unsupported boundary with something behind it. */
function uninspectedBoundary(element: Element): string | null {
  if (element.shadowRoot && element.shadowRoot.childElementCount > 0) {
    const rendered = element.getClientRects().length > 0 || getComputedStyle(element).display === 'contents';
    if (rendered) return 'open shadow root content is not inspected';
  }
  if (['iframe', 'frame', 'object', 'embed'].includes(element.tagName.toLowerCase())) {
    const rect = element.getBoundingClientRect();
    // A frame without area (a hidden tracking or bridge frame) shows nothing to inspect.
    if (rect.width > 0 && rect.height > 0) return 'embedded frame content is not inspected';
  }
  return null;
}

export function configureRuntime(configuration: RuntimeConfiguration): void {
  const state = stateFor(document);
  state.configuration = { ...state.configuration, ...configuration };
}

export async function capture(options: CaptureOptions = {}): Promise<RawCapture> {
  const limits = { ...defaultLimits, ...options };
  if (!Number.isInteger(limits.maxSamplesPerNode) || limits.maxSamplesPerNode < 1 || limits.maxSamplesPerNode > defaultLimits.maxSamplesPerNode) {
    throw new RangeError(`maxSamplesPerNode must be an integer from 1 to ${defaultLimits.maxSamplesPerNode}.`);
  }
  const state = stateFor(document);
  const started = performance.now();
  const readiness = await waitForReadiness(limits.timeoutMs);
  const discovered = discoverElements(document);
  const selected = discovered.slice(0, limits.maxNodes);
  const selectedSet = new Set(selected);
  const nodes = selected.map((element) => measure(element, selectedSet, state, limits.textLimit, limits.maxSamplesPerNode));

  // Partial evidence (P05): mark the nodes whose subtree or geometry was not fully observed.
  const capped = discovered.length > selected.length;
  const reasons = capped ? ['max node cap reached'] : [];
  const truncated = new Set<Element>();
  for (const element of discovered.slice(selected.length)) {
    // The cut point: the nearest captured ancestor of a skipped element.
    let parent = element.parentElement;
    while (parent && !selectedSet.has(parent)) parent = parent.parentElement;
    if (parent) truncated.add(parent);
  }
  for (const element of selected) {
    const boundary = uninspectedBoundary(element);
    if (!boundary) continue;
    truncated.add(element);
    if (!reasons.includes(boundary)) reasons.push(boundary);
  }
  let lastObserved: LastObserved | undefined;
  if (readiness.last) {
    const { phase, stableFrames, moving } = readiness.last;
    // With no identified mover, any geometry may still change, so every node is affected.
    const affected = moving.length === 0 ? selected : selected.filter((element) => moving.some((mover) => mover === element || mover.contains(element)));
    for (const element of affected) truncated.add(element);
    lastObserved = {
      phase, stableFrames, movingCount: moving.length,
      movingNodeIds: moving.filter((element) => selectedSet.has(element)).slice(0, MAX_MOVING_IDS).map((element) => nodeId(element, state))
    };
  }
  selected.forEach((element, index) => { if (truncated.has(element)) nodes[index]!.truncated = true; });
  const scenarioElement = document.querySelector('[data-anwc-scenario]');

  return {
    schemaVersion: '0.1',
    sessionId: state.sessionId,
    captureId: `${state.sessionId}:capture-${state.nextCaptureNumber++}`,
    capturedAt: new Date().toISOString(),
    page: {
      url: location.href, title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight }, scroll: { x: window.scrollX, y: window.scrollY },
      devicePixelRatio: window.devicePixelRatio, visualViewportScale: window.visualViewport?.scale ?? 1,
      scenario: scenarioElement?.getAttribute('data-anwc-scenario') ?? null
    },
    environment: { browser: navigator.userAgent, browserVersion: navigator.userAgent, compilerVersion: null, runtimeVersion: state.configuration.runtimeVersion ?? '0.0.0' },
    readiness: { settled: readiness.settled, waitMs: readiness.waitMs, reasons: readiness.reasons, ...(lastObserved ? { lastObserved } : {}) },
    coverage: {
      complete: reasons.length === 0, discoveredNodes: discovered.length, inspectedNodes: selected.length, skippedNodes: discovered.length - selected.length,
      reasons, nodesObserved: nodes.length,
      capabilities: ['rectangles', 'computed-style', 'overflow', 'best-effort-label', 'ancestor-clipping', 'text-fragments', 'pointer-samples'],
      unsupportedFeatures: ['paint-visibility', 'non-rectangular-clipping', 'transformed-geometry']
    },
    timingsMs: { capture: Math.round(performance.now() - started), serialize: 0 },
    nodes
  };
}
