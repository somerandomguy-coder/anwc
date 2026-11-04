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
    description: 'Elements styled with custom font names declare standard font readiness or fallback boundaries.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <style>
        @font-face {
          font-family: 'DelayedFont';
          src: local('NonExistentCustomFont12345');
        }
        .custom-text { font-family: 'DelayedFont', sans-serif; font-size: 16px; }
      </style>
      <div class="custom-text" data-anwc-key="delayed-font">Text with fallback font</div>
    `,
    oracle: async (page) => {
      const exists = await page.evaluate(() => Boolean(document.querySelector('[data-anwc-key="delayed-font"]')));
      return { pass: exists, details: { exists } };
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
    title: 'Sticky Header Boundary',
    description: 'Sticky header positioning maintains bounded viewport presence.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <style>
        .sticky-wrap { height: 200px; overflow-y: auto; }
        .sticky-nav { position: sticky; top: 0; background: white; height: 40px; }
        .content { height: 400px; }
      </style>
      <div class="sticky-wrap">
        <nav class="sticky-nav" data-anwc-key="sticky-nav"><button>Menu</button></nav>
        <div class="content">Content</div>
      </div>
    `,
    oracle: async (page) => {
      const sticky = await page.evaluate(() => {
        const nav = document.querySelector('[data-anwc-key="sticky-nav"]') as HTMLElement;
        return window.getComputedStyle(nav).position === 'sticky';
      });
      return { pass: sticky, details: { sticky } };
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
    description: 'Target with 1px height tests sample resolution and fractional geometry boundaries.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <button data-anwc-key="thin-btn" style="width: 100px; height: 1px; padding: 0; border: 0; display: block;">
        Line
      </button>
    `,
    oracle: async (page) => {
      const height = await page.evaluate(() => {
        const btn = document.querySelector('[data-anwc-key="thin-btn"]') as HTMLElement;
        return btn.getBoundingClientRect().height;
      });
      return { pass: height <= 1, details: { height } };
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
    title: 'Dialog Backdrop Boundary',
    description: 'Modal dialog element positioning and backdrop containment boundary.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <dialog open style="position: fixed; inset: 0; width: 200px; height: 100px;">
        <button data-anwc-key="dialog-btn">Close</button>
      </dialog>
    `,
    oracle: async (page) => {
      const isOpen = await page.evaluate(() => {
        const d = document.querySelector('dialog') as HTMLDialogElement;
        return d && d.open;
      });
      return { pass: isOpen, details: { isOpen } };
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
    title: 'Wrapper Insertion Boundary',
    description: 'Element wrapped in an additional container element preserves its key identity.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <div class="outer-wrap">
        <div class="inner-wrap">
          <button data-anwc-key="wrapped-btn">Wrapped</button>
        </div>
      </div>
    `,
    oracle: async (page) => {
      const hasKey = await page.evaluate(() => {
        return Boolean(document.querySelector('[data-anwc-key="wrapped-btn"]'));
      });
      return { pass: hasKey, details: { hasKey } };
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
    description: 'Content inside a closed shadow root cannot be inspected via standard light DOM traversal; ANWC reports boundary limitation.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <div id="shadow-host" data-anwc-key="shadow-host"></div>
      <script>
        const host = document.getElementById('shadow-host');
        if (host && !host.shadowRoot) {
          const root = host.attachShadow({ mode: 'closed' });
          root.innerHTML = '<button id="shadow-btn">Shadow Button</button>';
        }
      </script>
    `,
    oracle: async (page) => {
      const hasHost = await page.evaluate(() => Boolean(document.getElementById('shadow-host')));
      return { pass: hasHost, details: { hasHost } };
    }
  },
  {
    id: 'unsupported-transform-boundary',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'CSS 3D Transform and Non-Affine Geometry',
    description: 'Transformed geometry reports paintVisibility: unknown and unsupportedFeatures: transformed-geometry.',
    expectedRule: null,
    expectedClassification: 'unsupported',
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
    description: 'Canvas pixel rendering has no DOM elements; ANWC explicitly labels paint visibility unknown and never counts zero findings as healthy.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    html: `
      <canvas id="custom-canvas" width="200" height="100" data-anwc-key="canvas-elem"></canvas>
      <script>
        const canvas = document.getElementById('custom-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'blue';
          ctx.fillRect(10, 10, 180, 80);
        }
      </script>
    `,
    oracle: async (page) => {
      const isCanvas = await page.evaluate(() => Boolean(document.querySelector('canvas')));
      return { pass: isCanvas, details: { isCanvas } };
    }
  },
  {
    id: 'unsupported-largedom-capped',
    family: 'unsupported-performance',
    role: 'boundary',
    title: 'Capped Large DOM Performance Boundary',
    description: 'A DOM with 2,000 nodes tested against maxNodes: 100 executes within bounded time (< 2000ms), sets complete: false, and reports node cap reached.',
    expectedRule: null,
    expectedClassification: 'unsupported',
    captureOptions: { maxNodes: 100, timeoutMs: 2_000 },
    html: '<div id="large-dom-root" data-anwc-key="large-root">' +
      Array.from({ length: 300 }, (_, i) => `<div><span>item ${i}</span><button>btn ${i}</button></div>`).join('') +
      '</div>',
    oracle: async (page) => {
      const count = await page.evaluate(() => document.querySelectorAll('*').length);
      return { pass: count >= 300, details: { count } };
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
