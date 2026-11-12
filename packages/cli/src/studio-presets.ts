import { snapshotSchema, type Snapshot, type RawCapture } from '@anwc/protocol';

export interface StudioPreset {
  id: string;
  title: string;
  description: string;
  snapshot: Snapshot;
}

const known = <T>(value: T) => ({ status: 'known' as const, value, method: 'computed', limitations: [] as string[] });
const unknown = (limitations: string[] = ['not evaluated']) => ({ status: 'unknown' as const, value: null, method: 'none', limitations });

function createNode(overrides: Partial<RawCapture['nodes'][number]> & { nodeId: string; tag: string }): RawCapture['nodes'][number] {
  const box = overrides.box ?? { x: 0, y: 0, width: 350, height: 48 };
  const source = overrides.source ?? null;
  const siteId = overrides.siteId ?? (source ? source.siteId : null);
  return {
    siteId,
    source,
    parentNodeId: null,
    semanticKey: null,
    role: null,
    label: '',
    labelMethod: 'none',
    textTruncated: false,
    box,
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: known(false) },
    viewport: known({ intersection: box, boxFraction: 1 }),
    clip: known({ intersection: box, boxFraction: 1, ancestors: [] }),
    overflow: { clientWidth: box.width, clientHeight: box.height, scrollWidth: box.width, scrollHeight: box.height, scrollableX: false, scrollableY: false },
    text: known({ lineCount: 0, fragmentRects: [], clippedFragmentCount: 0 }),
    pointer: unknown(['not interactive']),
    interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: unknown(['paint visibility unsupported']),
    intent: { expectedCurrent: null, maxLines: null, allow: [] },
    ...overrides
  };
}

const shopBlockedSnapshot: Snapshot = {
  schemaVersion: '0.1',
  sessionId: 'session-preset-1',
  captureId: 'capture-shop-blocked-checkout',
  capturedAt: '2026-11-05T00:00:00.000Z',
  page: {
    url: 'http://127.0.0.1:4175/?case=blocked-checkout&variant=broken',
    title: 'Shop: Blocked Checkout',
    viewport: { width: 390, height: 844 },
    scroll: { x: 0, y: 0 },
    devicePixelRatio: 1,
    visualViewportScale: 1,
    scenario: 'shop-blocked-checkout'
  },
  environment: {
    browser: 'Chromium',
    browserVersion: '134.0.6998.35',
    compilerVersion: '0.1.0-alpha.0',
    runtimeVersion: '0.1.0-alpha.0'
  },
  readiness: {
    settled: true,
    waitMs: 50,
    reasons: ['network idle', 'two animation frames']
  },
  coverage: {
    complete: true,
    discoveredNodes: 4,
    inspectedNodes: 4,
    skippedNodes: 0,
    reasons: [],
    capabilities: ['rectangles', 'pointer-samples'],
    unsupportedFeatures: ['paint-visibility']
  },
  timingsMs: { capture: 5, rules: 1, serialize: 2 },
  nodes: [
    createNode({
      nodeId: 'n-root',
      tag: 'main',
      label: 'Shop Cart',
      labelMethod: 'text',
      box: { x: 0, y: 0, width: 390, height: 844 }
    }),
    createNode({
      nodeId: 'n-cart-items',
      parentNodeId: 'n-root',
      tag: 'section',
      label: 'Shopping Cart',
      labelMethod: 'text',
      box: { x: 16, y: 80, width: 358, height: 380 }
    }),
    createNode({
      nodeId: 'n-checkout-btn',
      parentNodeId: 'n-root',
      tag: 'button',
      semanticKey: 'checkout-button',
      role: 'button',
      label: 'Checkout ($48.00)',
      labelMethod: 'text',
      box: { x: 20, y: 500, width: 350, height: 48 },
      source: { siteId: 's-checkout', file: 'src/components/Checkout.tsx', line: 42, column: 9, tag: 'button' },
      pointer: known({
        samples: [
          { x: 107, y: 524, result: 'blocked', blockerNodeId: 'n-promo-modal' },
          { x: 195, y: 524, result: 'blocked', blockerNodeId: 'n-promo-modal' },
          { x: 282, y: 524, result: 'blocked', blockerNodeId: 'n-promo-modal' },
          { x: 195, y: 512, result: 'blocked', blockerNodeId: 'n-promo-modal' }
        ],
        tested: 4,
        blocked: 4,
        noTarget: 0,
        blockedSampleFraction: 1.0
      }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
      intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    }),
    createNode({
      nodeId: 'n-promo-modal',
      parentNodeId: 'n-root',
      tag: 'div',
      label: 'Promo Discount Modal Overlay',
      labelMethod: 'aria-label',
      box: { x: 0, y: 0, width: 390, height: 844 },
      interaction: { candidate: false, disabled: false, inert: false, pointerEvents: 'auto' }
    })
  ],
  findings: [
    {
      findingId: 'f-blocked-checkout',
      code: 'POINTER_BLOCKED_AT_SAMPLES',
      severity: 'error',
      nodeId: 'n-checkout-btn',
      source: { siteId: 's-checkout', file: 'src/components/Checkout.tsx', line: 42, column: 9, tag: 'button' },
      message: 'Checkout button hit-test samples blocked by Promo Discount Modal Overlay',
      evidence: { kind: 'pointer-blocked', tested: 4, blocked: 4, blockerNodeIds: ['n-promo-modal'] },
      relatedNodeIds: ['n-promo-modal'],
      limitations: ['Sampling is not pixel coverage.'],
      acknowledged: false,
      suggestion: 'Set pointer-events: none on the overlay backdrop or dismiss the modal.'
    }
  ]
};

const pricingAncestorClipSnapshot: Snapshot = {
  schemaVersion: '0.1',
  sessionId: 'session-preset-2',
  captureId: 'capture-pricing-ancestor-clip',
  capturedAt: '2026-11-05T00:00:00.000Z',
  page: {
    url: 'http://127.0.0.1:4176/?case=description-crop&variant=broken',
    title: 'Pricing: Ancestor Clip',
    viewport: { width: 390, height: 844 },
    scroll: { x: 0, y: 0 },
    devicePixelRatio: 1,
    visualViewportScale: 1,
    scenario: 'pricing-ancestor-clip'
  },
  environment: {
    browser: 'Chromium',
    browserVersion: '134.0.6998.35',
    compilerVersion: '0.1.0-alpha.0',
    runtimeVersion: '0.1.0-alpha.0'
  },
  readiness: {
    settled: true,
    waitMs: 50,
    reasons: ['network idle', 'two animation frames']
  },
  coverage: {
    complete: true,
    discoveredNodes: 4,
    inspectedNodes: 4,
    skippedNodes: 0,
    reasons: [],
    capabilities: ['rectangles', 'pointer-samples'],
    unsupportedFeatures: ['paint-visibility']
  },
  timingsMs: { capture: 4, rules: 1, serialize: 2 },
  nodes: [
    createNode({
      nodeId: 'n-root',
      tag: 'main',
      label: 'Pricing Plans',
      labelMethod: 'text',
      box: { x: 0, y: 0, width: 390, height: 844 }
    }),
    createNode({
      nodeId: 'n-pricing-slider',
      parentNodeId: 'n-root',
      tag: 'section',
      label: 'Pricing Tier Slider',
      labelMethod: 'text',
      box: { x: 0, y: 100, width: 390, height: 380 },
      overflow: { clientWidth: 390, clientHeight: 380, scrollWidth: 780, scrollHeight: 380, scrollableX: true, scrollableY: false }
    }),
    createNode({
      nodeId: 'n-card-starter',
      parentNodeId: 'n-pricing-slider',
      tag: 'article',
      label: 'Starter Tier Card',
      labelMethod: 'text',
      box: { x: 16, y: 120, width: 260, height: 320 }
    }),
    createNode({
      nodeId: 'n-growth-action',
      parentNodeId: 'n-pricing-slider',
      tag: 'button',
      semanticKey: 'pricing-growth-action',
      role: 'button',
      label: 'Select Growth Plan',
      labelMethod: 'text',
      box: { x: 300, y: 380, width: 220, height: 44 },
      source: { siteId: 's-pricing-cta', file: 'src/components/PricingTier.tsx', line: 78, column: 7, tag: 'button' },
      clip: known({
        intersection: { x: 300, y: 380, width: 90, height: 44 },
        boxFraction: 0.41,
        ancestors: [{ nodeId: 'n-pricing-slider', axes: 'x' as const, box: { x: 0, y: 100, width: 390, height: 380 } }]
      }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
      intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    })
  ],
  findings: [
    {
      findingId: 'f-ancestor-clip',
      code: 'CLIPPED_BY_ANCESTOR',
      severity: 'error',
      nodeId: 'n-growth-action',
      source: { siteId: 's-pricing-cta', file: 'src/components/PricingTier.tsx', line: 78, column: 7, tag: 'button' },
      message: 'Select Growth Plan button is 59% clipped by ancestor n-pricing-slider',
      evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.41, ancestorNodeIds: ['n-pricing-slider'] },
      relatedNodeIds: ['n-pricing-slider'],
      limitations: [],
      acknowledged: false,
      suggestion: 'Ensure horizontal scroll container padding or scroll snap aligns cards into viewport.'
    }
  ]
};

const dashboardOutsideViewportSnapshot: Snapshot = {
  schemaVersion: '0.1',
  sessionId: 'session-preset-3',
  captureId: 'capture-dashboard-outside-viewport',
  capturedAt: '2026-11-05T00:00:00.000Z',
  page: {
    url: 'http://127.0.0.1:4177/?case=outside-save&variant=broken',
    title: 'Dashboard: Outside Viewport',
    viewport: { width: 390, height: 844 },
    scroll: { x: 0, y: 0 },
    devicePixelRatio: 1,
    visualViewportScale: 1,
    scenario: 'dashboard-outside-viewport'
  },
  environment: {
    browser: 'Chromium',
    browserVersion: '134.0.6998.35',
    compilerVersion: '0.1.0-alpha.0',
    runtimeVersion: '0.1.0-alpha.0'
  },
  readiness: {
    settled: true,
    waitMs: 50,
    reasons: ['network idle', 'two animation frames']
  },
  coverage: {
    complete: true,
    discoveredNodes: 3,
    inspectedNodes: 3,
    skippedNodes: 0,
    reasons: [],
    capabilities: ['rectangles', 'pointer-samples'],
    unsupportedFeatures: ['paint-visibility']
  },
  timingsMs: { capture: 4, rules: 1, serialize: 2 },
  nodes: [
    createNode({
      nodeId: 'n-root',
      tag: 'main',
      label: 'Dashboard Settings',
      labelMethod: 'text',
      box: { x: 0, y: 0, width: 390, height: 844 }
    }),
    createNode({
      nodeId: 'n-settings-form',
      parentNodeId: 'n-root',
      tag: 'form',
      label: 'Account Form',
      labelMethod: 'text',
      box: { x: 16, y: 60, width: 358, height: 750 }
    }),
    createNode({
      nodeId: 'n-dashboard-save',
      parentNodeId: 'n-settings-form',
      tag: 'button',
      semanticKey: 'dashboard-save',
      role: 'button',
      label: 'Save Changes',
      labelMethod: 'text',
      box: { x: 20, y: 920, width: 350, height: 48 },
      source: { siteId: 's-save', file: 'src/views/Settings.tsx', line: 112, column: 5, tag: 'button' },
      viewport: known({ intersection: null, boxFraction: 0 }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
      intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    })
  ],
  findings: [
    {
      findingId: 'f-outside-viewport',
      code: 'OUTSIDE_VIEWPORT',
      severity: 'error',
      nodeId: 'n-dashboard-save',
      source: { siteId: 's-save', file: 'src/views/Settings.tsx', line: 112, column: 5, tag: 'button' },
      message: 'Save Changes is expected to be interactive but is outside the viewport.',
      evidence: { kind: 'generic', details: { boxFraction: 0, method: 'bounding-box' } },
      relatedNodeIds: [],
      limitations: [],
      acknowledged: false,
      suggestion: 'Pin save button to bottom sticky footer or make form scrollable.'
    }
  ]
};

const cleanShopSnapshot: Snapshot = {
  schemaVersion: '0.1',
  sessionId: 'session-preset-4',
  captureId: 'capture-clean-shop',
  capturedAt: '2026-11-05T00:00:00.000Z',
  page: {
    url: 'http://127.0.0.1:4175/?variant=healthy',
    title: 'Shop: Healthy Mobile Layout',
    viewport: { width: 390, height: 844 },
    scroll: { x: 0, y: 0 },
    devicePixelRatio: 1,
    visualViewportScale: 1,
    scenario: 'clean-shop'
  },
  environment: {
    browser: 'Chromium',
    browserVersion: '134.0.6998.35',
    compilerVersion: '0.1.0-alpha.0',
    runtimeVersion: '0.1.0-alpha.0'
  },
  readiness: {
    settled: true,
    waitMs: 40,
    reasons: ['network idle', 'two animation frames']
  },
  coverage: {
    complete: true,
    discoveredNodes: 4,
    inspectedNodes: 4,
    skippedNodes: 0,
    reasons: [],
    capabilities: ['rectangles', 'pointer-samples'],
    unsupportedFeatures: ['paint-visibility']
  },
  timingsMs: { capture: 4, rules: 0, serialize: 1 },
  nodes: [
    createNode({
      nodeId: 'n-root',
      tag: 'main',
      label: 'Shop Main',
      labelMethod: 'text',
      box: { x: 0, y: 0, width: 390, height: 844 }
    }),
    createNode({
      nodeId: 'n-header',
      parentNodeId: 'n-root',
      tag: 'header',
      label: 'Storefront Header',
      labelMethod: 'text',
      box: { x: 0, y: 0, width: 390, height: 60 }
    }),
    createNode({
      nodeId: 'n-cart-items',
      parentNodeId: 'n-root',
      tag: 'section',
      label: 'Cart Summary',
      labelMethod: 'text',
      box: { x: 16, y: 76, width: 358, height: 320 }
    }),
    createNode({
      nodeId: 'n-checkout-btn',
      parentNodeId: 'n-root',
      tag: 'button',
      semanticKey: 'checkout-button',
      role: 'button',
      label: 'Pay Now ($48.00)',
      labelMethod: 'text',
      box: { x: 20, y: 420, width: 350, height: 48 },
      source: { siteId: 's-checkout', file: 'src/components/Checkout.tsx', line: 42, column: 9, tag: 'button' },
      pointer: known({
        samples: [
          { x: 195, y: 444, result: 'target-or-descendant', blockerNodeId: null }
        ],
        tested: 1,
        blocked: 0,
        noTarget: 0,
        blockedSampleFraction: 0
      }),
      interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
      intent: { expectedCurrent: 'interactive', maxLines: null, allow: [] }
    })
  ],
  findings: []
};

// Validate all presets with snapshotSchema at load time
snapshotSchema.parse(shopBlockedSnapshot);
snapshotSchema.parse(pricingAncestorClipSnapshot);
snapshotSchema.parse(dashboardOutsideViewportSnapshot);
snapshotSchema.parse(cleanShopSnapshot);

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'shop-blocked-checkout',
    title: 'Shop: Blocked Checkout',
    description: 'Checkout CTA button hit-test raycasting obstructed by modal overlay backdrop.',
    snapshot: shopBlockedSnapshot
  },
  {
    id: 'pricing-ancestor-clip',
    title: 'Pricing: Ancestor Overflow Clipping',
    description: 'Growth tier CTA button clipped 59% by horizontal scroll container overflow bounds.',
    snapshot: pricingAncestorClipSnapshot
  },
  {
    id: 'dashboard-outside-viewport',
    title: 'Dashboard: Outside Viewport Action',
    description: 'Save Changes CTA button pushed past mobile 844px viewport height.',
    snapshot: dashboardOutsideViewportSnapshot
  },
  {
    id: 'clean-shop',
    title: 'Shop: Healthy Layout',
    description: 'Fully accessible, valid geometry, zero detected regressions or blocker findings.',
    snapshot: cleanShopSnapshot
  }
];
