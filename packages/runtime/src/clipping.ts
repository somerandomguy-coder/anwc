import type { Assessment, Measurement, Rect } from '@anwc/protocol';

type ClipValue = NonNullable<Measurement['clip']['value']>;

function known(value: ClipValue): Assessment<ClipValue> {
  return { status: 'known', value, method: 'client-box-ancestor-clipping', limitations: ['Supports normal-flow and sticky rectangular clips only.'] };
}

function unknown(reason: string): Assessment<ClipValue> {
  return { status: 'unknown', value: null, method: 'client-box-ancestor-clipping', limitations: [reason] };
}

/**
 * Coordinate noise tolerance. Chromium layout units are 1/64 CSS px, so any real clip
 * loses at least 0.0156px; differences below this are floating-point noise, not clipping.
 */
const EDGE_TOLERANCE = 0.01;

/**
 * Space a classic scrollbar takes out of the padding box on one axis.
 * Element.clientWidth/Height exclude it but are rounded to integers, so the rounded difference
 * from the fractional padding box recovers an integer scrollbar size. An axis that cannot have a
 * scrollbar has no gutter, whatever the rounding says.
 */
function scrollbarSize(padding: number, client: number, possible: boolean, zoom: number): number {
  if (!possible) return 0;
  // Under CSS zoom the client size is rounded before scaling, so it is uncertain by half a zoomed
  // pixel. Take the smallest scrollbar that fits: never invent a clip, at the cost of missing a
  // sub-two-pixel one at ordinary zoom levels.
  const size = zoom === 1 ? Math.round(padding - client) : Math.floor(padding - client - zoom / 2);
  // A 1px difference is indistinguishable from pixel snapping of the integer client size.
  return size > 1 ? size : 0;
}

function canScroll(overflow: string): boolean {
  return overflow === 'scroll' || overflow === 'auto';
}

/** The fractional padding box minus scrollbars: the rectangle an overflow clip cuts to. */
function clipBox(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  if (element === element.ownerDocument.documentElement) {
    // The root's client size is the viewport's, not the root box's.
    return { x: rect.left + element.clientLeft, y: rect.top + element.clientTop, width: element.clientWidth, height: element.clientHeight };
  }
  const style = getComputedStyle(element);
  const zoom = (element as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
  const border = (value: string) => (parseFloat(value) || 0) * zoom;
  const borderLeft = border(style.borderLeftWidth);
  const borderTop = border(style.borderTopWidth);
  const paddingWidth = Math.max(0, rect.width - borderLeft - border(style.borderRightWidth));
  const paddingHeight = Math.max(0, rect.height - borderTop - border(style.borderBottomWidth));
  const vertical = scrollbarSize(paddingWidth, element.clientWidth * zoom, canScroll(style.overflowY), zoom);
  const horizontal = scrollbarSize(paddingHeight, element.clientHeight * zoom, canScroll(style.overflowX), zoom);
  // clientLeft includes a scrollbar on the left edge (RTL). A reserved gutter without a scrollbar
  // (`overflow: hidden; scrollbar-gutter: stable`) is not cut: Chromium clips at the padding edge.
  const left = Math.min(vertical, Math.max(0, Math.round(element.clientLeft * zoom - borderLeft)));
  return {
    x: rect.left + borderLeft + left,
    y: rect.top + borderTop,
    width: Math.max(0, paddingWidth - vertical),
    height: Math.max(0, paddingHeight - horizontal)
  };
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
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const clipRight = clip.x + clip.width;
  const clipBottom = clip.y + clip.height;
  const cutLeft = x && clip.x - rect.x > EDGE_TOLERANCE;
  const cutRight = x && rectRight - clipRight > EDGE_TOLERANCE;
  const cutTop = y && clip.y - rect.y > EDGE_TOLERANCE;
  const cutBottom = y && rectBottom - clipBottom > EDGE_TOLERANCE;
  const left = cutLeft ? clip.x : rect.x;
  const right = cutRight ? clipRight : rectRight;
  const top = cutTop ? clip.y : rect.y;
  const bottom = cutBottom ? clipBottom : rectBottom;
  if (right <= left || bottom <= top) return null;
  // Nothing is cut: keep the exact rectangle so callers see no clipping at all.
  if (!cutLeft && !cutRight && !cutTop && !cutBottom) return rect;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function fraction(original: Rect, clipped: Rect | null): number {
  const total = original.width * original.height;
  if (total <= 0 || clipped === null) return 0;
  return Math.min(1, (clipped.width * clipped.height) / total);
}

export function observeAncestorClip(element: Element, box: Rect | null, nodeIdFor: (element: Element) => string | null): Assessment<ClipValue> {
  if (box === null) return known({ intersection: null, boxFraction: 0, ancestors: [] });
  const ownUnsupported = unsupported(element);
  if (ownUnsupported) return unknown(ownUnsupported);
  const position = getComputedStyle(element).position;
  if (position === 'absolute' || position === 'fixed') return unknown(`Position:${position} descendants are outside normal-flow clip model.`);

  // Top-layer modal dialog is rendered in top layer; DOM ancestors do not clip it.
  try {
    if (element.matches?.('dialog:modal')) {
      return known({ intersection: box, boxFraction: 1, ancestors: [] });
    }
  } catch {}

  let visible: Rect | null = box;
  const ancestors: ClipValue['ancestors'] = [];
  for (let current = element.parentElement; current; current = current.parentElement) {
    const unsupportedReason = unsupported(current);
    if (unsupportedReason) return unknown(unsupportedReason);
    if (!(current instanceof HTMLElement)) continue;
    const style = getComputedStyle(current);
    const x = clipAxis(style.overflowX);
    const y = clipAxis(style.overflowY);
    if (x || y) {
      const clip = clipBox(current);
      visible = visible && applyAxis(visible, clip, x, y);
      const nodeId = nodeIdFor(current);
      if (nodeId) ancestors.push({ nodeId, axes: x && y ? 'xy' : x ? 'x' : 'y', box: clip });
    }
    // Top-layer boundary: an active modal dialog is not clipped by its DOM ancestors
    try {
      if (current.matches?.('dialog:modal')) break;
    } catch {}
  }
  return known({ intersection: visible, boxFraction: fraction(box, visible), ancestors });
}

export function observeOwnTextClip(element: Element, fragment: Rect, ancestorClip: Assessment<ClipValue>): Assessment<Rect | null> {
  if (ancestorClip.status === 'unknown') return { status: 'unknown', value: null, method: 'text-fragment-clip', limitations: ancestorClip.limitations };
  // A Range rectangle can extend beyond its own element's box because glyph ink,
  // line-height, or inline layout overhangs. That does not mean it is clipped.
  // Intersect the text with the actual clipping ancestors instead of the measured
  // element box, which is only a summary of the element's visible geometry.
  let visible: Rect | null = fragment;
  for (const ancestor of ancestorClip.value.ancestors) {
    visible = visible && applyAxis(visible, ancestor.box, ancestor.axes.includes('x'), ancestor.axes.includes('y'));
  }
  if (element instanceof HTMLElement) {
    const style = getComputedStyle(element);
    const x = clipAxis(style.overflowX);
    const y = clipAxis(style.overflowY);
    if (x || y) visible = visible && applyAxis(visible, clipBox(element), x, y);
  }
  return { status: 'known', value: visible, method: 'text-fragment-clip', limitations: ['Text clipping uses supported rectangular clips only.'] };
}
