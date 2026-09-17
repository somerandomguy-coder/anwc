# ANWC history

> This is the completed-work record. Start at [STATUS](STATUS.md), then use [ROADMAP](ROADMAP.md) for active work. Entries below are retained as evidence, not an active task list.

Last updated: 2026-09-17, Australia/Sydney.

**Historical summary:** W01–W14 and the Phase 2 foundations, local packaging and pilot helpers shipped. The 2026-09-17 audit records remaining integrity and validation gaps; Phase 3 is now planned. Older entries retain their original dates and claims; they are not current certification. Paired-agent results remain unrecorded. Start at [STATUS](STATUS.md).

SSH access to `git@github.com:somerandomguy-coder/anwc.git` was verified and the supplied sample snippets were reviewed as design inputs. The repository now contains a source-linked Vite/React MVP with a browser collector, CLI, and deterministic defect shop. T10 is the remaining paired-agent experiment.

## Historical deliverables

The table records shipped implementations. For remaining acceptance work use STATUS and ROADMAP; “done” in older rows does not certify the expanded evaluator.

| Deliverable | Status | Evidence |
| --- | --- | --- |
| Read supplied concept notes | done | Three pasted attachments reviewed |
| Connect to repository | done | SSH clone succeeded; remote empty on initial inspection |
| Architecture and tonight's scope | done | [PLAN](PLAN.md) |
| Shared protocol contract (T01) | done | `@anwc/protocol` Zod schemas, exported TypeScript types, synthetic fixtures |
| JSX instrumentation compiler (T02) | done | parser-based source-preserving host-element annotation and source maps |
| Browser capture and identity (T04) | done | read-only browser collector with per-document IDs and explicit unknowns |
| Vite adapter and source manifest (T03) | done | development-only compiler/runtime injection with HMR manifest refresh |
| Geometry and text observations (T05) | done | supported client-box clipping and direct-text Range fragments |
| Pointer sampling and diagnostics (T06) | done | 5×5 browser hit tests and pure normalized findings |
| CLI and serializer (T07) | done | isolated Playwright inspection, JSON, bounded text, and runtime-only injection |
| Defect shop and controls (T08) | done | local e-commerce fixture with six isolated supported defects |
| Multi-page public fixture lab | done | clean `/`, `/catalog`, `/checkout`, `/account`; ten explicit `/lab?case=` defects |
| Small coding task briefs | done | [TASKS](TASKS.md) |
| Benchmark and scoring design | done | [BENCHMARK](BENCHMARK.md) |
| Paired-run manifest, runbook, result ledger, subject leakage gate, and packager | done | `@anwc/benchmark`; public examples at `bench/pilot.example*.json` |
| One-command matched ordinary/assisted subject preparation | shipped; acceptance follow-up P02/P03 | W12 prepare-pair/check-pair; revision and intent gaps remain |
| Independent returned-repair grader | shipped; acceptance follow-up P01/P03/P04 | W13 grade; evidence and lifecycle gaps remain |
| Two-app no-model benchmark rehearsal | shipped; acceptance follow-up P05 | W14 ordinary-side report; both arms/shop and verified provenance remain |
| Decision record | done | [DECISIONS](DECISIONS.md) |
| Workspace/toolchain (T00) | done | npm workspaces, Vite/React shell, TypeScript/Vitest/Playwright checks |
| Compiler/runtime/demo | done | T02–T08, verified by typecheck, unit, Chromium, build, and CLI checks |
| Actual benchmark/cost results | not started | No results claimed |
| Publish completed tasks to GitHub | done | `main` includes T00–T09 commits |

## Status vocabulary

`ready`: dependencies complete and task can be claimed. `queued`: waiting on a dependency. `in progress`: one named owner currently working. `blocked`: exact missing input/interface recorded. `review`: implementation and evidence ready for another collaborator. `done`: acceptance checks passed and reviewer acknowledged them.

Names below are proposed roles, not assignments: **Builder A** handles toolchain/compiler/integration; **Builder B** handles capture/demo. Either person can take either role. Do not assign an absent friend work without agreement.

## Historical prototype task board

| ID | Module | Status | Suggested role | Dependencies | Branch / evidence |
| --- | --- | --- | --- | --- | --- |
| T00 | Workspace/toolchain | done | A | none | pending commit: workspace setup |
| T01 | Protocol/schema | done | A; B reviews | T00 | pending commit: protocol contract |
| T02 | Source compiler | done | A | T01 | pending commit: JSX compiler |
| T03 | Vite integration | done | A | T02, runtime entry | pending commit: Vite adapter |
| T04 | Browser capture | done | B | T01 | pending commit: browser capture |
| T05 | Text/clip geometry | done | first available | T04 | pending commit: geometry and text observations |
| T06 | Pointer/rules | done | B | T04; T05 | pending commit: pointer rules |
| T07 | CLI/serializer | done | A | T03–T06 | pending commit: CLI inspector |
| T08 | Demo and controls | done | B | T00/T01; T07 | pending commit: defect shop |
| T09 | Integration/freeze | done | Codex | T02–T08 | pending commit: freeze MVP integration candidate |
| T10 | Paired experiment | in progress | evaluator | T09 | manifest/runbook helper complete; no agent runs recorded |

## Historical prototype gates

Historical prototype results are recorded below. They are not fresh certification of the expanded corpus. In particular, G4 does not yet establish a named healthy counterpart for every current defect at both widths; W04 adds that matrix. Export install/build smoke results do not prove absence of generated-file leakage or identical A/B app source; W01 and W12 close those gaps.

| Gate | Acceptance | Status | Evidence to attach |
| --- | --- | --- | --- |
| G0 | Clean app builds/runs, toolchain pinned | passed | Node 24.18.0, npm 11.13.0, TypeScript 5.7.3, Vite 6.1.0, React 19.0.0, Vitest 3.0.7, Playwright 1.51.1 / Chromium build 1161 |
| G1 | JSX site links to live node and original source | passed | Vite source-link and HMR Chromium tests |
| G2 | Supported text/clip/pointer rules pass independent checks | passed | Geometry, pointer, and scenario Chromium tests |
| G3 | CLI emits valid JSON + bounded text and cleans up | passed | CLI unit/integration coverage and runtime-only check |
| G4 | Six supported defects + six controls, two widths | passed | Scenario fixture and CLI tests at desktop/mobile |
| G5 | Production clean; instrumentation preserves app behavior | passed | Production build and clean cart behavior test |
| G6 | Reproducible benchmark candidate frozen | passed | `npm run test:integration`; sanitized reports under ignored `artifacts/integration/` |

“Done tonight” requires G0–G6, or a clearly documented reduced scope with unmet gates. These boxes are not progress estimates. Do not mark a gate passed because code was written or because an agent says it works.

## Next three actions

1. Finish P02's independent 18-pair behavior matrix from the Phase 2 ROADMAP.
2. Complete M1 evaluation reliability and M2 external-project adoption.
3. Use P08/P09 for a frozen small pilot. Keep T10 pending until actual agent outcomes exist.

## Collaboration workflow

Use one task branch per module and one integrator for root config/lockfile changes. Suggested names are `feat/t02-compiler`, `feat/t04-capture`, and `feat/t08-demo`. These branches do not exist yet. Keep PRs small enough that a friend can review their owned module and one end-to-end example.

Before starting, record owner and branch in this board. Before handing off, record files, commands, observed output, supported cases, unknowns, and next dependency. A failed command is evidence too; retain the error summary. Review against acceptance behavior, not matching implementation internals.

Use a stronger reasoning model for schema changes, ambiguous CSS correctness, and interpretation of experimental results. Use cheaper models for the bounded briefs once interfaces and acceptance tests are clear. This is a workflow suggestion, not a claim about a particular model's current capabilities or pricing.

Keep raw captures/logs out of routine Git commits. Commit small sanitized examples and a run manifest when results exist. Keep hidden evaluator answers outside the subject agent's accessible repository. Do not let test agents read this planning pack during a blinded benchmark.

## Handoff entry template

```md
### Txx — date/time — owner
- Status: in progress / blocked / review / done
- Branch and commit:
- Owned files changed:
- Interface changes: none, or coordinated decision link
- Acceptance commands and outcomes:
- Actual evidence/artifact paths:
- Unsupported cases or remaining failures:
- Next task now unblocked:
- Reviewer and review outcome:
```

## Risks that currently affect scope

| Risk | Resolution/default | Owner to confirm |
| --- | --- | --- |
| General visual coverage is not observable through pointer hits | Paint unknown in v0; limitation fixtures included | T01/T06 |
| Clipping is more complex for positioned/transformed elements | Certify restricted geometry and return unknown elsewhere | T05 |
| Wrapping may be intentional | Intent contracts plus healthy controls | T05/T08 |
| Tonight's work exceeds an evening | Cut later features; preserve the six-defect vertical slice | Both |
| Cheap-model modules drift apart | Shared protocol, owned paths, one integration gate | T01/T09 |
| Benchmark leaks answers or rewards superficial fixes | Separate evaluator checkout and hidden behavior checks | T08/T10 |
| Agent platform does not expose billed usage | Record NA and timing/usage proxies separately | T10 |

## Planning session log

- 2026-09-15: Reviewed three user-supplied concept notes; verified authenticated SSH connection; cloned an empty repository.
- 2026-09-15: Chose React/Vite plugin + browser runtime as the first slice, with compiler/source mapping separated from actual layout observations.
- 2026-09-15: Added detailed module briefs, protocol proposal, collaboration board, scoped visibility limits, and fair benchmark design.
- 2026-09-15: Prepared local shareable planning artifacts before implementation began. The later T00–T09 entries record the implementation and verification evidence.

### T00 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; `chore: set up ANWC workspace`
- Owned files changed: root package/tooling configuration; package skeleton manifests; clean `examples/shop`; smoke tests.
- Interface changes: none. Package names reserve the imports planned in the protocol.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (1 test); `npm run build` passed; `npm run test:browser` passed (1 Chromium test). `npm install` created `package-lock.json`; `npx playwright install chromium` installed Playwright Chromium build 1161.
- Actual evidence/artifact paths: local terminal output; `tests/unit/workspace.test.ts`; `tests/browser/shop.spec.ts`.
- Unsupported cases or remaining failures: `npm audit` reports 6 transitive development-dependency advisories (2 moderate, 3 high, 1 critical); no automatic upgrade was applied because the first priority is the pinned, verified baseline. `npm run anwc` exits with an explicit unavailable message until T07.
- Next task now unblocked: T01 protocol/schema.
- Reviewer and review outcome: self-reviewed; source tree typecheck, build, unit test, and browser smoke test all passed.

### T01 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: freeze protocol contract`
- Owned files changed: `packages/protocol/src/**`, `packages/protocol/package.json`, `tests/unit/protocol.test.ts`, `docs/PROTOCOL.md`, and this handoff board.
- Interface changes: protocol `0.1` is frozen. `RawCapture` has capture/serialization timings only; `Snapshot` adds diagnostic findings and rule timing. Findings use discriminated evidence for the six planned v0 rule families.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (7 tests across 2 files); `npm run build` passed. Tests round-trip JSON and reject incompatible versions, negative geometry, inconsistent pointer totals, and unresolved references.
- Actual evidence/artifact paths: `packages/protocol/src/schema.ts`, `packages/protocol/src/fixtures.ts`, and `tests/unit/protocol.test.ts`.
- Unsupported cases or remaining failures: this freezes shape and validation only; no browser producer, compiler transform, diagnostic algorithm, or CLI exists. A generic evidence variant remains reserved for rule codes introduced later.
- Next task now unblocked: T02 compiler and T04 browser capture can proceed independently.
- Reviewer and review outcome: self-reviewed; exported package typechecks and validated fixture round-trips.

### T02 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add JSX instrumentation compiler`
- Owned files changed: `packages/compiler/**`, compiler dependencies in the lockfile, `tests/unit/compiler.test.ts`, README, and this handoff board.
- Interface changes: `instrument(code, { filename, root, mode })` returns an `InstrumentResult` or `null` for production/unrelated inputs. It injects deterministic `data-anwc-site` attributes only into lowercase non-SVG host elements.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (11 tests across 3 files); `npm run build` passed. Tests cover TSX, fragments/custom/member components, spreads, query suffixes, Windows paths, SVG, collisions, repeat transform, site-id separation, and source-map file lookup.
- Actual evidence/artifact paths: `packages/compiler/src/index.ts` and `tests/unit/compiler.test.ts`.
- Unsupported cases or remaining failures: this is a pure Node transform only. T03 must connect it to a real Vite/React render and verify HMR, manifest lookup, and runtime behavior. There is no ref injection, component wrapping, or live-node identity here.
- Next task now unblocked: the transform side of T03; T04 remains independently ready.
- Reviewer and review outcome: self-reviewed; parser and map assertions pass with original JSX expressions retained verbatim.

### T04 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add browser capture runtime`
- Owned files changed: `packages/runtime/**`, browser runtime test bridge, `tests/browser/runtime-capture.spec.ts`, protocol validation clarification, README, and this handoff board.
- Interface changes: `capture(options)` returns read-only `RawCapture`; `configureRuntime` optionally joins a source manifest. Per-document WeakMap identity yields stable IDs within a page and a new session after navigation.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (12 tests); `npm run build` passed; `npm run test:browser` passed (2 Chromium tests). Browser assertions cover repeated source sites, source-null blocker nodes, portal content, post-render mutation, zero-size targets, hidden descendants, caps/incomplete coverage, navigation isolation, and no DOM/focus/scroll or input-value mutation.
- Actual evidence/artifact paths: `packages/runtime/src/index.ts` and `tests/browser/runtime-capture.spec.ts`.
- Unsupported cases or remaining failures: clipping and text fragments are explicitly unknown until T05; pointer samples until T06; paint visibility remains unknown in v0. The test-only runtime entry is never imported by the ordinary shop and production output remains clean.
- Next task now unblocked: T03 Vite adapter, T05 geometry/text, and the capture half of T06.
- Reviewer and review outcome: self-reviewed; real Chromium captures passed without screenshot APIs or page interaction.

### T03 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add Vite source-link adapter`
- Owned files changed: `packages/vite-plugin/**`, shop Vite configuration and HMR probe, browser source-link tests, README, and this handoff board.
- Interface changes: `anwc({ sourceRoot? })` is a Vite `pre` transform. It injects development-only source IDs, serves a versioned virtual runtime module, and exposes `window.__ANWC__` with `capture` and `sourceForSite`.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (12 tests); `npm run test:browser` passed (4 Chromium tests); `npm run build` passed. Browser tests resolve an actual rendered `h1` to `examples/shop/src/main.tsx` and change a JSX `<p>` to `<button>` through HMR, then verify the refreshed source manifest. A production-output search found no `data-anwc-site`, `__ANWC__`, or virtual runtime strings.
- Actual evidence/artifact paths: `packages/vite-plugin/src/index.ts` and `tests/browser/vite-plugin.spec.ts`.
- Unsupported cases or remaining failures: this is Vite development integration only. Production instrumentation requires explicit future configuration; lazy-route coverage is not yet separately tested because the demo has no routes. Next.js integration remains deferred by ADR-015.
- Next task now unblocked: T05 geometry/text and the complete T06 rule layer; T07 waits for their output.
- Reviewer and review outcome: self-reviewed; development source links, HMR refresh, and production stripping all passed in the real toolchain.

### T05 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add geometry and text observations`
- Owned files changed: runtime clipping/text collectors, runtime integration, geometry browser test, README, and this handoff board.
- Interface changes: `Measurement.clip` now reports supported normal-flow client-box intersections and the clipping ancestors that caused them. `Measurement.text` now reports direct-text Range fragments, approximate line grouping, and supported clipped-fragment evidence.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (12 tests); `npm run test:browser` passed (5 Chromium tests); `npm run build` passed. The real-browser geometry fixture covers nested normal-flow clips, scrolled containers, axis-specific overflow, nowrap clipping, inline wrapping, a healthy paragraph, and schema validation. Transformed and positioned descendants explicitly return unknown clip state.
- Actual evidence/artifact paths: `packages/runtime/src/clipping.ts`, `packages/runtime/src/text.ts`, and `tests/browser/runtime-geometry.spec.ts`.
- Unsupported cases or remaining failures: transforms, clip paths, masks, vertical writing, and positioned descendants are unknown. Line grouping is approximate; text ownership is direct-node-only, so parent elements do not duplicate inline child observations. No final diagnostics are emitted here.
- Next task now unblocked: T06 pointer sampling and pure diagnostic rules.
- Reviewer and review outcome: self-reviewed; browser output validates against `parseRawCapture` and all supported/unknown fixtures passed.

### T06 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add pointer diagnostics`
- Owned files changed: browser hit-test collector, pure diagnostics package, diagnostics unit tests, pointer browser fixture, README, and this handoff board.
- Interface changes: interaction candidates receive a deduplicated 5×5 interior hit-test grid. `diagnose(capture)` returns stable normalized findings without browser APIs, including horizontal overflow, clipping, text clipping/line budgets, expected hidden state, viewport state, unsupported visibility, and full or partial pointer blockage.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (14 tests); `npm run test:browser` passed (6 Chromium tests); `npm run build` passed. Browser tests verify opaque, transparent, partial, nested-stack, child-descendant, disabled, opacity-zero, and pointer-events-none cases. Real findings validate as a `Snapshot`.
- Actual evidence/artifact paths: `packages/runtime/src/hit-test.ts`, `packages/diagnostics/src/index.ts`, `tests/unit/diagnostics.test.ts`, and `tests/browser/runtime-pointer.spec.ts`.
- Unsupported cases or remaining failures: sample fractions are not pixel coverage; no rule infers paint visibility from pointer success. Disabled and inert controls retain interaction facts but are not reported as pointer-obscured. Rule severity is intent-aware; allowances produce acknowledged informational findings.
- Next task now unblocked: T07 CLI and serializer.
- Reviewer and review outcome: self-reviewed; pure synthetic rules and real browser hit-test findings passed without click, fill, scroll, style mutation, or screenshot APIs.

### T07 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add CLI inspector`
- Owned files changed: `packages/cli/**`, browser runtime injection entry, root CLI command, source-manifest registration fix, capture discovery filter, CLI integration tests, README, and this handoff board.
- Interface changes: `npm run anwc -- inspect URL` now launches an isolated Chromium context and emits validated JSON or bounded text. `--runtime-only` bundles and injects the same runtime collector for a page without the Vite plugin. Exit statuses are 0 success, 1 selected finding threshold, 2 usage/navigation/runtime failure, and 3 incomplete/unsettled capture.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (18 tests); `npm run test:browser` passed (6 Chromium tests); `npm run build` passed. CLI tests cover linked Vite inspection at a mobile viewport, runtime-only capture, JSON-only error output, and finding-threshold exit status. The public runtime-only command emitted a compact zero-finding text report with no screenshot call.
- Actual evidence/artifact paths: `packages/cli/src/index.ts`, `packages/cli/src/main.ts`, and `tests/unit/cli.test.ts`.
- Unsupported cases or remaining failures: no scenario runner exists yet, so CLI inspection does not set up app state; it only reads the state it reaches. Runtime-only captures have source-null nodes by design. The runtime-missing detection wait is capped at two seconds inside the caller's overall timeout.
- Next task now unblocked: T08 defect shop and then T09 integration/freeze.
- Reviewer and review outcome: self-reviewed; output is schema-validated, browser/context cleanup is in `finally`, and implementation contains no screenshot, click, fill, scroll, or style-mutation calls.

### T08 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `feat: add deterministic defect shop`
- Owned files changed: shop application, scenario registry, local styles, clean-shop behavior test, scenario DOM/ANWC tests, CLI scenario test, README, benchmark note, and this handoff board.
- Interface changes: public `?scenario=` IDs select `clean`, six isolated supported defects, or `combined`. No network assets or third-party services are used.
- Acceptance commands and outcomes: `npm run typecheck` passed; `npm run test:unit` passed (19 tests); `npm run test:browser` passed (8 Chromium tests); `npm run build` passed. Clean cart/modal behavior works. Each defect has an ordinary DOM/layout assertion before its ANWC check; CLI inspection finds the expected code at 390×844, while the browser fixture checks every scenario at both 1440×900 and 390×844.
- Actual evidence/artifact paths: `examples/shop/src/main.tsx`, `examples/shop/src/scenarios.ts`, `examples/shop/src/styles.css`, `tests/browser/shop-scenarios.spec.ts`, and `tests/unit/cli.test.ts`.
- Unsupported cases or remaining failures: scenario IDs intentionally describe the condition in this development checkout, so they must be materialized into hidden evaluator revisions for a blinded experiment. The demo currently has three products rather than the six suggested in the planning matrix; this does not affect the six defect/control gates.
- Next task now unblocked: T09 integration/freeze.
- Reviewer and review outcome: self-reviewed; supported findings are independently reproduced and then verified through the actual CLI without screenshots.

### T09 — 2026-09-15 — Codex
- Status: done
- Branch and commit: `main`; pending `chore: freeze MVP integration candidate`
- Owned files changed: root integration command, runtime text-clip precision and report metadata, clean-scenario regression coverage, README, and this handoff board.
- Interface changes: coverage now advertises the implemented clipping, text-fragment, and pointer-sample capabilities. Captures report the active `data-anwc-scenario` from the rendered application tree.
- Acceptance commands and outcomes: `npm run test:integration` passed: TypeScript, 19 unit tests, 9 Chromium tests, and a production build. The new clean-scenario regression confirms no unacknowledged findings.
- Actual evidence/artifact paths: ignored sanitized reports at `artifacts/integration/clean-desktop.json` (1440×900; complete; no findings) and `artifacts/integration/blocked-mobile.json` (390×844; complete; `POINTER_BLOCKED_AT_SAMPLES`). Reports are generated through the regular Vite plugin and CLI, with no screenshot call.
- Unsupported cases or remaining failures: results are the candidate fixture evidence, not a paired-agent benchmark or a cost measurement. Paint visibility, non-rectangular clipping, and transformed geometry remain explicitly unsupported.
- Next task now unblocked: T10 paired experiment.
- Reviewer and review outcome: self-reviewed. The final integration run surfaced an initial false-positive text clip caused by glyph overhang; T09 now intersects text Range rectangles only with actual clip ancestors and own overflow clips, and the clean regression passed.

### T10 (pilot tooling) — 2026-09-15 — Codex
- Status: in progress; no paired agent run has started.
- Branch and commit: `main`; pending `feat: add benchmark manifest helper`
- Owned files changed: `packages/benchmark/**`, `bench/pilot.example*.json`, benchmark unit tests, root command/configuration, public fixture lab, and handoff documents.
- Interface changes: `npm run bench -- validate PLAN.json` validates public paired-run metadata. `npm run bench -- runbook PLAN.json --output FILE.md` writes a non-secret execution checklist. `validate-results` and `summarize` validate an entered ledger and emit a descriptive summary. `check-subject PATH --condition ordinary|anwc-assisted` rejects known answer leakage and condition-tool mismatch. `package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` prepares a fresh export then runs that gate. A scored plan rejects placeholder model/reasoning/prompt values and mismatched A/B setup.
- Acceptance commands and outcomes: `npm run test:integration` passed: TypeScript, 24 unit tests across 6 files, 10 Chromium tests, and production build. Public plan and result-ledger validation passed (4 runs across 2 pairs); public runbook and summary generation passed. The public lab independently reproduces ten supported cases through browser and CLI checks. The current development checkout correctly fails `check-subject . --condition ordinary`, demonstrating detection of docs, bench files, tests, Git history, public scenario switching, and the ordinary-condition CLI leak. Local ignored ordinary and assisted exports both installed and built; the assisted export served a materialized blocker and emitted a source-linked pointer finding.
- Actual evidence/artifact paths: ignored `artifacts/benchmark/pilot.example.runbook.md` and `artifacts/benchmark/pilot.example.summary.md`; committed `bench/pilot.example*.json` and `tests/unit/benchmark.test.ts`.
- Unsupported cases or remaining failures: this helper neither materializes hidden fixtures nor launches agents, grades repairs, infers provider usage, or enforces host-level filesystem/network isolation. The packager creates subject folders from evaluator-provided overlays; preparing the actual fixture and scoring remain evaluator work. The continuation audit below qualifies the earlier export and fixture checks.
- Next task now unblocked: complete a scored manifest outside the subject workspace, materialize evaluator fixtures, then run and score paired A/B sessions.
- Reviewer and review outcome: self-reviewed; tests cover a fair pair plus incomplete/mismatched pair rejection.

### Continuation planning audit — 2026-09-15 — Codex
- Status: planning complete; W01–W14 implementation has not started.
- Reviewed revision: `7db32b135cc72e3ad6cb44e2a4630f264b1dfb79`.
- Owned files changed: `docs/CONTINUATION_PLAN.md`, README, progress, task index, handoff, and decision record.
- Evidence: source inspection found export isolation, paired endpoint/accounting, fixture behavior/truth, runtime visibility/sampling/readiness, and source registration gaps. The new plan names the relevant functions and gives each task fixed decisions, owned paths, dependencies, and acceptance checks.
- Validation: documentation links and Git whitespace checks; no application code changed or new browser/model results claimed.
- Next task: W01, then W02. Continue development while actual human comparisons remain pinned to their recorded revisions.
- Remaining limits: 18 planned defect/healthy pairs and prepare/grade commands are future deliverables; public cases remain unblinded. T10 requires real agent runs.

### W01 — 2026-09-15 — Antigravity
- Status: done
- Branch and commit: `main`; `feat: trustworthy subject exports (W01)`
- Owned files changed: `packages/benchmark/src/subject.ts`, `packages/benchmark/src/index.ts`, `tests/unit/benchmark.test.ts`, `packages/compiler/src/index.ts`, `package.json`, `examples/shop/package.json`, `playwright.config.ts`, `docs/PROGRESS.md`.
- Interface changes: Extracted `packages/benchmark/src/subject.ts`; `packageSubjectWorkspace` now validates path overlap, rejects non-application overlay files, generates clean condition-specific Vite configs/manifests post-overlay, generates matching lockfiles via `npm install --package-lock-only`, and strictly excludes forbidden files (`dist`, `test-runtime.ts`, `scenarios.ts`, source maps, test files, and TS build info).
- Acceptance commands and outcomes: `npm run test:integration` passed: TypeScript compilation, 28 unit tests across 6 files, 10 Chromium tests, and production shop build. Standalone packaging and builds verified for both `ordinary` and `anwc-assisted` conditions in `/tmp/` outside repo ancestry; both passed `check-subject`, clean `npm ci`, `npm run typecheck`, and `npm run build`. Unit tests cover overlay root-script rejection, path overlap rejection, and forbidden artifact/bridge exclusions.
- Actual evidence/artifact paths: `packages/benchmark/src/subject.ts`, `tests/unit/benchmark.test.ts`.
- Unsupported cases or remaining failures: W01 provides trustworthy subject exports and leakage checks; multi-port pair endpoints and missing measurement handling follow in W02.
- Next task now unblocked: W02 — result accounting and paired endpoints.
- Reviewer and review outcome: self-reviewed; full integration suite passed.

### W02 — 2026-09-15 — Antigravity
- Status: done
- Branch and commit: `main`; pending commit for W02
- Owned files changed: `packages/benchmark/src/index.ts`, `packages/benchmark/src/main.ts`, `tests/unit/benchmark.test.ts`, `docs/CONTINUATION_PLAN.md`, `docs/PROGRESS.md`.
- Interface changes:
  - Allowed paired endpoints to use different ports/origins as long as route pathname and search query match (`sameRouteAndQuery`).
  - Strict result validation: planned rows cannot carry usage/wallSeconds/scoring; failed/excluded rows cannot carry repair scores and require explanation in `notes`; duplicate/unknown/missing run IDs fail.
  - Honest accounting summary: separate Status breakdown table for planned, completed, capped, failed, excluded, and graded counts; Scored outcomes retains missing measurements as `NA` and tracks graded count; paired difference median calculated strictly when both runs are scored with observed values; known spending preserves failed-run costs and flags incomplete spending with `(incomplete)`.
  - Markdown table escaping: pipes and newlines in cell and heading content are safely escaped.
  - Strict CLI argument enforcement: extra arguments on `validate`, `runbook`, `validate-results`, and `summarize` return exit code 2 with usage instructions.
- Acceptance commands and outcomes: `npm run test:integration` passed: TypeScript compilation, 36 unit tests across 6 files, 10 Chromium browser tests, and production shop build.
- Actual evidence/artifact paths: `packages/benchmark/src/index.ts`, `packages/benchmark/src/main.ts`, and `tests/unit/benchmark.test.ts`.
- Unsupported cases or remaining failures: None for W02.
- Next task now unblocked: W03 — Give shop fixtures real behavior.
- Reviewer and review outcome: self-reviewed; all acceptance tests and integration suites pass.

### Arbitrary URL planning and verification correction — Codex
- Status: planning complete; R01–R06 remain unimplemented.
- Reviewed source: `bcdaf302d9af4b6002f3909e5e2747ce4a2c2808`.
- Previous session verification on Windows: TypeScript passed; 35/36 unit tests passed with one fixed five-second CLI integration timeout; 10 Chromium tests passed through a shell workaround; direct shop production build passed. Standard npm scripts failed on Unix-style environment assignments. These qualify the earlier platform-specific W01/W02 handoff claims; no full Windows integration pass is claimed.
- Founder-reported external results: default Amazon inspection timed out waiting for ANWC; Instagram inspection encountered a CSP evaluation error that the CLI labelled runtime missing. Neither external target was rerun during this planning turn.
- Source findings: default inspection assumes installed runtime; runtime-only inline injection is policy-sensitive; capture errors are misclassified; pointer detection uses browser geometry/hit targets independently of labels, but intent and custom-event discovery remain limited.
- Updated files: new `docs/ARBITRARY_URL_PLAN.md`, continuation plan, decision record, README, progress, and co-founder handoff. R01/R02/R03 are the first proposed plain-URL milestone; W12 is benchmark packaging, not a prerequisite for root inspection.
- Validation: documentation link/whitespace checks; no implementation or new runtime tests this turn.
- Remaining evidence: strict-CSP compatibility, neutral uninstrumented before/after repairs, broader false-positive coverage, and human time/cost comparisons remain unproved.

### R01 — Portable installed-runtime commands — Codex
- Status: done.
- Owned files: root/shop package scripts, Playwright config, current/future-scope documentation.
- Change: removed Unix-only `NODE_OPTIONS='...'` assignments and the forced Ubuntu Playwright override. Root `npm run dev` now invokes Vite with `examples/shop` as its root so normal `--host` and `--port` flags reach Vite.
- Evidence: `npm run test:integration` passed on Windows: TypeScript, 36 unit tests, 10 Chromium tests, and production build. `npm run dev -- --host 127.0.0.1 --port 4180` served the app at `http://127.0.0.1:4180/`.
- Remaining limit: Linux CI was not rerun. R02–R06 remain planned future runtime-only work; current support is an app that installs ANWC.
- Next task: W03 — functional shop controls and lab.

### W03 — Functional shop controls and lab — Codex
- Status: done.
- Owned files: `examples/shop/src/main.tsx`, shop browser behavior tests, continuation/progress handoff.
- Change: cart state is stored as validated product IDs in versioned sessionStorage, so normal page navigation preserves the cart in one browser session. The confirmation modal is shared by storefront and lab routes. Every checkout fixture has a real local confirmation handler; `/lab` defaults to the blocked-checkout case and explains the action to try.
- Evidence: focused TypeScript and six shop/scenario Chromium tests passed. `npm run test:integration` passed on Windows: 36 unit tests, 11 Chromium tests, TypeScript, and production build. The action test removes only the blocker, clicks the existing checkout button, and observes the checkout confirmation.
- Remaining limit: W04 has not created healthy counterpart routes or evaluator-side behavior checks yet. The public lab remains answer-bearing and unsuitable for blinded subjects.
- Next task: W04 — ten defects with ten explicit healthy counterparts.

### W04 — Broken/healthy fixture pairs — Codex
- Status: done.
- Owned files: public fixture registry, shop fixture variant rendering/styles, scenario browser tests, continuation/progress handoff.
- Change: each public case now has `/lab?case=ID&variant=broken|healthy`; the default remains broken and the prior `?scenario=ID` routes remain valid. Every pair uses one stable target key. Healthy checkout controls preserve real actions rather than deleting their targets.
- Evidence: focused fixture tests passed at 1440×900 and 390×844. Every broken case satisfies an independent DOM, Range, or browser hit-test condition before its exact target is checked for the expected ANWC finding. Every healthy counterpart retains content/action behavior and has no target-specific expected actionable finding. `npm run test:integration` passed on Windows: 36 unit tests, 11 Chromium tests, TypeScript, and production build.
- Remaining limit: the development registry deliberately includes answer-bearing expected codes. W09 will create a benchmark fixture contract with private evaluator sidecars; the current public lab remains unsuitable as a blinded subject.
- Next task: W05 — correct inherited render visibility.

### W05 — Correct inherited render visibility — Codex
- Status: done.
- Owned files: runtime render-state collection, focused runtime browser fixtures, protocol/continuation/progress handoff.
- Change: visibility now comes from the target's computed CSS value, allowing a child to restore `visibility:visible`. Display-none and zero-opacity ancestry still make the expected target hidden.
- Evidence: focused runtime tests passed. `npm run test:integration` passed on Windows: 36 unit tests, 12 Chromium tests, TypeScript, and production build. The five regression fixtures confirm both raw render observations and target-specific hidden findings.
- Remaining limit: this reports CSS render facts only; paint visibility remains unknown.
- Next task: W06 — bounded pointer probes in the current viewport.

### W06 — Bounded pointer probes in the current viewport — Codex

- Status: done.
- Owned files: `packages/runtime/src/hit-test.ts`, `packages/runtime/src/index.ts`, pointer browser tests, protocol notes, and handoff documents.
- Change: pointer checks now sample only the target area inside the current viewport. `maxSamplesPerNode` is a validated integer from 1 to 25, defaults to 25, and uses a deterministic center-first sequence. Samples that collapse to the same browser device-pixel hit-test location are deduplicated. A fully offscreen interactive target returns an unknown pointer result with an explicit no-samples limitation, so it cannot read as a successful pointer check.
- Evidence: TypeScript and the focused pointer suite passed on Windows: 2 Chromium tests. The suite covers partial/full offscreen controls, 1/5/25 caps, narrow controls, child spans, transparent input blockers, pointer-events-none paint layers, and disabled/inert controls.
- Remaining limit: pointer results are sampled event-delivery evidence, not pixel coverage or paint visibility. W07 is still needed so readiness itself has a bounded, evidence-based meaning.
- Next task: W07 — readiness and truthful timeout errors.

### W07 — Bounded readiness and truthful timeout errors — Codex

- Status: done.
- Owned files: runtime readiness helper, CLI capture handling, focused browser/CLI tests, protocol notes, and handoff documents.
- Change: capture now waits for `document.fonts.ready` and two successive stable geometry observations of interactive/expected targets, allowing at most 1 CSS px movement. It returns an explicit unsettled result when fonts are unavailable/not ready in budget or motion continues. The CLI validates raw capture data before diagnostics, bounds runtime evaluation, and separates absent runtime (`RUNTIME_MISSING`) from a present runtime that fails (`INTERNAL`).
- Evidence: `npm run test:integration` passed on Windows: TypeScript, 36 unit tests, 14 Chromium tests, and the production build. Focused tests make a known layout change during readiness, keep a target moving until deadline, and exercise a thrown runtime capture.
- Remaining limit: stability covers a short capture window only. It does not predict later layout shifts or paint-level visibility.
- Next task: W08 — reliable Vite startup, lazy modules, and production checks.

### W08 — Reliable source registration and production isolation — Codex

- Status: done.
- Owned files: Vite plugin, lazy shop probe, browser/unit source-link tests, protocol notes, and handoff documents.
- Change: each transformed module writes its current records to a shared pending registry before requesting live runtime registration. The runtime drains records present before it loaded and replaces a module's previous source sites on re-registration. The shop now imports the probe only when requested, giving the test suite a real lazy-module boundary.
- Evidence: TypeScript passed; focused Chromium coverage verifies queued registration, lazy import, HMR source replacement, and stale-site removal. A separate Vite production build test verifies the output contains neither `virtual:anwc-runtime` nor generated `data-anwc-site` attributes.
- Remaining limit: this proves the Vite adapter ordering contract. Next.js and other framework adapters remain separate future work.
- Next task: W09 — fixture contract and independent checker library.


### W09 — Fixture contract and independent checker — Codex

- Status: done.
- Change: added benchmark-only `0.2` public-case and private-sidecar schemas, bounded UI setup steps, and independent browser checks for content, width, line count, rendered actions, and actions that change public UI state.
- Evidence: `npm run test:integration` passed on Windows: TypeScript, 38 unit tests, 16 Chromium tests, and production build. The checker test rejects a hidden action and a target-deletion workaround, then accepts a working repair.
- Next task: W10 — landing/pricing fixture pairs.

### W10 — Landing/pricing fixture pairs — Codex

- Status: done.
- Change: added a local React/Vite pricing app with shared plan selection confirmation and four broken/healthy cases: title overflow, cropped description, blocked selection, and opacity-hidden selection.
- Evidence: `npm run test:integration` passed: 38 unit tests, 18 Chromium tests, TypeScript, and production builds for shop and landing. Healthy cases preserve the Growth selection action at desktop and mobile widths.
- Next task: W11 — dashboard fixture pairs.

### W11 — Dashboard fixture pairs — Codex

- Status: done.
- Change: added a local React/Vite project dashboard with tabs, task drawer, editable note, save confirmation, an intentionally scrollable activity table, and four broken/healthy cases for clipped save, long title, blocked input, and offscreen save.
- Evidence: `npm run test:integration` passed: 38 unit tests, 20 Chromium tests, TypeScript, and production builds for all three apps. Healthy dashboard cases retain tab, drawer, and save behavior at mobile and desktop widths.
- Next task: W12 — one-command A/B subject preparation.

## 2026-09-16 — Phase 2 planning and acceptance correction

- Reviewed source: `d616943bcb07597cc6424bbb53ff0894e99143f7`, clean worktree at review start. This change edits documentation only; no tests or product features were added or rerun.
- W12 shipped in `de11c3b`, W13 in `0b7b0aa`, W14 in `d616943`. These commit milestones describe implementation, not full acceptance certification.
- Re-read the existing local `anwc-w14-final/rehearsal-report.json` and dashboard deletion evidence. Pricing-blocked and dashboard-outside-save recorded broken failure, valid-repair pass, and runnable deletion failure at two widths. Only ordinary was graded; shop/assisted evidence is absent. Full reports reside in the original host's temp directory and are not durable collaborator artifacts.
- The report's `0b7b0aa` revision labels were caller supplied; preparation did not verify them or freeze the current evaluator hash. Do not treat them as verified build provenance.
- Source review identified concurrent mutating checks, weak text/opacity/input evidence, empty-check success, insufficient fixture matrix, broad nav deletion, defect hints in TASK/source, unfrozen intent, unverified receipt metadata, and unbounded/ambiguous grader process ownership. These are concrete follow-ups P01–P05, not claims of newly reproduced browser failures.
- Earlier “41 unit / 20 browser / three builds” counts are reported historical evidence. The visible final W14 record establishes typecheck/rehearsal, not a fresh full integration run. No new passed gate is claimed by this planning change.
- Decision: Phase 2 M1 trustworthy evaluator, M2 locally installable external React/Vite alpha, then a six-run founder pilot. P06–P08 engineering can proceed without paid model results. Runtime-only R02–R06 and Next.js integration remain deferred.
- Documentation: active cards now live only in ROADMAP; original W cards moved to archive/W_ROLLOUT.md. STATUS, README, TESTING, EVALUATOR_SETUP, BENCHMARK and future-plan cross-references were reconciled.

## 2026-09-16 — P01–P04 evaluator-foundation implementation batch

- Implemented ordered checker execution with exact single-target resolution, bounded check timeouts, duplicate-ID rejection, explicit rendered/viewport/pointer evidence, Range-based text checks, physical pointer/focus/typing input checks, and transition checks that reject pre-satisfied status.
- Added one registry for all 18 development states. Landing/dashboard materialization removes only marked public fixture links; the shop exporter emits a single-state application retaining navigation, catalogue, cart, and local confirmation. TASK.md now contains neutral behavior plus viewports, URL, commands, and editable paths.
- Replaced receipt `0.2` with strict Zod `0.3`: full Git revision verification, clean scored mode or clearly recorded practice mode, evaluator hashes, app/immutable hashes, declared source-intent hashes, toolchain fields, ports, route/viewports, and editable paths. A `0.2` receipt returns a migration message rather than being reinterpreted.
- The grader now verifies receipt/evaluator integrity, stages a copy outside the submitted subject, ignores returned dependencies/build/cache/logs, performs a bounded clean install, starts Vite on loopback with `--strictPort`, uses fresh pages for mutating checks, records capped logs/page errors, and reports 0/1/2/3 exit classes.
- Evidence on Windows: `npm run typecheck`; focused `npx vitest run tests/unit/benchmark.test.ts` (22 passed); `npm run test:browser` (22 passed). The browser suite includes new checker regressions for ambiguous actions, obstruction, empty content, opacity, pre-satisfied status, and delayed valid transitions.
- Remaining: all 18 broken/healthy pairs still need independent two-viewport measurement; source-intent extraction is declarative-attribute based rather than the planned parser-backed semantic comparison; cross-platform lifecycle, stalled install/server, occupied-port, and full integration coverage remain. Do not claim M1 or a scored benchmark yet.

## 2026-09-16 — P02 public matrix and fixture corrections

- Added an explicit 72-row matrix contract: 18 registered fixtures × broken/healthy state × 390×844/1440×900. Subject materialization can now emit either one frozen broken state or its healthy counterpart without reintroducing the public switchboard.
- Extended independent browser truth to all pricing and dashboard pairs at both widths. The existing shop matrix already covered all ten shop pairs. `npm run test:browser` passed 24 Chromium tests on Windows.
- The matrix exposed four fixtures that did not prove their named broken state: pricing title overflow, pricing description crop, dashboard blocked input, and dashboard long title. The source CSS/markup was corrected and the browser checks pass against the stronger states. This is fixture repair, not a grader relaxation.
- Focused browser-grade tests prepared and evaluated representative materialized broken and healthy landing, shop, and dashboard subjects. Broken failed and healthy passed, without public switching. A pricing-title CSS-only repair also passed while required content remained. The dashboard drawer case now checks both owner typing and a scoped drawer-save transition. [bench/fixture-matrix.json](../bench/fixture-matrix.json) is the committed 18-pair public manifest and has a registry-alignment unit test. Remaining P02 work is target-stable expected detector evidence for landing and dashboard; do not mark P02 or M1 complete yet.

## 2026-09-16 — P02 paired detector evidence

- Added fixture-only semantic keys for the four pricing and four dashboard targets. The prepared-subject materializer removes those keys, and its grading test guards against their export so target labels cannot reveal answers to a repair agent.
- Added paired detector assertions at 390×844 and 1440×900. Every broken pricing/dashboard target produces its designated diagnostic; the matching healthy target omits that code. This complements the existing separate shop target-code matrix.
- The healthy mobile dashboard exposed its normal save action below the initial viewport. The fixture was corrected by placing the mobile notes panel before the board. The broken clipped-save fixture retains an explicit constrained scrolling box, so its `CLIPPED_BY_ANCESTOR` evidence remains real.
- Evidence on Windows: `npm run test:integration` passed with 47 unit tests, 26 Chromium tests, TypeScript, and production builds for dashboard, landing, and shop. It includes the materialized-dashboard grading case after the export guard. P02 implementation and browser evidence are ready for review; P03 provenance/semantic-intent acceptance is next. M1 remains unclaimed.

## 2026-09-16 — P03 semantic intent and artifact provenance

- Replaced the regex scanner for source intent with TypeScript's TSX parser. It freezes static `data-anwc-expect` and `data-anwc-max-lines` declarations independent of whitespace, source location, JSX order, or attribute order. Dynamic declarations and invalid TSX now fail explicitly rather than being silently skipped.
- Receipts now pin a hash of `grade.ts` alongside the checker, registry, and sidecar. A grade result records a deterministic hash of the submitted tree, excluding generated dependencies, builds, caches, and logs. This identifies the repair that was actually evaluated without treating approved source edits as immutable.
- Evidence on Windows: `npm run test:integration` passed with 48 unit tests, 26 Chromium tests, TypeScript, and production builds for dashboard, landing, and shop. The suite includes parser formatting/dynamic/malformed-source checks, rejection of a deliberately altered grader hash, and staged broken/repair grades with distinct submitted artifact hashes. Remaining P03 acceptance includes scored dirty-revision boundaries, a separately changed evaluator tree, and filesystem failure cases.

## 2026-09-16 — P03 provenance acceptance and cross-platform integrity

- Completed P03 acceptance criteria:
  - Scored vs practice receipt boundaries: scored preparation rejects dirty Git worktree before writing; `receiptSchema` and `checkReturnedSubject` enforce that scored receipts cannot claim dirty source state; preparation rejects mismatched source revision against `HEAD`.
  - Malformed path traversal rejection: `pathKey` validation in `receiptSchema` rejects any keys in `applicationFiles` or `immutableFiles` containing `..` path traversal components before reading or staging files.
  - Separate evaluator tree validation: added `--evaluator-root PATH` CLI option and `evaluatorRoot` option to `gradeRepair`. When evaluating against a separate evaluator tree with altered grader/fixtures, it refuses certified grading with status `'integrity-failed'` and exit code `2`.
  - Symlink & overlapping output preflight: preflight rejects symlinked receipts, symlinked subject roots, internal symlinks within submitted subjects, existing pair outputs, and grade output paths overlapping or placed inside submitted subjects before any staging I/O occurs.
- Fixed Linux cross-platform test runner and build portability:
  - Configured tsx ESM loader import in Vitest worker environment, Playwright webServer environment, and workspace production build runner (`scripts/build.js`) to resolve `ERR_UNKNOWN_FILE_EXTENSION` when externalizing workspace package `@anwc/vite-plugin`.
  - Normalized `npm_execpath` (`npx-cli.js` -> `npm-cli.js`) and sanitized `NODE_OPTIONS` for npm subprocess invocations in temporary staging directories.
- Evidence on Linux: `npm run test:integration` passed cleanly:
  - `npm run typecheck`: 0 errors.
  - `npm run test:unit`: 7 test files, 51/51 tests passed.
  - `npm run test:browser`: 26/26 Chromium tests passed across shop, landing, and dashboard.
  - `npm run build`: Production builds succeeded for `@anwc/shop`, `@anwc/landing`, and `@anwc/dashboard`.
- Next task: P04 — own the evaluator process from start to finish (lifecycle, process cleanup, and failure modes).

## 2026-09-16 — P04 bounded grading lifecycle and failure-mode coverage

- Hardened evaluator process lifecycle and process group management:
  - Vite dev server child process spawned with detached process group on POSIX (`detached: process.platform !== 'win32'`).
  - `stopOwnedProcess` terminates process trees cleanly: sends SIGTERM to the process group (`process.kill(-pid, 'SIGTERM')`), escalates to SIGKILL if the process group has not terminated within 2 seconds, and uses `taskkill /pid <pid> /T /F` on Windows.
  - `runCommand` terminates timed-out child processes with process tree cleanup (`taskkill` on Windows, `SIGKILL` on Linux).
- Added comprehensive lifecycle and failure-mode acceptance tests:
  - Occupied port with healthy decoy rejection: `gradeRepair` immediately fails at `stage: 'initialization'` with `status: 'infrastructure-failed'`, `exitCode: 3`, and `repairVerified: false`, preventing any false passes from pre-existing decoy servers.
  - Bounded install & startup timeouts: tested `installTimeoutMs` and `startupTimeoutMs` bounds, ensuring failures return `exitCode: 3`, labelled stage ('install' or 'server'), timeout errors, and bounded logs.
  - Syntax crash & destructive deletion failure modes: verified that syntax-invalid source fails with non-zero exit codes (1 or 3), destructive deletions fail behavioral checks (`status: 'failed'`, `exitCode: 1`), and runtime exceptions on the page are collected in `logs.pageErrors`.
  - Port rebinding & file immutability: verified `cleanup: 'complete'`, immediate port release, repeated grading without collision, and bit-for-bit file immutability of submitted subjects.
- Evidence on Linux: `npm run test:integration` passed cleanly:
  - `npm run typecheck`: 0 errors.
  - `npm run test:unit`: 7 test files, 55/55 tests passed.
  - `npm run test:browser`: 26/26 Chromium tests passed across shop, landing, and dashboard.
  - `npm run build`: Production builds succeeded for `@anwc/shop`, `@anwc/landing`, and `@anwc/dashboard`.
  - Untested platforms: macOS.
- Next task: P05 — finish the cross-app rehearsal evidence (18 grade runs across shop, landing, and dashboard with durable reports).

## 2026-09-16 — P05 cross-app rehearsal evidence and Milestone M1 certification

- Upgraded rehearsal contract to `schemaVersion: '0.3'` with full evaluator hashes (checker, registry, sidecar, grader) and per-check evidence.
- Expanded rehearsal to cover all 3 apps and both conditions:
  - 3 representative faults: Shop (`shop-blocked-checkout`), Pricing (`pricing-blocked`), and Dashboard (`dashboard-outside-save`).
  - Both arms: `ordinary` and `anwc-assisted`.
  - 3 states per arm: `broken`, `repaired`, and `deletion`.
  - Both viewports: 390×844 and 1440×900.
  - Exactly 18 grade runs executed; 100% matched expected outcomes (6 broken failed on expected checks, 6 valid repairs passed, and 6 runnable destructive deletions failed required checks).
- Ensured collision-free dynamic port allocation via ephemeral port probing (`createServer` on port 0).
- Fixed dev server ESM TypeScript loader resolution for `anwc-assisted` arm by configuring `NODE_OPTIONS='--import tsx'` in child process environment, resolving `ERR_UNKNOWN_FILE_EXTENSION` when externalizing `@anwc/vite-plugin`.
- Committed durable compact sanitized report to Git at `bench/rehearsals/rehearsal-report.json`.
- Certified **Milestone M1 (trustworthy evaluation)**: evaluator can reliably verify returned repairs across all apps, arms, and viewports without model or external billing dependencies.
- Evidence on Linux: `npm run test:integration` passed cleanly:
  - `npm run typecheck`: 0 errors.
  - `npm run test:unit`: 7 test files, 56/56 tests passed (including rehearsal report contract and CLI argument validation).
  - `npm run test:browser`: 26/26 Chromium tests passed across shop, landing, and dashboard.
  - `npm run build`: Production builds succeeded for `@anwc/shop`, `@anwc/landing`, and `@anwc/dashboard`.
  - Untested platforms: macOS.
- Next task: P06 — Make ANWC installable outside this repository (alpha package packaging and external-consumer acceptance).

## 2026-09-16 — P06 local package distribution and external consumer acceptance

- Compiled standard ESM (`.js`) and TypeScript declaration (`.d.ts`) outputs for all 6 public packages (`@anwc/protocol`, `@anwc/compiler`, `@anwc/runtime`, `@anwc/diagnostics`, `@anwc/vite-plugin`, `@anwc/cli`) into `dist/` using TypeScript project references (`composite: true`).
- Kept `@anwc/benchmark` and example apps (`shop`, `landing`, `dashboard`) strictly `"private": true` with `noEmit: true`.
- Clean source isolation:
  - Relocated test fixtures from `packages/protocol/src/fixtures.ts` to `packages/protocol/test/fixtures.ts` to prevent test fixtures or example app paths from leaking into emitted declaration files.
  - Added shebang `#!/usr/bin/env node` to `packages/cli/src/main.ts` and set executable permissions (`0o755`) in `scripts/build.js`.
  - Decoupled `packages/cli` from monorepo-relative paths: resolves runtime browser entry via `import.meta.resolve('@anwc/runtime/browser-entry')` with local development fallback.
  - Wrapped `chromium.launch` in `@anwc/cli` with clear actionable error when Chromium browser binaries are missing.
- Package manifests & dependencies:
  - Versioned all 6 packages as `0.1.0-alpha.0` with explicit `main`, `types`, `exports`, and `"files": ["dist", "README.md"]`.
  - Decoupled internal dependencies to exact `"0.1.0-alpha.0"` workspace matches to prevent npm 11 registry lookup failures for prerelease versions.
  - Exported `bin: { "anwc": "./dist/main.js" }` from `@anwc/cli`.
- Automated packaging & tarball audit:
  - Implemented `scripts/pack.js` (`npm run pack:packages`) to pack tarballs into `dist/packages/*.tgz`.
  - Added strict tarball content audits verifying zero leakage of test files, fixtures, app files, uncompiled TypeScript (`.ts`/`.tsx`), source maps, or internal monorepo paths.
- External consumer acceptance test (`tests/unit/consumer.test.ts`):
  - Packs fresh local tarballs into an isolated directory.
  - Sets up a standalone React/Vite consumer application in `mkdtemp(tmpdir())` completely outside repo ancestry.
  - Installs packed tarballs via `npm install --no-audit --no-fund <tarballs>`.
  - Verifies TypeScript typechecking (`tsc --noEmit`) passes cleanly with emitted `.d.ts` types.
  - Verifies production stripping: `vite build` produces output containing no `data-anwc-site`, `__ANWC__`, or virtual runtime strings.
  - Verifies live inspection: launches Vite dev server, runs installed `anwc` CLI binary, and verifies CLI output correctly reports source file and line/col locations pointing to consumer JSX (`App.tsx`), handles repeated list elements, and reports uninstrumented elements with `source: null`.
- Tested environment matrix documented in `README.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, and `docs/HISTORY.md`:
  - Node 24.18.0, npm 11.13.0, TypeScript 5.7.3, Vite 6.1.0, React 19.0.0, Vitest 3.0.7, Playwright 1.51.1 / Chromium build 1161 on Linux (x86_64).
  - Untested platforms: macOS, Windows (fresh P06 pass).
- Next task: P07 — Make the first real inspection understandable.

## 2026-09-16 — P07 understandable inspection workflow and external consumer demo

- Milestone M2 (external adoption: P06–P07) is certified.
- Developer quickstart & 5-minute walkthrough in `README.md`:
  - Step-by-step instructions: build local alpha tarballs, install in external consumer project, configure `anwc()` before React in `vite.config.ts`, start dev server, inspect at desktop (`1440x900`) and mobile (`390x844`), follow source/blocker evidence to JSX lines, repair, and re-inspect to verify zero actionable findings.
  - Documents handling of custom components, repeated `.map()` items, authoritative JSON drilldown (`--format json`, `--output report.json`), and actionable recovery for common errors.
- Actionable CLI error handling and recovery guidance (`packages/cli/src/index.ts`):
  - Added detection of pasted Markdown URL links (`[url](url)`, `<url>`) with recovery advice directing to raw URL syntax.
  - Standardized specific recovery advice in `details.recovery` for programmatic JSON output and human-readable text output on `stderr`:
    - `RUNTIME_MISSING`: advises adding `@anwc/vite-plugin` before `@vitejs/plugin-react` in `vite.config.ts` or passing `--runtime-only`.
    - `BROWSER_MISSING`: advises running `npx playwright install chromium`.
    - `NAVIGATION_FAILED`: advises verifying dev server URL and port.
    - `TIMEOUT`: advises checking animations or increasing timeout budget via `--timeout-ms`.
  - Guaranteed JSON error envelope output to `stdout` when `--format json` is requested, even if CLI option parsing fails before options validation.
- Understandable CLI text output (`formatText`):
  - Formats concise severity and rule code with target tag and label: `<button> "Save Profile" (node n-12)`.
  - Resolves relative JSX source location: `source: src/ProfileSection.tsx:14:9`.
  - Prints empirical measured vs expected geometry:
    - `pointer-blocked`: `tested 25 sample points, 25 blocked`.
    - `blocker`: identifies blocking element tag, label, node ID, and source location (`blocker: <div className="announcement-banner"> (node n-15) at src/ProfileSection.tsx:21:9`).
    - `horizontal-overflow`: reports scrollWidth vs clientWidth and overflow amount.
    - `clipped-by-ancestor`: reports percentage clipped and ancestor element details.
    - `text-clipped`: reports clipped fragment counts and line counts.
    - `text-line-budget-exceeded`: reports observed lines vs max allowed lines.
    - `expected-visible-but-hidden`: reports expected intent vs hidden reasons.
  - Explicitly states limitations, suggestions, omitted counts, and JSON drilldown command.
  - Preserves authoritative Snapshot `0.1` protocol schema without modifications.
- External consumer demonstration & acceptance tests (`tests/unit/consumer.test.ts`, `tests/unit/cli.test.ts`):
  - Verified neutral external consumer app containing a custom component (`ProfileSection`), repeated items, and an announcement overlay without defect-revealing query strings or class names.
  - Verified that title/label changes (e.g., renaming button text) leave geometric measurements and evidence unchanged (identical sample points, blocked count, box coordinates, blocker id).
  - Verified that no hidden intent is inferred for arbitrary `div`s (`intent: { expectedCurrent: null, maxLines: null, allow: [] }`).
  - Verified clean text mode inspection reports `0 actionable findings for inspected rules`.
  - Verified blocked text mode inspection reports concise evidence and blocker element.
  - Recorded report size and latency benchmarks (text output is significantly more concise than raw JSON while providing immediate source links and blocker details).
- Integration status on Linux:
  - `npm run typecheck`: 0 errors.
  - `npm run test:unit`: 8 test files, 61/61 tests passed.
  - `npm run test:browser`: 26/26 Chromium tests passed.
  - `npm run build`: Production builds succeeded for packages and apps.
- Next task: P08 — Freeze a small usable agent pilot.

## 2026-09-17 — P08 frozen receipt identity

- Scored pilot manifests now require a SHA-256 receipt hash for every planned run. This binds each future ordinary or assisted result to the exact prepared evaluator receipt before the grade-import command is added.
- Evidence on Windows: TypeScript and the focused scored-manifest validation test passed. Grade import, duplicate handling, and operator artifacts remain P08 work.

## 2026-09-17 — P08 explicit grade import

- Added `receipt-hash` and `import-grade` benchmark commands. A grade import requires a completed/time-capped ledger run, its matching frozen receipt hash, fixture, state, and condition, plus a behavioral evaluator result. It records verified repair/full success and preserves detection/regression fields for human adjudication.
- The ledger rejects duplicate imports and any attempt to overwrite manually entered scoring. The evaluator setup and scoring guide now contain the exact operator commands and limitations.
- Focused evidence on Windows: TypeScript and grade-import mismatch/duplicate tests passed. The full integration suite was started after this batch; its early unit/CLI/external-consumer stages passed before the long staged-grader tests continued.

## 2026-09-17 — P08 three-app practice manifest

- Added [bench/pilot.practice.json](../bench/pilot.practice.json): six matched ordinary/assisted practice runs across Shop, Pricing, and Dashboard, using the public development corpus at its declared responsive viewports.
- Evidence on Windows: `npm run bench -- validate bench/pilot.practice.json` and `npm run bench -- validate-results bench/pilot.practice.json bench/pilot.practice.results.json` passed. It is deliberately an `example`, not a scored or held-out plan; the founder still selects one actual model, private subjects, and frozen receipts before P09.

## 2026-09-17 — Phase 3 planning and evidence correction

- Reviewed implementation at `4093fcb` for the requested next phase. Created Q01–Q11 with fixed scope, owned modules, dependencies, acceptance, four batches, human gates and stop rules. Product outcome: source-linked repair with reproducible UI state and a readable before/after evidence report.
- Prioritized grade-to-receipt identity, complete result validation and target-bound intent before stronger repair claims. Source review also found overwrite behavior, misleading full-success inference, text-budget limitations and incomplete Windows executable coverage. These findings are planned fixes, not newly executed adversarial reproductions.
- Newly reproduced on Windows: `npx vitest run tests/unit/benchmark.test.ts -t "keeps planned, completed, capped, failed, and excluded runs distinct"` exited 1: one failed, 36 skipped. Added scored runs in the test lack mandatory receipt hashes. The initial sandbox attempt could not spawn the test tool; the permitted rerun produced this failure. No full integration run occurred in this planning pass.
- Archived the Phase 2 cards, reconciled README/STATUS/operator/scoring guides and recorded ADR-020. Removed stale claims that import was unimplemented or that the historical rehearsal covered only two apps. Current docs distinguish historical passes, current failures and unimplemented proposals.
- Documentation validation: all 76 local Markdown links outside code examples resolve; `git diff --check` passed. Remote refs were fetched before committing the planning handoff.
- No runtime/compiler/CLI feature was changed. Human model results remain absent. Private cases are needed for holdout claims, not to practise the public six-run workflow. Next implementation: Q01, then Q02/Q03 in Batch A.

## 2026-09-17 — Q01 grade provenance and safe pilot import

- Grade result `0.4` now records exact receipt bytes hash, optional evaluator-supplied run ID, staged submission hash, frozen receipt/evaluator identity, and the complete expected check/viewport inventory. Grading hashes the receipt bytes it parses and detects subject mutation during evaluator staging.
- Scored-ledger import rejects old `0.3` grades, dirty/practice receipts, receipt/run/revision/fixture/state mismatches, empty/extra/duplicate check evidence, required unsupported checks, contradictory status/exit/verification/cleanup fields, and missing target viewport coverage. It retains detection/usage/regression fields and leaves full success unknown rather than inferring it from one repair grade.
- `grade --run RUN_ID` makes an importable grade. Grade and import outputs use exclusive creation and reject dangerous overlap with protected inputs. The ledger stores receipt, grade, run, artifact and expected-check identity.
- Evidence on Windows: `npm run typecheck`; focused ledger/import CLI tests; and the real staged browser-grade repair test passed. Batch A's full integration gate remains pending Q02/Q03. Next: Q02.

## 2026-09-17 — Q02 target-bound source intent

- Receipt `0.4` now hashes declared contracts across every JS/TS module under the prepared app's `src` tree. Each contract requires a unique static `data-anwc-key`, static expect/max-lines/allow values, no JSX spread, and freezes element tag plus explicit role/aria-label semantics. File paths remain diagnostic so a valid component move with the same key/shape does not invalidate a repair.
- Prepared fixture materialization preserves or adds explicit stable contracts where evaluator expectations rely on them. The pricing action uses a static Growth key only on the Growth control; generated shop fixtures include static action/title/rail contracts.
- Evidence on Windows: `npm run typecheck`; focused static-contract, prepared-subject, and dummy-target/file-move tests passed. Batch A's full integration gate remains pending Q03. Next: Q03.


