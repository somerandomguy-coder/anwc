# Phase 3: a dependable UI repair workflow

Planning baseline: `4093fcb`, reviewed 2026-09-17. **All Q tasks below are planned, not implemented.** This is the sole active backlog. Read [STATUS](STATUS.md) for current evidence; Phase 2 task cards are preserved in [the archive](archive/PHASE_2.md). This planning change does not implement product features.

## Product direction

Make ANWC useful for this ordinary developer journey: reproduce a UI state, see what is wrong and where it comes from, repair it, and show what changed without losing track of untested areas. An agent gets a concise evidence packet; a human gets a readable local report built from the same measurements.

The phase-end demo is an unrelated React/Vite app: open a drawer at mobile width, capture a blocked action, follow the blocker to its source, change CSS, repeat exactly the same state, and show an HTML comparison with the resolved finding, preserved behavior checks, and remaining unknowns. A second state at desktop width prevents a narrow mobile-only fix from appearing globally successful. The report must distinguish disappearance of a finding from independent proof that the button still works.

The differentiator is the combination of source identity, explicit UI contracts, reproducible states, conservative comparison, and an independently tested browser evidence corpus. These are cumulative engineering assets. A pretty report alone is easy to copy; reliability across unfamiliar layouts and honest repair evidence take sustained work. This is a product hypothesis, not a claim of competitive exclusivity or measured agent savings.

## Where we actually are

The compiler/runtime, three fixture apps, local alpha packaging, readable text CLI, and committed 18-grade rehearsal are real implementations. No human model comparison has been recorded. Previous claims that P08 was fully finished and only P09 remained were too strong.

| Evidence reviewed at this baseline | Consequence | Owner |
| --- | --- | --- |
| Existing ledger-accounting test reproduced a failure: added runs lack required receipt hashes | Current full integration cannot be described as green | Q01 |
| `pilot.ts` compares caller-supplied receipt to the plan, but `grade.ts` emits no receipt identity | A grade from a different preparation with the same fixture/condition can be substituted | Q01 |
| Grade schema permits a `passed` result with empty checks; import trusts `repairVerified`; import test uses that shape | Validate results semantically against frozen check/viewport inventory | Q01 |
| Import assigns `fullSuccess` while regressions remain unknown; blocks even preexisting detection adjudication; CLI writes over existing output | Preserve independent facts and enforce explicit file/version behavior | Q01 |
| `prepare.ts` reads intent only from `main.tsx` and hashes a multiset of values, without target binding; JSX spreads are ignored | Moving a contract to a dummy element or changing another source file can evade the intended guarantee | Q02 |
| `formatText` exists, but has no offline report; final string slicing can cut evidence/coverage footer; `--output report.json` saves the selected format | Build one truthful, bounded presentation contract for humans and agents | Q03–Q04 |
| CLI launches a fresh page; session node IDs and compiler source sites are not durable repair identities | State replay and honest matching are prerequisites for meaningful before/after reports | Q06–Q07 |
| Windows consumer test now passes through the installed JS entry; this does not establish Windows npm-shim execution | Test the actual documented installed command in release validation | Q10 |

Only the first row was newly reproduced by a test during this planning pass. Other rows are source-review findings, not newly measured failure counts. Historical Linux/Windows passes and rehearsal reports remain historical evidence; do not discard or upgrade them.

## Fixed scope and decisions

- Supported product: installed React/Vite integration, Chromium, local developer projects. Keep runtime-only aspirations in [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md); no automatic expansion into arbitrary third-party sites, Next.js, MCP, cloud dashboards, a router, or a new framework this phase.
- Keep TypeScript, existing parser, Zod, Playwright, npm workspaces. No model dependency for inspection or reports. Paid agents, public npm publication, and hosted services need a separate founder decision.
- Capture stays read-only. A replay runner may perform explicitly declared local interactions; its trace is separate from measurements. Never infer or execute actions from page prose.
- A pointer hit is event-delivery evidence. It is not opaque-pixel coverage. Canvas, masks, complex transforms, closed shadow roots, and cross-origin frames must not silently look verified.
- Keep snapshot `0.1` readable. Add separately versioned report/state/diff contracts. New benchmark provenance semantics require explicit version migration (proposed receipt/result `0.4`); old `0.3` artifacts remain viewable, not silently upgraded.
- Separate rule severity, measurement support, declared intent, coverage, and behavioral verification. No universal visibility percentage or invented numerical confidence.
- Keep all raw app text untrusted. Escape text/URLs in HTML/terminal output; do not export form values or credentials. Local reports use no CDN, telemetry, or remote requests. Sharing is explicit.
- Human testing is not a prerequisite for engineering tasks. Public corpus practice needs no private holdout. Independently authored holdouts are needed only before claiming generalization to unseen defects.

## Delivery order and gates

| Batch | Tasks | Reviewable result | Exit condition |
| --- | --- | --- | --- |
| A — trust and report foundations | Q01, Q02, Q03 | Reliable pilot identities and a shared report model | Provenance substitution rejected; target contracts preserved; bounded deterministic report tests pass |
| B — a usable human workflow | Q04, Q05, Q06 | Offline HTML/Markdown reports, conformance corpus, replayed UI states | A developer can inspect two named states and explain findings/unknowns without reading raw JSON |
| C — useful repair verification | Q07, Q08, Q09 | Honest before/after reports, targeted engine fixes, compact agent drilldown | Deletion/ambiguity never reported as verified repair; paired edge cases and output-budget checks pass |
| D — an adoptable alpha | Q10, Q11 | Installed workflows, release evidence, runnable pilot instructions | Windows/Linux release gates and operator dry run pass; human comparison remains explicitly pending |

Sequential implementation is the default. A batch groups 2–3 related tasks, not necessarily one giant commit. Commit each finished card with targeted evidence; run the full integration gate once at the batch boundary before handoff/push. Do not repeatedly run the full suite after every small edit. For a failure, rerun the affected test first. A skipped/inconclusive test never counts as passed.

Q01 → Q02 → Q03 → Q04 is the first route to user value. Q05 and Q06 then establish inputs for Q07/Q08. Q09 builds on Q03/Q07. Q10 may prepare CI during other work; Q11 closes the phase. Do not mark the phase complete solely because a task board is full.

## Q01 — Close pilot provenance and result-accounting gaps

**Own:** `packages/benchmark/src/{prepare,grade,pilot,index,main}.ts`, focused benchmark tests, EVALUATOR_SETUP. **Depends:** existing P08. **Status:** complete 2026-09-17; Batch A continues with Q02.

Build:
1. Define a versioned grade provenance envelope with exact receipt-byte SHA-256, run/submission identity supplied by the evaluator, submitted artifact hash, evaluator hashes, expected checks and viewport inventory. Read receipt bytes once, validate those same bytes, and retain them evaluator-side. A pair receipt may legitimately bind both conditions; condition/run identities distinguish them. Do not demand two different receipt hashes for a single pair.
2. Bind grade generation to that envelope. Hash the actual staged inputs before install and grade that stage; detect changes between submission validation and staging. Define rejection for missing provenance. Existing grade files cannot be certified by supplying a newer receipt beside them.
3. Validate import against plan revision, condition, fixture, state/setup, viewport inventory, receipt mode, run/submission identity and required checks. Reject scored-plan imports from practice/dirty receipts. Reject contradictory status/exit/verification fields, empty or missing required checks, duplicate checks, unsupported required checks presented as success, and unfinished cleanup.
4. Preserve detection adjudication, usage, time, unrelated rows, failures and NA values. Keep check pass/fail separate from repaired-defect and new-regression counts. A failed check is not automatically a new regression. Only emit full success when the declared complete success policy is proved; unknown regressions cannot silently become zero.
5. Store imported grade hash/provenance. Duplicate import fails explicitly. Default CLI writes to a new output with exclusive creation; reject overlap with plan, receipt, grade, source ledger or subject. No silent overwrite from two stale ledger reads. A later replacement mode requires explicit semantics, not an implicit retry.
6. Repair test fixtures broken by mandatory receipt hashes. Add a real CLI import regression, not only an in-memory test with a cast fake receipt.

**Acceptance:** two preparations with identical fixture names cannot exchange grades; wrong arm/run/state/revision/viewports rejected; malformed passed/empty grade rejected; input files and previous outputs survive rejected/concurrent imports; valid import preserves detection/usage/unrelated rows; duplicate fails; historical artifacts have a migration message. **Evidence:** TypeScript plus focused ledger/CLI import and real staged browser-grade tests pass on Windows. The Batch A full integration gate remains due after Q02/Q03. **Handoff:** grade result `0.4` contains provenance; old `0.3` grades remain readable but cannot be imported into a scored ledger. `grade --run RUN_ID` makes an importable result. `import-grade` and grade output both require a fresh output path. No “immutable” claim beyond what is tested.

## Q02 — Bind source expectations to the intended UI

**Own:** intent extraction in `prepare.ts`, fixture materialization in `fixtures/registry.ts`, parser helpers/tests. **Depends:** Q01 version boundary.

Build:
1. Traverse all allowed app source modules, not only `main.tsx`. Freeze contract values and the target's author-provided stable identity, relevant semantics and declared state scope. Shared legitimate intent must be identical in ordinary and assisted subjects and disclose no defect labels.
2. Prefer explicit stable keys for frozen benchmark contracts. For automatic target matching, state its limitations; do not pretend a value-only multiset or source line is identity. Moving files/wrappers and equivalent static literal syntax can remain valid when target identity is preserved. Renaming a contract key requires explicit re-baselining outside a scored run.
3. Handle duplicated keys, JSX spreads and dynamic values conservatively. Reject unverifiable benchmark intent with file/location and remedy. Track `expect`, `max-lines`, and allowed exceptions that affect grading. No executing source to guess dynamic meaning.
4. Replace remaining broad materialization substitutions with explicit templates or parser-based app-specific boundaries. Remove dead healthy/broken alternatives and selected-defect identifiers while preserving tabs, drawer, cart and source editability. Inspect prepared source as well as behavior.

**Acceptance:** moving an expectation to a dummy element fails; weakening contracts in an imported component or through a spread fails; duplicate identity fails; equivalent literals/CSS-only repair/file moves with stable keys pass; every prepared app retains required actions. Browser-grade representative alternatives/deletions independently. **Handoff:** supported static contract rules and explicit dynamic limitations. This is benchmark integrity, not a hostile-code sandbox.

## Q03 — One report model for humans and agents

**Own:** new `packages/report` pure transformation module (private until Q10), protocol adapters, CLI presentation tests. **Depends:** Q01; may use existing snapshot `0.1`.

Build:
1. Define `Report 0.1`: input schema/capture hash, state/viewport/browser/source coverage, findings, related target/blocker/ancestor references, measured versus expected evidence, limitations, actionable/acknowledged/unknown counts. Keep raw snapshots authoritative; report fields are traceable to input facts.
2. Group repeated symptoms by a directly measured shared blocker/clip ancestor, preserving every affected instance. Label it a shared relation, not a proved root cause. A source site shared by ten list items must not collapse ten runtime instances into one.
3. Deterministic ordering: unacknowledged errors, warnings, informational/acknowledged results; stable ties. Preserve the existing finding semantics. Repair suggestions name a measured relation and relevant source; no invented CSS property attribution.
4. Make text/character budgets structural: whole finding sections, a reserved coverage/omission footer, exact emitted-size accounting, a minimum valid budget. Handle Unicode, control characters and huge labels. Fix JSON drilldown guidance to require `--format json` when writing JSON.

**Acceptance:** all renderer counts/references agree with the raw snapshot; zero findings on partial/unsettled capture remains visibly incomplete; repeated instances and unknown blocker sources survive; output never exceeds its declared budget or truncates away limitations. Tests must check these invariants, not only string snapshots.

## Q04 — Readable local reports and evidence navigation

**Own:** report renderers/templates, CLI `report` command, report browser tests/docs. **Depends:** Q03.

Proposed interface (not available yet): `anwc report capture.json --format html --output report.html`; Markdown is a second format; terminal text uses Q03. Accept saved captures without starting a browser or contacting the original site.

Build an offline, single-file HTML report with a summary, named state/viewport, issue list, severity/rule filters, target and blocker source references, measured/expected values, unknown coverage, and expandable raw evidence. Include a simple viewport diagram showing rectangles and tested hit points, explicitly labelled geometry rather than a screenshot. Support keyboard navigation, legible narrow layouts, print output and a persistent incomplete-capture notice. Copyable file:line references are sufficient; no shell execution or automatic external editor launch.

Render untrusted strings as text. Do not embed executable page HTML, fetch remote resources, or make arbitrary captured URLs automatically active. Escape embedded JSON against script termination. A share export redacts sensitive URL components/source prefixes explicitly and labels the export; no silent alteration of the original evidence. Include compact Markdown suitable for a PR without full DOM dumps.

**Acceptance:** open the report with network blocked and original app stopped; filtering never changes total coverage or hides unknowns; malicious labels/URLs remain inert; long labels/missing sources/empty/partial captures readable; HTML/Markdown/terminal agree on finding counts and measurements. Include a manual five-minute co-founder walkthrough after this milestone. Screenshots may be used to QA the report UI; the inspection engine still needs none.

## Q05 — A browser conformance corpus, not more decorative sites

**Own:** `tests/conformance` fixtures, independent Playwright oracles, machine-readable capability matrix and runner. **Depends:** Q03 report support taxonomy.

Start with at least 24 named paired cases across the six families below. Every family needs a defective case, a healthy lookalike, and a boundary/unsupported case; categories can share fixtures. Keep these engineering fixtures separate from the public 18-case repair benchmark and future holdouts.

| Family | Required examples | Independent evidence / healthy control |
| --- | --- | --- |
| Text | nested spans, long URLs, CJK/RTL, delayed web font, intentional ellipsis and multiline clamp | Range/scroll/text preservation; truncation allowed only by explicit intent |
| Clips/scroll | x-only/y-only clip, border/padding, nested scrolling, sticky header after scroll | client clip geometry plus physical action; legitimate scroll container stays usable |
| Pointer layers | transparent interceptors, pointer-events:none paint layer, nested child hit, stacking context, thin target at DPR 1/2 | actual click/focus and independent event trace; paint-layer visibility stays unknown |
| State/semantics | hidden child restoring visibility, inert/disabled, closed/open dialog, portal, intentional offscreen content | expected current-state contract, mounted state, browser actionability |
| Identity/change | reordered repeated items, unmount/remount, lazy/HMR module, wrapper insertion, same-label controls | stable keys/source mapping and explicit ambiguous matches |
| Unsupported/performance | shadow/frame boundaries, transform/mask/canvas, capped large DOM, continuing motion | report the relevant unsupported/partial scope; never count a vacuous zero as healthy |

No full combinatorial explosion: fixed pairwise viewport/DPR/state selection in the matrix; measure clean controls independently of ANWC diagnostic code. Stable seeds for randomized geometry are for regression reproducibility, not holdout claims. Classify each cell supported, detected defect, healthy, or explicitly unsupported. Commit minimal repros for newly discovered failures.

**Acceptance:** run all matrix cells, report denominators per rule and healthy false positives, and prove an unsupported input cannot silently become known-good. Record timings/sample counts/inspected nodes for normal and capped large DOM. Q05 is complete when the harness and independent oracles work and all outcomes are recorded; newly exposed engine failures remain explicit open failures assigned to Q08, not silently skipped or relabelled healthy. Report a failing engine gate as failing even when the harness is complete. Every supported healthy false positive blocks that rule's release. Intended unsupported cases are expected outcomes, not skipped tests.

## Q06 — Reproduce the UI state you are inspecting

**Own:** small local scenario runner plus versioned state manifest, CLI integration. **Depends:** Q03/Q05 contracts.

Proposed interface: `anwc check anwc.checks.json --output artifacts/ui`; this is planned. A manifest declares base URL, browser/viewport, named checkpoints, deterministic setup, readiness and public expectations. First runner supports navigate within the declared local origin, exact/scoped click, fill, explicit scroll, wait-for-selector and capture. Reuse bounded Playwright semantics, not hidden benchmark defect sidecars.

Fresh browser context per independent scenario; ordered checkpoints may share state only when declared. Record performed steps, timeouts and final URL/scroll; associate captures with manifest hash and checkpoint. Default 2-second step timeout, explicit cap 10 seconds, overall scenario cap 60 seconds; classify failures without substituting another state. No arbitrary evaluate step, implicit form submission, third-party checkout or automatic credential collection. Explicit external deployments need separately defined scope; first release is local development.

**Acceptance:** initial, open-drawer, modal and scrolled sticky-header states reproduce twice; ambiguous target/missing readiness fails promptly; intentionally hidden closed menu is not a broken open state; storage does not leak across scenarios; capture itself causes no click/scroll. Include one actual behavior assertion alongside measurements. Explain clearly why a captured finding is not itself functional proof.

## Q07 — Compare repairs without inventing identity

**Own:** pure diff module in report package, comparison rendering, CLI `diff`. **Depends:** Q03, Q05, Q06.

Proposed interface: `anwc diff before.json after.json --format html --output diff.html`. Preserve both captures and their hashes. Require compatible checkpoint, viewport, scroll, browser profile, coverage and rule versions, or return explicitly non-comparable fields/reasons.

Match by unique author key and state first; otherwise use source/semantic/structural evidence as a labelled heuristic. Do not use session node IDs across reloads or line numbers as a permanent identifier. Reordered identical list instances remain ambiguous unless keys disambiguate. Report new, persistent, no-longer-observed, unmatched and non-comparable findings. “Verified fixed” additionally requires retained target/intent, adequate coverage and passing declared behavior checks. Deletion, unmounting, truncation, unsupported capture and changed setup cannot masquerade as a fix.

**Acceptance:** CSS fix, source line shift and keyed list reorder match correctly; removed checkout, duplicate keys, swapped same-label nodes and changed viewport cannot produce false repair success; partial capture remains inconclusive. Human report explains the decision and agent JSON carries the same evidence.

## Q08 — Fix the highest-value browser edge cases

**Own:** runtime clipping/text/hit-testing and diagnostics; conformance cases. **Depends:** Q05; Q06 for stateful reproductions.

Use Q05 outcomes to select at most three defect families for the first correction batch: prioritize false actionable reports on healthy UI, then missed supported defects, then useful unsupported features. Default candidates are nested/inline text geometry, axis clipping with scrolling, and pointer/portal/dialog boundaries. Select only reproduced failures; if these candidates pass, record that and use the highest observed failing family. Do not manufacture changes to fill three slots.

Each fix preserves raw evidence, documents its geometric assumptions, retains a paired healthy control and a counterexample outside support. No claim of paint visibility from hit sampling. Open shadow roots/same-origin frames may initially remain explicitly incomplete rather than quietly expanding DOM traversal. Full paint analysis is a separate research proposal.

**Acceptance:** independent reproducer fails before and passes after; all previously supported healthy controls pass; source/instance coverage intact; runtime cost is measured on the same corpus. Add no new diagnostic rule without a legitimate user interpretation and unknown-case policy.

## Q09 — Compact agent evidence with precise drilldown

**Own:** report queries and CLI output, representative measurement artifacts. **Depends:** Q03/Q07; Q08 results feed fixtures.

Provide offline summary and detail queries over a saved report. Return a finding's target, source, expectation, relevant ancestors/blockers and measured samples without repeating the whole page. Scope filters must report how much input was excluded; zero in a filtered view is not a page-wide pass. Keep deterministic identifiers within a report and disclose cross-capture matching separately.

Measure current full JSON, current text, new summary plus required drilldowns on fixed small/large/repeated-element captures: bytes, characters, latency, calls, omitted evidence, and repair-relevant facts retained. Target at least 50% fewer emitted characters than full snapshots for representative multi-finding workflows while retaining every required evidence field across summary/detail. Treat this as an engineering target, not a token/billing claim; record misses and do not hide evidence to reach it.

**Acceptance:** fixtures reconstruct every actionable finding and its limits from summary/detail; no output limit causes invalid JSON or wrong totals; cap and Unicode tests pass; no live app/browser dependency for saved-report queries. No model service is needed.

## Q10 — A repeatable installed alpha and CI workflow

**Own:** local package exports/pack audits, installed consumer, CLI doctor/setup diagnostics, CI config and quickstart. **Depends:** Q04/Q06/Q07/Q09 at final acceptance.

Give install/config/browser/version/port failures one concrete recovery path. Validate the actual documented installed executable, including npm's Windows shim through a properly quoted platform invocation. Do not count direct Node entry execution alone as shim coverage. Test from an unrelated path containing spaces with a clean dependency install and no parent-node_modules fallback.

Add CI validation on Windows and Linux: isolated temp roots, dynamically owned ports, exit-recorded logs/artifacts, bounded process cleanup and no stale success markers. A command helper must preserve the shell session identifier and final exit code; disappearance of a process is not a test result. Run the named scenario matrix headlessly and retain reports as CI artifacts. Existing browser/CLI exit semantics stay documented; incomplete capture is not success. macOS remains untested until actually run.

**Acceptance:** install → configure → state capture → HTML report → repair comparison works from packed artifacts on both tested OSs; production excludes instrumentation; escaping/leak audit passes; scenario failure yields a failing job with readable report. Version tested dependencies and report formats. Public npm publication remains a separate release decision.

## Q11 — Finish the operator kit and decide from real use

**Own:** EVALUATOR_SETUP, TESTING, BENCHMARK, practice manifest/ledger generation, compact operator report. **Depends:** Q01/Q02; can dry-run before Q10; final adoption feedback after Q10.

Generate or document one executable six-run setup using three public cases, neutral per-subject briefs and unique ports, full receipts, exact prompt text/hash, named viewports/setup and explicit order: ordinary→assisted, assisted→ordinary, ordinary→assisted. Keep model provider/label as an operator-selected input at real run time; high thinking, no ultra by default. No private corpus is required to practise the workflow.

Provide a single start-to-finish procedure: prepare isolated arms; validate readiness; give only each subject and URL to a fresh agent; record start/end/budget/storage reset/tool access; keep transcript/patch/screenshots/interventions outside subjects; grade the returned artifact; import matching result; separately adjudicate detection and regressions; summarize all six including failures. Unknown usage stays null. Operator report labels public practice and each incomplete field prominently.

Dry-run the whole procedure with documented synthetic submissions labelled synthetic (broken, alternative valid repair, deletion, wrong receipt). This is acceptance of the tooling, never a model result. Test malformed imports, duplicate outputs, and preservation of unrelated rows. Save a sanitized durable engineering report.

**Acceptance:** co-founder follows this document without reading old W/P cards; public example and generated ledger validate; synthetic end-to-end import/report retains failure/NA semantics. **Human gate:** founder chooses a provider/model and performs actual sessions; P09 results cannot be invented. Follow with three unrelated app workflows where feasible, recording adoption friction and false reports. Do not automatically write another large feature phase if usage evidence is absent.

## Success measures and stop rules

- Correctness: exact paired fixture denominators and zero unexplained actionable findings on supported healthy controls. Unknown/unsupported coverage reported separately, never counted as true negatives.
- Repair validity: target deletion, receipt substitution, duplicate-instance ambiguity and partial captures must never become verified repairs.
- Usability: report-to-source-to-replay workflow completed on an external app; novice/co-founder walkthrough records time, errors and help needed, not an assumed five-minute claim.
- Efficiency: fixed-workload p50/p95 capture/report latency, node/sample budget and output-size measurements on a recorded machine/browser. Set regression tolerances from the measured Q05 baseline; investigate over 20% p95 increase before release rather than hiding it in averaged figures.
- Economics: actual provider usage/time only from human runs; no cost conclusions from character counts alone.
- Stop expanding features after Q11 engineering acceptance. If human testing is pending, mark that gate pending and deliver the usable kit. React/Vite alpha feedback decides whether to activate arbitrary-site support, Next.js, or deeper visibility research next.

## Copyable task brief for an implementation model

> Implement Qxx from docs/ROADMAP.md. Read STATUS, this card, fixed decisions, dependencies, relevant source/tests, and git status. Keep within the card and necessary fixes. Deliver code, independent behavioral acceptance, and exact handoff evidence. Proposed commands are not available until implemented and tested. Preserve known/unknown and provenance boundaries. Run focused checks during work; at the agreed batch boundary run the full integration command once, retain its session/log and final exit code, and record failures honestly. Update STATUS/HISTORY; commit each completed card and push at the verified boundary under existing authorization. Do not require founder input for routine architecture choices already fixed here. Ask only for unresolved external access, paid execution, actual human observations, or a scope decision beyond this roadmap.
