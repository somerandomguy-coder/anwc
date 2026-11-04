import { describe, expect, test, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header, type HeaderProps } from '../../packages/studio/src/components/Header.js';
import { App, parseUploadedSnapshotJson } from '../../packages/studio/src/App.js';
import { STUDIO_PRESETS, shopBlockedSnapshot, cleanShopSnapshot } from '../../packages/studio/src/data/presets.js';
import { VIEWPORT_PRESETS } from '../../packages/studio/src/types.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { createReport } from '../../packages/report/src/index.js';

/**
 * Helper to render Header with React's server dispatcher active,
 * capturing the resulting ReactElement to inspect event handlers.
 */
function captureHeaderElement(props: HeaderProps): React.ReactElement {
  let element: React.ReactElement | null = null;
  function TestWrapper() {
    element = Header(props);
    return element;
  }
  renderToStaticMarkup(React.createElement(TestWrapper));
  return element!;
}

describe('Studio Header Component', () => {
  const defaultProps: HeaderProps = {
    url: 'http://127.0.0.1:4173/?case=blocked-checkout',
    onUrlChange: () => {},
    onInspect: () => {},
    viewport: { width: 390, height: 844 },
    overlayMode: false
  };

  test('renders ANWC Studio brand, logo, and offline badge', () => {
    const html = renderToStaticMarkup(React.createElement(Header, defaultProps));

    expect(html).toContain('ANWC Studio');
    expect(html).toContain('Offline');
    expect(html).toContain('data-testid="header"');
  });

  test('renders preset dropdown with all studio presets', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        activePresetId: 'shop-blocked-checkout'
      })
    );

    expect(html).toContain('data-testid="preset-picker"');
    expect(html).toContain('Shop: Blocked Checkout');
    expect(html).toContain('Pricing: Ancestor Overflow Clipping');
    expect(html).toContain('Dashboard: Outside Viewport Action');
    expect(html).toContain('Shop: Healthy Layout');
  });

  test('renders URL input with current URL and placeholder', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        url: 'http://localhost:3000/shop'
      })
    );

    expect(html).toContain('data-testid="url-input"');
    expect(html).toContain('value="http://localhost:3000/shop"');
    expect(html).toContain('placeholder="http://127.0.0.1:4173..."');
  });

  test('renders Inspect button in idle state', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        isInspecting: false
      })
    );

    expect(html).toContain('data-testid="inspect-button"');
    expect(html).toContain('Inspect');
    expect(html).not.toContain('Inspecting...');
  });

  test('renders Inspect button in loading state with spinner when isInspecting is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        isInspecting: true
      })
    );

    expect(html).toContain('data-testid="inspect-button"');
    expect(html).toContain('Inspecting...');
    expect(html).toContain('disabled=""');
  });

  test('renders Viewport Presets dropdown with standard options', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        viewport: { width: 390, height: 844 }
      })
    );

    expect(html).toContain('data-testid="viewport-picker"');
    expect(html).toContain('Mobile (390 × 844)');
    expect(html).toContain('Tablet (768 × 1024)');
    expect(html).toContain('Desktop (1440 × 900)');
  });

  test('renders custom option when viewport does not match standard presets', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        viewport: { width: 1200, height: 800 }
      })
    );

    expect(html).toContain('Custom (1200 × 800)');
  });

  test('renders Zoom scale dropdown with 50%, 75%, 100%, and Fit options', () => {
    const html = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        zoom: 1,
        zoomMode: '100%'
      })
    );

    expect(html).toContain('data-testid="zoom-picker"');
    expect(html).toContain('50%');
    expect(html).toContain('75%');
    expect(html).toContain('100%');
    expect(html).toContain('Fit');
  });

  test('renders Overlay mode toggle with correct label for side-by-side vs overlay', () => {
    const sideBySideHtml = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        overlayMode: false
      })
    );
    expect(sideBySideHtml).toContain('data-testid="overlay-toggle"');
    expect(sideBySideHtml).toContain('Side-by-Side');

    const overlayHtml = renderToStaticMarkup(
      React.createElement(Header, {
        ...defaultProps,
        overlayMode: true
      })
    );
    expect(overlayHtml).toContain('data-testid="overlay-toggle"');
    expect(overlayHtml).toContain('X-Ray Overlay');
  });

  test('renders Load JSON button and hidden file input', () => {
    const html = renderToStaticMarkup(React.createElement(Header, defaultProps));

    expect(html).toContain('data-testid="load-json-button"');
    expect(html).toContain('Load JSON');
    expect(html).toContain('data-testid="load-json-input"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".json,application/json"');
  });

  test('invokes onSelectPreset callback when preset is changed', () => {
    const onSelectPreset = vi.fn();
    const element = captureHeaderElement({
      ...defaultProps,
      onSelectPreset
    });

    const leftGroup = (element.props.children as React.ReactElement[])[0];
    const select = leftGroup.props.children[1].props.children[1];

    select.props.onChange({ target: { value: 'pricing-ancestor-clip' } });
    expect(onSelectPreset).toHaveBeenCalledWith('pricing-ancestor-clip');
  });

  test('invokes onUrlChange and onInspect callbacks', () => {
    const onUrlChange = vi.fn();
    const onInspect = vi.fn();
    const element = captureHeaderElement({
      ...defaultProps,
      url: 'http://localhost:3000',
      onUrlChange,
      onInspect
    });

    const middleGroup = (element.props.children as React.ReactElement[])[1];
    const input = middleGroup.props.children[0].props.children;
    const button = middleGroup.props.children[1];

    input.props.onChange({ target: { value: 'http://localhost:4000' } });
    expect(onUrlChange).toHaveBeenCalledWith('http://localhost:4000');

    // Click inspect button
    button.props.onClick();
    expect(onInspect).toHaveBeenCalledWith('http://localhost:3000');

    // Enter key on input
    const preventDefault = vi.fn();
    input.props.onKeyDown({ key: 'Enter', preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onInspect).toHaveBeenCalledWith('http://localhost:3000');
  });

  test('invokes onSelectViewport callback when viewport is changed', () => {
    const onSelectViewport = vi.fn();
    const element = captureHeaderElement({
      ...defaultProps,
      onSelectViewport
    });

    const rightGroup = (element.props.children as React.ReactElement[])[2];
    const vpSelect = rightGroup.props.children[0].props.children;

    vpSelect.props.onChange({ target: { value: 'desktop' } });
    expect(onSelectViewport).toHaveBeenCalledWith({
      width: 1440,
      height: 900,
      id: 'desktop'
    });
  });

  test('invokes onZoomChange callback when zoom is changed', () => {
    const onZoomChange = vi.fn();
    const element = captureHeaderElement({
      ...defaultProps,
      onZoomChange
    });

    const rightGroup = (element.props.children as React.ReactElement[])[2];
    const zoomSelect = rightGroup.props.children[1].props.children;

    zoomSelect.props.onChange({ target: { value: '0.75' } });
    expect(onZoomChange).toHaveBeenCalledWith(0.75, '75%');

    zoomSelect.props.onChange({ target: { value: 'fit' } });
    expect(onZoomChange).toHaveBeenCalledWith('fit', 'fit');
  });

  test('invokes onToggleOverlay callback when overlay button is clicked', () => {
    const onToggleOverlay = vi.fn();
    const element = captureHeaderElement({
      ...defaultProps,
      onToggleOverlay
    });

    const rightGroup = (element.props.children as React.ReactElement[])[2];
    const overlayBtn = rightGroup.props.children[2];

    overlayBtn.props.onClick();
    expect(onToggleOverlay).toHaveBeenCalled();
  });
});

describe('JSON Upload & Parser Utilities', () => {
  test('parses a valid ANWC Snapshot JSON', () => {
    const jsonStr = JSON.stringify(validSnapshotFixture);
    const result = parseUploadedSnapshotJson(jsonStr);

    expect(result.type).toBe('snapshot');
    if (result.type === 'snapshot') {
      expect(result.snapshot.sessionId).toBe(validSnapshotFixture.sessionId);
      expect(result.snapshot.nodes.length).toBe(validSnapshotFixture.nodes.length);
    }
  });

  test('parses a valid Report JSON with summary and groups', () => {
    const report = createReport(validSnapshotFixture);
    const jsonStr = JSON.stringify(report);
    const result = parseUploadedSnapshotJson(jsonStr);

    expect(result.type).toBe('report');
    if (result.type === 'report') {
      expect(result.report.reportId).toBe(report.reportId);
    }
  });

  test('parses a valid DiffReport JSON', () => {
    const mockDiff = {
      schemaVersion: '0.1',
      diffId: 'diff_test_123',
      generatedAt: '2026-11-05T00:00:00.000Z',
      summary: {
        verifiedFixed: 2,
        persistent: 1,
        newFindings: 0,
        inconclusive: 0,
        totalBefore: 3,
        totalAfter: 1,
        repairIntegrityVerdict: 'unresolved-defects'
      }
    };
    const result = parseUploadedSnapshotJson(JSON.stringify(mockDiff));

    expect(result.type).toBe('diff');
    if (result.type === 'diff') {
      expect(result.message).toContain('2 fixed, 1 persistent, 0 new');
    }
  });

  test('throws descriptive error on malformed JSON', () => {
    expect(() => parseUploadedSnapshotJson('not a json')).toThrow(/Invalid JSON syntax/);
    expect(() => parseUploadedSnapshotJson('{}')).toThrow(/Unsupported JSON file format/);
    expect(() => parseUploadedSnapshotJson('12345')).toThrow(/Parsed JSON is not an object/);
  });
});

describe('Studio App Coordinator', () => {
  test('renders complete studio app with Header, SplitView, and FindingDrawer', () => {
    const html = renderToStaticMarkup(React.createElement(App));

    // Studio root layout
    expect(html).toContain('data-testid="studio-app"');
    expect(html).toContain('data-testid="header"');
    expect(html).toContain('data-testid="viewport-workspace"');
    expect(html).toContain('data-testid="split-view"');
    expect(html).toContain('data-testid="ground-truth-pane"');
    expect(html).toContain('anwc-xray-pane');
    expect(html).toContain('aria-label="Finding Drawer"');
    expect(html).toContain('Diagnostic Findings');

    // Default snapshot has 'POINTER_BLOCKED_AT_SAMPLES'
    expect(html).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(html).toContain('Checkout button hit-test samples blocked');
    expect(html).toContain('src/components/Checkout.tsx:42');
  });

  test('initializes with custom initialPresetId', () => {
    const html = renderToStaticMarkup(
      React.createElement(App, {
        initialPresetId: 'clean-shop',
        initialSnapshot: cleanShopSnapshot
      })
    );

    // Clean shop has no findings
    expect(html).toContain('aria-label="Finding Drawer"');
    expect(html).toContain('Diagnostic Findings (0)');
    expect(html).toContain('Shop: Healthy Layout');
  });

  test('renders overlay mode when initialOverlayMode is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(App, {
        initialOverlayMode: true
      })
    );

    // Header reflects X-Ray Overlay button state
    expect(html).toContain('X-Ray Overlay');
    // Split view in overlay mode uses split-overlay-container
    expect(html).toContain('data-testid="split-overlay-container"');
  });

  test('synchronizes finding drawer and X-Ray target highlight', () => {
    const html = renderToStaticMarkup(
      React.createElement(App, {
        initialSnapshot: shopBlockedSnapshot,
        initialSelectedFindingId: 'f-blocked-checkout'
      })
    );

    // Selected finding card has data-selected="true"
    expect(html).toContain('data-selected="true"');
    // Bounding box for n-checkout-btn is x:20 y:500 width:350 height:48
    expect(html).toContain('350');
    expect(html).toContain('500');
  });
});
