# ANWC: everything for tonight, in one read

Read top to bottom on the train. Sections 1–4 are the must-knows; the rest is backup for questions. Facts here match the code at commit `d53da36` (2026-11-26). Deeper detail: [PITCH_STUDY_NOTES](PITCH_STUDY_NOTES.md), stage script: [PITCH](PITCH.md).

---

## 1. Say this (memorize)

> "AI coding agents can edit a web page, but they can't tell whether it actually works. A button can look fine in a screenshot and still be unclickable, because something invisible sits on top of it. ANWC opens the page in a real browser, measures what's blocked, cut off or overflowing, and points to the exact line of code. And when the agent says 'fixed', ANWC checks the claim. I'll show it catching an agent that cheats."

**If you blank:** agents can't see if their UI works → we measure it in a real browser and point to the code line → we catch agents that fake the fix. Then run the cheat demo.

---

## 2. What ANWC is (and isn't)

- **A verifier for UI changes.** Like a test runner or linter, but it checks the page the browser actually drew, not the code.
  - ESLint reads your code before it runs.
  - Unit tests check your logic.
  - ANWC checks what the browser rendered and whether it works, and links it back to the code line.
- **Not pixels, not screenshots, not embeddings.** It asks the browser for exact numbers (where each box is, what cuts it off, how many lines the text takes) and uses the browser's own tap test.
- **No AI model inside.** Same page, same answer, every time. Nothing leaves the machine.
- **It doesn't fix code.** It reports, writes a brief for the agent, and verifies the fix. Line: **"The tool that grades the homework shouldn't also write it."**
- **It doesn't judge looks.** No symmetry, centring, colour or spacing checks.
- **It supports screenshots, doesn't replace them.** "Screenshots for how it looks, ANWC for whether it works and where to fix it."

**The name.** It came from "AI-native web compiler", and there really is a compiler step: during development a Vite plugin parses every JSX file and stamps each element with its source file, line and column. Production builds are left untouched. That stamp is how a finding says "fix `main.tsx` line 44".

If asked: "It started as an AI-native web compiler: we instrument your JSX at build time so every element knows its source line. The product grew into the verifier built on top of that."

**How it ships.** A command-line tool that agents call and read as JSON (`anwc inspect`, `check`, `diff`, `report`, `doctor`, `studio`), a Vite plugin, and the Studio app for humans.

**The pipeline in one breath:**
1. The compiler stamps source lines.
2. The runtime measures the page in real Chromium, driven by Playwright.
3. Nine rules judge it.
4. Reports go to agents (JSON) and humans (Studio, HTML).
5. `check` verifies the fix.

---

## 3. The three verdicts and the cheat demo (the heart)

When an agent says "fixed", ANWC gives one of three answers:

- **Verified:** proven. The same element is still there, its problem is gone, and a real, unforced click on that exact element failed just before and works now. The earlier measurements haven't been edited.
- **Not proven (unverified):** the problem disappeared, but nothing proves it works. This is the honest default.
- **Contradicted:** the fix made things worse or cheated.

**The cheat demo:** the fake fix hides the button. The original error ("button is covered") disappears, so a check that only looks for that error goes quiet. ANWC says **CONTRADICTED**, because hiding the target is not a repair. Everyone who has used agents has seen them take shortcuts like this, so it lands.

**The real demo:** the notice moves out of the way. The click that did nothing before now opens the confirmation, and ANWC says **VERIFIED**. It adds a scope line: this finding, in this state, not the whole page.

The idea came from Vercel's agent-desktop: **a flag that every call carries proves nothing.**

---

## 4. The demo tonight

**Before (at home, not on stage):**

```bash
git pull
npm ci
npx playwright install chromium
npm run build
npm run demo
npm run demo:cheat
```

Both must end without an error. Use a terminal font of 18 pt or more.

**On stage:**

```bash
npm run demo:cheat
```

```bash
npm run demo
```

Each takes about 10 seconds and runs offline. If something breaks, open `artifacts/demo/before.html` and `after.html` from your rehearsal.

**Say first:** "The bug is planted and both fixes are scripted, so you can see exactly what happens." Saying it first makes you credible.

**Optional Studio moment:** `npm run anwc -- studio --port 4180` with the shop on 4175. Show the red marks, the covering element's line, the X-Ray Overlay and "Copy brief for agent".

**Deck:** fill in names, event, ask and contact on slides 1 and 8.

---

## 5. Why not just screenshots (your technical edge)

- **Patches lose exact geometry.** A vision model cuts the image into patches of roughly 14 px and embeds them, so "is this box 2 px inside its parent?" gets blurred away.
- **Invisible things don't show in pixels.** A transparent overlay looks perfect and still eats every click. No screenshot can show it; ANWC asks the browser what a tap would hit.
- **Pixels have no source line.** The model sees the problem but not where it lives in the code.
- **The DOM alone isn't enough either.** It says what exists, not where it ended up or what's on top.

### Invisible blockers: when they really happen

The browser decides what a tap hits by element **boxes**, not pixels. Something that draws nothing still catches taps.

1. **Ghost modal:** a popup fades to fully transparent but is never removed. Common in agent code: the fade is written, the removal forgotten.
2. **Loading cover:** a full-screen spinner fades out but stays.
3. **Image on top:** a PNG with see-through areas, or an unloaded image, over a button.
4. **Oversized wrapper:** a toast area or chat widget with a big transparent container.
5. **Stretched link:** a transparent "whole card is clickable" link swallows the card's buttons.

If the overlay is set to let clicks through (`pointer-events: none`), the browser skips it and ANWC correctly reports nothing.

**Tested:** on 2026-11-26 a brand-new app with a fully invisible (`opacity: 0`) overlay over "Buy now" got "25/25 blocked", naming the overlay's line.

**On stage:** the demo's blocker is a *visible* cookie notice. Use the ghost modal as the spoken example.

> "The scariest UI bug looks perfect. A popup fades out but never leaves, and now nothing can be clicked. A screenshot shows a flawless page. We ask the browser what a tap would hit, and it names the invisible popup and its line of code."

---

## 6. The nine checks

**First, intent.** ANWC can't read minds, so developers (or agents) add HTML attributes in JSX:

- `data-anwc-expect="visible"` or `"interactive"`: this must show, or be usable, right now.
- `data-anwc-max-lines="2"`: at most 2 lines of text.
- `data-anwc-allow="horizontal-scroll text-truncation"`: on purpose, don't treat it as a bug. Like Rust's `#[allow(...)]`; it's still recorded, as low-severity "info".
- `data-anwc-key="checkout"`: a stable name, for matching before and after.

Hiding things is normal, so hidden or off-screen only becomes a bug where `expect` says it shouldn't be. Severity: an element with a declared expectation gives an **error**; otherwise a **warning**.

### Always checked

1. **`HORIZONTAL_OVERFLOW`: content wider than its box.** Content width vs visible width. Example: a long word pushes a phone page sideways. Carousels can be marked allowed.
2. **`CLIPPED_BY_ANCESTOR`: a parent cuts it off.** It walks up the parents and computes what share survives. Example: a Save button half-hidden in a fixed-height panel. Measures in fractions of a pixel. For rotated or masked elements it answers "unknown" rather than guess.
3. **`TEXT_CLIPPED`: text cut off by its own box.** Each line's rectangle is checked to be fully visible. Example: a plan description losing its last line.

### Only where intent is declared

4. **`TEXT_LINE_BUDGET_EXCEEDED`:** wraps past `max-lines`. Example: a 2-line title becomes 4 on a phone.
   True story: our dashboard example's 2-line title wrapped to 3 on Linux fonts, ANWC flagged it, and our CI failed. The font really broke the design.
5. **`EXPECTED_VISIBLE_BUT_HIDDEN`:** hidden by "don't display", invisible or fully transparent styling, on it or a parent. **This catches the cheat demo.**
6. **`OUTSIDE_VIEWPORT`:** no part is on screen. Example: Save button 900 px down on mobile.
7. **`UNSUPPORTED_VISIBILITY`:** ANWC couldn't measure honestly, so it says "I can't tell" instead of "fine". Use this in the pitch.

### The tap test (clickable things only)

Covers buttons, links, form fields and anything clickable; disabled ones are skipped. Up to **25 points on a 5×5 grid**, centre first. For each point the browser's `document.elementFromPoint(x, y)` says what's on top, so ANWC knows whether it's reachable and **which element blocks it**.

8. **`POINTER_BLOCKED_AT_SAMPLES`:** every point blocked. Demo: "Checkout now has 25/25 pointer samples blocked", covered by the cookie notice at `main.tsx` line 44.
9. **`POINTER_PARTIALLY_BLOCKED`:** some points blocked. Example: a chat bubble over half a button.

**Why thin strips slip through:** the outer sixth of each side is never sampled. That's deliberate, because rounded buttons don't own their corners and corner taps would cause false alarms. 25 is a hard maximum. Ideas for later: an edge ring of points, extra taps when something's blocked, or computing exact coverage from boxes.

> "We sample 25 points per control with the browser's own hit test. A very thin strip at the edge can slip through; edge sampling is on our list, and we document the gap."

**How we know the checks are right:** each of the nine has test pages (a planted bug, a healthy version, edge cases) judged by separate browser code that imports nothing from ANWC. Switch a check off and the tests fail. This found four real bugs this week; three are fixed and one is the thin-strip limit.

---

## 7. Limits (memorize the shape)

**Three it can't see, one it can miss, one it doesn't judge, one promise.**

- **Can't see:**
  - painted pixels (colour isn't checked, so white on white counts as visible);
  - canvas (one big picture, no buttons inside);
  - some shadow DOM (closed ones can't be inspected).
- **Can miss:** thin overlays between the 25 tap points.
- **Doesn't judge:** taste (alignment, symmetry, beauty).
- **Promise:** incomplete captures are never reported as clean.

**Scope:**
- React with Vite, Chromium only, development only.
- One screen size and one state per capture.
- "Verified" covers only clickable things proven by a real click.

**Animation and video.**
- ANWC measures one moment after the page settles; constant movement gives an "unsettled" result, never clean.
- Video and canvas frames aren't inspected.
- Scroll effects are only sampled at declared positions.
- Line: "We're built for app interfaces: forms, checkouts, dashboards. Scroll-art and video-heavy sites are outside what we measure, and we say so."

**Your own code only.**
- Source lines need the plugin in the app's build, so it's for your own app during development.
- It's not a scanner for random websites. An experimental mode without the plugin exists, with no source lines; don't demo or promise it.

---

## 8. Who it's for, and the cheaper-model bet

- **For:** teams using coding agents on React/Vite apps, and the agents themselves.
- **Cheaper and open models:** structured text evidence may help most where vision is weakest, in smaller models and the many open models that can't read images.
- **Say it as a hypothesis:** "Our bet is that it helps cheaper and open models most. We haven't measured that; it's our next milestone, and we'll publish the result either way."
- **Never claim** agents get better, faster or cheaper with it, or that it saves tokens. None of that has been measured.

---

## 9. The landscape

**Chrome DevTools for agents** (Google):
- It gives an agent a browser to look at and inspect.
- ANWC adds a judged answer with the source line and a verdict on the fix.
- They work together.

**Visual regression testing** (Percy, Applitools, Chromatic, Argos):
- Save an approved screenshot, then compare new screenshots pixel by pixel; a human decides whether each difference is a bug.
- They need an approved image first; ANWC doesn't.
- They say "something changed"; ANWC says what, why and which line.
- They miss invisible overlays, since no pixels change.
- They catch colours, fonts and spacing, which ANWC doesn't.
- Line: "They check how it looks, we check whether it works."

**End-to-end tests:** they say pass or fail on a written path. ANWC adds why it failed and whether the repair is proven.

**The problem is real:** in the original SWE-bench Multimodal paper (2024), the best system solved 12% of visual front-end issues. Quote it as the 2024 baseline; newer models do better.

**Omarchy (DHH's Linux desktop):**
- ThePrimeagen leads its "Agentic QA". His harness, Oligarchy, boots Omarchy in virtual machines and lets agents press keys, click and judge from screenshots.
- His tests pair every action with its expected result and name the proof before running.
- He deleted tests of fonts, colours and icons to focus on behaviour, which is the same line we draw.
- **Pitch fact:** Omarchy's own agent instructions say to inspect screenshots "for clipping, overlap, incorrect spacing, stale state, focus problems".

> "Even DHH's Omarchy tells its agents to check screenshots for clipping and overlap by eye. For web apps, ANWC measures that instead of eyeballing it."

Be precise:
- We automate clipping and overlap, not spacing, stale state or focus.
- Omarchy is a desktop, not the web, so ANWC can't test it.
- There's no connection or endorsement.

---

## 10. What we learned from Vercel's agent-desktop

It's "computer use for agents" on desktop apps, reading the operating system's accessibility tree.

**Adopted:**
- one JSON wrapper for every command, with retry-safe error codes;
- IDs tied to one capture;
- verdicts instead of a bare "ok";
- partial results never shown as clean;
- the Studio's numbered boxes and legend;
- guides for contributing agents;
- independent test oracles.

**Not yet:** short summary first, a built-in usage guide, an MCP server, a live watch loop with a timeline, and hiding private data in exports.

---

## 11. Hard questions, short answers

- **"Doesn't Chrome DevTools for agents do this?"** It gives the agent a browser to look with; we give a judged answer, the source line and a verdict on the fix. They work together.
- **"Isn't this visual regression?"** That compares against an approved screenshot. We need no approved image and check behaviour, not similarity.
- **"Frontier models are good at UI now."** They still can't see an invisible overlay in a screenshot, and they still need proof their fix was real.
- **"Is it AI?"** No. Deterministic, so the same page gives the same answer.
- **"What does it support?"** React with Vite, Chromium, development.
- **"What does it miss?"** Painted pixels, canvas, some shadow DOM, thin overlays between sample points, and taste. Incomplete is never clean.
- **"Does it work on any website?"** No; it runs in your own app during development, where the code is changed.
- **"Can it fix things?"** Not by design: it judges and writes a brief, and the agent fixes. Auto-fix could be an optional extra later.
- **"Animations?"** It measures settled states; constant motion is flagged as unsettled.
- **"Any users? Proof it helps?"** Not yet. The next milestone is a controlled study: the same agent with and without ANWC, on bugs written by someone else.
- **"Why the name?"** The compiler origin story in section 2.
- **"Security? I saw npm audit warnings."** All in developer tooling (dev server, test runner, browser installer). Nothing ships to users, and the servers listen only on your own machine. Non-breaking updates are queued for after the pitch. Never `npm audit fix --force`: it would jump Zod a major version and break the data format.

---

## 12. Never say

- First or only.
- Any number for time, tokens or cost saved.
- "No findings means the page is correct."
- That it works on any website, or that it fixes things.
- That the demo bug is real, or that an agent made the demo fixes (they're scripted).
- That Omarchy or DHH have any connection to us.

---

## 13. Trying it with an agent on your laptop

Prompts and the instructions to paste into an agent: [TRY_WITH_AN_AGENT](TRY_WITH_AN_AGENT.md).

1. Use an agent that can run commands (Claude Code, Codex CLI, Cursor agent mode, Gemini CLI), not ChatGPT in the browser.
2. Paste the ANWC skill block, then Prompt A (shop) or B (portfolio).
3. The app goes in `examples/<name>/`, runs on port 5180, and gets inspected at 390x844 and 1440x900.
4. Don't let it commit or push.
5. Before tonight, stick with A or B. `npm run demo` is still the safe stage demo.

---

## 14. Status, as of 2026-11-26

- `main` is green on CI: Windows and Linux, Node 20 and 22, 418 unit tests and 57 browser tests, plus both demos on every run.
- The laptop demo bug (a warning mixed into JSON on Linux) is fixed.
- **Open:** confirm exit code 3 for incomplete captures; non-breaking dependency updates after the pitch.
- **Later:** the agent study, an MCP server, live watch mode, edge sampling for thin strips.
