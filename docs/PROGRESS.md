# Shared progress and handoff

Last updated: 2026-09-15, Australia/Sydney.

**Current state: the MVP integration candidate is frozen. Workspace, protocol, compiler, Vite integration, browser capture, geometry/text observations, diagnostics, CLI, multi-page public fixture lab, and defect shop are verified. T10's reproducible pilot tooling and isolated subject exports are ready; the actual paired-agent experiment remains unrun. Implementation 10/11 tasks complete. Begin the next session with [TOMORROW](TOMORROW.md).**

SSH access to `git@github.com:somerandomguy-coder/anwc.git` was verified and the supplied sample snippets were reviewed as design inputs. The repository now contains a source-linked Vite/React MVP with a browser collector, CLI, and deterministic defect shop. T10 is the remaining paired-agent experiment.

## Current deliverables

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
| Decision record | done | [DECISIONS](DECISIONS.md) |
| Workspace/toolchain (T00) | done | npm workspaces, Vite/React shell, TypeScript/Vitest/Playwright checks |
| Compiler/runtime/demo | done | T02–T08, verified by typecheck, unit, Chromium, build, and CLI checks |
| Actual benchmark/cost results | not started | No results claimed |
| Publish completed tasks to GitHub | done | `main` includes T00–T09 commits |

## Status vocabulary

`ready`: dependencies complete and task can be claimed. `queued`: waiting on a dependency. `in progress`: one named owner currently working. `blocked`: exact missing input/interface recorded. `review`: implementation and evidence ready for another collaborator. `done`: acceptance checks passed and reviewer acknowledged them.

Names below are proposed roles, not assignments: **Builder A** handles toolchain/compiler/integration; **Builder B** handles capture/demo. Either person can take either role. Do not assign an absent friend work without agreement.

## Task board

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

## Tonight's gates

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

1. Copy and complete the public pilot manifest, validate it, and generate the evaluator runbook before agent runs begin.
2. Materialize hidden fixtures outside the subject checkout, then run T10 as a paired-agent evaluation using the frozen protocol.
3. Keep evaluation answers isolated from the repair agent and record timing/cost separately from quality.

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
- Unsupported cases or remaining failures: this helper neither materializes hidden fixtures nor launches agents, grades repairs, infers provider usage, or enforces host-level filesystem/network isolation. It does not create subject folders; those actions must be performed by the evaluator before the first scored run.
- Next task now unblocked: complete a scored manifest outside the subject workspace, materialize evaluator fixtures, then run and score paired A/B sessions.
- Reviewer and review outcome: self-reviewed; tests cover a fair pair plus incomplete/mismatched pair rejection.
