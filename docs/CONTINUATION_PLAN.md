# ANWC continuation plan: reliability and useful test cases

Date: 2026-09-15. Reviewed source: `7db32b135cc72e3ad6cb44e2a4630f264b1dfb79`.

**Status: W01/W02 were committed in `ba386e1`/`bcdaf30`; W03–W14 remain planned.** Windows verification subsequently found script portability failures and one CLI test timeout; see [PROGRESS](PROGRESS.md). T00–T09 describe the original prototype; T10 remains the actual agent comparison. A green prototype suite does not mean every original acceptance detail or production use case is complete.

**Future product track:** [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md) defines R02–R06 for inspecting websites without preinstalled ANWC: automatic attachment, CSP-tested execution, custom targets, honest coverage, and neutral-page verification. The current product requires developers to install the ANWC Vite/runtime integration. R01 portable commands are complete; W03 is next for the shop. Root-URL inspection does not depend on W12; W12 prepares fair repair benchmark subjects. R02 owns attachment/error classification and W07 owns layout readiness. Implement one card at a time when these touch shared files.

## What to build while agent testing is pending

Continue engineering. Keep any experiment already started on its recorded revision, while new fixes and fixtures get new revisions. Waiting for human model runs should not block correctness work or make subject preparation remain a manual coding task.

The intended outcome of this plan is concrete:

1. Export two runnable copies of the same application without hidden benchmark material or stale build output.
2. Prove a defect exists using ordinary browser evidence, then prove a valid repair removes it while preserving behavior.
3. Give the evaluator a command that prepares those copies and a command that checks returned repairs.
4. Add two different small applications, with broken and healthy variants, to test beyond the same shop panel.

No new framework architecture is needed for these tasks. Keep TypeScript, npm workspaces, React/Vite, Zod, and Playwright. No external services, real accounts, payments, model API calls, or automatic paid agent runs are part of this backlog.

## What the three previously suggested directions meant

| Direction | How it belongs to ANWC | Decision now |
| --- | --- | --- |
| Vite product hardening | Make the existing plugin dependable when users change code, load routes, build production, or inspect a page before it is ready | Do the small correctness/integration tasks below |
| Next.js integration | Let a Next.js app expose the same evidence, ultimately with original JSX locations | Defer the compiler adapter. Runtime-only injection already exists; framework compatibility still needs its own proof |
| Richer browser visibility | Improve evidence for clipping and coverage beyond the current rectangle and pointer model | Fix false claims and missing limits now. Defer a new paint/compositing engine |

MCP and live sessions may later make inspection easier to call from agents. They are not prerequisites for building meaningful tests.

## Evidence behind this backlog

These are code-review observations, not new execution results:

| Location | Current gap | Task |
| --- | --- | --- |
| `packages/benchmark/src/index.ts`, `copyTree` / `packageSubjectWorkspace` | Copies complete app/package directories, including generated files; overlay writes happen after root script sanitization; lockfile and TS references are copied from a different workspace layout | W01 |
| Same file, `sameRunSetup` | Requires identical full URLs even though documented A/B servers use different ports | W02 |
| Same file, `renderResultsSummary` | Adds null repair/regression counts as zero, hides failure/exclusion counts in aggregates, and shows condition medians rather than paired differences | W02 |
| `examples/shop/src/main.tsx` | Checkout fixture buttons have no action; full-page links lose React cart state; the lab Details button sets state but the early return omits the modal | W03 |
| `tests/browser/shop-scenarios.spec.ts` | Line-budget truth checks only that a client rectangle exists; text-clip truth checks a height ratio. Neither proves the claimed text error | W04 |
| `packages/runtime/src/index.ts`, `renderState` | Accumulates ancestor visibility without handling a child that restores visibility | W05 |
| `packages/runtime/src/index.ts` / `hit-test.ts` | Declares `maxSamplesPerNode` but does not use it; samples the whole border box, including offscreen parts | W06 |
| `packages/runtime/src/index.ts`, `waitForReadiness` | Two animation frames are labelled settled without checking geometry stability or fonts | W07 |
| `packages/vite-plugin/src/index.ts` | Source registration depends on module execution order; current HMR test does not establish lazy-module and cold-start ordering guarantees | W08 |
| Existing test/benchmark tooling | No committed, working end-to-end repair grader or one-command fair pair preparation | W09–W14 |

The earlier ordinary/assisted export smoke checks are useful but insufficient: the ordinary source tree retains `src/test-runtime.ts`, source folders can contain generated files, and the example overlays used different app attributes. A passing build in a nested export is not proof of an independent clean install or identical A/B application inputs.

## Rules already decided for the implementing model

- Implement one W task per commit, in the order below. Record evidence and push each completed task using the user's existing authorization.
- No need to ask which library, router, database, model provider, or CSS framework to use. Keep the current dependencies; introduce a dependency only if a task explicitly needs it.
- Keep browser snapshot schema `0.1`. Tasks below can change behavior without replacing its structure. Benchmark-specific manifests may get their own version as specified.
- A public development corpus may contain answers in the evaluator repository. Only exported subject folders are agent inputs. Do not call public fixtures a statistical holdout.
- Source-editing repair agents receive editable app source plus a local URL. URL-only runs are detection-only.
- Both arms receive identical app content and intent annotations. Tool packages and generated Vite configurations may differ; record those differences.
- Valid repair means preserved content and functioning actions. Deleting the target, removing the layout contract, or turning off ANWC is not a repair.
- Capture stays read-only. A test/evaluator may click, fill, and scroll to set up a state; record that separately from the capture.
- Keep paint visibility unknown. Support limitations belong in output and docs.
- Do not publish another GitHub repo automatically. A clean export can later be placed in an agent-only repo with a single initial commit and no evaluator history. Start with local folders.
- No claim of cheaper or better agents until actual paired runs support it.

## Ordered task board

Statuses here describe dependency readiness, not assigned ownership.

| Task | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| W01 | Trustworthy subject exports | existing packager | done |
| W02 | Honest result accounting and paired endpoints | existing ledger | done |
| W03 | Functional shop controls and lab | existing shop | ready |
| W04 | Ten defects with ten explicit healthy counterparts | W03 | queued |
| W05 | Correct inherited render visibility | existing runtime | ready |
| W06 | Bounded pointer probes in the current viewport | existing runtime | ready |
| W07 | Bounded readiness and truthful timeout errors | existing CLI/runtime | ready |
| W08 | Reliable source registration and production checks | existing Vite plugin | ready |
| W09 | Small fixture contract and independent browser checks | W04 | queued |
| W10 | Landing/pricing application with four defect pairs | W09 | queued |
| W11 | Dashboard application with four defect pairs | W09 | queued |
| W12 | One-command A/B subject preparation | W01, W02, W09–W11 | queued |
| W13 | Independent repair grader and integrity checks | W09, W12 | queued |
| W14 | Full preparation/repair rehearsal and handoff | W05–W08, W13 | queued |

Run sequentially for the initial rollout. The table is not an instruction to launch multiple agents.

## W01 — Trustworthy subject exports

**Own:** subject packaging/inventory functions in `packages/benchmark/src/index.ts` (may extract `subject.ts`), benchmark CLI dispatch, focused filesystem tests, export docs.

**Build:**
1. Export an explicit list of required source/config files. Exclude `node_modules`, build output, caches, logs, test bridges, fixture answer files, Git metadata, and source maps at any depth. Do not silently ignore a prohibited payload and then certify a folder containing it.
2. Ordinary exports must not contain ANWC imports or scripts, including `examples/shop/src/test-runtime.ts`. Assisted exports need runtime tool source, not protocol synthetic fixtures or evaluator code.
3. Restrict overlays to application files. Generate root scripts, workspace lists, TS references, and condition-specific Vite configs after the overlay; an overlay cannot replace them.
4. Reject symlinks/junctions and source/overlay/destination path overlap that would cause recursive copies. Reject existing destinations. On failure, either remove only this invocation's verified staging directory or keep an explicit incomplete export that cannot pass preflight.
5. Produce a matching lockfile for the exported manifests using the installed npm tool. Use argument arrays for subprocesses. Report installation errors; do not assume a copied lockfile is valid.
6. Validate the finished inventory, not just the original allowlist. The gate remains an advisory preflight, not a filesystem sandbox.

**Acceptance:** seed an input with old `dist` JS containing an answer, nested tests, a runtime test bridge, and an overlay attempting to replace root scripts. Verify rejection/exclusion exactly as specified. Build A and B in fresh temporary directories outside the repo ancestry; run `npm ci`, clean typecheck, build, and development boot. No parent `node_modules` resolution, pre-existing dist, or TS build info may be used as evidence.

**Done when:** both exported apps boot independently; ordinary has no ANWC; assisted resolves a rendered node to its source; an invalid export never says ready.

## W02 — Result accounting and endpoint fairness

**Own:** benchmark plan/result validators and summary renderer, examples, benchmark tests/docs.

**Decisions:**
- Endpoints may use different origins/ports. Paired route path, query, viewport, fixture ID, state, and replicate must match; setup is what must be equal.
- Keep missing measurements unknown. Display repair/regression/success totals as `NA` when any relevant scored row is ungraded; show how many rows have been graded.
- Show planned, completed, capped, infrastructure-failed, and excluded counts separately. A cap remains an attempted run.
- Compute per-pair time/cost differences only when both observations exist and are comparable. Show the eligible-pair count; do not substitute zero for missing data.
- Preserve known costs from failed attempts in total expenditure. No cost-per-success claim when spending is incomplete or there are no successes.
- Planned rows have no usage/outcome data. Failed/excluded rows may retain time/usage but no repair scores. Require reasons for exclusions and infrastructure failures.
- Escape pipes/newlines in Markdown table cells.

**Acceptance:** a two-port fair pair passes; different routes fail; a ledger with one missing regression count shows `NA`; capped and failed runs remain visible; a known failed-run cost contributes to spending; missing cost prevents a complete cost claim; duplicate/unknown/missing run IDs fail. Add CLI argument rejection tests, including extra arguments to `validate`.

**Done when:** someone can read a summary without mistaking missing data for success or cheap execution.

## W03 — Give shop fixtures real behavior

**Own:** shop app/CSS and ordinary browser behavior tests. No detector edits.

**Build:** split shared navigation/modal/cart components if useful, without new routing dependencies. Use versioned sessionStorage for cart data so normal links preserve cart items within one browser context and new contexts start clean. Validate stored values before use. Put the modal outside the lab early-return path. Selecting `/lab` without a case should select `blocked-checkout` and show a brief instruction for the human. Preserve `/` as clean.

Give each checkout fixture an actual handler with a visible local confirmation; the surrounding expected flow must work once the layout bug is removed. Hidden/blocked variants retain their handler. Lab prose must explain which action to try and link to the healthy counterpart added by W04.

**Acceptance:** add to cart → navigate to checkout → count persists → review opens modal → close works. Lab Details opens and closes. After a test locally removes only the blocking overlay, a normal Playwright click produces the checkout confirmation. Empty cart and new context behave deterministically.

**Done when:** the grader can verify behavior rather than merely find a button on screen.

## W04 — Strong fixture truth and healthy counterparts

**Own:** lab fixture registry, shop fixture styles/components, scenario browser/CLI tests. Keep existing public URLs valid.

**Build:** public lab supports `/lab?case=ID&variant=broken|healthy`, default broken. Define each pair once in an evaluator-side registry to avoid three divergent lists. Keep observations for the target keyed to a stable semantic identifier; assert findings for that target, not any matching code anywhere in the page.

| Existing case | Broken truth, independent of ANWC | Healthy expectation |
| --- | --- | --- |
| Horizontal overflow | content scroll width exceeds available width | content fits without deleting text |
| Ancestor clip | action extent crosses an active client clip | whole action inside clip; click confirms |
| Nested clip | nested active clip cuts the target | no active clip cuts it; click confirms |
| Line budget | text ranges occupy more than the declared two lines | at most two lines with text retained |
| Text clipping | direct-text ranges extend beyond an active clipping boundary | ranges retained inside active clips |
| Display hidden | action expected in current state has no rendered box | visible action and confirmation |
| Opacity hidden | box exists but effective opacity is zero | visible action and confirmation |
| Full pointer block | normal click fails/is intercepted; center belongs to blocker | normal click confirms |
| Partial pointer block | a documented point hits blocker, another reaches button | both points deliver to action |
| Outside viewport | required current action below the initial viewport | action lies inside required viewport |

Use independent test geometry helpers; do not import ANWC clipping/text/hit-test helpers into ground-truth checks. A visible client rectangle alone is not proof of excess wrapping. Browser Range line grouping is acceptable evidence for simple text; note the shared browser primitive, and keep implementation independent.

**Acceptance:** 10 broken + 10 healthy variants at 1440×900 and 390×844, reset scroll/state between each. Healthy targets produce no relevant actionable finding; explicitly allow only enumerated informational observations. Regressions must not be hidden by loosening assertions or adding blanket intent allowances.

**Done when:** a detector change can demonstrably cause either a false-positive or false-negative test to fail.

## W05 — Fix inherited visibility semantics

**Own:** `renderState`, focused runtime browser test, protocol documentation of behavior.

**Decision:** target computed visibility determines inherited/overridden visibility. Ancestor `display:none` and zero opacity still affect descendants. Do not equate Playwright's visible matcher with paint visibility.

**Acceptance fixtures:** hidden parent with explicitly visible child (no hidden finding for the child); hidden child under visible parent (hidden); display-none ancestor with visible child (hidden); opacity-zero ancestor with opaque child (effective zero opacity); plain visible control. Give each target the same current-visibility intent. Validate snapshots.

**Done when:** hidden-state findings follow the actual state without inventing paint guarantees.

## W06 — Respect pointer sampling limits and viewport

**Own:** `hit-test.ts`, capture option validation/passing, browser tests and protocol method notes.

**Decisions:** intersect the target border rectangle with the current viewport before sampling. No intersection means zero samples and a documented limitation, never an all-clear proof. Keep pointer and clipping evidence separate; do not assume an unsupported clip model is known. Generate a deterministic center-first sequence with at most 25 unique interior points. Honor `maxSamplesPerNode` as an integer 1–25 (default 25); reject invalid values explicitly. A deliberately reduced sampling setting is a known method limitation, not silently the full 25-point method.

**Acceptance:** partially offscreen target sampled only within viewport; completely offscreen target has zero tests; 1/5/25 caps respected; narrow targets deduplicated; child span hits accepted; transparent input-blocker detected; opaque pointer-events-none layer retains paint unknown. Disabled/inert controls do not become pointer-obstruction errors.

**Done when:** reports state exactly which points were tested and never overstate sample coverage.

## W07 — Readiness and timeouts that mean what they say

**Own:** runtime readiness helper, CLI capture timeout handling, focused CLI/browser fixtures.

**Build:** use a bounded wait for fonts and two successive stable geometry observations of the candidate elements (1 CSS px tolerance). Use the existing timeout budget; continuing movement or missing font readiness yields settled false plus specific reasons. Cancel timers/frame callbacks on completion. Document that stability over a short window is still heuristic.

The CLI must distinguish runtime missing from a present runtime throwing or timing out. Preserve the existing error envelope codes and 0/1/2/3 exit semantics. Validate the capture before diagnosing it. Do not start actions or scroll during readiness.

**Acceptance:** static fixture settles; a controlled late font/layout change is awaited; continuous animation reaches the deadline with settled false; a runtime exception is not reported as missing runtime; no injected runtime still reports missing. Use bounded deterministic fixtures, not arbitrary sleeps.

**Done when:** incomplete or unsettled output cannot masquerade as a reliable clean capture.

## W08 — Vite startup, lazy modules, and production isolation

**Own:** Vite plugin, source-link integration tests, a lazy test component.

**Build:** make source registration independent of whether the app module or injected runtime executes first. Choose a shared pending registration queue drained by the runtime, with replacement per module to remove stale sites after HMR. Preserve source mapping through appended code.

**Acceptance:** cold load with delayed runtime; cold load with delayed app; lazy component imported after initial capture; editing lazy JSX updates source locations; removing a source site does not leave a live stale lookup. Compare app text, ordinary behavior, and key rectangles with plugin enabled/disabled. Check production HTML/JS for injected runtime and generated site IDs in an automated test, rather than just a manual search.

**Done when:** source linkage and default production stripping hold across these entry orders.

## W09 — Fixture contract and independent checker library

**Own:** new `packages/benchmark/src/fixtures/`, fixture schema/tests, small public development examples.

**Contract (new benchmark-only version `0.2`; browser snapshots remain `0.1`):**
- Case: neutral ID, app ID, public task requirements, required viewports, route, setup steps, required content/actions.
- Setup steps: only click by role/name, fill with public non-sensitive text, and scroll to a selector, each with bounded timeout. No arbitrary source evaluation strings.
- Evaluator sidecar: defect description, baseline truth checks, independent repair checks, and a fixture revision/hash. Never export this sidecar.
- Check results: stable check ID, pass/fail/unsupported, measured evidence, required/non-required marker. No implicit pass for absent elements.

A repair passes only when every required check passes. Unsupported required checks leave the repair unverified; they never count as success. Baseline-defect checks and post-repair checks are separate so the repaired app is not required to retain its original bug.

Implement explicit checks: content retained; width within container; text within active client clip; declared line count; action rendered; action receives click and changes public UI state. Reuse ordinary Playwright/browser primitives, never `diagnose` or ANWC geometry helpers as the scorer.

**Acceptance:** same checker fails an intentionally broken fixture, passes its healthy version, and fails a version that merely deletes the target. Malformed setup/check definitions reject unknown fields.

**Done when:** fixture authors specify intended behavior without writing another private benchmark framework.

## W10 — Landing/pricing app

**Own:** `examples/landing/`, evaluator-side public development fixture definitions, its browser tests. Use existing React/Vite versions and local assets.

**Build:** a small landing page with pricing cards, plan selection confirmation, feature list, and a dialog. Four paired development cases:
1. Plan title overflows at mobile width.
2. Pricing description is cropped by a fixed-height clip.
3. Promotional panel intercepts the select-plan action.
4. Plan action uses zero opacity while still expected in the current state.

Each has broken and healthy variants plus shared meaningful behavior. Break actual components; do not add a disconnected defect box. Public labels and selectors are fine in the evaluator preview but must be materialized away on export.

**Acceptance:** W09 checks fail broken and pass healthy at both widths (or document an intentional viewport-specific defect and its other-width control). Required text and plan selection survive repair. No external asset/network dependence.

**Done when:** the corpus tests a second page structure rather than another copy of the shop panel.

## W11 — Dashboard app

**Own:** `examples/dashboard/`, evaluator-side public definitions, its browser tests.

**Build:** local project dashboard with a task list, detail drawer, tabs, and a harmless save action that updates a visible status. Four paired cases:
1. Primary save action clipped by a nested normal-flow container.
2. Long task title exceeds a shared two-line design contract.
3. Drawer contains a partial input obstruction at an explicit sampled point.
4. Required save action placed outside the initial viewport for the chosen state.

Include healthy controls: intentionally scrollable data table, closed drawer without a visibility expectation, and disabled action for an unchanged form. The intentional table scroll is not a defect. Do not silently suppress extra false positives; document/fix specific evidence behavior before declaring the control healthy.

**Acceptance:** W09 checks fail broken and pass healthy; tabs/drawer/save still work; action state is set up by ordinary UI steps. Capture itself stays read-only.

**Done when:** there are tests for stateful UI, not just initial page load.

## W12 — Prepare the same app for both agents with one command

**Own:** benchmark `prepare-pair` command, exporter integration, fixture materialization, integration tests.

**Proposed command — not available yet:**

```sh
npm run bench -- prepare-pair --fixture pricing-03 --out PATH --revision COMMIT
```

**Build:** accept a case from the evaluator fixture registry and the source commit. Require a clean matching source revision for a scored export. Create `ordinary/`, `assisted/`, and an evaluator receipt outside both subjects. Materialize a single variant into ordinary app JSX/CSS; remove lab routes, variant switching, unselected variants, evaluator imports, and golden healthy source.

Use identical app files in A/B. Configure Vite separately; source hashes in the receipt must match for every application file and shared intent declaration. Generate public `TASK.md` from requirements only, plus install/dev/build commands. Record source/detector/fixture revisions, generated file hashes, endpoint route and setup. No grader/answers in subject receipts.

**Acceptance:** each arm `npm ci` + clean build + boot from a standalone directory. Compare app hashes before agent work starts. Ordinary has no ANWC API; assisted returns source-linked evidence. Two separately assigned ports are supported. Replacing an app file in just one arm before the run causes pair-readiness validation to fail. Agents may subsequently edit designated app files; W13 grades those edits rather than requiring original app hashes after repair.

**Done when:** the human does not have to write two overlays or decide which source files to remove.

## W13 — Grade returned repairs independently

**Own:** benchmark `grade` command and W09 check runner, integrity verification, adversarial repair fixtures.

**Proposed command — not available yet:**

```sh
npm run bench -- grade --receipt EVALUATOR_RECEIPT --subject SUBJECT --output RESULT.json
```

**Build:** launch the returned app in a clean local evaluator environment, perform recorded UI setup, check required behavior and content at all required widths, then shut down processes in finally blocks. Apply normal repository execution permissions; never imply arbitrary agent patches are trusted remote code. Preserve the original subject receipt and compare non-editable tool/config/intent inputs.

Produce independent check results and artifact hashes. Import the grade into the ledger explicitly; do not overwrite unrelated run rows or provider usage. Keep defect-detection precision/recall for evaluator adjudication; the grader proves repair behavior, not what the agent understood.

**Acceptance:** broken input fails; healthy source passes; deleted checkout fails; removed content fails; disabled button fails; edited expectation/tool code fails integrity; valid alternative CSS fix passes; runtime crash is a failure with evidence; capped partial repair reports remaining failed checks. Do not use the old defect-presence tests as repair graders.

**Done when:** the evaluator can check a returned patch without relying on the agent's own success claim.

## W14 — Rehearsal, explicit limitations, and handoff

**Own:** end-to-end development rehearsal, current docs, optional CI command using existing toolchain.

**Build:** choose one representative case per app. Prepare an A/B pair, run the independent checker on broken subjects, apply a committed evaluator-only valid patch, rerun grading, and confirm preserved controls. Also show a rejected deletion patch. Use no model calls. Export a compact report with actual outcomes, full revisions, viewports, and unsupported cases.

Ensure documentation says:
- public practice cases are unblinded; new private variants may later be used for holdout;
- each real pair freezes the same app, detector, task, settings, and grader revisions;
- newer detector code cannot be substituted halfway through a pair;
- severe correctness changes create a new benchmark version; earlier results stay attached to the old version;
- paint/shape/transform limits remain explicit.

**Acceptance:** one documented command completes the rehearsal from a clean install. Stop on failed checks. No hidden truths or answer patches appear in subjects. Update PROGRESS with real counts and known gaps rather than carrying forward historical passed gates.

**Done when:** the user can start a fresh agent with a folder and TASK.md, obtain a repair, then run a deterministic evaluator command.

## How much more testing is enough before the next product decision?

This backlog has a stopping point: 10 shop pairs, 4 landing pairs, 4 dashboard pairs, plus targeted runtime/compatibility cases. That is 18 development defect/healthy pairs. Do not turn every pair into paid agent runs automatically.

For an initial real comparison, sample a small predeclared subset spanning all three apps. Keep the rest for regression checks and later expansion. Truly held-out content must be authored/frozen independently of detector tuning; a changed random seed alone does not establish independence.

After W14, discuss broader feature work with the founder using the evidence:
- recurring state/setup friction may justify a persistent session API or MCP;
- demand from actual Next.js users may justify an adapter;
- paint-only failures may justify a restricted visibility research task;
- accurate reports with no repair savings suggest report/usability work rather than more fixture generation.

## Prompt for a cheaper implementing model

Copy this prompt and replace only Wxx:

> Implement Wxx from docs/CONTINUATION_PLAN.md. Read that entire task card, the global decisions, docs/PROTOCOL.md, and the current source in its owned paths. Inspect git status first. Reuse the established dependencies and interfaces. Implement only this task and necessary acceptance tests; do not redesign the architecture, choose model providers, or begin another W task. Use the task's fixed decisions for routine choices. Keep evaluation truth outside exported subjects. Verify behavior with independent browser checks where specified. Report any mismatch with the task's assumptions using a concrete failing example. Run the targeted checks while working, then npm run test:integration once before handoff; rerun only if changes/failures require it. Update docs/PROGRESS.md with files, test evidence, unresolved limits, and the next dependency. Commit this completed task and push under the user's existing authorization. Never label an unrun check or human agent comparison passed.

Escalate only a demonstrated conflict that cannot be resolved within the task's decisions: required browser schema change, ambiguous new paint semantics, access needed to private evaluator data, or real agent/model selection before paid runs. Do not ask the founder to select an implementation detail already fixed in this document.
