import type { ConformanceCase } from './types.js';

export const conformanceCases: ConformanceCase[] = [
  // ==========================================
  // FAMILY 1: TEXT
  // ==========================================
  {
    id: 'text-overflow-defective',
    family: 'text',
    role: 'defective',
    title: 'Horizontal Text Overflow',
    description: 'Unbroken URL in a fixed-width container causes horizontal scroll overflow without truncation styling.',
    expectedRule: 'HORIZONTAL_OVERFLOW',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .container { width: 120px; overflow: visible; border: 1px solid red; font-family: monospace; }
        .nowrap { white-space: nowrap; display: block; }
      </style>
      <div class="container">
        <span class="nowrap" data-anwc-key="long-url">https://example.com/very/long/unbroken/path/to/resource</span>
      </div>
    `,
    oracle: async (page) => {
      const isOverflowing = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="long-url"]') as HTMLElement;
        return el.scrollWidth > el.parentElement!.clientWidth;
      });
      return { pass: isOverflowing, details: { isOverflowing } };
    }
  },
  {
    id: 'text-ellipsis-healthy',
    family: 'text',
    role: 'healthy',
    title: 'Intentional Ellipsis Truncation',
    description: 'Text truncation with explicit CSS text-overflow: ellipsis and declared data-anwc-allow="text-truncation".',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .container { width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      </style>
      <div class="container" data-anwc-allow="text-truncation horizontal-scroll" data-anwc-key="ellipsis-text">
        This is intentionally clamped text that fits within the UI design.
      </div>
    `,
    oracle: async (page) => {
      const isClamped = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="ellipsis-text"]') as HTMLElement;
        const style = window.getComputedStyle(el);
        return style.textOverflow === 'ellipsis' && style.overflow === 'hidden' && style.whiteSpace === 'nowrap';
      });
      return { pass: isClamped, details: { isClamped } };
    }
  },
  {
    id: 'text-nested-spans-healthy',
    family: 'text',
    role: 'healthy',
    title: 'Nested Text Spans with Wrapping',
    description: 'Nested spans containing inline formatting render naturally without overflow or clipping.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .box { width: 200px; font-family: sans-serif; line-height: 1.4; }
      </style>
      <div class="box" data-anwc-key="nested-text">
        <span>Regular text with <strong>bold text</strong> and <em>italicized emphasis</em> inside.</span>
      </div>
    `,
    oracle: async (page) => {
      const fits = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="nested-text"]') as HTMLElement;
        return el.scrollWidth <= el.clientWidth;
      });
      return { pass: fits, details: { fits } };
    }
  },
  {
    id: 'text-cjk-rtl-healthy',
    family: 'text',
    role: 'healthy',
    title: 'CJK and Multilingual Text Flow',
    description: 'Chinese, Japanese, and mixed script characters render cleanly in a bounded container.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .card { width: 250px; padding: 8px; border: 1px solid #ccc; font-size: 14px; }
      </style>
      <div class="card" data-anwc-key="cjk-box">
        <p>购物车结算 (Shopping Cart Checkout) — 100% 优质商品</p>
      </div>
    `,
    oracle: async (page) => {
      const fits = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="cjk-box"]') as HTMLElement;
        return el.scrollWidth <= el.clientWidth;
      });
      return { pass: fits, details: { fits } };
    }
  },
  {
    id: 'text-line-budget-defective',
    family: 'text',
    role: 'defective',
    title: 'Text Exceeding Declared Line Budget',
    description: 'Text renders across 4 lines when author contract specifies data-anwc-max-lines="2".',
    expectedRule: 'TEXT_LINE_BUDGET_EXCEEDED',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .budget-box { width: 100px; line-height: 20px; font-family: sans-serif; }
      </style>
      <p class="budget-box" data-anwc-key="budget-p" data-anwc-max-lines="2">
        This is a multi-line paragraph designed to wrap across at least four distinct lines in this narrow box.
      </p>
    `,
    oracle: async (page) => {
      const lines = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="budget-p"]') as HTMLElement;
        return Math.round(el.offsetHeight / 20);
      });
      return { pass: lines > 2, details: { observedLines: lines, maxLines: 2 } };
    }
  },
  {
    id: 'text-nested-inline-budget-defective',
    family: 'text',
    role: 'defective',
    title: 'Nested Inline Text Line Budget Overflow',
    description: 'Text containing nested inline tags (span, em, strong) wraps onto multiple lines exceeding data-anwc-max-lines="1".',
    expectedRule: 'TEXT_LINE_BUDGET_EXCEEDED',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .nested-budget { width: 100px; line-height: 20px; font-family: sans-serif; }
      </style>
      <p class="nested-budget" data-anwc-key="nested-inline-budget-p" data-anwc-max-lines="1">
        First part with <span>styled inline phrases</span> and <strong>important warnings</strong> wrapping.
      </p>
    `,
    oracle: async (page) => {
      const lines = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="nested-inline-budget-p"]') as HTMLElement;
        return Math.round(el.offsetHeight / 20);
      });
      return { pass: lines > 1, details: { observedLines: lines, maxLines: 1 } };
    }
  },
  {
    id: 'text-nested-inline-budget-healthy',
    family: 'text',
    role: 'healthy',
    title: 'Nested Inline Text Within Line Budget',
    description: 'Text containing nested inline tags fits within declared data-anwc-max-lines="4" without overflow or clipping.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .healthy-nested { width: 280px; line-height: 20px; font-family: sans-serif; }
      </style>
      <p class="healthy-nested" data-anwc-key="nested-inline-healthy-p" data-anwc-max-lines="4">
        Clean text containing <span>inline spans</span> and <em>formatted segments</em> fitting comfortably.
      </p>
    `,
    oracle: async (page) => {
      const fits = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="nested-inline-healthy-p"]') as HTMLElement;
        return Math.round(el.offsetHeight / 20) <= 4;
      });
      return { pass: fits, details: { fits } };
    }
  },
  {
    id: 'text-delayed-font-boundary',
    family: 'text',
    role: 'boundary',
    title: 'Delayed Web Font Boundary',
    description: 'A web font whose file is still downloading keeps document.fonts.ready pending. ANWC must not report settled text geometry; it must return readiness unsettled with the font-timeout reason.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'readiness-unsettled', reason: 'font readiness did not complete before timeout' },
    captureOptions: { timeoutMs: 400 },
    html: `
      <style>
        .custom-text { font-family: 'AnwcDelayedFont', sans-serif; font-size: 16px; }
      </style>
      <div class="custom-text" data-anwc-key="delayed-font">Text waiting for its web font</div>
    `,
    setup: async (page) => {
      // Hold the font response well past the capture timeout. The next case
      // navigates away, which cancels the request; fulfilling then may throw.
      await page.route('**/__anwc-conformance/delayed-font.woff2', async (route: any) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.fulfill({ status: 404, body: '' }).catch(() => undefined);
      });
      await page.evaluate(() => {
        const face = new FontFace('AnwcDelayedFont', 'url(/__anwc-conformance/delayed-font.woff2)');
        document.fonts.add(face);
        void face.load().catch(() => undefined);
      });
    },
    oracle: async (page) => {
      const details = await page.evaluate(() => ({
        fontsStatus: document.fonts.status,
        faceStatus: [...document.fonts].find((face) => face.family.replace(/["']/g, '') === 'AnwcDelayedFont')?.status ?? 'missing'
      }));
      return { pass: details.fontsStatus === 'loading' && details.faceStatus === 'loading', details };
    }
  },

  // ==========================================
  // FAMILY 2: CLIPS / SCROLL
  // ==========================================
  {
    id: 'clip-x-defective',
    family: 'clips-scroll',
    role: 'defective',
    title: 'Horizontal Clipping by Ancestor',
    description: 'An interactive button is clipped horizontally by an ancestor with overflow-x: hidden.',
    expectedRule: 'CLIPPED_BY_ANCESTOR',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .clip-parent { width: 50px; overflow-x: hidden; height: 50px; }
        .clipped-btn { width: 140px; height: 40px; }
      </style>
      <div class="clip-parent">
        <button class="clipped-btn" data-anwc-key="x-clipped-btn">Proceed to payment</button>
      </div>
    `,
    oracle: async (page) => {
      const isClipped = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="x-clipped-btn"]') as HTMLElement;
        const parent = btn.parentElement!;
        return btn.getBoundingClientRect().width > parent.getBoundingClientRect().width;
      });
      return { pass: isClipped, details: { isClipped } };
    }
  },
  {
    id: 'clip-y-defective',
    family: 'clips-scroll',
    role: 'defective',
    title: 'Vertical Clipping by Ancestor',
    description: 'An interactive action is clipped vertically by an ancestor with overflow-y: hidden and insufficient height.',
    expectedRule: 'CLIPPED_BY_ANCESTOR',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .clip-parent-y { height: 18px; overflow-y: hidden; width: 150px; }
        .clipped-btn-y { height: 44px; width: 140px; }
      </style>
      <div class="clip-parent-y">
        <button class="clipped-btn-y" data-anwc-key="y-clipped-btn">Submit Form</button>
      </div>
    `,
    oracle: async (page) => {
      const isClipped = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="y-clipped-btn"]') as HTMLElement;
        const parent = btn.parentElement!;
        return btn.getBoundingClientRect().height > parent.getBoundingClientRect().height;
      });
      return { pass: isClipped, details: { isClipped } };
    }
  },
  {
    id: 'clip-scroll-healthy',
    family: 'clips-scroll',
    role: 'healthy',
    title: 'Declared Scrollable Container',
    description: 'Legitimate horizontal scroll carousel declaring data-anwc-allow="horizontal-scroll" stays usable without clipping errors.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .carousel { width: 320px; overflow-x: auto; display: flex; gap: 8px; }
        .slide { min-width: 140px; height: 44px; background: #eee; }
      </style>
      <div class="carousel" data-anwc-allow="horizontal-scroll" data-anwc-key="carousel">
        <button class="slide" data-anwc-key="slide-1">Slide 1</button>
        <button class="slide" data-anwc-key="slide-2">Slide 2</button>
      </div>
    `,
    oracle: async (page) => {
      const scrollable = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="carousel"]') as HTMLElement;
        return window.getComputedStyle(el).overflowX === 'auto' && el.clientWidth > 0;
      });
      return { pass: scrollable, details: { scrollable } };
    }
  },
  {
    id: 'clip-sticky-overflow-defective',
    family: 'clips-scroll',
    role: 'defective',
    title: 'Sticky Header Overflows Container Width',
    description: 'Stickily positioned navigation bar inside an overflow-x: hidden scroll container is wider than the container and clipped.',
    expectedRule: 'CLIPPED_BY_ANCESTOR',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .sticky-clip-wrap { width: 120px; height: 160px; overflow-x: hidden; overflow-y: auto; }
        .sticky-clip-nav { position: sticky; top: 0; width: 260px; height: 36px; background: #eee; }
      </style>
      <div class="sticky-clip-wrap">
        <nav class="sticky-clip-nav" data-anwc-key="sticky-clip-nav"><button>Action</button></nav>
        <div style="height: 300px;">Scrollable area</div>
      </div>
    `,
    oracle: async (page) => {
      const clipped = await page.evaluate(() => {
        const nav = document.querySelector('[data-anwc-key="sticky-clip-nav"]') as HTMLElement;
        return nav.getBoundingClientRect().width > nav.parentElement!.getBoundingClientRect().width;
      });
      return { pass: clipped, details: { clipped } };
    }
  },
  {
    id: 'clip-sticky-healthy',
    family: 'clips-scroll',
    role: 'healthy',
    title: 'Sticky Header Within Scroll Container',
    description: 'Sticky navigation header inside a scroll container fits within the container and is not clipped.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .sticky-pass-wrap { width: 320px; height: 200px; overflow-y: auto; }
        .sticky-pass-nav { position: sticky; top: 0; width: 100%; height: 40px; background: white; }
      </style>
      <div class="sticky-pass-wrap" data-anwc-allow="vertical-scroll">
        <nav class="sticky-pass-nav" data-anwc-key="sticky-pass-nav"><button>Sticky Menu</button></nav>
        <div style="height: 150px;">Scroll content within container height</div>
      </div>
    `,
    oracle: async (page) => {
      const fits = await page.evaluate(() => {
        const nav = document.querySelector('[data-anwc-key="sticky-pass-nav"]') as HTMLElement;
        return nav.getBoundingClientRect().width <= nav.parentElement!.getBoundingClientRect().width;
      });
      return { pass: fits, details: { fits } };
    }
  },
  {
    id: 'clip-sticky-boundary',
    family: 'clips-scroll',
    role: 'boundary',
    title: 'Sticky Header in a Rounded (clip-path) Scroller',
    description: 'A sticky header inside a scroller clipped by clip-path: inset(... round ...). Non-rectangular clipping is outside the rectangular clip model, so the header clip must be unknown with the clip-path limitation.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'assessment-unknown', key: 'sticky-nav', field: 'clip', limitation: 'Clip paths are unsupported' },
    html: `
      <style>
        .sticky-wrap { height: 200px; overflow-y: auto; clip-path: inset(0 round 16px); }
        .sticky-nav { position: sticky; top: 0; background: white; height: 40px; }
        .content { height: 400px; }
      </style>
      <div class="sticky-wrap">
        <nav class="sticky-nav" data-anwc-key="sticky-nav"><button>Menu</button></nav>
        <div class="content">Content</div>
      </div>
    `,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const nav = document.querySelector('[data-anwc-key="sticky-nav"]') as HTMLElement;
        return { position: getComputedStyle(nav).position, wrapClipPath: getComputedStyle(nav.parentElement!).clipPath };
      });
      return { pass: details.position === 'sticky' && details.wrapClipPath.startsWith('inset('), details };
    }
  },

  // ==========================================
  // FAMILY 3: POINTER LAYERS
  // ==========================================
  {
    id: 'pointer-transparent-defective',
    family: 'pointer-layers',
    role: 'defective',
    title: 'Transparent Overlay Occlusion',
    description: 'An invisible overlay with opacity: 0 intercepts pointer events above an interactive button.',
    expectedRule: 'POINTER_BLOCKED_AT_SAMPLES',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .wrap { position: relative; width: 140px; height: 44px; }
        .btn { width: 140px; height: 44px; }
        .blocker { position: absolute; inset: 0; opacity: 0; z-index: 10; cursor: pointer; }
      </style>
      <div class="wrap">
        <button class="btn" data-anwc-key="blocked-action">Click me</button>
        <div class="blocker" data-anwc-key="invisible-blocker"></div>
      </div>
    `,
    oracle: async (page) => {
      const isBlocked = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="blocked-action"]') as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit !== btn && !btn.contains(hit);
      });
      return { pass: isBlocked, details: { isBlocked } };
    }
  },
  {
    id: 'pointer-partial-defective',
    family: 'pointer-layers',
    role: 'defective',
    title: 'Partial Overlay Occlusion',
    description: 'An overlay covering half of an interactive button intercepts a fraction of pointer samples.',
    expectedRule: 'POINTER_PARTIALLY_BLOCKED',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .wrap { position: relative; width: 140px; height: 44px; }
        .btn { width: 140px; height: 44px; }
        .half-overlay { position: absolute; left: 0; top: 0; width: 70px; height: 44px; z-index: 5; background: rgba(0,0,0,0.2); }
      </style>
      <div class="wrap">
        <button class="btn" data-anwc-key="half-blocked">Partial Action</button>
        <div class="half-overlay" data-anwc-key="half-blocker"></div>
      </div>
    `,
    oracle: async (page) => {
      const isPartiallyBlocked = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="half-blocked"]') as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const leftHit = document.elementFromPoint(rect.left + 10, rect.top + rect.height / 2);
        const rightHit = document.elementFromPoint(rect.right - 10, rect.top + rect.height / 2);
        return leftHit !== btn && rightHit === btn;
      });
      return { pass: isPartiallyBlocked, details: { isPartiallyBlocked } };
    }
  },
  {
    id: 'pointer-wrapped-link-healthy',
    family: 'pointer-layers',
    role: 'healthy',
    title: 'Wrapped Inline Link',
    description: 'A link wraps over several lines between sibling links. Its bounding box covers the neighbours, but nothing is over its own line fragments.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .flow { position: relative; width: 200px; margin: 0; font: 16px/24px sans-serif; }
        .cover { position: absolute; z-index: 5; background: rgba(0,0,0,0.2); }
      </style>
      <p class="flow"><a href="#one">first neighbour link</a> <a href="#two" data-anwc-key="wrapped-link">link that wraps onto another line</a> <a href="#three">last neighbour link</a></p>
    `,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const link = document.querySelector('[data-anwc-key="wrapped-link"]') as HTMLElement;
        const fragments = Array.from(link.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const perFragment = fragments.map((r) => {
          let points = 0, blocked = 0;
          for (let y = r.top + 1; y < r.bottom - 1; y += 2) for (let x = r.left + 1; x < r.right - 1; x += 2) {
            points++;
            const hit = document.elementFromPoint(x, y);
            if (hit !== link && !(hit && link.contains(hit))) blocked++;
          }
          return { points, blocked };
        });
        return { perFragment };
      });
      const fragments: Array<{ points: number; blocked: number }> = details.perFragment;
      return { pass: fragments.length > 1 && fragments.every((f) => f.points > 0 && f.blocked === 0), details };
    }
  },
  {
    id: 'pointer-wrapped-link-covered-defective',
    family: 'pointer-layers',
    role: 'defective',
    title: 'Wrapped Inline Link Covered On One Fragment',
    description: 'An overlay covers one line fragment of a wrapped link and leaves the others reachable.',
    expectedRule: 'POINTER_PARTIALLY_BLOCKED',
    expectedClassification: 'detected-defect',
    html: `
      <style>
        .flow { position: relative; width: 200px; margin: 0; font: 16px/24px sans-serif; }
        .cover { position: absolute; z-index: 5; background: rgba(0,0,0,0.2); }
      </style>
      <p class="flow"><a href="#one">first neighbour link</a> <a href="#two" data-anwc-key="covered-link">link that wraps onto another line</a> <a href="#three">last neighbour link</a><span class="cover"></span></p>
    `,
    setup: async (page) => {
      await page.evaluate(() => {
        const link = document.querySelector('[data-anwc-key="covered-link"]') as HTMLElement;
        const cover = document.querySelector('.cover') as HTMLElement;
        const origin = (link.parentElement as HTMLElement).getBoundingClientRect();
        const last = Array.from(link.getClientRects()).at(-1)!;
        Object.assign(cover.style, { left: `${last.left - origin.left}px`, top: `${last.top - origin.top}px`, width: `${last.width}px`, height: `${last.height}px` });
      });
    },
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const link = document.querySelector('[data-anwc-key="covered-link"]') as HTMLElement;
        const fragments = Array.from(link.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        const perFragment = fragments.map((r) => {
          let points = 0, blocked = 0;
          for (let y = r.top + 1; y < r.bottom - 1; y += 2) for (let x = r.left + 1; x < r.right - 1; x += 2) {
            points++;
            const hit = document.elementFromPoint(x, y);
            if (hit !== link && !(hit && link.contains(hit))) blocked++;
          }
          return { points, blocked };
        });
        return { perFragment };
      });
      const fragments: Array<{ points: number; blocked: number }> = details.perFragment;
      return { pass: fragments.length > 1 && fragments.at(-1)!.blocked === fragments.at(-1)!.points && fragments.slice(0, -1).every((f) => f.blocked === 0), details };
    }
  },
  {
    id: 'pointer-passthrough-healthy',
    family: 'pointer-layers',
    role: 'healthy',
    title: 'Pointer-Events None Passthrough',
    description: 'A visual overlay with pointer-events: none allows physical pointer events to reach the underlying button.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <style>
        .wrap { position: relative; width: 140px; height: 44px; }
        .btn { width: 140px; height: 44px; }
        .passthrough { position: absolute; inset: 0; pointer-events: none; background: rgba(255,0,0,0.1); }
      </style>
      <div class="wrap">
        <button class="btn" data-anwc-key="passthrough-btn">Clickable Button</button>
        <div class="passthrough"></div>
      </div>
    `,
    oracle: async (page) => {
      const hitsButton = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="passthrough-btn"]') as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === btn;
      });
      return { pass: hitsButton, details: { hitsButton } };
    }
  },
  {
    id: 'pointer-nested-child-healthy',
    family: 'pointer-layers',
    role: 'healthy',
    title: 'Nested Child Target Hit',
    description: 'Pointer hitting an inner span inside a button is recognized as a valid hit on the interactive target.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <button data-anwc-key="nested-btn" style="width: 140px; height: 44px;">
        <span style="pointer-events: auto;">Inside Span</span>
      </button>
    `,
    oracle: async (page) => {
      const hitsChild = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="nested-btn"]') as HTMLElement;
        const span = btn.querySelector('span')!;
        const rect = span.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === span && btn.contains(hit);
      });
      return { pass: hitsChild, details: { hitsChild } };
    }
  },
  {
    id: 'pointer-thin-target-boundary',
    family: 'pointer-layers',
    role: 'boundary',
    title: 'Thin Target Boundary',
    description: 'A 1px-tall button collapses the 5x5 hit-test grid onto a few physical pixel rows. ANWC must report fewer samples than its budget rather than a full-resolution pointer result.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'pointer-sample-collapse', key: 'thin-btn', sampleBudget: 25 },
    html: `
      <button data-anwc-key="thin-btn" style="width: 100px; height: 1px; padding: 0; border: 0; display: block; overflow: hidden;">
        Line
      </button>
    `,
    oracle: async (page) => {
      const height = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="thin-btn"]') as HTMLElement;
        return btn.getBoundingClientRect().height;
      });
      return { pass: height > 0 && height <= 1, details: { height } };
    }
  },

  // ==========================================
  // FAMILY 4: STATE / SEMANTICS
  // ==========================================
  {
    id: 'state-hidden-contract-defective',
    family: 'state-semantics',
    role: 'defective',
    title: 'Hidden Element Expected Visible',
    description: 'Action declaring data-anwc-expect="interactive" is hidden with display: none.',
    expectedRule: 'EXPECTED_VISIBLE_BUT_HIDDEN',
    expectedClassification: 'detected-defect',
    html: `
      <button data-anwc-key="hidden-action" data-anwc-expect="interactive" style="display: none;">
        Confirm Checkout
      </button>
    `,
    oracle: async (page) => {
      const isDisplayNone = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="hidden-action"]') as HTMLElement;
        return window.getComputedStyle(btn).display === 'none';
      });
      return { pass: isDisplayNone, details: { isDisplayNone } };
    }
  },
  {
    id: 'state-opacity-zero-defective',
    family: 'state-semantics',
    role: 'defective',
    title: 'Zero Opacity Action Expected Interactive',
    description: 'Action declaring data-anwc-expect="interactive" has effective opacity: 0.',
    expectedRule: 'EXPECTED_VISIBLE_BUT_HIDDEN',
    expectedClassification: 'detected-defect',
    html: `
      <button data-anwc-key="zero-opacity-action" data-anwc-expect="interactive" style="opacity: 0; width: 100px; height: 40px;">
        Ghost Button
      </button>
    `,
    oracle: async (page) => {
      const isOpacityZero = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="zero-opacity-action"]') as HTMLElement;
        return window.getComputedStyle(btn).opacity === '0';
      });
      return { pass: isOpacityZero, details: { isOpacityZero } };
    }
  },
  {
    id: 'state-disabled-healthy',
    family: 'state-semantics',
    role: 'healthy',
    title: 'Disabled Control Control',
    description: 'Button with disabled attribute is legitimately non-interactive and produces 0 findings.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <button data-anwc-key="disabled-btn" disabled style="width: 100px; height: 40px;">
        Disabled
      </button>
    `,
    oracle: async (page) => {
      const isDisabled = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="disabled-btn"]') as HTMLButtonElement;
        return btn.disabled;
      });
      return { pass: isDisabled, details: { isDisabled } };
    }
  },
  {
    id: 'state-inert-healthy',
    family: 'state-semantics',
    role: 'healthy',
    title: 'Inert Container Control',
    description: 'Container marked inert suppresses interactive expectations and produces 0 false findings.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <div inert>
        <button data-anwc-key="inert-btn" style="width: 100px; height: 40px;">Inert button</button>
      </div>
    `,
    oracle: async (page) => {
      const isInert = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="inert-btn"]') as HTMLElement;
        return Boolean(btn && btn.closest('[inert]'));
      });
      return { pass: isInert, details: { isInert } };
    }
  },
  {
    id: 'state-modal-dialog-healthy',
    family: 'state-semantics',
    role: 'healthy',
    title: 'Background Control Inert While Modal Dialog Active',
    description: 'Interactive candidate in background document is made inert by an active modal dialog and emits 0 false pointer blockage warnings.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <div class="dialog-test-container" style="width: 300px; padding: 10px;">
        <button data-anwc-key="bg-btn" style="width: 120px; height: 40px;">
          Background Action
        </button>
        <dialog id="conformance-modal" style="width: 200px; height: 100px;">
          <button data-anwc-key="modal-action-btn">Modal Confirm</button>
        </dialog>
      </div>
    `,
    oracle: async (page) => {
      await page.evaluate(() => {
        const dlg = document.getElementById('conformance-modal') as HTMLDialogElement;
        if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
      });
      const isModal = await page.evaluate(() => {
        const dlg = document.querySelector('dialog');
        return Boolean(dlg && dlg.matches(':modal'));
      });
      return { pass: isModal, details: { isModal } };
    }
  },
  {
    id: 'state-dialog-portal-boundary',
    family: 'state-semantics',
    role: 'boundary',
    title: 'Non-modal Fixed Dialog Boundary',
    description: 'A non-modal <dialog open> positioned fixed is outside the normal-flow clip model. ANWC must report its clip as unknown with the position:fixed limitation instead of a rectangular clip fraction.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'assessment-unknown', key: 'dialog-shell', field: 'clip', limitation: 'Position:fixed' },
    html: `
      <dialog open data-anwc-key="dialog-shell" style="position: fixed; inset: 0; width: 200px; height: 100px;">
        <button data-anwc-key="dialog-btn">Close</button>
      </dialog>
    `,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const d = document.querySelector('dialog') as HTMLDialogElement;
        return { open: d.open, modal: d.matches(':modal'), position: getComputedStyle(d).position };
      });
      return { pass: details.open && !details.modal && details.position === 'fixed', details };
    }
  },

  // ==========================================
  // FAMILY 5: IDENTITY / CHANGE
  // ==========================================
  {
    id: 'identity-duplicate-key-defective',
    family: 'identity-change',
    role: 'defective',
    title: 'Duplicate Stable Key Collision',
    description: 'Multiple distinct buttons in the DOM share the same static data-anwc-key="save-action".',
    expectedRule: null, // tested at source or intent check
    expectedClassification: 'detected-defect',
    html: `
      <div>
        <button data-anwc-key="save-action">Save Top</button>
        <button data-anwc-key="save-action">Save Bottom</button>
      </div>
    `,
    oracle: async (page) => {
      const count = await page.evaluate(() => {
        return document.querySelectorAll('[data-anwc-key="save-action"]').length;
      });
      return { pass: count === 2, details: { count } };
    }
  },
  {
    id: 'identity-reorder-healthy',
    family: 'identity-change',
    role: 'healthy',
    title: 'Reordered Items with Stable Keys',
    description: 'List items retain their unique static author keys across reordering without ambiguity.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <ul data-anwc-key="item-list">
        <li><button data-anwc-key="item-c">Item C</button></li>
        <li><button data-anwc-key="item-a">Item A</button></li>
        <li><button data-anwc-key="item-b">Item B</button></li>
      </ul>
    `,
    oracle: async (page) => {
      const keys = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map((b) => b.getAttribute('data-anwc-key'));
      });
      return { pass: keys.length === 3 && new Set(keys).size === 3, details: { keys } };
    }
  },
  {
    id: 'identity-wrapper-boundary',
    family: 'identity-change',
    role: 'boundary',
    title: 'Boxless display:contents Wrapper Boundary',
    description: 'A keyed wrapper with display: contents (as slot/provider components insert) has no box of its own. ANWC must capture it boxless rather than inventing geometry, while the wrapped button keeps its key.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'boxless-node', key: 'contents-wrapper' },
    html: `
      <div class="outer-wrap">
        <div style="display: contents" data-anwc-key="contents-wrapper">
          <button data-anwc-key="wrapped-btn">Wrapped</button>
        </div>
      </div>
    `,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const wrapper = document.querySelector('[data-anwc-key="contents-wrapper"]') as HTMLElement;
        const button = document.querySelector('[data-anwc-key="wrapped-btn"]') as HTMLElement;
        return { wrapperRects: wrapper.getClientRects().length, buttonHeight: button.getBoundingClientRect().height };
      });
      return { pass: details.wrapperRects === 0 && details.buttonHeight > 0, details };
    }
  },

  // ==========================================
  // FAMILY 6: UNSUPPORTED / PERFORMANCE
  // ==========================================
  {
    id: 'unsupported-shadow-boundary',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Closed Shadow Root Boundary',
    description: 'Content inside a closed shadow root is invisible to light-DOM traversal. The v0 runtime does not declare this in coverage, so the case is a known gap until it does.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: {
      kind: 'known-gap',
      reason: 'runtime traverses light DOM only and emits no shadow-root coverage reason or unsupported feature; needs a runtime change'
    },
    html: `
      <div id="shadow-host" data-anwc-key="shadow-host"></div>
    `,
    setup: async (page) => {
      await page.evaluate(() => {
        const host = document.getElementById('shadow-host')!;
        const root = host.attachShadow({ mode: 'closed' });
        root.innerHTML = '<button id="shadow-btn">Shadow Button</button>';
      });
    },
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const host = document.getElementById('shadow-host')!;
        return { openShadowRoot: host.shadowRoot !== null, hostHeight: host.getBoundingClientRect().height };
      });
      return { pass: !details.openShadowRoot && details.hostHeight > 0, details };
    }
  },
  {
    id: 'unsupported-transform-boundary',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'CSS 3D Transform and Non-Affine Geometry',
    description: 'A 3D-transformed container is outside the rectangular clip model. ANWC must report its clip as unknown with the transform limitation.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'assessment-unknown', key: 'transform-box', field: 'clip', limitation: 'Transforms are unsupported' },
    html: `
      <style>
        .transform-box { transform: rotateY(45deg) scale(0.8); transform-style: preserve-3d; }
      </style>
      <div class="transform-box" data-anwc-key="transform-box">
        <button>Transformed</button>
      </div>
    `,
    oracle: async (page) => {
      const isTransformed = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="transform-box"]') as HTMLElement;
        return window.getComputedStyle(el).transform !== 'none';
      });
      return { pass: isTransformed, details: { isTransformed } };
    }
  },
  {
    id: 'unsupported-canvas-boundary',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'HTML Canvas Pixel Rendering Boundary',
    description: 'Canvas pixels have no DOM elements. The v0 runtime only has the global paint-visibility limitation, which holds for every node, so the case is a known gap until a canvas-specific signal exists.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: {
      kind: 'known-gap',
      reason: 'runtime emits no canvas-specific signal; only the all-node paint-visibility unknown, which is true by design; needs a runtime change'
    },
    html: `
      <canvas id="custom-canvas" width="200" height="100" data-anwc-key="canvas-elem"></canvas>
    `,
    setup: async (page) => {
      await page.evaluate(() => {
        const canvas = document.getElementById('custom-canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'rgb(0, 0, 255)';
        ctx.fillRect(10, 10, 180, 80);
      });
    },
    oracle: async (page) => {
      const pixel = await page.evaluate(() => {
        const canvas = document.getElementById('custom-canvas') as HTMLCanvasElement;
        return [...canvas.getContext('2d')!.getImageData(100, 50, 1, 1).data];
      });
      return { pass: pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 255, details: { pixel } };
    }
  },
  {
    id: 'unsupported-largedom-capped',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Capped Large DOM Performance Boundary',
    description: 'About 900 elements captured with maxNodes: 100 finish within bounded time (< 2000ms), set complete: false, skip nodes, and report the node cap reason.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'coverage-cap', reason: 'max node cap reached' },
    captureOptions: { maxNodes: 100, timeoutMs: 2_000 },
    html: '<div id="large-dom-root" data-anwc-key="large-root">' +
      Array.from({ length: 300 }, (_, i) => `<div><span>item ${i}</span><button>btn ${i}</button></div>`).join('') +
      '</div>',
    oracle: async (page) => {
      const count = await page.evaluate(() => document.body.querySelectorAll('*').length);
      return { pass: count >= 300, details: { count } };
    }
  },
  {
    id: 'partial-cap-truncated',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Lowered Cap Cuts A Subtree',
    description: 'A capture capped below the document size marks the nearest captured ancestor of the skipped elements as truncated.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'truncated-node', key: 'cut-list', reason: 'max node cap reached' },
    captureOptions: { maxNodes: 5 },
    html: `<ul data-anwc-key="cut-list"><li>one</li><li>two</li><li>three</li><li>four</li><li>five</li><li>six</li></ul>`,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="cut-list"]') as HTMLElement;
        return { items: el.children.length, all: document.querySelectorAll('body, body *').length };
      });
      return { pass: details.items === 6 && details.all > 5, details };
    }
  },
  {
    id: 'partial-open-shadow-truncated',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Open Shadow Root Boundary',
    description: 'Content in an open shadow root is not traversed; the host is marked truncated and coverage is incomplete.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'truncated-node', key: 'open-host', reason: 'open shadow root content is not inspected' },
    html: `<div id="open-host" data-anwc-key="open-host"></div>`,
    setup: async (page) => {
      await page.evaluate(() => {
        document.getElementById('open-host')!.attachShadow({ mode: 'open' }).innerHTML = '<button>Shadow action</button>';
      });
    },
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="open-host"]') as HTMLElement;
        return { shadowChildren: el.shadowRoot?.childElementCount ?? 0, lightChildren: el.childElementCount };
      });
      return { pass: details.shadowChildren === 1 && details.lightChildren === 0, details };
    }
  },
  {
    id: 'partial-frame-truncated',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Embedded Frame Boundary',
    description: 'Content in an iframe is a separate document; the visible frame is marked truncated and coverage is incomplete.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    boundarySignal: { kind: 'truncated-node', key: 'frame-host', reason: 'embedded frame content is not inspected' },
    html: `<iframe data-anwc-key="frame-host" srcdoc="<button>Framed action</button>" width="200" height="60"></iframe>`,
    oracle: async (page) => {
      const details = await page.evaluate(() => {
        const el = document.querySelector('[data-anwc-key="frame-host"]') as HTMLElement;
        return { frames: window.frames.length, height: el.getBoundingClientRect().height };
      });
      return { pass: details.frames === 1 && details.height > 0, details };
    }
  },
  {
    id: 'performance-runaway-motion-defective',
    family: 'unsupported-performance',
    role: 'defective',
    title: 'Runaway Continuing Motion Defect',
    description: 'Continuous rapid geometry oscillation prevents DOM readiness from settling within timeout.',
    expectedRule: null,
    expectedClassification: 'detected-defect',
    captureOptions: { timeoutMs: 300 },
    html: `
      <style>
        @keyframes jitter { 0% { transform: translateX(0px); } 50% { transform: translateX(50px); } 100% { transform: translateX(0px); } }
        .oscillating { animation: jitter 0.05s infinite linear; width: 100px; height: 100px; background: red; }
      </style>
      <button class="oscillating" id="oscillating-box" data-anwc-key="oscillating-box" data-anwc-expect="interactive">Jitter Button</button>
    `,
    oracle: async (page) => {
      const hasAnimation = await page.evaluate(() => {
        const el = document.getElementById('oscillating-box')!;
        return window.getComputedStyle(el).animationName === 'jitter';
      });
      return { pass: hasAnimation, details: { hasAnimation } };
    }
  },
  {
    id: 'performance-standard-dom-healthy',
    family: 'unsupported-performance',
    role: 'healthy',
    title: 'Standard Bounded DOM Performance Control',
    description: 'A standard static DOM with normal node count settles immediately within budget and yields zero false findings.',
    expectedRule: null,
    expectedClassification: 'healthy-pass',
    html: `
      <div data-anwc-key="clean-perf-container">
        <h1>Clean Performance Container</h1>
        <p>Simple static text content that settles instantly without animation or DOM cap issues.</p>
        <button data-anwc-key="clean-perf-btn">Clickable Action</button>
      </div>
    `,
    oracle: async (page) => {
      const count = await page.evaluate(() => document.querySelectorAll('*').length);
      return { pass: count < 50, details: { count } };
    }
  }
];
