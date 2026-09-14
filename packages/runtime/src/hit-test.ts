import type { Assessment, Measurement, Rect } from '@anwc/protocol';

function known<T>(value: T): Assessment<T> {
  return { status: 'known', value, method: 'browser-hit-test-grid', limitations: ['Samples are not pixel coverage or a paint-visibility proof.'] };
}

function samplePoints(box: Rect): Array<{ x: number; y: number }> {
  if (box.width <= 0 || box.height <= 0) return [];
  const unique = new Map<string, { x: number; y: number }>();
  for (let row = 1; row <= 5; row += 1) for (let column = 1; column <= 5; column += 1) {
    const point = { x: box.x + box.width * (column / 6), y: box.y + box.height * (row / 6) };
    unique.set(`${point.x.toFixed(6)},${point.y.toFixed(6)}`, point);
  }
  return [...unique.values()];
}

export function observePointer(
  element: Element,
  box: Rect | null,
  candidate: boolean,
  selected: Set<Element>,
  nodeIdFor: (element: Element) => string
): Measurement['pointer'] {
  if (!candidate) return { status: 'unknown', value: null, method: 'not-interactive-candidate', limitations: ['Only interaction candidates receive pointer samples.'] };
  if (box === null) return { status: 'unknown', value: null, method: 'browser-hit-test-grid', limitations: ['The target has no client rectangle.'] };
  const samples = samplePoints(box).map((point) => {
    const hit = element.ownerDocument.elementFromPoint(point.x, point.y);
    if (!hit) return { ...point, result: 'no-target' as const, blockerNodeId: null };
    if (hit === element || element.contains(hit)) return { ...point, result: 'target-or-descendant' as const, blockerNodeId: null };
    return { ...point, result: 'blocked' as const, blockerNodeId: selected.has(hit) ? nodeIdFor(hit) : null };
  });
  const blocked = samples.filter((sample) => sample.result === 'blocked').length;
  const noTarget = samples.filter((sample) => sample.result === 'no-target').length;
  return known({ samples, tested: samples.length, blocked, noTarget, blockedSampleFraction: samples.length === 0 ? 0 : blocked / samples.length });
}
