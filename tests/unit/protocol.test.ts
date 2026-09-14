import { describe, expect, test } from 'vitest';
import { parseRawCapture, parseSnapshot } from '../../packages/protocol/src/index.js';
import { partialRawCaptureFixture, validRawCaptureFixture, validSnapshotFixture } from '../../packages/protocol/src/fixtures.js';

describe('ANWC protocol 0.1', () => {
  test('round-trips repeat sites, an uninstrumented blocker, and unknown paint', () => {
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(validSnapshotFixture)));
    expect(parsed.nodes.filter((item) => item.siteId === 's_card')).toHaveLength(2);
    expect(parsed.nodes.find((item) => item.nodeId === 'n-overlay')?.source).toBeNull();
    expect(parsed.nodes[0]?.paintVisibility).toMatchObject({ status: 'unknown', value: null });
  });

  test('retains incomplete coverage during serialization', () => {
    expect(parseRawCapture(JSON.parse(JSON.stringify(partialRawCaptureFixture))).coverage).toMatchObject({ complete: false, skippedNodes: 1 });
  });

  test('allows a site id while source lookup is unavailable', () => {
    const capture = JSON.parse(JSON.stringify(validRawCaptureFixture));
    capture.nodes[3].siteId = 's_known_but_unresolved';
    expect(parseRawCapture(capture).nodes[3]?.source).toBeNull();
  });

  test.each([
    ['an incompatible version', (capture: any) => { capture.schemaVersion = '0.2'; }],
    ['a negative rectangle dimension', (capture: any) => { capture.nodes[0].box.width = -1; }],
    ['inconsistent pointer totals', (capture: any) => { capture.nodes[1].pointer.value.tested = 25; }]
  ])('rejects %s', (_, mutate) => {
    const capture = JSON.parse(JSON.stringify(validRawCaptureFixture));
    mutate(capture);
    expect(() => parseRawCapture(capture)).toThrow();
  });

  test('rejects unresolved node references', () => {
    const snapshot = JSON.parse(JSON.stringify(validSnapshotFixture));
    snapshot.findings[0].relatedNodeIds = ['missing'];
    expect(() => parseSnapshot(snapshot)).toThrow();
  });
});
