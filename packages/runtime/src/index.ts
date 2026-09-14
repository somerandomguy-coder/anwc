import type { Assessment, Measurement, RawCapture, SourceRef } from '@anwc/protocol';
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

function renderState(element: Element): Measurement['render'] {
  const hidden: string[] = [];
  let opacityZero = false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none') hidden.push('display:none');
    if (style.visibility === 'hidden' || style.visibility === 'collapse') hidden.push(`visibility:${style.visibility}`);
    if (Number(style.opacity) === 0) opacityZero = true;
  }
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
  for (let current: Element | null = element; current; current = current.parentElement) if (current.hasAttribute('inert')) return true;
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

function measure(element: Element, selected: Set<Element>, state: RuntimeState, textLimit: number): Measurement {
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
    pointer: observePointer(element, box, interaction.candidate, selected, (candidate) => nodeId(candidate, state)),
    interaction,
    paintVisibility: unknown('v0', ['Paint visibility is unsupported in v0.']),
    intent: { expectedCurrent: expected === 'visible' || expected === 'interactive' ? expected : null, maxLines, allow }
  };
}

async function waitForReadiness(timeoutMs: number): Promise<{ settled: boolean; waitMs: number; reasons: string[] }> {
  const started = performance.now();
  let animationFrame = 0;
  let timeout = 0;
  const settled = await new Promise<boolean>((resolve) => {
    const finish = (value: boolean) => { cancelAnimationFrame(animationFrame); clearTimeout(timeout); resolve(value); };
    animationFrame = requestAnimationFrame(() => { animationFrame = requestAnimationFrame(() => finish(true)); });
    timeout = window.setTimeout(() => finish(false), timeoutMs);
  });
  return { settled, waitMs: Math.round(performance.now() - started), reasons: settled ? ['two animation frames'] : ['readiness timeout'] };
}

export function configureRuntime(configuration: RuntimeConfiguration): void {
  const state = stateFor(document);
  state.configuration = { ...state.configuration, ...configuration };
}

export async function capture(options: CaptureOptions = {}): Promise<RawCapture> {
  const limits = { ...defaultLimits, ...options };
  const state = stateFor(document);
  const started = performance.now();
  const readiness = await waitForReadiness(limits.timeoutMs);
  const discovered = [...document.querySelectorAll('*')];
  const selected = discovered.slice(0, limits.maxNodes);
  const selectedSet = new Set(selected);
  const nodes = selected.map((element) => measure(element, selectedSet, state, limits.textLimit));
  const documentElement = document.documentElement;

  return {
    schemaVersion: '0.1',
    sessionId: state.sessionId,
    captureId: `${state.sessionId}:capture-${state.nextCaptureNumber++}`,
    capturedAt: new Date().toISOString(),
    page: {
      url: location.href, title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight }, scroll: { x: window.scrollX, y: window.scrollY },
      devicePixelRatio: window.devicePixelRatio, visualViewportScale: window.visualViewport?.scale ?? 1,
      scenario: documentElement.getAttribute('data-anwc-scenario')
    },
    environment: { browser: navigator.userAgent, browserVersion: navigator.userAgent, compilerVersion: null, runtimeVersion: state.configuration.runtimeVersion ?? '0.0.0' },
    readiness,
    coverage: {
      complete: discovered.length <= limits.maxNodes, discoveredNodes: discovered.length, inspectedNodes: selected.length, skippedNodes: discovered.length - selected.length,
      reasons: discovered.length <= limits.maxNodes ? [] : ['max node cap reached'], capabilities: ['rectangles', 'computed-style', 'overflow', 'best-effort-label'],
      unsupportedFeatures: ['ancestor-clipping', 'text-fragments', 'pointer-samples', 'paint-visibility']
    },
    timingsMs: { capture: Math.round(performance.now() - started), serialize: 0 },
    nodes
  };
}
