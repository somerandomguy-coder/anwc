import { conformanceCases } from './matrix.js';
import { ruleOracles, type RuleCode } from './oracles.js';

/**
 * Rule gate tables (PHASE_4 P15).
 *
 * One gate per detector rule code emitted by `diagnose`. Each gate lists a
 * planted defect (the canary, always run first), a healthy control and at
 * least one threshold boundary. For every case the independent oracle in
 * `oracles.ts` states the ground truth for the keyed element, `oracleExpects`
 * pins that premise, and `tests/browser/oracle.spec.ts` requires ANWC to report
 * the rule on that element exactly when the oracle says the fact is true.
 *
 * "Boundary" here means the rule's threshold edge (exact fit vs one pixel
 * over, touching vs overlapping), not the unsupported-feature boundary role of
 * the conformance matrix.
 *
 * `knownDisagreement` marks a case where ANWC and the oracle are recorded as
 * disagreeing. The spec requires the disagreement to persist (so a fix forces
 * this table to be updated) and never counts it as agreement.
 */

export type GateRole = 'defect' | 'healthy' | 'boundary';

export interface GateCase {
  id: string;
  role: GateRole;
  /** `data-anwc-key` of the element the rule is judged on. */
  key: string;
  /** What the oracle must say about the keyed element (the case premise). */
  oracleExpects: boolean;
  /** Reuse a conformance matrix case's HTML and setup instead of new markup. */
  fromCase?: string;
  html?: string;
  setup?: (page: any) => Promise<void>;
  note: string;
  knownDisagreement?: string;
}

export interface RuleGate {
  rule: RuleCode;
  cases: GateCase[];
}

const resetBody = '<style>body { margin: 0; }</style>';

export const ruleGates: RuleGate[] = [
  {
    rule: 'HORIZONTAL_OVERFLOW',
    cases: [
      { id: 'overflow-defect', role: 'defect', key: 'long-url', oracleExpects: true, fromCase: 'text-overflow-defective', note: 'Unbroken nowrap URL wider than its block.' },
      { id: 'overflow-healthy', role: 'healthy', key: 'nested-text', oracleExpects: false, fromCase: 'text-nested-spans-healthy', note: 'Wrapping inline text.' },
      {
        id: 'overflow-exact-fit', role: 'boundary', key: 'of-exact', oracleExpects: false,
        html: `<div data-anwc-key="of-exact" style="width: 100px;"><div style="width: 100px; height: 10px;"></div></div>`,
        note: 'Child exactly as wide as the container: scrollWidth === clientWidth.'
      },
      {
        id: 'overflow-one-pixel', role: 'boundary', key: 'of-one', oracleExpects: true,
        html: `<div data-anwc-key="of-one" style="width: 100px;"><div style="width: 101px; height: 10px;"></div></div>`,
        note: 'Child one pixel wider than the container.'
      }
    ]
  },
  {
    rule: 'CLIPPED_BY_ANCESTOR',
    cases: [
      { id: 'clip-defect-x', role: 'defect', key: 'x-clipped-btn', oracleExpects: true, fromCase: 'clip-x-defective', note: 'Button wider than an overflow-x: hidden parent.' },
      { id: 'clip-defect-y', role: 'defect', key: 'y-clipped-btn', oracleExpects: true, fromCase: 'clip-y-defective', note: 'Button taller than an overflow-y: hidden parent.' },
      { id: 'clip-healthy', role: 'healthy', key: 'sticky-pass-nav', oracleExpects: false, fromCase: 'clip-sticky-healthy', note: 'Sticky header that fits its scroller.' },
      {
        id: 'clip-exact-fit', role: 'boundary', key: 'clip-exact', oracleExpects: false,
        html: `<div style="width: 100px; height: 40px; overflow: hidden;"><div data-anwc-key="clip-exact" style="width: 100px; height: 40px;"></div></div>`,
        note: 'Child exactly fills an overflow: hidden parent.'
      },
      {
        id: 'clip-subpixel-fit', role: 'boundary', key: 'clip-subpixel', oracleExpects: false,
        html: `<div style="width: 100.4px; height: 40px; overflow: hidden;"><div data-anwc-key="clip-subpixel" style="width: 100.4px; height: 40px;"></div></div>`,
        note: 'Child exactly fills a fractional-width (100.4px) overflow: hidden parent.',
        knownDisagreement: 'P15 finding: ANWC reports CLIPPED_BY_ANCESTOR (false positive). The runtime clip box uses integer clientWidth (100) while the child box is 100.39px; the fractional padding box clips nothing.'
      },
      {
        id: 'clip-one-pixel', role: 'boundary', key: 'clip-one', oracleExpects: true,
        html: `<div style="width: 100px; height: 40px; overflow: hidden;"><div data-anwc-key="clip-one" style="width: 101px; height: 40px;"></div></div>`,
        note: 'Child one pixel wider than an overflow: hidden parent.'
      }
    ]
  },
  {
    rule: 'TEXT_CLIPPED',
    cases: [
      {
        id: 'text-clip-defect', role: 'defect', key: 'tc-defect', oracleExpects: true,
        html: `<div data-anwc-key="tc-defect" style="width: 80px; overflow: hidden; white-space: nowrap; font: 16px/2 sans-serif;">This sentence cannot fit in eighty pixels</div>`,
        note: 'Nowrap text cut by its own overflow: hidden box, no truncation intent.'
      },
      { id: 'text-clip-healthy', role: 'healthy', key: 'nested-text', oracleExpects: false, fromCase: 'text-nested-spans-healthy', note: 'Wrapping inline text, no clip.' },
      {
        id: 'text-clip-overhang', role: 'boundary', key: 'tc-overhang', oracleExpects: false,
        html: `<p data-anwc-key="tc-overhang" style="margin: 20px 0; height: 8px; font: 24px sans-serif; line-height: 8px;">Overhang</p>`,
        note: 'Glyphs overhang a short box with overflow: visible; nothing clips them (ADR-016).'
      },
      {
        id: 'text-clip-exact-fit', role: 'boundary', key: 'tc-exact', oracleExpects: false,
        html: `<span data-anwc-key="tc-exact" style="display: inline-block; overflow: hidden; white-space: nowrap; font: 16px/2 sans-serif;">Shrink-wrapped label</span>`,
        note: 'overflow: hidden box shrink-wrapped to exactly its text width.',
        knownDisagreement: 'P15 finding: ANWC reports TEXT_CLIPPED (false positive). The own-clip box uses integer clientWidth (150) while the text Range rect is 150.31px wide inside a 150.31px box.'
      }
    ]
  },
  {
    rule: 'TEXT_LINE_BUDGET_EXCEEDED',
    cases: [
      { id: 'budget-defect', role: 'defect', key: 'budget-p', oracleExpects: true, fromCase: 'text-line-budget-defective', note: 'Four-ish lines against a budget of 2.' },
      { id: 'budget-defect-nested', role: 'defect', key: 'nested-inline-budget-p', oracleExpects: true, fromCase: 'text-nested-inline-budget-defective', note: 'Nested inline text over a budget of 1.' },
      { id: 'budget-healthy', role: 'healthy', key: 'nested-inline-healthy-p', oracleExpects: false, fromCase: 'text-nested-inline-budget-healthy', note: 'Within a budget of 4.' },
      {
        id: 'budget-exact', role: 'boundary', key: 'budget-exact', oracleExpects: false,
        html: `<p data-anwc-key="budget-exact" data-anwc-max-lines="2" style="margin: 0; width: 300px; font: 16px sans-serif; line-height: 20px;">First line<br>Second line</p>`,
        note: 'Exactly two forced lines against a budget of 2.'
      },
      {
        id: 'budget-one-over', role: 'boundary', key: 'budget-over', oracleExpects: true,
        html: `<p data-anwc-key="budget-over" data-anwc-max-lines="2" style="margin: 0; width: 300px; font: 16px sans-serif; line-height: 20px;">First line<br>Second line<br>Third line</p>`,
        note: 'Three forced lines against a budget of 2.'
      }
    ]
  },
  {
    rule: 'EXPECTED_VISIBLE_BUT_HIDDEN',
    cases: [
      { id: 'hidden-defect-display', role: 'defect', key: 'hidden-action', oracleExpects: true, fromCase: 'state-hidden-contract-defective', note: 'Expected interactive, display: none.' },
      { id: 'hidden-defect-opacity', role: 'defect', key: 'zero-opacity-action', oracleExpects: true, fromCase: 'state-opacity-zero-defective', note: 'Expected interactive, opacity: 0.' },
      {
        id: 'hidden-healthy', role: 'healthy', key: 'shown-action', oracleExpects: false,
        html: `<button data-anwc-key="shown-action" data-anwc-expect="interactive" style="width: 120px; height: 40px;">Checkout</button>`,
        note: 'Expected interactive and rendered normally.'
      },
      {
        id: 'hidden-visibility-restored', role: 'boundary', key: 'restored', oracleExpects: false,
        html: `<div style="visibility: hidden;"><button data-anwc-key="restored" data-anwc-expect="visible" style="visibility: visible;">Restored</button></div>`,
        note: 'Ancestor visibility: hidden, target explicitly restores visibility: visible.'
      },
      {
        id: 'hidden-near-zero-opacity', role: 'boundary', key: 'faint', oracleExpects: false,
        html: `<div style="opacity: 0.01;"><button data-anwc-key="faint" data-anwc-expect="visible">Faint</button></div>`,
        note: 'Ancestor opacity 0.01 is not zero.'
      },
      {
        id: 'hidden-ancestor-opacity-zero', role: 'boundary', key: 'ghost-child', oracleExpects: true,
        html: `<div style="opacity: 0;"><button data-anwc-key="ghost-child" data-anwc-expect="visible">Ghost</button></div>`,
        note: 'Opacity 0 inherited from an ancestor.'
      },
      {
        id: 'hidden-content-visibility', role: 'boundary', key: 'skipped', oracleExpects: true,
        html: `<div style="content-visibility: hidden; width: 200px; height: 50px;"><button data-anwc-key="skipped" data-anwc-expect="visible">Skipped</button></div>`,
        note: 'Ancestor content-visibility: hidden skips rendering of the target.',
        knownDisagreement: 'P15 finding: ANWC does not report EXPECTED_VISIBLE_BUT_HIDDEN (false negative). The runtime render state checks display, visibility and opacity only; checkVisibility() is false under content-visibility: hidden.'
      }
    ]
  },
  {
    rule: 'OUTSIDE_VIEWPORT',
    cases: [
      {
        id: 'viewport-defect', role: 'defect', key: 'below-fold', oracleExpects: true,
        html: `${resetBody}<div style="height: 3000px;"></div><button data-anwc-key="below-fold" data-anwc-expect="visible" style="display: block;">Below the fold</button>`,
        note: 'Expected visible, 3000px below the top of an unscrolled page.'
      },
      {
        id: 'viewport-healthy', role: 'healthy', key: 'above-fold', oracleExpects: false,
        html: `${resetBody}<button data-anwc-key="above-fold" data-anwc-expect="visible" style="display: block;">Above the fold</button>`,
        note: 'Expected visible, at the top of the page.'
      },
      {
        id: 'viewport-touching-edge', role: 'boundary', key: 'edge-touch', oracleExpects: true,
        html: `${resetBody}<div id="gate-spacer"></div><button data-anwc-key="edge-touch" data-anwc-expect="visible" style="display: block; height: 20px;">Edge</button>`,
        setup: async (page) => page.evaluate(() => { (document.getElementById('gate-spacer') as HTMLElement).style.height = `${innerHeight}px`; }),
        note: 'Top edge exactly at the viewport bottom: zero shared area.'
      },
      {
        id: 'viewport-one-pixel-in', role: 'boundary', key: 'edge-in', oracleExpects: false,
        html: `${resetBody}<div id="gate-spacer"></div><button data-anwc-key="edge-in" data-anwc-expect="visible" style="display: block; height: 20px;">Edge</button>`,
        setup: async (page) => page.evaluate(() => { (document.getElementById('gate-spacer') as HTMLElement).style.height = `${innerHeight - 1}px`; }),
        note: 'One pixel row inside the viewport.'
      }
    ]
  },
  {
    rule: 'UNSUPPORTED_VISIBILITY',
    cases: [
      {
        id: 'unsupported-defect', role: 'defect', key: 'rounded-action', oracleExpects: true,
        html: `<div style="clip-path: inset(0 round 12px); width: 200px;"><button data-anwc-key="rounded-action" data-anwc-expect="visible">Rounded</button></div>`,
        note: 'Visibility expectation under a non-rectangular clip-path.'
      },
      {
        id: 'unsupported-healthy', role: 'healthy', key: 'plain-action', oracleExpects: false,
        html: `<div style="width: 200px;"><button data-anwc-key="plain-action" data-anwc-expect="visible">Plain</button></div>`,
        note: 'Visibility expectation in plain normal flow.'
      },
      {
        id: 'unsupported-sticky', role: 'boundary', key: 'sticky-action', oracleExpects: false,
        html: `<div style="height: 100px; overflow: auto;"><button data-anwc-key="sticky-action" data-anwc-expect="visible" style="position: sticky; top: 0;">Sticky</button><div style="height: 300px;"></div></div>`,
        note: 'position: sticky stays inside the rectangular model.'
      },
      {
        id: 'unsupported-absolute', role: 'boundary', key: 'abs-action', oracleExpects: true,
        html: `<div style="position: relative; height: 60px;"><button data-anwc-key="abs-action" data-anwc-expect="visible" style="position: absolute; top: 0; left: 0;">Absolute</button></div>`,
        note: 'position: absolute leaves the normal-flow clip model.'
      }
    ]
  },
  {
    rule: 'POINTER_BLOCKED_AT_SAMPLES',
    cases: [
      { id: 'blocked-defect', role: 'defect', key: 'blocked-action', oracleExpects: true, fromCase: 'pointer-transparent-defective', note: 'Opacity 0 overlay covers the whole button.' },
      { id: 'blocked-healthy', role: 'healthy', key: 'passthrough-btn', oracleExpects: false, fromCase: 'pointer-passthrough-healthy', note: 'pointer-events: none overlay.' },
      { id: 'blocked-healthy-child', role: 'healthy', key: 'nested-btn', oracleExpects: false, fromCase: 'pointer-nested-child-healthy', note: 'Hits land on a descendant span.' },
      {
        id: 'blocked-auto-child-overlay', role: 'boundary', key: 'under-auto', oracleExpects: true,
        html: `<div style="position: relative; width: 140px; height: 44px;"><button data-anwc-key="under-auto" style="width: 140px; height: 44px;">Under</button><div style="position: absolute; inset: 0; pointer-events: none;"><div style="width: 100%; height: 100%; pointer-events: auto;"></div></div></div>`,
        note: 'Overlay has pointer-events: none but its full-size child re-enables auto.'
      },
      {
        id: 'blocked-adjacent-overlay', role: 'boundary', key: 'beside', oracleExpects: false,
        html: `<div style="position: relative; width: 280px; height: 44px;"><button data-anwc-key="beside" style="width: 140px; height: 44px; padding: 0; border: 0;">Beside</button><div style="position: absolute; left: 140px; top: 0; width: 140px; height: 44px; background: #0002;"></div></div>`,
        note: 'Overlay touches the right edge without overlapping.'
      }
    ]
  },
  {
    rule: 'POINTER_PARTIALLY_BLOCKED',
    cases: [
      { id: 'partial-defect', role: 'defect', key: 'half-blocked', oracleExpects: true, fromCase: 'pointer-partial-defective', note: 'Overlay covers the left half.' },
      { id: 'partial-healthy', role: 'healthy', key: 'nested-btn', oracleExpects: false, fromCase: 'pointer-nested-child-healthy', note: 'No overlay.' },
      { id: 'partial-fully-covered', role: 'boundary', key: 'blocked-action', oracleExpects: false, fromCase: 'pointer-transparent-defective', note: 'Fully covered is the other rule, not partial.' },
      {
        id: 'partial-wide-strip', role: 'boundary', key: 'strip-wide', oracleExpects: true,
        html: `<div style="position: relative; width: 140px; height: 44px;"><button data-anwc-key="strip-wide" style="width: 140px; height: 44px; padding: 0; border: 0;">Strip</button><div style="position: absolute; left: 0; top: 0; width: 28px; height: 44px; background: #0002;"></div></div>`,
        note: 'Overlay covers the left 20% of the button.'
      },
      {
        id: 'partial-thin-strip', role: 'boundary', key: 'strip-thin', oracleExpects: true,
        html: `<div style="position: relative; width: 140px; height: 44px;"><button data-anwc-key="strip-thin" style="width: 140px; height: 44px; padding: 0; border: 0;">Strip</button><div style="position: absolute; left: 0; top: 0; width: 8px; height: 44px; background: #0002;"></div></div>`,
        note: 'Overlay covers an 8px strip on the left edge (about 6% of the area).',
        knownDisagreement: 'P15 finding: ANWC does not report POINTER_PARTIALLY_BLOCKED (false negative). Its 5x5 grid starts 1/6 of the width (23px) in, so an 8px edge strip is never sampled; the 2px scan finds 88/1540 points blocked. This is the documented sampling limitation, not a regression.'
      }
    ]
  }
];

/** Resolve a gate case to mountable HTML and setup, reusing matrix cases where named. */
export function gateMarkup(c: GateCase): { html: string; setup?: (page: any) => Promise<void> } {
  if (c.fromCase) {
    const source = conformanceCases.find((candidate) => candidate.id === c.fromCase);
    if (!source) throw new Error(`gate case ${c.id} names unknown conformance case ${c.fromCase}`);
    return { html: source.html, setup: source.setup };
  }
  if (!c.html) throw new Error(`gate case ${c.id} has neither fromCase nor html`);
  return { html: c.html, setup: c.setup };
}

/** Canary first: defects, then healthy controls, then boundaries. */
export function orderedCases(gate: RuleGate): GateCase[] {
  const rank: Record<GateRole, number> = { defect: 0, healthy: 1, boundary: 2 };
  return [...gate.cases].sort((a, b) => rank[a.role] - rank[b.role]);
}

export { ruleOracles };
