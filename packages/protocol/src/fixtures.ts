import type { RawCapture, Snapshot } from './schema.js';

const known = <T>(value: T) => ({ status: 'known' as const, value, method: 'fixture', limitations: [] });
const unknown = (limitations: string[]) => ({ status: 'unknown' as const, value: null, method: 'fixture', limitations });
const box = { x: 0, y: 0, width: 120, height: 40 };

function node(overrides: Partial<RawCapture['nodes'][number]>): RawCapture['nodes'][number] {
  return {
    nodeId: 'n-default', siteId: null, source: null, parentNodeId: 'n-root', tag: 'div', semanticKey: null, role: null,
    label: '', labelMethod: 'none', textTruncated: false, box,
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: known(false) },
    viewport: known({ intersection: box, boxFraction: 1 }),
    clip: known({ intersection: box, boxFraction: 1, ancestors: [] }),
    overflow: { clientWidth: 120, clientHeight: 40, scrollWidth: 120, scrollHeight: 40, scrollableX: false, scrollableY: false },
    text: known({ lineCount: 0, fragmentRects: [], clippedFragmentCount: 0 }),
    pointer: unknown(['not interactive']),
    interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: unknown(['paint visibility is unsupported in v0']),
    intent: { expectedCurrent: null, maxLines: null, allow: [] },
    ...overrides
  };
}

const cardSource = { siteId: 's_card', file: 'examples/shop/src/Card.tsx', line: 10, column: 3, tag: 'button' };

export const validRawCaptureFixture: RawCapture = {
  schemaVersion: '0.1',
  sessionId: 'session-fixture',
  captureId: 'capture-fixture',
  capturedAt: '2026-09-15T00:00:00.000Z',
  page: { url: 'http://127.0.0.1:4173/', title: 'Fixture shop', viewport: { width: 390, height: 844 }, scroll: { x: 0, y: 0 }, devicePixelRatio: 1, visualViewportScale: 1, scenario: 'fixture' },
  environment: { browser: 'Chromium', browserVersion: '134.0.6998.35', compilerVersion: '0.0.0', runtimeVersion: '0.0.0' },
  readiness: { settled: true, waitMs: 32, reasons: ['two animation frames'] },
  coverage: { complete: true, discoveredNodes: 4, inspectedNodes: 4, skippedNodes: 0, reasons: [], capabilities: ['rectangles', 'pointer-samples'], unsupportedFeatures: ['paint-visibility'] },
  timingsMs: { capture: 4, serialize: 1 },
  nodes: [
    node({ nodeId: 'n-root', parentNodeId: null, tag: 'main', label: 'Shop', labelMethod: 'text' }),
    node({
      nodeId: 'n-card-1', siteId: 's_card', source: cardSource, tag: 'button', semanticKey: 'first', label: 'Add first', labelMethod: 'text',
      pointer: known({ samples: [{ x: 60, y: 20, result: 'target-or-descendant', blockerNodeId: null }], tested: 1, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' }, intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    }),
    node({
      nodeId: 'n-card-2', siteId: 's_card', source: cardSource, tag: 'button', semanticKey: 'second', label: 'Add second', labelMethod: 'text',
      pointer: known({ samples: [{ x: 60, y: 20, result: 'target-or-descendant', blockerNodeId: null }], tested: 1, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' }, intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    }),
    node({ nodeId: 'n-overlay', label: 'Third-party overlay', labelMethod: 'text' })
  ]
};

export const validSnapshotFixture: Snapshot = {
  ...validRawCaptureFixture,
  timingsMs: { capture: 4, rules: 0, serialize: 1 },
  findings: [{
    findingId: 'f-overlay', code: 'POINTER_BLOCKED_AT_SAMPLES', severity: 'error', nodeId: 'n-card-1', source: cardSource,
    message: 'Illustrative finding', evidence: { kind: 'pointer-blocked', tested: 1, blocked: 1, blockerNodeIds: ['n-overlay'] },
    relatedNodeIds: ['n-overlay'], limitations: ['Sampling is not pixel coverage.'], acknowledged: false, suggestion: 'Inspect the overlay.'
  }]
};

export const partialRawCaptureFixture: RawCapture = {
  ...validRawCaptureFixture,
  captureId: 'capture-partial',
  coverage: { ...validRawCaptureFixture.coverage, complete: false, inspectedNodes: 3, skippedNodes: 1, reasons: ['max node cap reached'] }
};
