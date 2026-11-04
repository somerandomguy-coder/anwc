import { describe, expect, test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeFitZoom,
  computeScaledDimensions,
  clampSplitRatio,
  computePaneWidths
} from '../../packages/studio/src/components/split-utils.js';
import { GroundTruthPane, isValidTargetUrl } from '../../packages/studio/src/components/GroundTruthPane.js';
import { SplitView } from '../../packages/studio/src/components/SplitView.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

describe('Studio Split View & Scaling Utilities', () => {
  test('clamps split ratio within allowed range', () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0.05)).toBe(0.1);
    expect(clampSplitRatio(0.95)).toBe(0.9);
    expect(clampSplitRatio(0.701)).toBe(0.7);
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
  });

  test('computes pane widths for side-by-side, single pane, and overlay modes', () => {
    // 50/50 default
    expect(computePaneWidths(0.5, 'both', false)).toEqual({ left: '50%', right: '50%' });
    // 70/30 preset
    expect(computePaneWidths(0.7, 'both', false)).toEqual({ left: '70%', right: '30%' });
    // 30/70 preset
    expect(computePaneWidths(0.3, 'both', false)).toEqual({ left: '30%', right: '70%' });
    // Left-only single pane
    expect(computePaneWidths(0.5, 'left', false)).toEqual({ left: '100%', right: '0%' });
    // Right-only single pane
    expect(computePaneWidths(0.5, 'right', false)).toEqual({ left: '0%', right: '100%' });
    // Overlay mode (both take 100% of viewport area stacked)
    expect(computePaneWidths(0.5, 'both', true)).toEqual({ left: '100%', right: '100%' });
  });

  test('computes scaled dimensions correctly', () => {
    const viewport = { width: 390, height: 844 };
    expect(computeScaledDimensions(viewport, 1)).toEqual({ width: 390, height: 844 });
    expect(computeScaledDimensions(viewport, 0.75)).toEqual({ width: 293, height: 633 });
    expect(computeScaledDimensions(viewport, 0.5)).toEqual({ width: 195, height: 422 });
  });

  test('computes fit zoom based on container dimensions', () => {
    const mobileViewport = { width: 390, height: 844 };
    // Container large enough for 100%
    const largeContainer = { width: 1200, height: 1000 };
    expect(computeFitZoom(mobileViewport, largeContainer, 32)).toBe(1.0);

    // Constrained height container (600px height with 32px padding -> 536px available / 844 = 0.635)
    const shortContainer = { width: 1200, height: 600 };
    const zoom = computeFitZoom(mobileViewport, shortContainer, 32);
    expect(zoom).toBeLessThan(1);
    expect(zoom).toBe(0.64);

    // Desktop viewport (1440x900) in laptop screen (1200x800)
    const desktopViewport = { width: 1440, height: 900 };
    const laptopContainer = { width: 1200, height: 800 };
    const desktopFit = computeFitZoom(desktopViewport, laptopContainer, 32);
    expect(desktopFit).toBeLessThan(1);
    // (1200 - 64) / 1440 = 0.788
    expect(desktopFit).toBe(0.79);
  });
});

describe('GroundTruthPane Component', () => {
  const defaultViewport = { width: 390, height: 844 };

  test('validates target URLs safely against dangerous schemes and markdown syntax', () => {
    expect(isValidTargetUrl('http://localhost:3000/app')).toBe(true);
    expect(isValidTargetUrl('https://demo.anwc.dev')).toBe(true);
    expect(isValidTargetUrl('file:///etc/passwd')).toBe(false);
    expect(isValidTargetUrl('javascript:alert(1)')).toBe(false);
    expect(isValidTargetUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidTargetUrl('ftp://ftp.example.com')).toBe(false);
    expect(isValidTargetUrl('[app](http://localhost:3000)')).toBe(false);
    expect(isValidTargetUrl('')).toBe(false);
    expect(isValidTargetUrl(null)).toBe(false);
    expect(isValidTargetUrl(undefined)).toBe(false);
  });

  test('renders sandboxed iframe when valid target URL is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://localhost:3000/app',
        viewport: defaultViewport
      })
    );

    // Renders iframe pointing to live target app
    expect(html).toContain('<iframe');
    expect(html).toContain('src="http://localhost:3000/app"');
    // Enforces strict sandbox permissions
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-forms"');
    // Dimensions match viewport exactly
    expect(html).toContain('width:390px');
    expect(html).toContain('height:844px');
  });

  test('falls back to blueprint SVG when unsafe or malicious URL is provided', () => {
    const maliciousSchemes = [
      'javascript:alert(document.cookie)',
      'file:///C:/Windows/System32',
      '[click here](http://malicious.com)',
      'data:text/html,bad'
    ];

    for (const badUrl of maliciousSchemes) {
      const html = renderToStaticMarkup(
        React.createElement(GroundTruthPane, {
          url: badUrl,
          viewport: defaultViewport
        })
      );
      expect(html).not.toContain('<iframe');
      expect(html).toContain('anwc-blueprint-svg');
    }
  });

  test('renders animated highlight pulse overlay over active target element', () => {
    const targetBox = { x: 20, y: 150, width: 280, height: 48 };
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://localhost:3000/app',
        viewport: defaultViewport,
        activeFindingBox: targetBox
      })
    );

    // Overlay highlight box present
    expect(html).toContain('anwc-ground-truth-highlight');
    // Coordinates match target box
    expect(html).toContain('left:20px');
    expect(html).toContain('top:150px');
    expect(html).toContain('width:280px');
    expect(html).toContain('height:48px');
    // Includes pulse animation
    expect(html).toContain('anwc-pulse');
  });

  test('derives target box automatically from activeFinding and snapshot', () => {
    const finding = validSnapshotFixture.findings[0]!;
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://localhost:3000/app',
        viewport: validSnapshotFixture.page.viewport,
        snapshot: validSnapshotFixture,
        activeFinding: finding
      })
    );

    // Finding 0 target node is n-card-1 with box { x: 0, y: 0, width: 120, height: 40 }
    expect(html).toContain('anwc-ground-truth-highlight');
    expect(html).toContain('left:0px');
    expect(html).toContain('top:0px');
    expect(html).toContain('width:120px');
    expect(html).toContain('height:40px');
  });

  test('renders SVG blueprint representation when no live URL is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: null,
        viewport: validSnapshotFixture.page.viewport,
        snapshot: validSnapshotFixture
      })
    );

    // No iframe should be rendered
    expect(html).not.toContain('<iframe');
    // Renders SVG blueprint canvas
    expect(html).toContain('anwc-blueprint-svg');
    expect(html).toContain('viewBox="0 0 390 844"');
    // Renders blueprint wireframe rects for DOM nodes
    expect(html).toContain('anwc-blueprint-node');
    // Shows blueprint grid pattern
    expect(html).toContain('blueprint-grid');
  });

  test('renders clean blueprint fallback placeholder when URL and snapshot nodes are absent', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        viewport: defaultViewport
      })
    );

    expect(html).not.toContain('<iframe');
    expect(html).toContain('anwc-blueprint-svg');
    expect(html).toContain('No Live Ground Truth URL');
  });

  test('applies zoom scaling with top center transform origin when zoom is specified', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://localhost:3000/app',
        viewport: defaultViewport,
        zoom: 0.75
      })
    );

    expect(html).toContain('transform:scale(0.75)');
    expect(html).toContain('transform-origin:top center');
  });

  test('omits transform style when zoom is 1 (unscaled)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://localhost:3000/app',
        viewport: defaultViewport,
        zoom: 1
      })
    );

    expect(html).not.toContain('transform:scale(1)');
  });
});

describe('SplitView Component', () => {
  const dummyLeft = React.createElement('div', { 'data-testid': 'mock-left' }, 'Left Content');
  const dummyRight = React.createElement('div', { 'data-testid': 'mock-right' }, 'Right Content');

  test('renders side-by-side layout with default 50/50 split in uncontrolled mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight
      })
    );

    expect(html).toContain('mock-left');
    expect(html).toContain('mock-right');
    expect(html).toContain('anwc-split-view');
    expect(html).toContain('anwc-split-divider');
    // 50% left and right width
    expect(html).toContain('width:50%');
  });

  test('supports preset divider ratios 70/30 and 30/70', () => {
    const html70 = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        splitRatio: 0.7
      })
    );
    expect(html70).toContain('width:70%');
    expect(html70).toContain('width:30%');

    const html30 = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        splitRatio: 0.3
      })
    );
    expect(html30).toContain('width:30%');
    expect(html30).toContain('width:70%');
  });

  test('supports single-pane toggling', () => {
    const leftOnlyHtml = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        activePane: 'left'
      })
    );
    expect(leftOnlyHtml).toContain('mock-left');
    expect(leftOnlyHtml).not.toContain('mock-right');

    const rightOnlyHtml = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        activePane: 'right'
      })
    );
    expect(rightOnlyHtml).not.toContain('mock-left');
    expect(rightOnlyHtml).toContain('mock-right');
  });

  test('supports overlay mode with absolute positioning, opacity, and blend mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        overlayMode: true,
        overlayOpacity: 0.8,
        blendMode: 'difference'
      })
    );

    expect(html).toContain('anwc-split-overlay-container');
    expect(html).toContain('anwc-overlay-layer');
    expect(html).toContain('position:absolute');
    expect(html).toContain('opacity:0.8');
    expect(html).toContain('mix-blend-mode:difference');
    expect(html).toContain('anwc-overlay-toolbar');
  });

  test('applies uniform zoom scaling consistently when scaled', () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        zoom: 0.65
      })
    );

    expect(html).toContain('transform:scale(0.65)');
    expect(html).toContain('transform-origin:top center');
  });

  test('omits transform style when unscaled (zoom === 1)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SplitView, {
        left: dummyLeft,
        right: dummyRight,
        zoom: 1
      })
    );

    expect(html).not.toContain('transform:scale(1)');
  });
});
