# ANWC status

Updated 2026-09-17. Phase 3 is underway: Q01 closes grade provenance, Q02 binds source expectations to stable targets across modules, and Q03 introduces the unified report model for humans and agents. Batch A exit gates have passed. **Next task: Q04, readable local reports and evidence navigation (offline HTML/Markdown renderers).**

## What works today

ANWC is a development-only React/Vite inspection prototype. Its compiler adds source identity; its browser collector measures layout, clipping, text and sampled pointer access. The CLI provides JSON and readable text. Local alpha packages and an external consumer test exist. Chromium still performs layout; pointer access does not prove paint visibility.

The evaluator has 18 public broken/healthy pairs across shop, pricing and dashboard apps, isolated subject preparation, versioned receipts, staged grading, a committed cross-app rehearsal, practice plan/ledger templates, and grade import. These are useful engineering foundations. They do not yet establish a trustworthy end-to-end scored pilot or measured agent benefit.

## Evidence and current limits

| Area | Existing evidence | Remaining acceptance |
| --- | --- | --- |
| Installed React/Vite path | ESM/declaration packages, local `0.1.0-alpha.0` tarballs, source linkage, production stripping, external consumer tests | Q10 validates the actual installed executable on Windows/Linux and the new complete workflow; macOS untested |
| Public fixture corpus | 10 shop, 4 pricing, 4 dashboard pairs; independent browser checks and target-specific detector tests | Public practice, not holdout; Q05 adds a separate paired conformance corpus |
| Preparation and grade | Receipt contract `0.4`; grade result `0.4` provenance, target-bound intent across every app `src` module, immutable/evaluator hashes, fresh staging and bounded server/check execution | Batch A complete; verified on Windows |
| Shared report model | `packages/report` pure transformation module, Report 0.1 schema, SHA-256 capture hashing, structural character budgets, deterministic unack error->warning->info ordering | Q04 offline HTML/Markdown reports |
| Rehearsal | Committed report: 18 grades, three apps, two conditions, broken/repaired/deletion states, two viewports each | Historical evidence at its recorded revisions, not a fresh gate for current HEAD |
| Pilot ledger | Practice templates, receipt-hash command and provenance-bound `import-grade` | Q01 rejects substitution, incomplete evidence and unsafe output paths; Q11 finishes operator handoff and human results remain pending |
| Everyday repair | Single-state JSON/text inspection and source-linked findings; Report 0.1 | Q04–Q09 add HTML/Markdown, explicit state replay, conservative comparisons, conformance-driven fixes and compact drill-down |
| Agent benefit | No real paired results recorded | Human sessions remain pending; no time/cost/success-rate claim |
| Arbitrary sites | Experimental `--runtime-only` injection | Supported scope still requires installed runtime; R02–R06 remain deferred |

**Latest verification, 2026-09-17:** Q01 repaired the reproduced ledger regression: TypeScript, the ledger/import CLI tests, and a real staged browser-grade test passed on Windows. Grade result `0.4` requires exact receipt, run, staged-submission, evaluator and expected-check provenance for scored-ledger import.
Q02 requires each benchmark contract to carry a unique static author key and preserves its tag/explicit semantic attributes across every `src` module.
Q03 implemented the unified `Report 0.1` model in `packages/report`, with SHA-256 capture hashing, structural character budgets, and deterministic grouping. All 39 benchmark unit tests, report unit tests, CLI tests, and external consumer tests passed on Windows. Batch A exit gate passed.

Historical results in [HISTORY](HISTORY.md) include Windows evaluator checks and a Linux integration pass (61 unit tests, 26 browser tests, three production builds). The committed [rehearsal report](../bench/rehearsals/rehearsal-report.json) records six broken failures, six repaired passes, and six deletion failures. Preserve those results with their revisions; do not represent them as a current pass.

## How to continue

Use the Q cards and dependency/batch table in ROADMAP. Batch A is Q01–Q03: result integrity, target-bound intent, and one shared report model. Q01/Q02 are committed; run relevant focused checks as needed and the full integration gate once at the Batch A boundary. Record final exit codes, failures and limitations before pushing. Do not mark a task complete because its command started or a process disappeared.

Routine implementation choices are fixed in the roadmap. Human input is needed for actual model sessions, paid execution or a scope change; engineering work need not wait for those sessions. Phase 3 stops at a usable, validated kit and pending human evidence instead of inventing another feature backlog.

## Run the existing demo

From the repository root:

```powershell
npm install
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 4175
```

In another terminal:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format json
```

The root storefront is healthy; the lab deliberately reveals a seeded fault. Use plain URLs, not Markdown link syntax. HTML reports, `check` state replay and `diff` commands in the roadmap are proposals, not available commands yet.

## Document map

| Need | Read |
| --- | --- |
| Sole active backlog and implementation briefs | [ROADMAP](ROADMAP.md) |
| Human demo and small pilot procedure | [TESTING](TESTING.md) |
| Existing preparation, grade and import commands | [EVALUATOR_SETUP](EVALUATOR_SETUP.md) |
| Scoring policy and interpretation | [BENCHMARK](BENCHMARK.md) |
| Current snapshot/CLI contract | [PROTOCOL](PROTOCOL.md) |
| Deferred arbitrary-site inspector | [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md) |
| Evidence and decisions | [HISTORY](HISTORY.md), [DECISIONS](DECISIONS.md) |
| Historical cards/architecture | [Phase 2](archive/PHASE_2.md), [W rollout](archive/W_ROLLOUT.md), [TASKS](TASKS.md), [PLAN](PLAN.md) |
