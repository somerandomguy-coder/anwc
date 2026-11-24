import { describe, expect, test } from 'vitest';
import type { Measurement, RawCapture } from '../../packages/protocol/src/index.js';
import { evaluateBoundarySignal, legacyBoundaryFallback, withoutBoundarySignal } from '../conformance/boundary.js';
import { conformanceCases } from '../conformance/matrix.js';
import type { BoundarySignal } from '../conformance/types.js';
import { readFileSync } from 'node:fs';
import { gateMarkup, orderedCases, ruleGates, ruleOracles } from '../conformance/gates.js';
import { detectorRuleCodes, ruleCodesIn } from '../conformance/rule-codes.js';

describe('Q05 Conformance Matrix Specification', () => {
  test('defines defective, healthy and boundary cases across the 6 required families', () => {
    // Actual counts by role; these are cases, not pairs.
    const byRole = (role: string) => conformanceCases.filter((c) => c.role === role).length;
    expect({ total: conformanceCases.length, defective: byRole('defective'), healthy: byRole('healthy'), boundary: byRole('boundary') })
      .toEqual({ total: 36, defective: 13, healthy: 14, boundary: 9 });

    const families = new Set(conformanceCases.map((c) => c.family));
    expect(families).toEqual(new Set([
      'text',
      'clips-scroll',
      'pointer-layers',
      'state-semantics',
      'identity-change',
      'unsupported-performance'
    ]));

    // Every family has at least 1 defective, 1 healthy, and 1 boundary case
    for (const fam of families) {
      const casesInFamily = conformanceCases.filter((c) => c.family === fam);
      const roles = new Set(casesInFamily.map((c) => c.role));
      expect(roles.has('defective'), `Family ${fam} missing defective role`).toBe(true);
      expect(roles.has('healthy'), `Family ${fam} missing healthy role`).toBe(true);
      expect(roles.has('boundary'), `Family ${fam} missing boundary role`).toBe(true);
    }
  });

  test('each case has valid HTML, description, and independent oracle function', () => {
    const ids = new Set<string>();
    for (const c of conformanceCases) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.html.length).toBeGreaterThan(0);
      // innerHTML never executes scripts; DOM preparation belongs in setup().
      expect(c.html, `${c.id} relies on an inert <script>`).not.toMatch(/<script/i);
      expect(typeof c.oracle).toBe('function');
    }
  });

  test('boundary cases, and only boundary cases, declare a case-specific signal tied to their markup', () => {
    for (const c of conformanceCases) {
      if (c.role !== 'boundary') {
        expect(c.boundarySignal, `${c.id} is not a boundary case`).toBeUndefined();
        continue;
      }
      expect(c.boundarySignal, `${c.id} needs a boundarySignal`).toBeDefined();
      const signal = c.boundarySignal!;
      if ('key' in signal) expect(c.html, `${c.id} signal key must exist in its HTML`).toContain(`data-anwc-key="${signal.key}"`);
      if (signal.kind === 'coverage-cap') expect(c.captureOptions?.maxNodes, `${c.id} needs a node cap`).toBeGreaterThan(0);
    }
    const gaps = conformanceCases.filter((c) => c.boundarySignal?.kind === 'known-gap').map((c) => c.id);
    expect(gaps).toEqual(['unsupported-shadow-boundary', 'unsupported-canvas-boundary']);
  });
});

function node(key: string, overrides: Partial<Measurement> = {}): Measurement {
  const unknownPaint = { status: 'unknown', value: null, method: 'v0', limitations: ['Paint visibility is unsupported in v0.'] } as const;
  return {
    nodeId: `n-${key}`, siteId: null, source: null, parentNodeId: null, tag: 'div', semanticKey: key, role: null,
    label: '', labelMethod: 'none', textTruncated: false, box: { x: 0, y: 0, width: 100, height: 20 },
    render: { hasBox: true, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'computed-style-ancestry', limitations: [] } },
    viewport: { status: 'known', value: { intersection: null, boxFraction: 1 }, method: 'viewport-rectangle', limitations: [] },
    clip: { status: 'known', value: { intersection: null, boxFraction: 1, ancestors: [] }, method: 'client-box-ancestor-clipping', limitations: [] },
    overflow: null,
    text: { status: 'known', value: { lineCount: 1, fragmentRects: [], clippedFragmentCount: 0 }, method: 'range-client-rects-inline-text', limitations: [] },
    pointer: { status: 'known', value: { samples: [], tested: 25, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }, method: 'browser-hit-test-grid', limitations: [] },
    interaction: { candidate: true, disabled: false, inert: false, pointerEvents: 'auto' },
    paintVisibility: unknownPaint,
    intent: { expectedCurrent: null, maxLines: null, allow: [] },
    ...overrides
  } as Measurement;
}

function capture(nodes: Measurement[], extra: Partial<RawCapture> = {}): RawCapture {
  return {
    schemaVersion: '0.1', sessionId: 's', captureId: 's:1', capturedAt: new Date(0).toISOString(),
    page: { url: 'http://127.0.0.1/', title: '', viewport: { width: 800, height: 600 }, scroll: { x: 0, y: 0 }, devicePixelRatio: 1, visualViewportScale: 1, scenario: null },
    environment: { browser: 'test', browserVersion: 'test', compilerVersion: null, runtimeVersion: '0.0.0' },
    readiness: { settled: true, waitMs: 0, reasons: ['fonts ready'] },
    coverage: {
      complete: true, discoveredNodes: nodes.length, inspectedNodes: nodes.length, skippedNodes: 0, reasons: [], capabilities: [],
      unsupportedFeatures: ['paint-visibility', 'non-rectangular-clipping', 'transformed-geometry']
    },
    timingsMs: { capture: 0, serialize: 0 },
    nodes,
    ...extra
  } as RawCapture;
}

/** A capture that carries each kind of signal, as the runtime emits it. */
const withSignal: Record<Exclude<BoundarySignal['kind'], 'known-gap'>, { signal: BoundarySignal; capture: RawCapture }> = {
  'coverage-cap': {
    signal: { kind: 'coverage-cap', reason: 'max node cap reached' },
    capture: capture([node('a')], { coverage: { complete: false, discoveredNodes: 5, inspectedNodes: 1, skippedNodes: 4, reasons: ['max node cap reached'], capabilities: [], unsupportedFeatures: ['paint-visibility'] } })
  },
  'readiness-unsettled': {
    signal: { kind: 'readiness-unsettled', reason: 'font readiness did not complete before timeout' },
    capture: capture([node('a')], { readiness: { settled: false, waitMs: 400, reasons: ['font readiness did not complete before timeout'] } })
  },
  'assessment-unknown': {
    signal: { kind: 'assessment-unknown', key: 'box', field: 'clip', limitation: 'Transforms are unsupported' },
    capture: capture([node('box', { clip: { status: 'unknown', value: null, method: 'client-box-ancestor-clipping', limitations: ['Transforms are unsupported for rectangular clip fractions.'] } })])
  },
  'boxless-node': {
    signal: { kind: 'boxless-node', key: 'wrap' },
    capture: capture([node('wrap', { box: null, render: { hasBox: false, cssHiddenReasons: [], effectiveOpacityZero: { status: 'known', value: false, method: 'computed-style-ancestry', limitations: [] } } })])
  },
  'pointer-sample-collapse': {
    signal: { kind: 'pointer-sample-collapse', key: 'thin', sampleBudget: 25 },
    capture: capture([node('thin', { pointer: { status: 'known', value: { samples: [], tested: 10, blocked: 0, noTarget: 0, blockedSampleFraction: 0 }, method: 'browser-hit-test-grid', limitations: [] } })])
  }
};

describe('L3 boundary signal checks', () => {
  for (const [kind, { signal, capture: withIt }] of Object.entries(withSignal)) {
    test(`${kind}: passes with the signal and fails once only that signal is removed`, () => {
      expect(evaluateBoundarySignal(signal, withIt).present).toBe(true);
      const stripped = withoutBoundarySignal(signal, withIt);
      expect(evaluateBoundarySignal(signal, stripped).present).toBe(false);
      // The stripped capture still has all-node paint-unknown, so the pre-L3
      // fallback would have passed it: that fallback is not specific.
      expect(legacyBoundaryFallback(stripped)).toBe(true);
    });
  }

  test('all-node paint-unknown alone satisfies no declared boundary signal', () => {
    const plain = capture([node('box'), node('wrap'), node('thin')]);
    expect(legacyBoundaryFallback(plain)).toBe(true);
    for (const c of conformanceCases.filter((candidate) => candidate.boundarySignal)) {
      expect(evaluateBoundarySignal(c.boundarySignal!, plain).present, c.id).toBe(false);
    }
  });

  test('a limitation on a different node or field does not count', () => {
    const signal: BoundarySignal = { kind: 'assessment-unknown', key: 'box', field: 'clip', limitation: 'Transforms are unsupported' };
    const unknownClip = { status: 'unknown', value: null, method: 'client-box-ancestor-clipping', limitations: ['Transforms are unsupported for rectangular clip fractions.'] } as const;
    expect(evaluateBoundarySignal(signal, capture([node('box'), node('other', { clip: unknownClip })])).present).toBe(false);
    const unknownText = { status: 'unknown', value: null, method: 'range-client-rects-inline-text', limitations: ['Transforms are unsupported for text fragment observations.'] } as const;
    expect(evaluateBoundarySignal(signal, capture([node('box', { text: unknownText })])).present).toBe(false);
  });

  test('known gaps never pass', () => {
    const signal: BoundarySignal = { kind: 'known-gap', reason: 'no runtime signal' };
    expect(evaluateBoundarySignal(signal, withSignal['coverage-cap'].capture).present).toBe(false);
  });
});

describe('P15 rule gates: every detector rule has an independent oracle gate', () => {
  test('the rule-code scanner finds a planted rule (canary) before scanning the real source', () => {
    const planted = `findings.push(finding(node, 'PLANTED_CANARY_RULE', 'msg', evidence));\nfindings.push(finding(node, ok ? 'A_RULE' : 'B_RULE', 'm', e));`;
    expect(ruleCodesIn(planted)).toEqual(['A_RULE', 'B_RULE', 'PLANTED_CANARY_RULE']);
  });

  test('gate rules are exactly the codes diagnose can emit', () => {
    const codes = detectorRuleCodes();
    expect(codes.length).toBeGreaterThan(0);
    expect(ruleGates.map((gate) => gate.rule).sort()).toEqual(codes);
    expect(Object.keys(ruleOracles).sort()).toEqual(codes);
  });

  test('each gate has a planted defect, a healthy control and a boundary, all keyed into real markup', () => {
    const matrixIds = new Set(conformanceCases.map((c) => c.id));
    const ids = new Set<string>();
    for (const gate of ruleGates) {
      const roles = new Set(gate.cases.map((c) => c.role));
      expect([...roles].sort(), gate.rule).toEqual(['boundary', 'defect', 'healthy']);
      expect(orderedCases(gate)[0]!.role, `${gate.rule} must run its canary first`).toBe('defect');
      for (const c of gate.cases) {
        expect(ids.has(c.id), `duplicate gate case id ${c.id}`).toBe(false);
        ids.add(c.id);
        if (c.role === 'defect') expect(c.oracleExpects, `${c.id}: a defect must be a violation`).toBe(true);
        if (c.role === 'healthy') expect(c.oracleExpects, `${c.id}: a healthy control must not be a violation`).toBe(false);
        if (c.fromCase) expect(matrixIds.has(c.fromCase), `${c.id} reuses unknown matrix case ${c.fromCase}`).toBe(true);
        const { html } = gateMarkup(c);
        expect(html, `${c.id} key must exist in its markup`).toContain(`data-anwc-key="${c.key}"`);
        expect(html, `${c.id} relies on an inert <script>`).not.toMatch(/<script/i);
        // A recorded disagreement is never allowed on the canary.
        if (c.role === 'defect') expect(c.knownDisagreement, c.id).toBeUndefined();
      }
    }
  });

  test('recorded oracle/ANWC disagreements are exactly the remaining P15 findings', () => {
    const recorded = ruleGates.flatMap((gate) => gate.cases.filter((c) => c.knownDisagreement).map((c) => `${gate.rule}/${c.id}`));
    expect(recorded).toEqual([
      'POINTER_PARTIALLY_BLOCKED/partial-thin-strip'
    ]);
  });

  test('the oracle module imports nothing, so it cannot borrow ANWC code', () => {
    const source = readFileSync(new URL('../conformance/oracles.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(|import\(/);
    expect(source).not.toMatch(/__ANWC_TEST__|@anwc\//);
  });
});
