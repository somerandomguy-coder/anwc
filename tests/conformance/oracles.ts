/**
 * Independent rule oracles (PHASE_4 P15).
 *
 * Each oracle states, from plain browser APIs only, whether the fact a detector
 * rule reports is true for one keyed element. This file must not import
 * anything: no ANWC package, no runtime, no diagnostics, no protocol types
 * (tests/unit/conformance.test.ts enforces it). The oracles deliberately use
 * different measurement routes from the runtime where the browser offers one:
 *
 * - line budget: element content height / computed px line-height (runtime: Range rect rows);
 * - hidden-but-expected: `Element.checkVisibility()` (runtime: computed-style ancestry walk);
 * - pointer: a dense 2px hit-test scan of the whole visible box (runtime: <= 25 grid samples);
 * - clipping and text clipping: fractional padding boxes from
 *   getBoundingClientRect minus borders (runtime: integer clientWidth/Height);
 * - overflow, viewport: scrollWidth/clientWidth, getBoundingClientRect, Range rects.
 *
 * Code inside `page.evaluate` must stay self-contained arrow functions: it is
 * serialized into the page.
 */

export type RuleOracle = (page: any, key: string) => Promise<{ violates: boolean; details: Record<string, unknown> }>;

const target = `[data-anwc-key="%KEY%"]`;

/** HORIZONTAL_OVERFLOW: the element's scrollable width exceeds its client width. */
const horizontalOverflow: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, rendered: el.getClientRects().length > 0 };
  }, target.replace('%KEY%', key));
  return { violates: details.rendered && details.scrollWidth > details.clientWidth, details };
};

/**
 * CLIPPED_BY_ANCESTOR: part of the element's border box falls outside the
 * padding box of an ancestor whose computed overflow on that axis is not
 * `visible`.
 */
const clippedByAncestor: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    const clippers: string[] = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const cx = s.overflowX !== 'visible';
      const cy = s.overflowY !== 'visible';
      if (!cx && !cy) continue;
      // Fractional padding box: border box minus borders and scrollbar gutters
      // (clientWidth/clientHeight are rounded to integers, so not used here).
      const ar = a.getBoundingClientRect();
      const bl = parseFloat(s.borderLeftWidth), br = parseFloat(s.borderRightWidth);
      const bt = parseFloat(s.borderTopWidth), bb = parseFloat(s.borderBottomWidth);
      const padLeft = ar.left + bl, padTop = ar.top + bt;
      const padRight = ar.right - br - (a.offsetWidth - a.clientWidth - Math.round(bl + br));
      const padBottom = ar.bottom - bb - (a.offsetHeight - a.clientHeight - Math.round(bt + bb));
      if (cx) { left = Math.max(left, padLeft); right = Math.min(right, padRight); }
      if (cy) { top = Math.max(top, padTop); bottom = Math.min(bottom, padBottom); }
      clippers.push(`${a.tagName.toLowerCase()}(${s.overflowX}/${s.overflowY})`);
    }
    const area = r.width * r.height;
    const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
    return { box: [r.left, r.top, r.width, r.height], visibleFraction: area > 0 ? visibleArea / area : null, clippers };
  }, target.replace('%KEY%', key));
  return { violates: details.visibleFraction !== null && details.visibleFraction < 1, details };
};

/**
 * TEXT_CLIPPED: a Range rect of the element's own inline text (text nodes,
 * through inline descendants) loses area to the element's own overflow clip
 * or to an ancestor overflow clip. Overhang past an unclipped box is not
 * clipping (ADR-016).
 */
const textClipped: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const texts: Text[] = [];
    const walk = (parent: Node) => {
      parent.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) texts.push(child as Text);
        else if (child instanceof Element && ['inline', 'contents'].includes(getComputedStyle(child).display)) walk(child);
      });
    };
    walk(el);
    const clips: Array<{ l: number; t: number; r: number; b: number; x: boolean; y: boolean }> = [];
    for (let a: HTMLElement | null = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const x = s.overflowX !== 'visible', y = s.overflowY !== 'visible';
      if (!x && !y) continue;
      // Fractional padding box, as in the clipping oracle.
      const ar = a.getBoundingClientRect();
      const bl = parseFloat(s.borderLeftWidth), br = parseFloat(s.borderRightWidth);
      const bt = parseFloat(s.borderTopWidth), bb = parseFloat(s.borderBottomWidth);
      clips.push({
        l: ar.left + bl,
        t: ar.top + bt,
        r: ar.right - br - (a.offsetWidth - a.clientWidth - Math.round(bl + br)),
        b: ar.bottom - bb - (a.offsetHeight - a.clientHeight - Math.round(bt + bb)),
        x, y
      });
    }
    let fragments = 0;
    let clipped = 0;
    let firstClipped: { fragment: number[]; clip: number[][] } | null = null;
    for (const text of texts) {
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const f of Array.from(range.getClientRects())) {
        if (f.width <= 0 || f.height <= 0) continue;
        fragments++;
        let l = f.left, t = f.top, r = f.right, b = f.bottom;
        for (const c of clips) {
          if (c.x) { l = Math.max(l, c.l); r = Math.min(r, c.r); }
          if (c.y) { t = Math.max(t, c.t); b = Math.min(b, c.b); }
        }
        const kept = Math.max(0, r - l) * Math.max(0, b - t);
        if (kept < f.width * f.height) {
          clipped++;
          if (!firstClipped) firstClipped = { fragment: [f.left, f.top, f.right, f.bottom], clip: clips.map((c) => [c.l, c.t, c.r, c.b]) };
        }
      }
    }
    return { textNodes: texts.length, fragments, clipped, clippingBoxes: clips.length, firstClipped };
  }, target.replace('%KEY%', key));
  return { violates: details.clipped > 0, details };
};

/**
 * TEXT_LINE_BUDGET_EXCEEDED: rendered lines, from content height divided by a
 * px line-height, exceed a positive integer `data-anwc-max-lines`.
 */
const textLineBudget: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const s = getComputedStyle(el);
    const raw = el.getAttribute('data-anwc-max-lines') ?? '';
    const budget = /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
    const lineHeight = s.lineHeight.endsWith('px') ? parseFloat(s.lineHeight) : NaN;
    const content = el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    return { budget, lineHeight: s.lineHeight, lines: Number.isFinite(lineHeight) ? Math.round(content / lineHeight) : null };
  }, target.replace('%KEY%', key));
  if (details.lines === null) throw new Error(`line-budget oracle needs a px line-height on ${key}`);
  return { violates: details.budget !== null && details.lines > details.budget, details };
};

/**
 * EXPECTED_VISIBLE_BUT_HIDDEN: the element declares `data-anwc-expect` and the
 * browser's own `checkVisibility` (display, content-visibility, opacity,
 * visibility) says it is not visible.
 */
const expectedVisibleButHidden: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement & { checkVisibility(options?: Record<string, boolean>): boolean };
    return {
      expect: el.getAttribute('data-anwc-expect'),
      checkVisibility: el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    };
  }, target.replace('%KEY%', key));
  const expects = details.expect === 'visible' || details.expect === 'interactive';
  return { violates: expects && !details.checkVisibility, details };
};

/**
 * OUTSIDE_VIEWPORT: the element declares `data-anwc-expect`, has a box, and
 * that box shares no area with the layout viewport.
 */
const outsideViewport: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return { expect: el.getAttribute('data-anwc-expect'), hasBox: el.getClientRects().length > 0, box: [r.left, r.top, r.width, r.height], viewport: [innerWidth, innerHeight], sharedArea: w * h };
  }, target.replace('%KEY%', key));
  const expects = details.expect === 'visible' || details.expect === 'interactive';
  return { violates: expects && details.hasBox && details.sharedArea === 0, details };
};

/**
 * UNSUPPORTED_VISIBILITY: the element declares `data-anwc-expect` but its
 * visible area depends on geometry a rectangle-intersection model cannot
 * express: a transform, clip-path or mask on itself or an ancestor, a vertical
 * writing mode, or its own absolute/fixed positioning (out-of-flow
 * containing block).
 */
const unsupportedVisibility: RuleOracle = async (page, key) => {
  const details = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const reasons: string[] = [];
    for (let a: Element | null = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      const tag = a.tagName.toLowerCase();
      if (s.transform !== 'none') reasons.push(`${tag}: transform`);
      if (s.clipPath !== 'none') reasons.push(`${tag}: clip-path`);
      if (s.maskImage !== 'none') reasons.push(`${tag}: mask`);
      if (!s.writingMode.startsWith('horizontal')) reasons.push(`${tag}: writing-mode`);
    }
    const position = getComputedStyle(el).position;
    if (position === 'absolute' || position === 'fixed') reasons.push(`self: position ${position}`);
    return { expect: el.getAttribute('data-anwc-expect'), reasons };
  }, target.replace('%KEY%', key));
  const expects = details.expect === 'visible' || details.expect === 'interactive';
  return { violates: expects && details.reasons.length > 0, details };
};

/**
 * Pointer ground truth: hit-test every 2px across the element's
 * viewport-visible box and count points whose topmost element is neither the
 * target nor inside it. Only enabled, non-inert targets are scanned.
 */
async function pointerScan(page: any, key: string) {
  return page.evaluate((selector: string) => {
    const el = document.querySelector(selector) as HTMLElement;
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0), top = Math.max(r.top, 0);
    const right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    const actionable = !el.matches(':disabled') && !el.closest('[inert]');
    let points = 0, blocked = 0;
    for (let y = top + 1; y < bottom; y += 2) {
      for (let x = left + 1; x < right; x += 2) {
        points++;
        const hit = document.elementFromPoint(x, y);
        if (hit && hit !== el && !el.contains(hit)) blocked++;
      }
    }
    return { actionable, points, blocked };
  }, target.replace('%KEY%', key));
}

/** POINTER_BLOCKED_AT_SAMPLES: every scanned point lands on another element. */
const pointerBlocked: RuleOracle = async (page, key) => {
  const details = await pointerScan(page, key);
  return { violates: details.actionable && details.points > 0 && details.blocked === details.points, details };
};

/** POINTER_PARTIALLY_BLOCKED: some, but not all, scanned points land on another element. */
const pointerPartiallyBlocked: RuleOracle = async (page, key) => {
  const details = await pointerScan(page, key);
  return { violates: details.actionable && details.blocked > 0 && details.blocked < details.points, details };
};

/** One oracle per detector rule code. */
export const ruleOracles = {
  HORIZONTAL_OVERFLOW: horizontalOverflow,
  CLIPPED_BY_ANCESTOR: clippedByAncestor,
  TEXT_CLIPPED: textClipped,
  TEXT_LINE_BUDGET_EXCEEDED: textLineBudget,
  EXPECTED_VISIBLE_BUT_HIDDEN: expectedVisibleButHidden,
  OUTSIDE_VIEWPORT: outsideViewport,
  UNSUPPORTED_VISIBILITY: unsupportedVisibility,
  POINTER_BLOCKED_AT_SAMPLES: pointerBlocked,
  POINTER_PARTIALLY_BLOCKED: pointerPartiallyBlocked
} satisfies Record<string, RuleOracle>;

export type RuleCode = keyof typeof ruleOracles;
