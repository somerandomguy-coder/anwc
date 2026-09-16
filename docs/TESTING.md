# Testing ANWC

Updated 2026-09-16. Start with [STATUS](STATUS.md) for current evidence and [ROADMAP](ROADMAP.md) for the next tasks. Manual demos and the automatic grader are usable now; M1's cross-app rehearsal is certified. P08 is the remaining pilot-kit work before human model runs.

## 1. Verify and start the shop

From the evaluator repository:

```powershell
git pull --ff-only
npm install
npx playwright install chromium
npm run test:integration
npm run dev -- --host 127.0.0.1 --port 4175
```

In another terminal:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format text
```

Open the second URL in a browser and try Checkout. Compare with the same URL plus `&variant=healthy`; the healthy control should accept the action. Inspect both and follow the reported source location/blocker. A source-editing agent can fix a copy of the app; a URL-only agent can only inspect.

The shop's clean routes are /, /catalog, /checkout and /account. Its public lab has ten cases:

| Case | Target evidence |
| --- | --- |
| horizontal-overflow | HORIZONTAL_OVERFLOW |
| ancestor-clip, nested-clip | CLIPPED_BY_ANCESTOR |
| line-budget | TEXT_LINE_BUDGET_EXCEEDED |
| text-clipped | TEXT_CLIPPED |
| hidden-checkout, opacity-checkout | EXPECTED_VISIBLE_BUT_HIDDEN |
| blocked-checkout | POINTER_BLOCKED_AT_SAMPLES |
| partial-checkout | POINTER_PARTIALLY_BLOCKED |
| outside-viewport | OUTSIDE_VIEWPORT |

These URLs/source labels disclose the defects. Use them to learn the tool, never to claim a blinded test. Existing seeded-defect tests expect the broken fixture to remain broken; they are not a returned-repair grader.

## 2. Try the other app shapes

Use separate terminals:

```powershell
npm run dev --workspace=@anwc/landing -- --host 127.0.0.1 --port 4176
npm run dev --workspace=@anwc/dashboard -- --host 127.0.0.1 --port 4177
```

- Pricing: `http://127.0.0.1:4176/?case=blocked-selection&variant=broken`; choose Growth, then compare `variant=healthy`.
- Dashboard: `http://127.0.0.1:4177/?case=outside-save&variant=broken`; compare Save placement with `variant=healthy`, and try Tasks, Open task drawer, Owner and Save.
- Landing cases: title-overflow, description-crop, blocked-selection, hidden-selection.
- Dashboard cases: clipped-save, long-title, blocked-input, outside-save.

Use 390×844 and 1440×900. Reset the page between cases and record any setup/scroll. Presence of a button alone is not proof of the intended failure; P01/P02 add stronger independent checks for these newer apps.

## 3. Try an editable isolated subject

Follow [EVALUATOR_SETUP](EVALUATOR_SETUP.md), which owns the current export, startup, grading and rehearsal command sequence. Give the agent its exported folder plus URL. Do not give it an ANWC clone, enclosing evaluator directory, grader definitions, earlier answers, receipt, or other condition's patch.

Current exports/grades are practice-only: prompts/source reveal fault hints, source intent is not frozen, provenance is not verified, and full independent acceptance is incomplete. You may learn from them now; do not spend a large comparison budget assuming those gaps are solved.

## 4. Planned small pilot

After P01–P08, start with **one exact model, three cases spanning three apps, two conditions = six runs**. Keep high thinking if available, matching the founder's preference; no ultra or automatic paid execution. Record the exact provider label/settings actually used, rather than assuming a named version exists.

A: normal source, shell/build, browser DOM/Playwright and screenshots. B: identical inputs and normal tools plus ANWC. Both get the same neutral task, viewport/setup and initial 20-minute cap. Fresh sessions and storage for each run; counterbalance condition order. Keep screenshot usage, interventions, patches and transcripts.

Grade independently and record verified repairs/regressions, wall time, observed input/cache/output tokens and cost. Unknown billing is null/NA. Include ANWC tool/report context cost. A shorter report alone is not a successful repair.

Use the first six runs to find workflow problems. Expand models/repetitions only after the kit works and the founder chooses a budget. Public cases remain unblinded; private independently authored material is needed for holdout claims.

## 5. Existing ledger commands

Copy the examples outside subject access and replace placeholders before recording actual runs:

```powershell
npm run bench -- validate PATH_TO_PLAN.json
npm run bench -- runbook PATH_TO_PLAN.json --output artifacts/benchmark/runbook.md
npm run bench -- validate-results PATH_TO_PLAN.json PATH_TO_RESULTS.json
npm run bench -- summarize PATH_TO_PLAN.json PATH_TO_RESULTS.json --output artifacts/benchmark/summary.md
```

The ledger is separate from the grader. P08 plans explicit grade import; until then evaluator entries are manual. It preserves planned, completed, capped, infrastructure-failed and excluded rows. Do not copy repair check outcomes into detection precision/recall.

Read [BENCHMARK](BENCHMARK.md) before interpreting any result. Geometry and pointer samples do not prove paint visibility; masks, transforms, canvas and unsupported subtrees need explicit limits.
