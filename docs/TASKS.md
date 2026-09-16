# Small implementation tasks for coding models

Status: **T00–T09 are complete and published through `4c6cafe`.** These are historical bounded implementation briefs, retained for review and future narrowly scoped follow-up work. Do not replay them or treat them as an unstarted backlog. Begin with [STATUS](STATUS.md), then use [HISTORY](HISTORY.md) for evidence. T10 is a paired-agent evaluation, whose operational brief is [BENCHMARK](BENCHMARK.md).

## Shared task prompt

For new work, use the Phase 2 P01–P09 task cards and copyable model prompt in [ROADMAP](ROADMAP.md). The original W cards are archived in [W_ROLLOUT](archive/W_ROLLOUT.md). The T00–T09 briefs below are historical. The roadmap also records acceptance gaps found during source review; their fixes do not require waiting for T10's human agent runs.

Copy this prefix, then the selected task below:

> Implement ANWC task Txx in this repository. First read README.md, docs/PROTOCOL.md, the corresponding task brief, and docs/HISTORY.md. Inspect existing code before editing. Limit changes to the task's owned files and agreed integration files. Preserve the frozen protocol and other tasks' work. Do not build later features, replace the toolchain, loosen tests, or mark unsupported visibility as known. Use real browser tests for layout. Run the listed acceptance checks, update the task's progress entry with files changed, command outcomes, limitations and next handoff, and stop at a reviewable implementation. If a dependency is missing, implement the independent portion, state the exact missing interface, and mark the task blocked rather than inventing a competing contract. Do not publish packages or push/merge remote changes unless the collaborators request it.

The schema and acceptance criteria are requirements, not a ban on sensible local implementation choices. A cheaper model should ask for a cross-module decision only when an interface change is necessary. Keep bug fixes scoped; do not use CSS modifications to hide detector failures.

## Dependency map

```text
T00 workspace
 └─T01 protocol
    ├─T02 compiler ─T03 Vite integration ───────────────┐
    ├─T04 browser capture ─T05 text/clipping ─┐        │
    │                     └─T06 pointer/rules┤        │
    └─T08 demo skeleton (final checks later) │        │
                                            └─T07 CLI┤
                                                     └─T09 integration/freeze
                                                        └─T10 experiment
```

T06's pointer collector can start after T04; its complete rule integration also requires T05. T07 can start on synthetic schema fixtures after T01 but is not complete until real capture and rules work. T08 starts after T00/T01 and uses independent browser assertions; its ANWC integration requires T07.

## T00 — Workspace and reproducible tooling

**Owner suggestion:** Builder A. **Estimate:** 30–45 minutes. **Depends on:** none.

**Owned files:** root `package.json`, lockfile, `tsconfig` files, `.gitignore`, package skeleton manifests, test runner configuration, initial CI workflow if time permits. Coordinate changes to these shared files after this task.

**Build:** npm workspaces with TypeScript; choose and pin mutually compatible React/Vite/Babel/Playwright versions; install Chromium; provide root scripts for `dev`, `build`, `typecheck`, `test:unit`, `test:browser`, and eventually `anwc`. Separate browser and Node tsconfigs. Ignore node_modules, dist, local captures, traces, and raw benchmark logs. Make the clean app boot with local assets and no third-party services.

**Acceptance:** a fresh install from lockfile succeeds; TypeScript checks the skeleton; clean React page renders; production build succeeds. Record exact Node/package-manager/browser/dependency versions and install failures. Stub scripts must fail honestly or be labeled unavailable; do not return success without doing work.

**Handoff:** runnable skeleton and exact commands. No runtime algorithm here.

## T01 — Freeze the protocol and shared fixtures

**Owner suggestion:** Builder A, reviewed by Builder B. **Estimate:** 30–60 minutes. **Depends on:** T00.

**Owned files:** `packages/protocol/**`, protocol-specific tests, `docs/PROTOCOL.md` corrections.

**Build:** shared types and runtime validation from the proposal; define `RawCapture`, `InstrumentResult`, `InspectOptions`, error envelopes, and evidence unions. Add a valid synthetic capture with repeated source sites, an uninstrumented blocker, and unknown paint visibility. Add a partial capture example.

**Acceptance:** JSON round-trip validates; invalid version/negative dimensions/inconsistent sample totals fail validation; two nodes sharing a site are accepted; unknown uses null; incomplete status survives serialization. Keep counts consistent and node references resolvable. All other packages compile against exports, not copied types.

**Handoff:** freeze protocol 0.1. Record any changes with rationale before T02/T04 proceed.

## T02 — Pure JSX/TSX instrumentation compiler

**Owner suggestion:** Builder A. **Estimate:** 60–120 minutes. **Depends on:** T01.

**Owned files:** `packages/compiler/**`, `tests/compiler/**`.

**Build:** parser-based host-element discovery and source-preserving attribute insertion; source-site hashing with normalized relative paths; original locations and source map; deterministic transform behavior; input filters and reserved-attribute diagnostics. Preserve source directive prologues, comments, expressions, refs, keys, and evaluation order. Return null for unrelated files.

**Required fixtures:** TSX types; JSX; fragments; custom/member components; multiline tags; spreads before/after ordinary attributes; mapped lists; two files with identical line/column sites; Windows paths; query suffix; SVG subtree; reserved attribute collision; repeat transform; production-off.

**Acceptance:** transformed code parses and runs through the ordinary React build; original expressions execute once; unchanged source returns the same site IDs; separate files do not collide; map lookups reach the original JSX; compiler does not assign unique live IDs to a repeated source site. Verify runtime render output preserves event behavior.

**Avoid:** regex-based JSX rewriting, injecting refs, wrapping components, globally incrementing compile IDs, pretending IDs survive arbitrary source edits.

**Handoff:** `instrument` export, example transformed source + manifest, tests and known exclusions.

## T03 — Vite adapter and dev-only source manifest

**Owner suggestion:** Builder A. **Estimate:** 45–90 minutes. **Depends on:** T02, runtime entry interface from T04.

**Owned files:** `packages/vite-plugin/**`, shop Vite config, source-link integration tests. Coordinate runtime entry files with T04.

**Build:** pre-transform adapter, client runtime injection, virtual source manifest and source lookup; development default on, production default off; integration with React plugin and HMR. Manifest records must update for lazy route modules and changed source. A test-only instrumented build can be explicit.

**Acceptance:** actual rendered button resolves to original file/line; editing JSX updates metadata after HMR; repeated card nodes share site but retain independent instances; lazy import metadata becomes resolvable; disabling plugin preserves ordinary app behavior. Production output and HTML contain no generated ANWC metadata/runtime by default.

**Avoid:** collecting measurements on the Vite server, assuming only one browser tab, exposed general-purpose filesystem read endpoints, automatic production opt-in.

**Handoff:** copyable Vite integration example and tested dependency versions.

## T04 — Read-only DOM capture and identity

**Owner suggestion:** Builder B. **Estimate:** 60–120 minutes. **Depends on:** T01.

**Owned files:** `packages/runtime/src/capture*`, `identity*`, `discovery*`, `readiness*`, runtime entry, related browser tests.

**Build:** browser-safe capture bundle; per-document WeakMap IDs; relevant node discovery; source lookup injection; base boxes, text labels, computed state, enabled/inert state, scroll/viewport; cached reads; bounded readiness and node caps. Include uninstrumented hit blockers when T06 requests registration.

**Acceptance:** list instances, portal content in the same document, post-render mutations, zero-size targets, hidden descendants, source:null nodes and navigation isolation behave as specified. Caps report incomplete capture. Snapshot causes no DOM/style/focus/scroll mutation and creates no observer loop. Browser-only bundle imports no Node builtins.

**Avoid:** rescanning on every mutation, input value collection, claiming a complete accessible-name computation.

**Handoff:** real raw capture available to T05/T06/T07, plus fixtures showing repeated nodes and source-null cases.

## T05 — Rectangular clipping, overflow, and text observations

**Owner suggestion:** whichever collaborator finishes T02/T03 first. **Estimate:** 90–150 minutes. **Depends on:** T04.

**Owned files:** `packages/runtime/src/geometry*`, `clipping*`, `text*`, corresponding browser fixtures/tests. Coordinate raw fields with T01.

**Build:** supported axis-specific client-box clipping with explicit containing-block limitations; scroll/client measurements; text-node ownership; Range fragment extraction and approximate horizontal line grouping; overflow allowances and line budget inputs. Record evidence, not final rule messages.

**Acceptance:** normal-flow clipping through nested parents, asymmetric overflow axes, border/client box differences, scrolled containers, nowrap overflow, simple text truncation, inline-span wrapping and a healthy paragraph. Positioned descendant escaping a clip is correct or explicitly unknown. Transforms/masks/vertical writing do not receive falsely precise fractions. No division by zero and no scroll-dimension-only claim of text clipping.

**Avoid:** treating all ancestor rectangles as clips, marking every wrap as a bug, deriving lines only from line-height, duplicating one text range at every ancestor.

**Handoff:** browser measurements with documented supported geometry and unsupported flags; independently computed expected fixture bounds.

## T06 — Pointer sampling and diagnostic rules

**Owner suggestion:** Builder B. **Estimate:** 90–150 minutes. **Depends on:** T04; T05 for full rules.

**Owned files:** `packages/runtime/src/hit-test*`, `packages/diagnostics/**`, rule and hit-test browser tests.

**Build:** 5×5 interior samples plus deduplicated center; target-descendant acceptance; blockers registered as nodes; counts and sample fraction; hidden/disabled/inert distinctions. Implement the rule codes from PLAN using normalized evidence. Stable ordering, deduplication, intent-aware severity, acknowledged allowances, and unknown flags.

**Acceptance:** opaque ordinary overlay, transparent pointer-blocking overlay, partial blocker, child span inside a button, nested stacking contexts, opacity-zero target ancestry, disabled control and opaque pointer-events-none overlay. The latter never turns pointer success into paint visibility success. Rules accept synthetic raw captures and do not call DOM APIs.

**Avoid:** numeric z-index summation, `.click()` in measurement, direct `.value` mutation, exact covered-area claims, one arbitrary coverage threshold for every element.

**Handoff:** stable findings for supported fixtures; explicit limitations for unsupported paint effects.

## T07 — CLI, orchestration, and bounded output

**Owner suggestion:** Builder A. **Estimate:** 60–120 minutes. **Depends on:** T01/T03/T04/T05/T06 for completion.

**Owned files:** `packages/cli/**`, serializer code, CLI integration tests; root CLI script by coordination.

**Build:** parse options; launch Chromium; isolated context; navigate and wait; choose plugin/runtime-only capture; join source manifest; run rules; emit JSON or bounded text; persist file; return specified exit status. Include version/timing/capability metadata. Use `finally` cleanup.

**Acceptance:** valid output at both widths; JSON has no console noise; URLs unavailable, bad flags, runtime missing, timeout, incomplete capture and finding threshold produce defined statuses; Unicode/control characters escape correctly; text output reports truncation; max node/sample caps preserved; runtime-only mode produces usable source-null findings. Verify the inspection code path never calls screenshot, click, fill, scroll, or style mutation APIs.

**Avoid:** bespoke network/MCP service, global latest-snapshot endpoint, reporting character counts as real tokens, swallowing capture errors into empty results.

**Handoff:** one working command and saved JSON/text examples from actual captures.

## T08 — Defect shop and healthy controls

**Owner suggestion:** Builder B. **Estimate:** 90–150 minutes. **Depends on:** T00/T01 for page; T07 for final tool integration.

**Owned files:** `examples/shop/**` except shared Vite config; demo behavior tests and public scenario runner. Evaluator answer sheet belongs in a separate restricted checkout/artifact.

**Build:** modest React e-commerce page with navigation, hero, products, cart, cookie notice and modal; local assets/system fonts; clean default; deterministic isolated states and one combined demonstration. Seed the matrix in BENCHMARK. Give public scenarios neutral IDs; keep defect descriptions and answer keys away from agents during evaluation.

**Acceptance:** desktop 1440×900 and mobile 390×844; at least six independently verified supported defects and six controls; cart behavior works in clean state; defects reproduce with fixed setup; no runtime rule imports truth labels. Test each case's actual DOM/layout/behavior without ANWC, then check ANWC output separately. Healthy fix cannot simply remove UI/content.

**Avoid:** network-loaded fonts/assets, hundreds of decorative components, a benchmark that requires knowing a hidden aesthetic preference, using the detector to generate its own expected answers.

**Handoff:** clean and broken demo commands/URLs, reproducible setup, evaluator truth records with evidence and scope labels.

## T09 — Integration gate and tonight's freeze

**Owner suggestion:** both collaborators; one integrator. **Estimate:** 60–120 minutes. **Depends on:** T02–T08.

**Owned files:** `tests/integration/**`, final CI/scripts by coordination, documentation status updates. Fix production modules only with their owner aware.

**Build/check:** complete vertical slice and gates from PLAN; test same ordinary app with instrumentation on/off; verify source map, IDs, interactions, production stripping, errors, limits, supported cases and controls. Review output manually against real browser observations. Measure one warm/cold latency sample set and report it as a preliminary measurement.

**Acceptance:** required scripts pass; at least six supported defects and six controls independently verified at applicable widths; no undocumented all-clear for unknown paint cases; saved actual reports and command logs; versions and commit identifier recorded; tomorrow's agents can reproduce setup from written steps.

**Handoff:** immutable local candidate commit/tag after tests, with collaborators deciding remote publication. Update PROGRESS with exact evidence. If failures remain, mark the affected gate failed and reduce claims, not tests.

## T10 — Same-agent pilot experiment

**Owner suggestion:** one evaluator, the other adjudicator. **Estimate:** 2–4 hours after MVP, dependent on agent speed/budget. **Depends on:** T09.

**Owned files:** `bench/prompts/**`, sanitized run summaries, `docs/RESULTS.md` when results exist. Raw runs and hidden ground truth stay outside the agent's workspace.

**Build/run:** execute BENCHMARK's paired normal-tools and normal-tools-plus-ANWC runs with the same model/settings/budget. Record actual costs when available; separate unavailable metrics; evaluate patches independently in clean environments. Run a small detection-only pilot first, then repair.

**Acceptance:** run manifest, tool/usage logs, all failures counted, matched scenario IDs, real independent scoring, zero fabricated costs, caveated conclusions. Include false positives and unsupported features in results. A faster wrong repair does not count as success.

**Handoff:** decision: expand, improve correctness/reporting, or stop framework expansion pending stronger evidence.

## Later tasks, not tonight's assignments

| Task | Trigger to start | Acceptance direction |
| --- | --- | --- |
| Next.js adapter | Source mapping proves value in Vite pilot | Supported build modes, SSR/RSC/directive preservation, no hydration mismatch |
| MCP transport | Agents cannot conveniently consume the CLI | Versioned read-only tools backed by same schema and explicit session IDs |
| Live deltas | Repeated full snapshots dominate measured cost | Correct invalidation, bounded staleness, fallback full snapshot |
| CDP paint experiment | Visual coverage is a leading unsupported failure | Pinned protocol decoder, restricted compositing assumptions, known/unknown accuracy |
| Semantic components/actions | Real tasks need declared business meaning | Single source of truth, normal HTML, ordinary permission and action semantics |
| Packaged installer | Two unrelated apps integrate successfully | Installation/uninstallation documented, dev-only default, version matrix |
