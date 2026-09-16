# ANWC status

Updated 2026-09-17. Phase 3 is planned in [ROADMAP](ROADMAP.md): a dependable UI repair workflow. **Next task: Q01, bind grades to their actual preparation and repair ledger semantics.** No Q tasks have been implemented by this planning update.

## What works today

ANWC is a development-only React/Vite inspection prototype. Its compiler adds source identity; its browser collector measures layout, clipping, text and sampled pointer access. The CLI provides JSON and readable text. Local alpha packages and an external consumer test exist. Chromium still performs layout; pointer access does not prove paint visibility.

The evaluator has 18 public broken/healthy pairs across shop, pricing and dashboard apps, isolated subject preparation, versioned receipts, staged grading, a committed cross-app rehearsal, practice plan/ledger templates, and grade import. These are useful engineering foundations. They do not yet establish a trustworthy end-to-end scored pilot or measured agent benefit.

## Evidence and current limits

| Area | Existing evidence | Remaining acceptance |
| --- | --- | --- |
| Installed React/Vite path | ESM/declaration packages, local `0.1.0-alpha.0` tarballs, source linkage, production stripping, external consumer tests | Q10 validates the actual installed executable on Windows/Linux and the new complete workflow; macOS untested |
| Public fixture corpus | 10 shop, 4 pricing, 4 dashboard pairs; independent browser checks and target-specific detector tests | Public practice, not holdout; Q05 adds a separate paired conformance corpus |
| Preparation and grade | Contract `0.3`, immutable/evaluator hashes, intent-value checks, fresh staging and bounded server/check execution | Q01 binds grade identity and validates result semantics; Q02 binds intent to targets across modules |
| Rehearsal | Committed report: 18 grades, three apps, two conditions, broken/repaired/deletion states, two viewports each | Historical evidence at its recorded revisions, not a fresh gate for current HEAD |
| Pilot ledger | Practice templates, receipt-hash command and `import-grade` implemented | Grade substitution, empty/contradictory checks, inferred full success and overwrite risks need Q01; Q11 finishes operator handoff |
| Everyday repair | Single-state JSON/text inspection and source-linked findings | Q03–Q09 add shared reports, HTML/Markdown, explicit state replay, conservative comparisons, conformance-driven fixes and compact drill-down |
| Agent benefit | No real paired results recorded | Human sessions remain pending; no time/cost/success-rate claim |
| Arbitrary sites | Experimental `--runtime-only` injection | Supported scope still requires installed runtime; R02–R06 remain deferred |

**Latest verification, 2026-09-17:** at `4093fcb`, `npx vitest run tests/unit/benchmark.test.ts -t "keeps planned, completed, capped, failed, and excluded runs distinct"` failed (1 failed, 36 skipped). The test's added scored runs omit the now-required `receiptHash`. This is a reproduced integration regression, not evidence that the browser collector is broken. No full integration suite was run during this docs-only planning pass.

The other Q01/Q02 gaps are source-review findings, not newly executed adversarial tests. In particular, import checks the supplied receipt against the plan but the grade contains no receipt identity, and current intent checks cover values in `main.tsx` without binding them to intended targets. ROADMAP records exact acceptance work. Earlier blanket M1/M2 certification and “only human testing remains” wording is superseded by this assessment.

Historical results in [HISTORY](HISTORY.md) include Windows evaluator checks and a Linux integration pass (61 unit tests, 26 browser tests, three production builds). The committed [rehearsal report](../bench/rehearsals/rehearsal-report.json) records six broken failures, six repaired passes, and six deletion failures. Preserve those results with their revisions; do not represent them as a current pass.

## How to continue

Use the Q cards and dependency/batch table in ROADMAP. Batch A is Q01–Q03: result integrity, target-bound intent, and one shared report model. Commit each completed card; run relevant focused checks as needed and the full integration gate once at a coherent batch boundary. Record final exit codes, failures and limitations before pushing. Do not mark a task complete because its command started or a process disappeared.

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
