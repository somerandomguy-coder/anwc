import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Finding, Snapshot } from '@anwc/protocol';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { createReport } from '../../packages/report/src/index.js';
import {
  ALL_CATEGORIES,
  ROLE_ENCODING,
  SAMPLE_ENCODING,
  applyFindingFilter,
  categorizeFinding,
  checkViewportAlignment,
  classifySample,
  findingRoleBoxes,
  legendSentence,
  nodeLookupFromSnapshot,
  numberFindings,
  overlayFindingIds,
  stepFinding,
  studioKeyAction,
  whyReported
} from '../../packages/studio/src/components/encoding.js';
import { findingViewReducer, useFindingView, type FindingViewState } from '../../packages/studio/src/components/useFindingView.js';
import { XRayPane } from '../../packages/studio/src/components/XRayPane.js';
import { XRayLegend } from '../../packages/studio/src/components/XRayLegend.js';
import { FindingDrawer } from '../../packages/studio/src/components/FindingDrawer.js';
import { FindingCard } from '../../packages/studio/src/components/FindingCard.js';
import { extractFindings } from '../../packages/studio/src/components/drawer-utils.js';
import { nextTheme } from '../../packages/studio/src/components/theme.js';
import { App } from '../../packages/studio/src/App.js';
import { shopBlockedSnapshot, pricingAncestorClipSnapshot } from '../../packages/studio/src/data/presets.js';

/* ------------------------------------------------------------------------ */
/* Fixture: three findings in three categories on the protocol fixture       */
/* ------------------------------------------------------------------------ */

const overlaySource = { siteId: 's_overlay', file: 'examples/shop/src/Overlay.tsx', line: 7, column: 5, tag: 'div' };

const multi: Snapshot = {
  ...validSnapshotFixture,
  nodes: validSnapshotFixture.nodes.map((n) => {
    if (n.nodeId === 'n-overlay') return { ...n, siteId: 's_overlay', source: overlaySource, box: { x: 0, y: 200, width: 390, height: 300 } };
    if (n.nodeId === 'n-card-2') {
      return {
        ...n,
        box: { x: 10, y: 600, width: 200, height: 40 },
        clip: { status: 'known' as const, value: { intersection: { x: 10, y: 600, width: 100, height: 40 }, boxFraction: 0.5, ancestors: [{ nodeId: 'n-root', axes: 'x' as const, box: { x: 0, y: 0, width: 110, height: 844 } }] }, method: 'fixture', limitations: [] },
        pointer: { status: 'known' as const, value: { samples: [{ x: 50, y: 620, result: 'target-or-descendant' as const, blockerNodeId: null }, { x: 160, y: 620, result: 'blocked' as const, blockerNodeId: 'n-root' }], tested: 2, blocked: 1, noTarget: 0, blockedSampleFraction: 0.5 }, method: 'fixture', limitations: [] }
      };
    }
    if (n.nodeId === 'n-root') return { ...n, box: { x: 0, y: 0, width: 390, height: 844 } };
    return n;
  }),
  findings: [
    validSnapshotFixture.findings[0]!,
    {
      findingId: 'f-clip', code: 'CLIPPED_BY_ANCESTOR', severity: 'warning', nodeId: 'n-card-2', source: null,
      message: 'Add second is clipped by a supported ancestor rectangle.',
      evidence: { kind: 'clipped-by-ancestor', boxFraction: 0.5, ancestorNodeIds: ['n-root'] },
      relatedNodeIds: ['n-root'], limitations: ['Only overflow rectangles are modelled.'], acknowledged: false, suggestion: null
    },
    {
      findingId: 'f-overflow', code: 'HORIZONTAL_OVERFLOW', severity: 'warning', nodeId: 'n-root', source: null,
      message: 'Shop overflows horizontally.', evidence: { kind: 'horizontal-overflow', clientWidth: 390, scrollWidth: 512 },
      relatedNodeIds: [], limitations: [], acknowledged: false, suggestion: null
    }
  ]
};

const report = createReport(multi);
const ordered = extractFindings(report);
const numbering = numberFindings(ordered);

function viewFor(overrides: Partial<{ overlayIds: string[]; visibleIds: string[]; isolatedFindingId: string | null; hoveredFindingId: string | null }> = {}) {
  const ids = ordered.map((f) => f.findingId);
  return { numbering, overlayIds: ids, visibleIds: ids, isolatedFindingId: null, hoveredFindingId: null, ...overrides };
}

/** Renders the drawer and x-ray from one shared useFindingView, like App does. */
function Shared(props: { categories?: Parameters<typeof useFindingView>[0]['initialCategories']; query?: string; isolated?: string | null; hovered?: string | null; selected?: string | null }): React.JSX.Element {
  const view = useFindingView({
    findings: ordered,
    selectedFindingId: props.selected ?? null,
    onSelectFinding: () => {},
    initialCategories: props.categories,
    initialQuery: props.query,
    initialIsolatedFindingId: props.isolated ?? null,
    initialHoveredFindingId: props.hovered ?? null
  });
  return React.createElement(
    'div',
    null,
    React.createElement(XRayPane, { snapshot: multi, view, selectedFindingId: props.selected ?? null, frameViewport: multi.page.viewport }),
    React.createElement(FindingDrawer, { report, snapshot: multi, selectedFindingId: props.selected ?? null, onSelectFinding: () => {}, view })
  );
}

function overlayNumbers(html: string): string[] {
  return [...html.matchAll(/class="xray-finding" data-finding-id="([^"]+)" data-finding-number="(\d+)"/g)].map((m) => `${m[1]}#${m[2]}`);
}

function cardNumbers(html: string): string[] {
  return [...html.matchAll(/data-finding-id="([^"]+)" data-finding-number="(\d+)" data-category/g)].map((m) => `${m[1]}#${m[2]}`);
}

/* ------------------------------------------------------------------------ */

describe('P11 numbering: x-ray boxes match finding cards', () => {
  test('numbers are 1-based, in list order, and stable under filtering', () => {
    expect([...numbering.values()]).toEqual([1, 2, 3]);
    const onlyClip = applyFindingFilter(ordered, { categories: new Set(['clipping'] as const), query: '' });
    expect(onlyClip.map((f) => numbering.get(f.findingId))).toEqual([numbering.get('f-clip')]);
  });

  test('every drawn box group carries the same number as its card', () => {
    const html = renderToStaticMarkup(React.createElement(Shared, {}));
    const boxes = overlayNumbers(html).sort();
    const cards = cardNumbers(html).sort();
    expect(boxes).toHaveLength(3);
    expect(cards).toEqual(boxes);
    // Number badges are drawn on the target boxes and on the cards.
    expect(html.match(/class="xray-number-badge"/g)).toHaveLength(3);
    expect(html.match(/data-testid="finding-number"/g)).toHaveLength(3);
  });

  test('hovering a finding (from either side) focuses its boxes and marks its card', () => {
    const html = renderToStaticMarkup(React.createElement(Shared, { hovered: 'f-clip' }));
    expect(html).toMatch(/data-finding-id="f-clip" data-finding-number="\d" data-focused="true"/);
    expect(html).toMatch(/data-finding-id="f-overflow" data-finding-number="\d" data-focused="false"/);
    expect(html).toMatch(/data-hovered="true"[^>]*data-finding-id="f-clip"/);
    expect(html.match(/data-hovered="true"/g)).toHaveLength(1);
  });

  test('App renders matching numbers in the x-ray and the drawer for a preset', () => {
    const html = renderToStaticMarkup(React.createElement(App, { initialSnapshot: shopBlockedSnapshot, initialSelectedFindingId: 'f-blocked-checkout' }));
    expect(overlayNumbers(html)).toEqual(['f-blocked-checkout#1']);
    expect(cardNumbers(html)).toEqual(['f-blocked-checkout#1']);
    expect(html).toContain('data-testid="xray-legend"');
  });
});

describe('P11 legend and encoding', () => {
  test('four box roles have distinct colours and distinct line styles', () => {
    const roles = Object.values(ROLE_ENCODING);
    expect(new Set(roles.map((r) => r.colorVar)).size).toBe(4);
    expect(new Set(roles.map((r) => r.dash ?? 'solid')).size).toBe(4);
    expect(ROLE_ENCODING.target.lineStyle).toBe('solid');
    expect(ROLE_ENCODING.blocker.lineStyle).toBe('dashed');
    expect(ROLE_ENCODING.clip.lineStyle).toBe('dotted');
  });

  test('hit samples have distinct colours and shapes', () => {
    const samples = Object.values(SAMPLE_ENCODING);
    expect(new Set(samples.map((s) => s.colorVar)).size).toBe(4);
    expect(new Set(samples.map((s) => s.shape)).size).toBe(4);
  });

  test('legend lists roles with line-style words and sample classes, plus the sentence', () => {
    const html = renderToStaticMarkup(React.createElement(XRayLegend, { sentence: 'Hello view.' }));
    for (const role of ['target', 'blocker', 'clip', 'context']) expect(html).toContain(`data-legend-role="${role}"`);
    for (const word of ['(solid)', '(dashed)', '(dotted)', '(dash-dot)']) expect(html).toContain(word);
    for (const cls of ['reachable', 'blocked', 'clipped', 'no-hit']) expect(html).toContain(`data-legend-sample="${cls}"`);
    expect(html).toContain('Hello view.');
  });

  test('roles come from measured evidence: target, blocker, clipping ancestor', () => {
    const pointer = findingRoleBoxes(multi, multi.findings[0]!);
    expect(pointer.map((b) => `${b.role}:${b.nodeId}`)).toEqual(['blocker:n-overlay', 'target:n-card-1']);
    const clip = findingRoleBoxes(multi, multi.findings[1]!);
    expect(clip.map((b) => `${b.role}:${b.nodeId}`)).toEqual(['clip:n-root', 'target:n-card-2']);
    // ReportFinding shape resolves the same roles.
    const reportClip = ordered.find((f) => f.findingId === 'f-clip')!;
    expect(findingRoleBoxes(multi, reportClip).map((b) => b.role)).toEqual(['clip', 'target']);
  });

  test('x-ray draws the clip ancestor dotted, the blocker dashed and the target solid', () => {
    const html = renderToStaticMarkup(React.createElement(XRayPane, { snapshot: pricingAncestorClipSnapshot, activeFinding: pricingAncestorClipSnapshot.findings[0]! }));
    expect(html).toContain('class="xray-clip-box" data-role="clip"');
    expect(html).toContain(`stroke-dasharray:${ROLE_ENCODING.clip.dash}`);
    expect(html).toContain('CLIP: &lt;');
    const blocked = renderToStaticMarkup(React.createElement(XRayPane, { snapshot: shopBlockedSnapshot, activeFinding: shopBlockedSnapshot.findings[0]! }));
    expect(blocked).toContain(`stroke-dasharray:${ROLE_ENCODING.blocker.dash}`);
    const targetRect = blocked.match(/class="xray-target-box"[^>]*><rect[^>]*>/)![0];
    expect(targetRect).not.toContain('stroke-dasharray');
  });

  test('samples are classified reachable, blocked, clipped or no-hit', () => {
    const card2 = multi.nodes.find((n) => n.nodeId === 'n-card-2')!;
    expect(classifySample({ x: 50, y: 620, result: 'target-or-descendant' }, card2)).toBe('reachable');
    expect(classifySample({ x: 160, y: 620, result: 'blocked' }, card2)).toBe('clipped');
    expect(classifySample({ x: 60, y: 620, result: 'blocked' }, card2)).toBe('blocked');
    expect(classifySample({ x: 60, y: 620, result: 'no-target' }, card2)).toBe('no-hit');
    expect(classifySample({ x: 1, y: 1, result: 'blocked' }, null)).toBe('blocked');
    const html = renderToStaticMarkup(React.createElement(XRayPane, { snapshot: multi, activeFinding: multi.findings[1]! }));
    expect(html).toContain('data-sample-class="reachable"');
    expect(html).toContain('data-sample-class="clipped"');
  });

  test('legend sentence describes the current view', () => {
    expect(legendSentence({ totalFindings: 0, visibleFindings: 0 })).toMatch(/no findings/);
    expect(legendSentence({ totalFindings: 3, visibleFindings: 0 })).toMatch(/Show all/);
    expect(legendSentence({ totalFindings: 3, visibleFindings: 3 })).toMatch(/^Showing all 3 findings: each numbered box/);
    expect(legendSentence({ totalFindings: 3, visibleFindings: 2 })).toMatch(/^Showing 2 of 3 findings/);
    const iso = legendSentence({ totalFindings: 3, visibleFindings: 3, isolated: { number: 2, code: 'CLIPPED_BY_ANCESTOR', roles: new Set(['target', 'clip'] as const) } });
    expect(iso).toBe('Showing only finding 2 (CLIPPED_BY_ANCESTOR): the solid box is its target and dotted boxes are the ancestors that clip it.');
    expect(iso.split('. ').length).toBe(1);
  });
});

describe('P11 filtering and isolation', () => {
  test('categories map rule codes, and checkboxes plus text filter the list', () => {
    expect(ordered.map((f) => categorizeFinding(f)).sort()).toEqual(['clipping', 'overflow', 'pointer']);
    expect(categorizeFinding({ code: 'OUTSIDE_VIEWPORT', evidence: { kind: 'generic', details: {} } })).toBe('visibility');
    expect(categorizeFinding({ code: 'TEXT_CLIPPED', evidence: { kind: 'text-clipped', clippedFragmentCount: 1, lineCount: 1 } })).toBe('text');
    expect(categorizeFinding({ code: 'SOMETHING_NEW', evidence: { kind: 'generic', details: {} } })).toBe('other');
    const noPointer = applyFindingFilter(ordered, { categories: new Set(['clipping', 'overflow'] as const), query: '' });
    expect(noPointer.map((f) => f.findingId).sort()).toEqual(['f-clip', 'f-overflow']);
    const bySource = applyFindingFilter(ordered, { categories: ALL_CATEGORIES, query: 'card.tsx' });
    expect(bySource.map((f) => f.findingId).sort()).toEqual(['f-clip', 'f-overlay']);
    const byMessage = applyFindingFilter(ordered, { categories: ALL_CATEGORIES, query: 'HORIZONTALLY' });
    expect(byMessage.map((f) => f.findingId)).toEqual(['f-overflow']);
  });

  test('unchecking a category removes it from the overlay and the list together', () => {
    const html = renderToStaticMarkup(React.createElement(Shared, { categories: ['clipping', 'overflow', 'text', 'visibility', 'other'] }));
    expect(overlayNumbers(html).map((s) => s.split('#')[0]).sort()).toEqual(['f-clip', 'f-overflow']);
    expect(cardNumbers(html).map((s) => s.split('#')[0]).sort()).toEqual(['f-clip', 'f-overflow']);
    expect(html).not.toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(html).toContain('Showing 2 of 3 findings');
    expect(html).toMatch(/data-testid="show-all"(?![^>]*disabled)/);
  });

  test('isolating a finding draws only its boxes and keeps the list intact', () => {
    expect(overlayFindingIds(['a', 'b', 'c'], 'b')).toEqual(['b']);
    expect(overlayFindingIds(['a', 'c'], 'b')).toEqual(['a', 'c']); // isolated finding filtered out -> show visible
    expect(overlayFindingIds(['a', 'b'], null)).toEqual(['a', 'b']);
    const html = renderToStaticMarkup(React.createElement(Shared, { isolated: 'f-clip', selected: 'f-clip' }));
    expect(overlayNumbers(html).map((s) => s.split('#')[0])).toEqual(['f-clip']);
    expect(cardNumbers(html)).toHaveLength(3);
    expect(html).toContain(`Showing only finding ${numbering.get('f-clip')} (CLIPPED_BY_ANCESTOR)`);
    expect(html).toMatch(/data-isolated="true"[^>]*data-finding-id="f-clip"/);
  });

  test('reducer: activate isolates, j/k carries isolation, Esc clears, Show all resets everything', () => {
    let s: FindingViewState = { categories: new Set(['pointer'] as const), query: 'abc', isolatedFindingId: null, hoveredFindingId: null };
    s = findingViewReducer(s, { type: 'stepped', findingId: 'f-clip' });
    expect(s.isolatedFindingId).toBeNull();
    s = findingViewReducer(s, { type: 'activate', findingId: 'f-overlay' });
    expect(s.isolatedFindingId).toBe('f-overlay');
    s = findingViewReducer(s, { type: 'stepped', findingId: 'f-clip' });
    expect(s.isolatedFindingId).toBe('f-clip');
    s = findingViewReducer(s, { type: 'clear' });
    expect(s).toMatchObject({ query: '', isolatedFindingId: null });
    expect([...s.categories]).toEqual(['pointer']);
    s = findingViewReducer(s, { type: 'toggle-category', category: 'pointer' });
    expect(s.categories.size).toBe(0);
    s = findingViewReducer({ ...s, query: 'x', isolatedFindingId: 'f-clip' }, { type: 'show-all' });
    expect(s.categories.size).toBe(ALL_CATEGORIES.size);
    expect(s).toMatchObject({ query: '', isolatedFindingId: null });
    s = findingViewReducer({ ...s, isolatedFindingId: 'gone', hoveredFindingId: 'gone' }, { type: 'reset-capture', findingIds: new Set(['f-clip']) });
    expect(s).toMatchObject({ isolatedFindingId: null, hoveredFindingId: null });
  });
});

describe('P11 why-this-is-reported and limitations', () => {
  const lookup = nodeLookupFromSnapshot(multi);

  test('pointer line names the blocker and its source from the measured relation', () => {
    expect(whyReported(multi.findings[0]!, lookup)).toBe(
      '1 of 1 hit-test sample inside the target landed on <div> "Third-party overlay" at examples/shop/src/Overlay.tsx:7 instead of the target.'
    );
    // ReportFinding carries the blocker node itself.
    expect(whyReported(ordered.find((f) => f.findingId === 'f-overlay')!)).toContain('examples/shop/src/Overlay.tsx:7');
  });

  test('every evidence kind yields a sentence built from its own numbers', () => {
    expect(whyReported(multi.findings[1]!, lookup)).toBe('Only 50% of the target box is inside the overflow rectangle of <main> "Shop".');
    expect(whyReported(multi.findings[2]!, lookup)).toBe('scrollWidth 512px is larger than clientWidth 390px, so 122px of content extends past the box.');
    const base = multi.findings[2]!;
    const mk = (evidence: Finding['evidence'], code = base.code): Finding => ({ ...base, code, evidence });
    expect(whyReported(mk({ kind: 'text-clipped', clippedFragmentCount: 2, lineCount: 3 }))).toContain('2 direct-text fragments across 3 lines');
    expect(whyReported(mk({ kind: 'text-line-budget-exceeded', observedLines: 4, maxLines: 2 }))).toBe('The text renders 4 lines but its declared budget is 2.');
    expect(whyReported(mk({ kind: 'expected-visible-but-hidden', hiddenReasons: ['display:none'], expectedCurrent: 'visible' }))).toContain('(display:none)');
    expect(whyReported(mk({ kind: 'generic', details: { boxFraction: 0, method: 'bounding-box' } }, 'OUTSIDE_VIEWPORT'))).toMatch(/^0% of the element's box intersects the viewport/);
    expect(whyReported(mk({ kind: 'generic', details: { expectedCurrent: 'visible', method: 'unsupported-transform' } }, 'UNSUPPORTED_VISIBILITY'))).toContain('unsupported-transform');
  });

  test('cards show the why line and the finding’s own limitations', () => {
    const html = renderToStaticMarkup(React.createElement(FindingCard, { finding: multi.findings[1]!, number: 2, nodeLookup: lookup }));
    expect(html).toContain('Why this is reported:');
    expect(html).toContain('Only 50% of the target box');
    expect(html).toContain('Only overflow rectangles are modelled.');
    const none = renderToStaticMarkup(React.createElement(FindingCard, { finding: multi.findings[2]! }));
    expect(none).toContain('none recorded by the rule');
  });
});

describe('P11 viewport mismatch refusal', () => {
  test('alignment check compares frame and capture viewports', () => {
    expect(checkViewportAlignment({ width: 390, height: 844 }, { width: 390, height: 844 }).aligned).toBe(true);
    expect(checkViewportAlignment({ width: 390, height: 844 }, null).aligned).toBe(true);
    const bad = checkViewportAlignment({ width: 390, height: 844 }, { width: 768, height: 1024 });
    expect(bad.aligned).toBe(false);
    if (!bad.aligned) expect(bad.message).toContain('768 × 1024');
  });

  test('x-ray refuses to draw boxes when the frame viewport differs, with a message', () => {
    const html = renderToStaticMarkup(React.createElement(XRayPane, {
      snapshot: multi, view: viewFor(), frameViewport: { width: 768, height: 1024 }
    }));
    expect(html).toContain('data-testid="xray-viewport-mismatch"');
    expect(html).toContain('data-overlay="refused"');
    expect(html).toContain('capture was taken at 390 × 844');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('xray-finding');
    const ok = renderToStaticMarkup(React.createElement(XRayPane, { snapshot: multi, view: viewFor(), frameViewport: { width: 390, height: 844 } }));
    expect(ok).toContain('data-overlay="drawn"');
    expect(ok).not.toContain('xray-viewport-mismatch');
  });
});

describe('P11 keyboard and themes', () => {
  test('j/k/slash/Esc map to actions; typing in a field is left alone except Esc', () => {
    expect(studioKeyAction({ key: 'j' })).toBe('next');
    expect(studioKeyAction({ key: 'k' })).toBe('prev');
    expect(studioKeyAction({ key: '/' })).toBe('focus-filter');
    expect(studioKeyAction({ key: 'Escape' })).toBe('clear');
    expect(studioKeyAction({ key: 'j', targetTag: 'INPUT' })).toBeNull();
    expect(studioKeyAction({ key: '/', targetEditable: true })).toBeNull();
    expect(studioKeyAction({ key: 'Escape', targetTag: 'input' })).toBe('clear');
    expect(studioKeyAction({ key: 'j', ctrlKey: true })).toBeNull();
    expect(studioKeyAction({ key: 'x' })).toBeNull();
  });

  test('stepping wraps through the visible findings', () => {
    expect(stepFinding(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(stepFinding(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(stepFinding(['a', 'b'], null, 1)).toBe('a');
    expect(stepFinding(['a', 'b'], 'hidden', -1)).toBe('b');
    expect(stepFinding([], 'a', 1)).toBeNull();
  });

  test('every encoding token is defined for dark, system-light and pinned-light themes', () => {
    const css = readFileSync(fileURLToPath(new URL('../../packages/studio/src/index.css', import.meta.url)), 'utf8');
    const blocks = {
      dark: css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: light)')),
      systemLight: css.slice(css.indexOf('@media (prefers-color-scheme: light)'), css.indexOf(':root[data-theme="light"]')),
      pinnedLight: css.slice(css.indexOf(':root[data-theme="light"]'), css.indexOf('/* ---------- Base'))
    };
    const tokens = [
      ...Object.values(ROLE_ENCODING).flatMap((r) => [r.colorVar, `${r.colorVar}-fill`]),
      ...Object.values(SAMPLE_ENCODING).map((s) => s.colorVar),
      '--anwc-bg', '--anwc-fg', '--anwc-surface', '--anwc-xray-bg', '--anwc-sample-halo'
    ];
    for (const [name, block] of Object.entries(blocks)) {
      for (const token of tokens) {
        if (name !== 'dark' && token === '--anwc-role-context-fill') continue; // transparent in every theme
        expect(block, `${token} in ${name}`).toContain(`${token}:`);
      }
    }
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});

