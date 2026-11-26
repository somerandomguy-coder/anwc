# Pitch study notes (source for the train cheat sheet)

Written 2026-11-26 from the code at `e3d84f1`. Rules: `packages/diagnostics/src/index.ts`. Measurements: `packages/runtime/src/` (`index.ts`, `hit-test.ts`, `text.ts`, `clipping.ts`).

## Corrections to remember

- No pixels, no screenshots, no embeddings. ANWC asks the browser for exact numbers (boxes, clips, text lines) and runs the browser's own hit test.
- The "dots" are tap points: up to 25 points inside each clickable element, each asking the browser "what would a tap here hit?"
- It does not judge looks: no symmetry, centring, colour or spacing checks.
- It does not fix code. It reports, writes a brief for the agent, and verifies the fix.
- No AI model inside. Same page, same answer.

## What ANWC is (and the name)

- The name came from "AI-native web compiler". There really is a compiler step, `packages/compiler`: during development it parses each JSX file with Babel and stamps every element with a `data-anwc-site` attribute pointing at its file, line and column. Production builds are left untouched. That stamp is how a finding knows its source line.
- But the compiler is the plumbing, not the product. The value is measuring the running page and judging repairs.
- What it is, in one line: **a verification tool for UI changes**, like a test runner or linter, except it checks the rendered page instead of the code.
- Not just a library. It ships as a command-line tool (`anwc inspect`, `check`, `diff`, `report`, `doctor`, `studio`), a Vite plugin, and the Studio app. Agents call the command line and read JSON; people use the Studio or the HTML report.
- Comparison that lands: ESLint reads your code before it runs; unit tests check your logic; ANWC checks what the browser actually rendered, and links it back to the code.
- Parts: compiler (stamps source lines) → runtime (measures in Chromium) → diagnostics (nine rules) → report (JSON, text, HTML) → CLI and Studio (how agents and people use it).
- Asked "why the name?": "It started as an AI-native web compiler: we instrument your JSX at build time so every element knows its source line. The product grew into the verifier built on top of that."

## Two ideas that make the nine checks make sense

**1. Intent.** ANWC can't guess what you wanted, so developers can declare it with HTML attributes:

| Attribute | Says |
| --- | --- |
| `data-anwc-expect="visible"` or `"interactive"` | This must be visible (or usable) in this state and screen size |
| `data-anwc-max-lines="2"` | This text may use at most 2 lines |
| `data-anwc-allow="horizontal-scroll text-truncation"` | This overflow or cut-off text is on purpose |
| `data-anwc-key="checkout"` | A stable name, so before and after can be matched |

Four of the nine checks only run where intent is declared. Without `expect`, a hidden or off-screen element is not a bug, because hiding things is normal.

**2. Severity.** An element with a declared expectation gives an **error**; otherwise a **warning**. An allowed (`data-anwc-allow`) finding becomes **info** and stays in the output marked acknowledged, so a policy can never erase a measurement.

## The nine checks

### Always on (measured for every element)

**1. `HORIZONTAL_OVERFLOW`: content wider than its box**
- Measures: the element's content width (`scrollWidth`) against its visible width (`clientWidth`).
- Fires: when content is wider.
- Real bug: a long word or table pushes the page sideways on a phone.
- On purpose: carousels, code blocks. Mark with `data-anwc-allow="horizontal-scroll"`.

**2. `CLIPPED_BY_ANCESTOR`: a parent cuts it off**
- Measures: walks up the parents; any parent with `overflow: hidden`, `clip`, `scroll` or `auto` cuts its children to its inner box. ANWC computes how much of the element survives (`boxFraction`).
- Fires: when less than 100% survives. Zero-size elements never fire.
- Real bug: a Save button half-hidden in a fixed-height panel.
- Precision: fractional pixels, scrollbars subtracted. Inside a CSS-zoomed scroller, clips under about 2 px can be missed.
- Refuses to guess: transforms, `clip-path`, masks, vertical text and absolute/fixed positioning give "unknown" (see check 7).

**3. `TEXT_CLIPPED`: text cut off by its own box**
- Measures: the rectangle of every line fragment of the text (browser Range rectangles), then whether each fragment is fully inside the visible area.
- Fires: when any fragment is cut.
- Real bug: a plan description loses its last line.
- On purpose: deliberate "…" truncation. Mark with `data-anwc-allow="text-truncation"`.
- Fixed this week: whole-pixel rounding used to cause false alarms on text that fits exactly.

There is no general "this is hidden" check, because hiding things is normal. Hidden only becomes a bug when the developer said it should be visible (check 5).

### Need declared intent

**4. `TEXT_LINE_BUDGET_EXCEEDED`: text wraps onto too many lines**
- Needs: `data-anwc-max-lines="N"`.
- Measures: counts lines by grouping text fragments by height.
- Fires: when the count is over N.
- Real bug: a title designed for 2 lines wraps to 4 on a narrow phone. Nothing is cut, it just breaks the design.

**5. `EXPECTED_VISIBLE_BUT_HIDDEN`: should be visible, isn't**
- Needs: `data-anwc-expect="visible"` or `"interactive"`.
- Measures: `display: none` on the element or any parent, `visibility: hidden`, opacity 0 anywhere up the tree, `content-visibility: hidden` on a parent.
- Real bug: a checkout button hidden by a broken state. This is what catches the cheat demo's "fix", which hides the button.

**6. `OUTSIDE_VIEWPORT`: should be on screen, isn't**
- Needs: `data-anwc-expect`.
- Measures: how much of the box overlaps the visible screen.
- Fires: when none of it does.
- Real bug: the Save button pushed 900 px down on mobile.
- Note: this is for the current scroll position and screen size only.

**7. `UNSUPPORTED_VISIBILITY`: ANWC can't measure this honestly**
- Needs: `data-anwc-expect`.
- Fires: when the clip check returned "unknown" (transforms, clip-path, masks, vertical text, absolute/fixed positioning).
- Why it exists: the tool admits it can't measure instead of silently saying "fine". Use this in the pitch.

### The tap test (only clickable things)

Which elements: `button`, `select`, `textarea`, `summary`, links with `href`, visible inputs, ARIA roles button/link/checkbox/menuitem, and anything with `onclick`. Disabled and inert ones are skipped.

How: points on a 5×5 grid inside the element's visible part, at 1/6, 2/6 … 5/6 of its width and height, centre first. For each point the browser's `elementFromPoint` says what is on top. If it's the element or its child, it's reachable; anything else is a blocker, and ANWC records which element. A link that wraps onto two lines is sampled on each line, not across its whole bounding box (fixed this week; it caused false alarms on wrapped links). Elements off screen get no samples.

**8. `POINTER_BLOCKED_AT_SAMPLES`: every tap hits something else**
- Fires: when all tested points are blocked.
- Demo: "Checkout now has 25/25 pointer samples blocked", covered by the cookie notice at `main.tsx:44:170`.
- Why screenshots miss it: a transparent overlay looks perfect and still eats every click.

**9. `POINTER_PARTIALLY_BLOCKED`: some taps blocked**
- Fires: when some, not all, points are blocked.
- Real bug: a chat bubble covering half a button.
- Known limit: an overlay thinner than the gap between grid points (an 8 px strip on a button edge was the test case) can be missed. It's sampling, not pixel coverage.

Numbering note: the code lists them as horizontal overflow, clipped by ancestor, text clipped, line budget, expected visible but hidden, outside viewport, unsupported visibility, pointer blocked, pointer partially blocked. The groups above are for explaining, not the code order.

## Invisible blockers: real examples (why screenshots aren't enough)

Key fact: the browser decides what a tap hits by element boxes, not pixels. An element that draws nothing still catches every tap in its rectangle.

1. Ghost modal: a popup fades to `opacity: 0` but is never removed, so it covers the page invisibly. Common in agent-written code (the fade is written, the removal is forgotten).
2. Loading cover: a full-screen spinner or skeleton fades out but stays.
3. Image on top: a PNG with transparent areas, a gradient or an unloaded image sits over a button. You see the button; the tap hits the image's box.
4. Oversized wrapper: a toast area, chat widget or sticky header with a big transparent container over the buttons near it.
5. Stretched link: a transparent "make the whole card clickable" link swallows the card's own buttons.

In every case a screenshot is pixel-perfect. ANWC's tap test gets the browser's real answer, including the right answer when the overlay uses `pointer-events: none` (clicks pass through, so nothing is reported).

On stage: the demo's blocker is a visible cookie notice. Use the ghost modal as the spoken example; don't say the demo shows a transparent overlay.

Line: "The scariest UI bug looks perfect. A popup fades out but never leaves, and now nothing can be clicked. A screenshot shows a flawless page. We ask the browser what a tap would hit, and it names the invisible popup and its line of code."

## Visual regression testing (Percy, Applitools, Chromatic, Argos)

Save a screenshot when the page looks right (the approved image), then after each change compare new screenshots pixel by pixel; a human decides whether each difference is a bug.
- They need an approved picture first; ANWC doesn't.
- They say "something changed"; ANWC says what is wrong, why, and which code line.
- They miss invisible problems (a ghost overlay changes no pixels); ANWC's tap test catches it.
- They catch colours, fonts, spacing and wrong icons, which ANWC doesn't. Line: "They check how it looks, we check whether it works."

## The limits to remember

Memory aid: three it can't see, one it can miss, one it doesn't judge, one promise.
- Can't see: painted pixels (colour isn't checked, so white on white counts as visible), canvas (one picture, no buttons inside), some shadow DOM (closed ones can't be inspected; open ones mark the capture incomplete).
- Can miss: thin overlays between the 25 tap points.
- Doesn't judge: taste (alignment, symmetry, centring, beauty).
- Promise: incomplete captures are never reported as clean.
- Scope: React with Vite, Chromium, development only, one screen size and state per capture; "verified" covers only clickable things proven by a real click.

## Intent attributes in practice

- Written by the developer (or the agent) directly in JSX, e.g. `<h2 data-anwc-max-lines="1">`, `<button data-anwc-expect="interactive">`.
- Rust analogy: `data-anwc-allow` is like `#[allow(...)]` (on purpose, still recorded as acknowledged); `expect` and `max-lines` are like assertions (state a rule once, get told when it breaks).
- To fail CI: `anwc inspect … --fail-on error` exits 1.
- True story: the dashboard example's title is limited to 2 lines. On GitHub's Linux machines a wider font wrapped it to 3, ANWC reported `TEXT_LINE_BUDGET_EXCEEDED`, and CI failed. The font really broke the design.
- Don't claim these hand-written attributes are removed in production; only ANWC's own source stamps are development-only.

## Animation, video and scroll effects

- ANWC measures one moment after the page settles. Constant movement gives an "unsettled" capture (exit 3), never a clean result.
- Video and canvas are single boxes; their frames aren't inspected.
- One scroll position per capture; `check` can declare scroll steps, but that samples, not covers.
- Line: "We're built for app interfaces: forms, checkouts, dashboards. Scroll-art and video-heavy sites are outside what we measure, and we say so."

## Your own code, not random URLs

- Source lines need the Vite plugin in the app's build, so it works on your own React/Vite app during development.
- An experimental `--runtime-only` mode can measure a running page without the plugin, but with no source lines; arbitrary-site support is officially deferred. Don't demo or promise it.
- Line: "A developer and agent tool that runs where the code is changed, not a website auditor."

## The tap test under the hood

- Tool: `document.elementFromPoint(x, y)`, a standard browser function returning the topmost element a tap at that point would hit (respects stacking and `pointer-events: none`). Runs inside real Chromium, opened and controlled by Playwright.
- Code: `packages/runtime/src/hit-test.ts`. For each point: no element → no-target; the button or something inside it → reachable; anything else → blocked, and the blocker is recorded.
- Points: a fixed 5×5 grid at 1/6 … 5/6 of the width and height, centre first. 25 is a hard maximum (the runtime rejects more).
- Why thin edge strips slip through: the outer sixth of every side is never sampled. That's deliberate, because rounded buttons don't own their corners and corner taps would give false alarms.
- Possible improvements (not built): an edge ring of points just inside each side, avoiding corners; adaptive extra taps when something is blocked; computing exact covered area from the boxes of elements above, confirmed with taps.
- Cost isn't the issue (taps are fast). The real costs: the "at most 25" output contract, run-to-run stability, and fair before/after comparison with old captures.
- Line: "We sample 25 points per control with the browser's own hit test. A very thin strip at the edge can slip through; edge sampling is on our list, and we document the gap."

## Limits that apply to all nine

- Up to 1,500 elements per capture; beyond that the capture is marked partial and never reported as clean.
- Pages with a visible iframe or open shadow root are marked incomplete (`inspect` exits 3).
- Paint is not measured: "visible" means not hidden by CSS and not cut off, not "pixels actually drawn". Canvas and closed shadow roots are not inspected.
- One state and one screen size per capture. Other states need `check` with declared steps.
- Each finding carries its own `limitations` list in the output, and the studio shows it.

## How the checks are tested (for "how do you know it's right?")

- Independent oracles: for each of the nine checks there's a test page with a planted defect, a healthy control and edge cases, judged by plain browser code that imports nothing from ANWC. If a check is switched off, the suite fails.
- Those oracles found four real bugs this week; three are fixed and one (the thin strip) is documented.
- CI runs 418 unit and 57 browser tests on Windows and Linux.
