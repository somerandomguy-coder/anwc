import { describe, expect, test } from 'vitest';
import { parseRawCapture, parseSnapshot } from '../../packages/protocol/src/index.js';
import { partialRawCaptureFixture, validRawCaptureFixture, validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

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

  describe('partial evidence (P05)', () => {
    const partial = (): any => {
      const capture = JSON.parse(JSON.stringify(partialRawCaptureFixture));
      capture.coverage.nodesObserved = 3;
      capture.nodes[0].truncated = true;
      return capture;
    };

    test('captures saved before P05 still parse, and gain no new fields', () => {
      const old = JSON.parse(JSON.stringify(partialRawCaptureFixture));
      expect(old.coverage).not.toHaveProperty('nodesObserved');
      expect(parseRawCapture(old)).toEqual(old);
      const snapshot = JSON.parse(JSON.stringify(validSnapshotFixture));
      expect(parseSnapshot(snapshot)).toEqual(snapshot);
    });

    test('accepts truncated, nodesObserved and lastObserved', () => {
      const capture = partial();
      capture.readiness = { settled: false, waitMs: 90, reasons: ['geometry remained unstable before timeout'], lastObserved: { phase: 'geometry', stableFrames: 0, movingCount: 1, movingNodeIds: ['n-card-1'] } };
      expect(parseRawCapture(capture)).toEqual(capture);
    });

    test.each([
      ['truncated: false', (c: any) => { c.nodes[0].truncated = false; }],
      ['nodesObserved that disagrees with inspectedNodes', (c: any) => { c.coverage.nodesObserved = 4; }],
      ['lastObserved on a settled capture', (c: any) => { c.readiness.lastObserved = { phase: 'fonts', stableFrames: 0, movingCount: 0, movingNodeIds: [] }; }],
      ['an unresolved moving node', (c: any) => { c.readiness.settled = false; c.readiness.lastObserved = { phase: 'geometry', stableFrames: 0, movingCount: 1, movingNodeIds: ['gone'] }; }],
      ['a truncated node in a complete, settled capture', (c: any) => { c.coverage = { ...c.coverage, complete: true, discoveredNodes: 3, skippedNodes: 0, reasons: [] }; }]
    ])('rejects %s', (_, mutate) => {
      const capture = partial();
      mutate(capture);
      expect(() => parseRawCapture(capture)).toThrow();
    });
  });
});
