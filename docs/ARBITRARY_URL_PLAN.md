# Inspecting arbitrary websites: current behavior and implementation plan

Current planning status, 2026-09-17: R01 shipped; R02–R06 remain deferred. [ROADMAP](ROADMAP.md) is the active Phase 3 backlog for a dependable installed React/Vite repair workflow. Runtime-only support remains a future product track, to be reconsidered after usage evidence. The technical R cards below remain design targets, not delivered support. Historical external-site observations are retained; no Amazon/Instagram test was rerun.

## The product behavior we want

From a workspace with the ANWC CLI installed:

```powershell
npm run anwc -- inspect "https://www.example.com/" --viewport 390x844 --format text
```

The command should inspect the rendered page without requiring the website to install ANWC, use React, or expose a special route. Reuse compatible installed instrumentation when available; otherwise attach the collector in this inspection's temporary browser session. Return bounded browser evidence or an actionable explanation of the unsupported condition. A successful capture is not a guarantee that the website has no visual or functional bugs.

The compiler remains useful: apps that install the plugin can map a rendered element back to original JSX. For the current product scope, ANWC requires that installed runtime path. A future runtime-only inspector should report `source unavailable` on arbitrary deployed sites. Inspection does not provide editable source for a remote website.

The `/lab?case=...` URL only selects a deliberately broken demo. It does not teach the detector what to report. Root URLs already work: they inspect whatever is rendered at `/`. Preparing an isolated defective app at `/` is benchmark infrastructure, not a prerequisite for URL inspection.

## What works and fails today

The existing external-page attempt is:

```powershell
npm run anwc -- inspect "https://www.amazon.com.au/" --runtime-only --viewport 390x844 --format text
```

Use a plain URL, not Markdown's `[label](URL)` syntax. This is an existing future-path command, not a promise that Amazon or Instagram currently succeeds. Neither site was rerun during this planning update.

In `packages/cli/src/index.ts`:

- Without `--runtime-only`, `capturePage` waits up to two seconds for `window.__ANWC__`. Ordinary websites do not install our collector. The reported Amazon timeout is consistent with this missing prerequisite; it does not establish what Amazon rendered.
- With `--runtime-only`, it bundles our collector and injects an inline script through `page.addScriptTag`. Strict Content Security Policy (CSP) can prevent this path.
- The reported Instagram error occurred during the runtime wait and says string evaluation was forbidden by CSP. W07 now separates failures inside capture from runtime absence, but errors during the runtime-presence wait are still broadly classified as `RUNTIME_MISSING`. Injection remains outside that wait and can surface as `INTERNAL`.
- Each inspection launches a fresh headless browser context. It does not inherit the user's Instagram login, cookies, current tab, consent state, or scroll position.

CSP can restrict inline scripts and string evaluation; changing a timeout does not resolve that. See [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src). Playwright exposes [script injection and initialization APIs](https://playwright.dev/docs/api/class-page), but their suitability must be verified against the pinned browser/toolchain and our collector, not assumed from method names.

## How the current detector chooses elements

`packages/runtime/src/index.ts` discovers ordinary document elements, excluding script/metadata/internal elements, then inspects up to 1,500 in document order. It reads rectangles, computed styles, overflow, and supported text/clip observations. Pointer tests are narrower: native controls and links, selected ARIA roles, and elements with an HTML `onclick` attribute.

`packages/runtime/src/hit-test.ts` uses a configurable 1–25 point cap (default 25), sampling the candidate's intersection with the current viewport; fully offscreen candidates have no samples. At each point it asks `document.elementFromPoint` which element receives pointer targeting. The target or its descendant counts as reachable; a different element is recorded as a blocker. This API ignores `pointer-events:none` and does not prove paint visibility ([MDN elementFromPoint](https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint)).

Names come from `aria-label`, `aria-labelledby`, or text content. The demo explicitly names its cookie element and includes answer-bearing class/key names. These aid humans and contaminate a blinded test, but the diagnostic rule does not compare them with a list of known defects. `diagnose` uses measurements, not the scenario field.

| Evidence | What ANWC currently knows | What it cannot infer automatically |
| --- | --- | --- |
| A button's samples hit another element | Pointer obstruction at those points | Whether the covering dialog is intentional |
| A rectangle/text fragment is clipped | Supported geometric clipping | Whether cropping is part of the design |
| Text occupies three lines | Measured line count | Whether the design permits two or four lines |
| An element is hidden | CSS/box facts | Whether that element should be visible in this app state |
| A custom div handles a framework event | Ordinary DOM geometry | Its event-handler meaning; delegated React events need not appear as `onclick` attributes |

`data-anwc-expect` supplies a current visibility/interaction expectation. `data-anwc-max-lines` supplies a line budget. `data-anwc-allow` acknowledges intentional scrolling/truncation. A normal semantic button can receive a pointer warning without these annotations; expectations currently raise severity to error. Labels and business meaning are not required for the geometric test.

An opaque layer with `pointer-events:none` may visually hide a control while all its pointer probes succeed. Canvas internals, iframe documents, and shadow trees are not covered by the current top-level selector. The present `complete` flag primarily means the node cap was not reached; it must not be advertised as whole-page visual coverage.

## Fixed scope and rollout

The current product scope is installed ANWC only: developers add the Vite plugin/runtime to an application they control. W and Phase 2 implementations provide the foundation; Phase 3 Q01–Q11 owns current acceptance corrections and the usable repair workflow. R02–R06 remain the future runtime-only inspector track and must not delay installed-runtime work. Implement sequentially with one owner for shared CLI/protocol files. No automatic parallel agent work is requested.

| Task | Deliverable | Dependencies |
| --- | --- | --- |
| R01 | Portable commands and useful URL errors | Current CLI |
| R02 | Automatic collector attachment and precise failures | R01; deferred future runtime-only scope |
| R03 | Prove detection without scenario names or ANWC annotations | R02, W05/W06 corrections |
| R04 | Explicit inspection targets for custom elements | R03 |
| R05 | Honest coverage, readiness, and page-state reporting | R02, W07 |
| R06 | Repeatable compatibility checks and operator guide | R03–R05 |

The current usable milestone is R01 plus the installed-runtime workflow. The future runtime-only milestone is R01–R03, including strict-CSP local fixtures and an uninstrumented neutral root page. Reliable arbitrary-site claims require R05/R06 as well. Third-party services can still show login/challenge pages or unsupported content; the tool must describe those limits.

Keep snapshot/error schema `0.1` for this bounded rollout. Use existing error `details`, coverage reasons/capabilities/unsupportedFeatures, assessment limitations, and source-null fields. CLI option additions require coordinated parser/schema/consumer/test changes in the owning task. Do not silently add snapshot fields. A browser-session attachment API or new structured page/frame model requires a separately scoped follow-up.

### R01 — Portable commands and URL validation

**Status:** complete on Windows. The root dev command directly invokes Vite with `examples/shop` as its root; root/shop build and test scripts use no Unix-only environment assignment or forced Playwright host platform. The standard full integration command passed: 36 unit tests, 10 Chromium tests, TypeScript, and production build. A root startup check accepted `--host 127.0.0.1 --port 4180` and served at that address. Linux CI has not been rerun in this checkpoint.

**Own:** root/shop npm scripts, generated subject scripts in `packages/benchmark/src/subject.ts`, CLI argument validation, focused tests/docs.

**Build:** remove hard-coded Unix environment assignments and the global Ubuntu Playwright override. Use portable Node entry invocation or a small cross-platform launcher with argument arrays; no new dependency is required. Keep necessary TypeScript loading explicit. Verify generated assisted exports as well as the evaluator checkout.

Reject a pasted Markdown link with `INVALID_USAGE` and a plain-URL example before launching Chromium. Do not silently select between differing label and destination URLs. Accept HTTP/HTTPS, reject unsupported schemes with a clear error; preserve the existing controlled `data:text/html` test path explicitly. Do not regress ordinary quoted URLs or query strings.

**Acceptance:** existing commands boot/build/test on Windows; a Linux CI check uses the same scripts without host override. Malformed Markdown input fails before navigation; valid root/path/query inputs reach the existing parser unchanged. Record any platform not executed instead of claiming it passed. Reproduce the existing five-second CLI test timeout before adjusting a bounded integration-test allowance; do not globally hide hangs with longer timeouts.

**Done when:** users can copy plain commands from docs on supported platforms and input mistakes produce usage guidance.

### R02 — Automatic collector attachment and precise errors

**Own:** CLI `capturePage`/`inspect`, runtime browser entry where needed, CLI options schema, local HTTP/CSP integration fixtures. Coordinate with W07: R02 owns attachment/error classification; W07 owns geometry/font readiness.

**Build:** introduce `--runtime auto|installed|inject`, default `auto`. Preserve `--runtime-only` as the `inject` alias; reject contradictory flags. In auto, check for a compatible installed API with a bounded, CSP-tested mechanism, preserving its source lookup. If absent, attach the same collector in this CLI-owned temporary session. Do not overwrite an incompatible page global: fail explicitly with version/API details. An installed-only miss should suggest auto/inject.

First prove an attachment approach on controlled strict-CSP pages: test a pre-navigation initialization mechanism and the capture invocation itself against the pinned Playwright/Chromium. Keep page CSP enabled; do not ship a global `bypassCSP`, remove policy headers, add `unsafe-eval`, or edit browser settings as the default fix. If the available mechanism cannot inspect a policy, return a precise unsupported error; do not claim CSP compatibility because the ordinary fixture passed. A different browser execution context is a bounded follow-up if this experiment fails, not permission to build an extension inside R02.

Use an overall deadline with bounded phases. Distinguish navigation, attachment, compatibility, readiness timeout, runtime exception, and invalid capture. Validate raw capture before `diagnose`. Keep the existing 0/1/2/3 exit classes; use current envelope codes plus `details.phase` and `details.reason` for precision. `RUNTIME_MISSING` is only absence; a CSP evaluation/attachment failure uses `INTERNAL` with reason `SCRIPT_POLICY_BLOCKED`, runtime throws use `INTERNAL` with reason `CAPTURE_FAILED`, invalid payloads use reason `INVALID_CAPTURE`, deadline expiry uses `TIMEOUT`. Do not report these as clean snapshots.

**Acceptance matrix:** installed/source-linked app; plain HTML without ANWC; strict header CSP denying inline/eval; nonce-based app script under strict CSP; redirect; incompatible global; throwing capture; malformed payload; stalled capture. Verify text and JSON, source-null on external DOM, and browser cleanup on every path. Record selected mode/method in existing coverage capability strings and the text footer; zero findings must state that it applies to inspected evidence.

**Done when:** a plain root URL works without prior website integration on the controlled matrix, and failures explain the actual phase rather than all saying runtime missing.

### R03 — Demonstrate label-independent measurement

**Own:** uninstrumented HTTP fixtures and browser/CLI tests. Reuse W05/W06 runtime fixes instead of duplicating them.

**Build:** serve static HTML/vanilla JS at `/`, with no ANWC package, lab route, query selector, ANWC attributes, or defect-revealing labels/classes. Keep broken/healthy variants and expectations on the evaluator side. Give real controls meaningful local actions.

Test native button fully/partly covered, an unobstructed button with a child span, text clipping, a restored-visibility descendant, and healthy normal wrapping/scrolling. Include transparent pointer obstruction and an opaque `pointer-events:none` layer: the latter must retain paint unknown. Include a legitimate modal covering background controls; measured obstruction is possible but product incorrectness must not be asserted automatically.

Run identical geometry with different visible labels and neutral class names. Expected sample evidence and rule codes stay the same, allowing labels, generated IDs, and timing to differ. Strip expectations while keeping geometry: pointer evidence remains, severity may change; hidden/line-budget errors must not appear without the corresponding intent. Apply a genuine CSS repair, verify normal click behavior independently, then show the obstruction disappears. Deleting the target cannot satisfy the behavior check.

**Acceptance:** each supported defect has independent browser truth and a passing healthy counterpart at 390×844 and 1440×900. Keep new fixture HTML free of detector imports. Record explicit unsupported outcomes rather than adding scenario-specific detector conditions.

**Done when:** we can demonstrate that an unlabelled page at `/` produces measured findings and a real repair changes those findings.

### R04 — Target custom elements without guessing business meaning

**Own:** CLI option/parser, runtime capture options/discovery, targeted tests, user guide.

**Build:** add repeatable `--target CSS_SELECTOR` and an optional `--expect visible|interactive` applying to those explicit matches for this capture. `--expect` without targets is invalid. No source/DOM mutation is needed. Explicitly targeted custom divs receive pointer sampling even if automatic semantic detection missed them. A target supplies measurement scope; an expectation supplies user intent. Do not imply that adding `role=button` proves a real event handler exists.

Malformed or unmatched target selectors produce a precise usage/target error, never an empty success. Include matched targets and required ancestor/blocker context under the node budget. If context cannot fit, expose partial coverage and unresolved evidence. Preserve ordinary automatic discovery when no target is supplied. Reuse existing node IDs, tag, role, label, box and related IDs in reports; show short blocker descriptions in text so users do not have to decode `related n32` alone.

**Acceptance:** a delegated-handler div is documented as potentially missed in automatic mode and sampled when targeted; its handler remains untouched. Verify zero/multiple matches, disabled/inert controls, empty labels, nested children, existing labels/expectations, and large-tree budget behavior. Independent UI action tests prove behavior; capture performs no clicks, fills, scrolls, or event-listener instrumentation.

**Done when:** arbitrary components can be inspected explicitly without naming their business purpose or rewriting their markup.

### R05 — Coverage and page state users can interpret

**Own:** CLI navigation metadata/error details/text formatting; runtime discovery/coverage; W07 readiness integration; fixtures.

**Build:** report the final captured URL and title, top-document scope, node cap/skips, source availability, and known unsupported containers in text. Populate existing coverage reasons/unsupportedFeatures for iframe contents, detected open shadow roots, canvas internals, and paint limits. Closed shadow roots cannot be reliably enumerated; state the general limitation. Do not traverse frames/shadow trees inside this task or assert full coverage of them.

A changed final URL is evidence of a redirect, not proof of a login wall. Page text/status may support a best-effort login/challenge notice; label it as such. Record HTTP error status in navigation error details; do not grade an HTTP error document as the requested page. When `--ready-selector` is supplied and absent, fail readiness. Without an expected page/selector, do not claim that the user's intended application state was reached. Keep new clean contexts as default, with no automatic login, cookie dismissal, CAPTCHA handling, user-profile import, or app interaction.

Use W07's bounded readiness and R02's phase errors. Expose incompleteness for skipped unsupported subtrees and budget exhaustion; distinguish that from full paint visibility, which remains unsupported even on a complete DOM capture. Preserve captured evidence when meaningful and return exit 3 for partial/unsettled captures.

**Acceptance:** deterministic redirect/login mock, challenge mock, HTTP 403/500, delayed hydration, endlessly moving element, iframe, open shadow tree, canvas, >1,500-node app. No empty/blocked/partial capture is described as a whole-site pass. Do not print cookie values, form input values, or response bodies in new diagnostics.

**Done when:** users can tell which page/state/scope was actually inspected and what remains unknown.

### R06 — Compatibility rehearsal and handoff

**Own:** one local compatibility command, operator docs, result template; no live-service dependency in CI.

**Build:** run the controlled R02/R03/R05 matrix through the public CLI and produce a compact report with commit, toolchain, mode, viewport, observed result, unsupported reason, and source availability. Demonstrate a repaired uninstrumented root page and an instrumented app's source linkage. Use one bounded full integration run after targeted checks.

Public website smoke tests are optional manual observations. For Amazon/Instagram, record requested/final page and whether the intended content was reached; do not promise stable availability or classify consent/login UI as a bug solely because it covers content. An authenticated current-tab or saved-state workflow remains a separate future task requiring its own lifecycle and data-handling contract.

**Acceptance:** clean-install instructions reproduce the local matrix on the supported platforms; no credentials or network accounts are needed. Examples contain plain URLs only. Explain how to use targets and source-null output. Keep human agent repair/cost results distinct from detector compatibility results.

**Done when:** another collaborator can reproduce arbitrary-page inspection without the public lab and understand each success/limitation.

## Is the current prototype real?

The compiler inserts source identity, the collector measures Chromium's live DOM, and diagnostics calculate findings from those measurements. That is a functioning prototype. Existing tests also exercise runtime-only inspection, but mainly on a small `data:` page; that does not establish strict-CSP or large-site compatibility.

Our fixture labels and intent annotations make the demonstration easier than an unfamiliar app. The current sample-based pointer model, candidate heuristic, readiness check, source-unavailable mode, and coverage limitations are material. Those external-site concerns came from an earlier revision; Windows script fixes and W07 readiness work have since shipped. See STATUS/HISTORY for dated evidence. This planning update does not rerun or upgrade compatibility results.

When the deferred R track is activated, R03 supplies its uninstrumented, neutrally labelled page with a measured before/after repair. The next product claim requires unfamiliar-app precision/false-positive checks and actual paired agent outcomes. Neither a green fixture suite nor a short report proves cost savings.

## Implementer prompt

> Implement Rxx from docs/ARBITRARY_URL_PLAN.md only. Read the fixed scope, the entire task card, docs/PROTOCOL.md, current source, and git status. Follow its predetermined options, error mapping, dependencies, and acceptance matrix. Preserve source linkage when installed and source-null when absent. Reuse existing dependencies. Use controlled local HTTP fixtures for compatibility evidence; do not rely on live service behavior. Never resolve unknowns by returning clean results or injecting fixture-specific rules. Update STATUS with actual evidence and HISTORY with completed-task evidence, commit the completed task, and push under the user's existing authorization. Ask only for a demonstrated contract conflict outside this scope.
