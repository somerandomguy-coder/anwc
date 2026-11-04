import { describe, expect, test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeXRayBoundingBoxes,
  mapSampleColor,
  getAllPointerSamples,
  buildHoveredSampleInfo
} from '../../packages/studio/src/components/xray-utils.js';
import { SampleTooltip } from '../../packages/studio/src/components/SampleTooltip.js';
import { XRayPane } from '../../packages/studio/src/components/XRayPane.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

describe('Studio X-Ray Canvas Utilities', () => {
  test('maps hit sample results to correct status colors', () => {
    expect(mapSampleColor('target-or-descendant')).toBe('#22c55e'); // Green
    expect(mapSampleColor('blocked')).toBe('#ef4444'); // Red
    expect(mapSampleColor('no-target')).toBe('#f59e0b'); // Amber
    expect(mapSampleColor('unknown-status')).toBe('#94a3b8'); // Slate fallback
  });

  test('extracts target and blocker bounding boxes for active finding', () => {
    const finding = validSnapshotFixture.findings[0]!;
    const boxes = computeXRayBoundingBoxes(validSnapshotFixture, finding);
    expect(boxes.target).toBeDefined();
    expect(boxes.blockers).toBeInstanceOf(Array);
    expect(boxes.target).toEqual({ x: 0, y: 0, width: 120, height: 40 });
    expect(boxes.blockers.length).toBe(1);
    expect(boxes.blockers[0]).toEqual({ x: 0, y: 0, width: 120, height: 40 });
    expect(boxes.targetNode?.nodeId).toBe('n-card-1');
    expect(boxes.blockerNodes.length).toBe(1);
    expect(boxes.blockerNodes[0]?.nodeId).toBe('n-overlay');
  });

  test('extracts ancestor bounding boxes for clipped-by-ancestor finding', () => {
    const clippedFinding = {
      ...validSnapshotFixture.findings[0]!,
      code: 'CLIPPED_BY_ANCESTOR',
      evidence: { kind: 'clipped-by-ancestor' as const, boxFraction: 0.2, ancestorNodeIds: ['n-overlay'] },
      relatedNodeIds: []
    };
    const boxes = computeXRayBoundingBoxes(validSnapshotFixture, clippedFinding);
    expect(boxes.target).toBeDefined();
    expect(boxes.blockers.length).toBe(1);
    expect(boxes.blockerNodes[0]?.nodeId).toBe('n-overlay');
  });

  test('handles undefined or null finding gracefully', () => {
    const boxes = computeXRayBoundingBoxes(validSnapshotFixture, null);
    expect(boxes.target).toBeUndefined();
    expect(boxes.blockers).toEqual([]);
    expect(boxes.targetNode).toBeUndefined();
    expect(boxes.blockerNodes).toEqual([]);
    expect(boxes.allNodes.length).toBe(validSnapshotFixture.nodes.length);
  });

  test('extracts all pointer samples from snapshot nodes', () => {
    const samples = getAllPointerSamples(validSnapshotFixture);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]).toMatchObject({
      x: 60,
      y: 20,
      result: 'target-or-descendant',
      targetNodeId: 'n-card-1'
    });
  });

  test('builds enriched hovered sample info with blocker details', () => {
    const sample = {
      x: 50,
      y: 30,
      result: 'blocked' as const,
      blockerNodeId: 'n-overlay',
      targetNodeId: 'n-card-1'
    };
    const info = buildHoveredSampleInfo(sample, validSnapshotFixture, { screenX: 100, screenY: 200 });
    expect(info.x).toBe(50);
    expect(info.y).toBe(30);
    expect(info.result).toBe('blocked');
    expect(info.blockerNodeId).toBe('n-overlay');
    expect(info.blockerTag).toBe('div');
    expect(info.blockerLabel).toBe('Third-party overlay');
    expect(info.screenX).toBe(100);
    expect(info.screenY).toBe(200);
  });
});

describe('SampleTooltip Component', () => {
  test('returns null when sample is null', () => {
    const html = renderToStaticMarkup(React.createElement(SampleTooltip, { sample: null }));
    expect(html).toBe('');
  });

  test('renders target hit sample details', () => {
    const html = renderToStaticMarkup(
      React.createElement(SampleTooltip, {
        sample: {
          x: 120,
          y: 80,
          result: 'target-or-descendant',
          targetNodeId: 'n-btn',
          screenX: 250,
          screenY: 350
        }
      })
    );
    expect(html).toContain('Raycast Sample');
    expect(html).toContain('Target Hit');
    expect(html).toContain('(120, 80)');
    expect(html).toContain('n-btn');
  });

  test('renders blocked sample details with blocker info', () => {
    const html = renderToStaticMarkup(
      React.createElement(SampleTooltip, {
        sample: {
          x: 15,
          y: 25,
          result: 'blocked',
          targetNodeId: 'n-submit',
          blockerNodeId: 'n-modal-overlay',
          blockerTag: 'aside',
          blockerLabel: 'Cookie Banner',
          screenX: 50,
          screenY: 60
        }
      })
    );
    expect(html).toContain('Blocked');
    expect(html).toContain('(15, 25)');
    expect(html).toContain('Blocked by:');
    expect(html).toContain('&lt;aside&gt;');
    expect(html).toContain('&quot;Cookie Banner&quot;');
    expect(html).toContain('n-modal-overlay');
  });
});

describe('XRayPane Component', () => {
  test('renders SVG canvas with viewport dimensions and geometric elements', () => {
    const finding = validSnapshotFixture.findings[0]!;
    const html = renderToStaticMarkup(
      React.createElement(XRayPane, {
        snapshot: validSnapshotFixture,
        activeFinding: finding
      })
    );

    // Matches viewport dimensions: 390 x 844
    expect(html).toContain('viewBox="0 0 390 844"');
    // Renders target bounding box
    expect(html).toContain('xray-target-box');
    expect(html).toContain('TARGET: &lt;button&gt;');
    // Renders blocker bounding box
    expect(html).toContain('xray-blocker-box');
    expect(html).toContain('BLOCKER: &lt;div&gt;');
    // Renders samples group
    expect(html).toContain('xray-samples');
    // Circle sample with color green (#22c55e)
    expect(html).toContain('fill="#22c55e"');
  });

  test('respects overlayMode and zoom level', () => {
    const overlayHtml = renderToStaticMarkup(
      React.createElement(XRayPane, {
        snapshot: validSnapshotFixture,
        overlayMode: true,
        zoom: 0.75
      })
    );

    // Scaled container
    expect(overlayHtml).toContain('transform:scale(0.75)');
    // In overlayMode, background fills are suppressed
    expect(overlayHtml).not.toContain('fill="#0b1120"');
  });
});
