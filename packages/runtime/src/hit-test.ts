import type { Assessment, Measurement, Rect } from '@anwc/protocol';

function known<T>(value: T, maxSamples: number): Assessment<T> {
  return {
    status: 'known', value, method: 'browser-hit-test-grid',
    limitations: [
      'Samples are limited to the target area inside the current viewport.',
      `At most ${maxSamples} deterministic interior samples were collected.`,
      'Samples are not pixel coverage or a paint-visibility proof.'
    ]
  };
}

function intersection(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right <= left || bottom <= top ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

const gridOrder: ReadonlyArray<readonly [number, number]> = [
  [2, 2], [1, 1], [3, 1], [1, 3], [3, 3],
  [0, 0], [2, 0], [4, 0], [0, 2], [4, 2], [0, 4], [2, 4], [4, 4],
  [2, 1], [1, 2], [3, 2], [2, 3],
  [1, 0], [3, 0], [0, 1], [4, 1], [0, 3], [4, 3], [1, 4], [3, 4]
];

function samplePoints(box: Rect, limit: number, devicePixelRatio: number): Array<{ x: number; y: number }> {
  if (box.width <= 0 || box.height <= 0) return [];
  const unique = new Map<string, { x: number; y: number }>();
  for (const [column, row] of gridOrder) {
    const point = { x: box.x + box.width * ((column + 1) / 6), y: box.y + box.height * ((row + 1) / 6) };
    // Multiple fractional coordinates can resolve to the same physical pixel on a
    // narrow control. Keep one interior coordinate for each physical hit-test point.
    const key = `${Math.round(point.x * devicePixelRatio)},${Math.round(point.y * devicePixelRatio)}`;
    if (!unique.has(key)) unique.set(key, point);
    if (unique.size === limit) break;
  }
  return [...unique.values()];
}

export function observePointer(
  element: Element,
  box: Rect | null,
  candidate: boolean,
  selected: Set<Element>,
  nodeIdFor: (element: Element) => string,
  maxSamples: number
): Measurement['pointer'] {
  if (!candidate) return { status: 'unknown', value: null, method: 'not-interactive-candidate', limitations: ['Only interaction candidates receive pointer samples.'] };
  if (box === null) return { status: 'unknown', value: null, method: 'browser-hit-test-grid', limitations: ['The target has no client rectangle.'] };
  const viewport = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const visibleBox = intersection(box, viewport);
  if (!visibleBox) {
    return {
      status: 'unknown', value: null, method: 'browser-hit-test-grid',
      limitations: ['The target does not intersect the current viewport, so no pointer samples were collected.']
    };
  }
  const samples = samplePoints(visibleBox, maxSamples, Math.max(1, window.devicePixelRatio || 1)).map((point) => {
    const hit = element.ownerDocument.elementFromPoint(point.x, point.y);
    if (!hit) return { ...point, result: 'no-target' as const, blockerNodeId: null };
    if (hit === element || element.contains(hit)) return { ...point, result: 'target-or-descendant' as const, blockerNodeId: null };
    return { ...point, result: 'blocked' as const, blockerNodeId: selected.has(hit) ? nodeIdFor(hit) : null };
  });
  const blocked = samples.filter((sample) => sample.result === 'blocked').length;
  const noTarget = samples.filter((sample) => sample.result === 'no-target').length;
  return known({ samples, tested: samples.length, blocked, noTarget, blockedSampleFraction: samples.length === 0 ? 0 : blocked / samples.length }, maxSamples);
}
