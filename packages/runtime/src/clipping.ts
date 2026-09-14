import type { Assessment, Measurement, Rect } from '@anwc/protocol';

type ClipValue = NonNullable<Measurement['clip']['value']>;

function known(value: ClipValue): Assessment<ClipValue> {
  return { status: 'known', value, method: 'client-box-ancestor-clipping', limitations: ['Supports normal-flow rectangular clips only.'] };
}

function unknown(reason: string): Assessment<ClipValue> {
  return { status: 'unknown', value: null, method: 'client-box-ancestor-clipping', limitations: [reason] };
}

function clientBox(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + element.clientLeft, y: rect.top + element.clientTop, width: element.clientWidth, height: element.clientHeight };
}

function clipAxis(value: string): boolean {
  return value === 'hidden' || value === 'clip' || value === 'scroll' || value === 'auto';
}

function unsupported(element: Element): string | null {
  const style = getComputedStyle(element);
  if (style.transform !== 'none') return 'Transforms are unsupported for rectangular clip fractions.';
  if (style.clipPath !== 'none') return 'Clip paths are unsupported for rectangular clip fractions.';
  if (style.maskImage !== 'none') return 'Masks are unsupported for rectangular clip fractions.';
  if (!style.writingMode.startsWith('horizontal-tb')) return 'Vertical writing modes are unsupported for rectangular clip fractions.';
  return null;
}

function applyAxis(rect: Rect, clip: Rect, x: boolean, y: boolean): Rect | null {
  const left = x ? Math.max(rect.x, clip.x) : rect.x;
  const right = x ? Math.min(rect.x + rect.width, clip.x + clip.width) : rect.x + rect.width;
  const top = y ? Math.max(rect.y, clip.y) : rect.y;
  const bottom = y ? Math.min(rect.y + rect.height, clip.y + clip.height) : rect.y + rect.height;
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function fraction(original: Rect, clipped: Rect | null): number {
  const total = original.width * original.height;
  if (total <= 0 || clipped === null) return 0;
  return (clipped.width * clipped.height) / total;
}

export function observeAncestorClip(element: Element, box: Rect | null, nodeIdFor: (element: Element) => string | null): Assessment<ClipValue> {
  if (box === null) return known({ intersection: null, boxFraction: 0, ancestors: [] });
  const ownUnsupported = unsupported(element);
  if (ownUnsupported) return unknown(ownUnsupported);
  const position = getComputedStyle(element).position;
  if (position === 'absolute' || position === 'fixed' || position === 'sticky') return unknown(`Position:${position} descendants are outside T05's normal-flow clip model.`);

  let visible: Rect | null = box;
  const ancestors: ClipValue['ancestors'] = [];
  for (let current = element.parentElement; current; current = current.parentElement) {
    const unsupportedReason = unsupported(current);
    if (unsupportedReason) return unknown(unsupportedReason);
    if (!(current instanceof HTMLElement)) continue;
    const style = getComputedStyle(current);
    const x = clipAxis(style.overflowX);
    const y = clipAxis(style.overflowY);
    if (!x && !y) continue;
    const clip = clientBox(current);
    visible = visible && applyAxis(visible, clip, x, y);
    const nodeId = nodeIdFor(current);
    if (nodeId) ancestors.push({ nodeId, axes: x && y ? 'xy' : x ? 'x' : 'y', box: clip });
  }
  return known({ intersection: visible, boxFraction: fraction(box, visible), ancestors });
}

export function observeOwnTextClip(element: Element, fragment: Rect, ancestorClip: Assessment<ClipValue>): Assessment<Rect | null> {
  if (ancestorClip.status === 'unknown') return { status: 'unknown', value: null, method: 'text-fragment-clip', limitations: ancestorClip.limitations };
  let visible = ancestorClip.value.intersection === null ? null : applyAxis(fragment, ancestorClip.value.intersection, true, true);
  if (element instanceof HTMLElement) {
    const style = getComputedStyle(element);
    const x = clipAxis(style.overflowX);
    const y = clipAxis(style.overflowY);
    if (x || y) visible = visible && applyAxis(visible, clientBox(element), x, y);
  }
  return { status: 'known', value: visible, method: 'text-fragment-clip', limitations: ['Text clipping uses supported rectangular clips only.'] };
}
