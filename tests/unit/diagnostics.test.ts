import { describe, expect, test } from 'vitest';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { snapshotSchema, type RawCapture } from '../../packages/protocol/src/index.js';
import { validRawCaptureFixture } from '../../packages/protocol/test/fixtures.js';

function captureWithFindings(): RawCapture {
  const capture = JSON.parse(JSON.stringify(validRawCaptureFixture)) as RawCapture;
  const card = capture.nodes.find((node) => node.nodeId === 'n-card-1')!;
  card.clip = {
    status: 'known', method: 'fixture', limitations: [],
    value: { intersection: { x: 8, y: 40, width: 60, height: 40 }, boxFraction: 0.5, ancestors: [{ nodeId: 'n-root', axes: 'x', box: { x: 0, y: 0, width: 60, height: 80 } }] }
  };
  card.overflow = { clientWidth: 100, clientHeight: 40, scrollWidth: 180, scrollHeight: 40, scrollableX: true, scrollableY: false };
  card.text = { status: 'known', method: 'fixture', limitations: [], value: { lineCount: 3, fragmentRects: [], clippedFragmentCount: 1 } };
  card.intent = { expectedCurrent: 'interactive', maxLines: 2, allow: [] };
  card.render.cssHiddenReasons = ['display:none'];
  card.pointer = {
    status: 'known', method: 'fixture', limitations: [],
    value: {
      samples: [{ x: 10, y: 10, result: 'blocked', blockerNodeId: 'n-overlay' }], tested: 1, blocked: 1, noTarget: 0, blockedSampleFraction: 1
    }
  };
  return capture;
}

describe('pure ANWC diagnostics', () => {
  test('creates stable normalized findings without DOM APIs', () => {
    const findings = diagnose(captureWithFindings());
    expect(typeof globalThis.document).toBe('undefined');
    expect(findings.map((item) => item.code)).toEqual([
      'HORIZONTAL_OVERFLOW', 'CLIPPED_BY_ANCESTOR', 'TEXT_CLIPPED', 'TEXT_LINE_BUDGET_EXCEEDED', 'EXPECTED_VISIBLE_BUT_HIDDEN', 'POINTER_BLOCKED_AT_SAMPLES'
    ]);
    expect(findings.find((item) => item.code === 'POINTER_BLOCKED_AT_SAMPLES')).toMatchObject({ relatedNodeIds: ['n-overlay'], evidence: { blockerNodeIds: ['n-overlay'] } });
  });

  test('records acknowledged allowances and distinguishes disabled controls', () => {
    const capture = captureWithFindings();
    const card = capture.nodes.find((node) => node.nodeId === 'n-card-1')!;
    card.intent.allow = ['horizontal-scroll', 'text-truncation'];
    card.interaction.disabled = true;
    const findings = diagnose(capture);
    expect(findings.find((item) => item.code === 'HORIZONTAL_OVERFLOW')).toMatchObject({ severity: 'info', acknowledged: true });
    expect(findings.find((item) => item.code === 'TEXT_CLIPPED')).toMatchObject({ severity: 'info', acknowledged: true });
    expect(findings.some((item) => item.code.startsWith('POINTER_'))).toBe(false);
  });
});
