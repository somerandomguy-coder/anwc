# ANWC three-app matched practice pilot runbook

> **Example only.** Copy this plan, set `kind` to `scored`, replace placeholder agent/prompt data, and freeze the evaluator corpus before running it.

- App commit: `ae8c58c75ee7bacef97b72f16077ac08c3d4f022`
- Detector commit: `ae8c58c75ee7bacef97b72f16077ac08c3d4f022`
- Browser: Chromium
- Node / package manager: v24.18.0 / npm
- Agent: replace-before-scored-run / replace-before-scored-run / replace-before-scored-run
- Budget: 20 minutes; token limit provider/default
- Prompt ID: ui-repair-v1

## Paired runs

| Pair | Condition | Fixture | Replicate | Viewport | State | Subject URL |
| --- | --- | --- | --- | --- | --- | --- |
| shop | ordinary | shop-blocked-checkout | 1 | 390×844 | broken | http://127.0.0.1:4301/ |
| shop | anwc-assisted | shop-blocked-checkout | 1 | 390×844 | broken | http://127.0.0.1:4302/ |
| pricing | anwc-assisted | pricing-blocked | 1 | 1440×900 | broken | http://127.0.0.1:4303/ |
| pricing | ordinary | pricing-blocked | 1 | 1440×900 | broken | http://127.0.0.1:4304/ |
| dashboard | ordinary | dashboard-outside-save | 1 | 390×844 | broken | http://127.0.0.1:4305/ |
| dashboard | anwc-assisted | dashboard-outside-save | 1 | 390×844 | broken | http://127.0.0.1:4306/ |

## Evaluator checklist

1. Create a fresh subject checkout for each run from the app commit. Keep fixture truth, grader code, this runbook, and prior patches outside it.
2. Materialize the selected held-out fixture into that checkout; do not leave a public scenario switch or answer-bearing labels available to the subject agent.
3. Start fresh ordinary and assisted sessions. Give them identical source, viewport/state, prompt, time cap, and ordinary tools. Only the assisted session receives ANWC.
4. Save the patch, elapsed time, usage record, tool log, screenshots used, and any intervention outside the subject checkout. Record unavailable billing as `NA`.
5. Apply each patch to a clean evaluator checkout, run hidden repair/control checks, and record scoring before comparing conditions.

This runbook does not score repairs. Use the frozen evaluator truth and the policy in `docs/BENCHMARK.md`.

## Neutral Task Briefs (for Agents)

Give each agent only the neutral brief matching its subject below. Do not disclose the seeded defect name or detector code.

### Complete Mobile Checkout (`shop`, 390×844)

- Fixture: `shop-blocked-checkout`
- Task prompt hash: `ff7964d14f4d96cc569a27e9718fe6651844f539e56b17ed0a9f63700226e8d4`

> "The mobile web shop allows users to open their cart and complete checkout. Inspect the checkout flow at viewport 390x844. Ensure the customer can proceed from viewing cart items to confirming checkout cleanly without UI obstructions or interactive errors."

### Desktop Plan Selection (`pricing`, 1440×900)

- Fixture: `pricing-blocked`
- Task prompt hash: `ad2c2c2f203653743adf4db526f22dfe5721af50c230c5daa5ab884d60964e86`

> "The desktop pricing page displays available plan tiers and pricing information. Inspect the plan selection experience at viewport 1440x900. Ensure users can inspect and select the Growth plan cleanly without obstructed controls or hidden options."

### Save Task Changes (`dashboard`, 390×844)

- Fixture: `dashboard-outside-save`
- Task prompt hash: `e5618ebc79b1cb50a767e75eb59b75d5b889a554324c097c208442e9a8b08466`

> "The mobile dashboard allows users to manage workspace tasks. Inspect the task editing experience at viewport 390x844. Ensure users can open task details, make updates, and save changes cleanly without critical controls clipped or placed outside the viewport."


## Step-by-Step Operator Procedure

### Step 1: Prepare Isolated Subject Arms
From evaluator checkout root, prepare the 3 matched pairs with unique ports:
```powershell
$rev = git rev-parse HEAD
npm run bench -- prepare-pair . --fixture shop-blocked-checkout --out ..\pair-shop --source-revision $rev --detector-revision $rev --ordinary-port 4301 --assisted-port 4302
npm run bench -- prepare-pair . --fixture pricing-blocked --out ..\pair-pricing --source-revision $rev --detector-revision $rev --ordinary-port 4304 --assisted-port 4303
npm run bench -- prepare-pair . --fixture dashboard-outside-save --out ..\pair-dashboard --source-revision $rev --detector-revision $rev --ordinary-port 4305 --assisted-port 4306
```

### Step 2: Validate Pair Readiness
```powershell
npm run bench -- check-pair ..\pair-shop
npm run bench -- check-pair ..\pair-pricing
npm run bench -- check-pair ..\pair-dashboard
```

### Step 3: Run Agent Sessions in Counterbalanced Order
Execute runs in the specified order to balance learning effects:
1. `shop-ordinary`: port 4301, viewport 390×844
2. `shop-assisted`: port 4302, viewport 390×844
3. `pricing-assisted`: port 4303, viewport 1440×900
4. `pricing-ordinary`: port 4304, viewport 1440×900
5. `dashboard-ordinary`: port 4305, viewport 390×844
6. `dashboard-assisted`: port 4306, viewport 390×844

Give each agent only its assigned subject workspace and URL with the corresponding neutral brief.
Keep transcripts, git diff patches, and screenshots outside the subject directory.

### Step 4: Grade Returned Repairs
Run grading in fresh evaluator stages on unused ports (4311-4316):
```powershell
npm run bench -- grade --receipt ..\pair-shop\receipt.json --subject ..\pair-shop\ordinary --condition ordinary --port 4311 --run shop-ordinary --output ..\results\shop-ordinary-grade.json
```

### Step 5: Import Grades and Record Adjudication
```powershell
npm run bench -- import-grade practice-plan.json practice-results.json --run shop-ordinary --receipt ..\pair-shop\receipt.json --grade ..\results\shop-ordinary-grade.json --output practice-results.step1.json
```

### Step 6: Summarize Findings
```powershell
npm run bench -- summarize practice-plan.json practice-results.final.json --output practice-summary.md
```
