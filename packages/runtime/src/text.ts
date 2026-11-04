import type { Assessment, Measurement, Rect } from '@anwc/protocol';
import { observeOwnTextClip } from './clipping.js';

function unknown(reason: string): Assessment<NonNullable<Measurement['text']['value']>> {
  return { status: 'unknown', value: null, method: 'range-client-rects-inline-text', limitations: [reason] };
}

function toRect(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function equalRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function inlineTextNodes(element: Element): Text[] {
  const result: Text[] = [];
  function collect(parent: Node) {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent && child.textContent.trim().length > 0) {
          result.push(child as Text);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE && child instanceof Element) {
        const display = getComputedStyle(child).display;
        if (display === 'none') continue;
        if (display === 'inline' || display === 'contents') {
          collect(child);
        }
      }
    }
  }
  collect(element);
  return result;
}

function lineCount(rects: Rect[]): number {
  const rows: number[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const center = rect.y + rect.height / 2;
    const tolerance = Math.max(1, rect.height * 0.35);
    if (!rows.some((row) => Math.abs(row - center) <= tolerance)) rows.push(center);
  }
  return rows.length;
}

export function observeText(element: Element, clip: Measurement['clip']): Measurement['text'] {
  if (clip.status === 'unknown') return unknown(clip.limitations[0] ?? 'Clipping state is unavailable.');
  const style = getComputedStyle(element);
  if (style.transform !== 'none') return unknown('Transforms are unsupported for text fragment observations.');
  if (!style.writingMode.startsWith('horizontal-tb')) return unknown('Vertical writing modes are unsupported for text fragment observations.');

  const fragments: Rect[] = [];
  for (const text of inlineTextNodes(element)) {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(text);
    for (const clientRect of [...range.getClientRects()]) {
      const rect = toRect(clientRect);
      if (rect.width > 0 && rect.height > 0 && !fragments.some((existing) => equalRect(existing, rect))) fragments.push(rect);
    }
    range.detach();
  }
  const clippedFragmentCount = fragments.filter((fragment) => {
    const visible = observeOwnTextClip(element, fragment, clip);
    if (visible.status !== 'known') return false;
    return visible.value === null || !equalRect(visible.value, fragment);
  }).length;
  return {
    status: 'known',
    value: { lineCount: lineCount(fragments), fragmentRects: fragments, clippedFragmentCount },
    method: 'range-client-rects-inline-text',
    limitations: ['Inline descendant text nodes included; block children establish independent flow.', 'Line grouping is approximate.']
  };
}
