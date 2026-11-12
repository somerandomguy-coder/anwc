# Testing ANWC

Updated 2026-11-12. For a short demonstration, start with [LAUNCH](LAUNCH.md). [STATUS](STATUS.md) records current evidence; [ROADMAP](ROADMAP.md) holds the finished Phase 3 cards and [PHASE_4](PHASE_4.md) the proposed next ones. Inspection demos, single-file HTML/Markdown reports and evaluator grading work. State replay (`check`) and comparison (`diff`) exist but have acceptance gaps: CLI diff cannot certify repairs without behavior-evidence binding. Q11 adds the **Operator Kit and Synthetic Six-Run Practice Harness**. This guide covers practice and eventual agent evaluation, not proof of measured agent benefit.

## 1. Verify and start the shop

From the evaluator repository:

```powershell
git pull --ff-only
npm install
npm run build
npx playwright install chromium
npm run test:unit
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

Use 390×844 and 1440×900. Reset the page between cases and record any setup/scroll. Presence of a button alone is not proof of the intended failure; the independent browser checks exercise behavior and target geometry.

## 3. Try an editable isolated subject

Follow [EVALUATOR_SETUP](EVALUATOR_SETUP.md), which owns the current export, startup, grading and rehearsal command sequence. Give the agent its exported folder plus URL. Do not give it an ANWC clone, enclosing evaluator directory, grader definitions, earlier answers, receipt, or other condition's patch.

Treat public cases as development practice. Neutral briefs, immutable/evaluator hashes and intent-value checks exist, but public source variants can retain fault hints. Freeze app/detector/fixture/task/grader/settings per pair.

## 4. Six-run pilot operator kit (Q11)

Q11 provides the complete start-to-finish pilot procedure: **one exact model, three cases spanning three apps, two conditions = six runs**.

### Scaffolding practice artifacts
```powershell
npm run bench -- practice-setup --out bench/practice
```

This generates `practice-plan.json`, `practice-results.json`, `neutral-briefs.json`, and `OPERATOR_RUNBOOK.md`.

### Run sequence and ports
Execute sessions in the pre-registered counterbalanced order with unique ports:
1. `shop-ordinary`: port 4301, mobile 390×844 (`shop-blocked-checkout`)
2. `shop-assisted`: port 4302, mobile 390×844 (`shop-blocked-checkout`)
3. `pricing-assisted`: port 4303, desktop 1440×900 (`pricing-blocked`)
4. `pricing-ordinary`: port 4304, desktop 1440×900 (`pricing-blocked`)
5. `dashboard-ordinary`: port 4305, mobile 390×844 (`dashboard-outside-save`)
6. `dashboard-assisted`: port 4306, mobile 390×844 (`dashboard-outside-save`)

### Neutral task briefs
Give each agent only the neutral brief matching its subject:
- **Shop:** "The mobile web shop allows users to open their cart and complete checkout. Inspect the checkout flow at viewport 390x844. Ensure the customer can proceed from viewing cart items to confirming checkout cleanly without UI obstructions or interactive errors." (Hash: `ff7964d14f4d96cc569a27e9718fe6651844f539e56b17ed0a9f63700226e8d4`)
- **Pricing:** "The desktop pricing page displays available plan tiers and pricing information. Inspect the plan selection experience at viewport 1440x900. Ensure users can inspect and select the Growth plan cleanly without obstructed controls or hidden options." (Hash: `ad2c2c2f203653743adf4db526f22dfe5721af50c230c5daa5ab884d60964e86`)
- **Dashboard:** "The mobile dashboard allows users to manage workspace tasks. Inspect the task editing experience at viewport 390x844. Ensure users can open task details, make updates, and save changes cleanly without critical controls clipped or placed outside the viewport." (Hash: `e5618ebc79b1cb50a767e75eb59b75d5b889a554324c097c208442e9a8b08466`)

### Synthetic tooling dry-run
Test the full evaluation and grade import lifecycle headlessly with synthetic submissions:
```powershell
npm run bench -- practice-dryrun --out bench/practice --fast
```
Produces `synthetic-practice-report.json`, `synthetic-practice-report.md`, and `practice-results.imported.json`.

## 5. Ledger commands

```powershell
npm run bench -- validate bench/practice/practice-plan.json
npm run bench -- runbook bench/practice/practice-plan.json --output artifacts/benchmark/runbook.md
npm run bench -- validate-results bench/practice/practice-plan.json bench/practice/practice-results.json
npm run bench -- summarize bench/practice/practice-plan.json bench/practice/practice-results.json --output artifacts/benchmark/summary.md
```

Grade import binds exact receipt and run provenance, rejects tampered receipts, requires a new output path, and preserves unrelated rows. Full success remains null until regressions are adjudicated.

Read [BENCHMARK](BENCHMARK.md) before interpreting any result. Geometry and pointer samples do not prove paint visibility; masks, transforms, canvas and unsupported subtrees need explicit limits.
