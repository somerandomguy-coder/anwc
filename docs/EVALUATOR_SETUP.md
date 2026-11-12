# Evaluator setup

Updated 2026-11-05. The evaluator uses receipt and grade result `0.4`, materialized subjects and fresh staging for grading. Q01/Q02 enforce grade identity, result validation, and target-bound intent. Q11 implements the complete **Operator Kit and Synthetic Six-Run Practice Harness** (`anwc-bench practice-setup` and `anwc-bench practice-dryrun`). Tooling acceptance is complete; human model sessions (P09) remain pending founder execution.

## Separate evaluator and agents

Keep three areas: the ANWC evaluator checkout, an ordinary subject folder, and an assisted subject folder. Only the evaluator sees fixture definitions, receipts, graders, reports, patches from other runs and Git history. Both agents get identical application inputs and ordinary browser/shell tools; assisted additionally gets ANWC.

An agent with only a URL cannot change application source. An ANWC clone exposes answers and history. Use a fresh exported folder plus its own development URL for a repair task. Folder layout alone is not an access-control boundary if the agent can browse its parent directories.

## Six-run operator kit (Q11)

Q11 provides an executable six-run setup using three public cases, neutral per-subject briefs, unique ports (4301–4306), and an explicit counterbalanced order: `ordinary → assisted`, `assisted → ordinary`, `ordinary → assisted`.

### Setup generation

Generate practice artifacts into a dedicated directory:

```powershell
npm run bench -- practice-setup --out bench/practice
```

This scaffolds:
1. `practice-plan.json`: Valid `BenchmarkPlan` (schema 0.1, kind: `example`) declaring the 6 runs across 3 pairs with exact ports and viewports.
2. `practice-results.json`: Valid `BenchmarkResults` ledger with all 6 runs initialized in `status: "planned"`.
3. `neutral-briefs.json`: Neutral task prompts with SHA-256 hashes for all 3 subjects.
4. `OPERATOR_RUNBOOK.md`: Procedural guide with copyable commands.

### Start-to-finish operator procedure

#### Step 1: Prepare isolated subject arms with unique ports
```powershell
$rev = git rev-parse HEAD
npm run bench -- prepare-pair . --fixture shop-blocked-checkout --out ..\pair-shop --source-revision $rev --detector-revision $rev --ordinary-port 4301 --assisted-port 4302
npm run bench -- prepare-pair . --fixture pricing-blocked --out ..\pair-pricing --source-revision $rev --detector-revision $rev --ordinary-port 4304 --assisted-port 4303
npm run bench -- prepare-pair . --fixture dashboard-outside-save --out ..\pair-dashboard --source-revision $rev --detector-revision $rev --ordinary-port 4305 --assisted-port 4306
```

#### Step 2: Validate readiness
```powershell
npm run bench -- check-pair ..\pair-shop
npm run bench -- check-pair ..\pair-pricing
npm run bench -- check-pair ..\pair-dashboard
```

#### Step 3: Session handover in counterbalanced order
Run sessions in the pre-registered counterbalanced order to minimize learning effects:
1. `shop-ordinary`: port 4301, mobile viewport 390×844
2. `shop-assisted`: port 4302, mobile viewport 390×844
3. `pricing-assisted`: port 4303, desktop viewport 1440×900
4. `pricing-ordinary`: port 4304, desktop viewport 1440×900
5. `dashboard-ordinary`: port 4305, mobile viewport 390×844
6. `dashboard-assisted`: port 4306, mobile viewport 390×844

**Handover rule:** Give each agent only its assigned subject directory and URL, paired with the corresponding neutral brief:
- **Shop:** "The mobile web shop allows users to open their cart and complete checkout. Inspect the checkout flow at viewport 390x844. Ensure the customer can proceed from viewing cart items to confirming checkout cleanly without UI obstructions or interactive errors." (Prompt hash: `ff7964d14f4d96cc569a27e9718fe6651844f539e56b17ed0a9f63700226e8d4`)
- **Pricing:** "The desktop pricing page displays available plan tiers and pricing information. Inspect the plan selection experience at viewport 1440x900. Ensure users can inspect and select the Growth plan cleanly without obstructed controls or hidden options." (Prompt hash: `ad2c2c2f203653743adf4db526f22dfe5721af50c230c5daa5ab884d60964e86`)
- **Dashboard:** "The mobile dashboard allows users to manage workspace tasks. Inspect the task editing experience at viewport 390x844. Ensure users can open task details, make updates, and save changes cleanly without critical controls clipped or placed outside the viewport." (Prompt hash: `e5618ebc79b1cb50a767e75eb59b75d5b889a554324c097c208442e9a8b08466`)

Keep transcripts, patches, screenshots, and token logs strictly outside the subject workspaces.

#### Step 4: Grade returned repairs
Grade each returned subject on an unused port (4311–4316) outside the subject:
```powershell
npm run bench -- grade --receipt ..\pair-shop\receipt.json --subject ..\pair-shop\ordinary --condition ordinary --port 4311 --run shop-ordinary --output ..\results\shop-ordinary.json
npm run bench -- grade --receipt ..\pair-shop\receipt.json --subject ..\pair-shop\assisted --condition anwc-assisted --port 4312 --run shop-assisted --output ..\results\shop-assisted.json
npm run bench -- grade --receipt ..\pair-pricing\receipt.json --subject ..\pair-pricing\assisted --condition anwc-assisted --port 4313 --run pricing-assisted --output ..\results\pricing-assisted.json
npm run bench -- grade --receipt ..\pair-pricing\receipt.json --subject ..\pair-pricing\ordinary --condition ordinary --port 4314 --run pricing-ordinary --output ..\results\pricing-ordinary.json
npm run bench -- grade --receipt ..\pair-dashboard\receipt.json --subject ..\pair-dashboard\ordinary --condition ordinary --port 4315 --run dashboard-ordinary --output ..\results\dashboard-ordinary.json
npm run bench -- grade --receipt ..\pair-dashboard\receipt.json --subject ..\pair-dashboard\assisted --condition anwc-assisted --port 4316 --run dashboard-assisted --output ..\results\dashboard-assisted.json
```

The grader verifies immutable files, intent hashes, stages the subject to a fresh temp directory, executes `npm ci --ignore-scripts`, starts Vite, and evaluates behavioral checks with Chromium.

#### Step 5: Import grades into the ledger
Import evaluator results with provenance binding:
```powershell
npm run bench -- import-grade bench\practice\practice-plan.json bench\practice\practice-results.json --run shop-ordinary --receipt ..\pair-shop\receipt.json --grade ..\results\shop-ordinary.json --output bench\practice\results.step1.json
```
Repeat for each completed run. Grade import verifies exact receipt and run provenance, rejects tampered receipts, requires a new output path, and preserves unrelated rows. Full success remains null until regressions are adjudicated.

#### Step 6: Summarize findings
```powershell
npm run bench -- summarize bench\practice\practice-plan.json bench\practice\results.final.json --output bench\practice\practice-summary.md
```

### Synthetic dry-run tool acceptance

To verify the entire tooling chain without calling LLMs, run the automated dry-run:

```powershell
npm run bench -- practice-dryrun --out bench/practice --fast
```

This executes all 6 runs with synthetic submissions (broken, CSS valid-repair, deletion, wrong-receipt), tests negative integrity gates, imports grades to the ledger, and outputs `bench/practice/synthetic-practice-report.json` and `bench/practice/synthetic-practice-report.md`.

## Existing rehearsal

```powershell
$anwcRehearsal = Join-Path (Split-Path (Get-Location).Path -Parent) ("anwc-rehearsal-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
npm run bench -- rehearse . --out "$anwcRehearsal" --source-revision "$anwcRevision" --detector-revision "$anwcRevision"
```

The committed rehearsal covers Shop, Pricing, and Dashboard in ordinary and ANWC-assisted conditions, for broken, repaired, and runnable deletion states at both required viewports: 18 grades in total. Its durable report is [bench/rehearsals/rehearsal-report.json](../bench/rehearsals/rehearsal-report.json). Do not reuse any rehearsal subject or patch as a fresh agent subject. Each grade uses its own clean evaluator stage.

## Manual overlay path

`package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` and `check-subject SUBJECT --condition ordinary|anwc-assisted` are older shop-default commands. The overlay materializes application files; the packager generates condition-specific configs afterward. Do not instruct operators to hand-author two different Vite overlays. Their leakage gate is advisory, not proof of clean installation, hidden answers, protected source intent, or OS isolation.

## Pilot decision gate

Phase 2 implemented the foundation, packaging and pilot helpers. Q01/Q02 added benchmark receipt/grade contract `0.4` and target-bound source intent; their presence alone does not certify the full scored workflow. Q11 delivered the operator kit and a synthetic six-run dry run (`practice-setup`, `practice-dryrun`). Founder choices for actual model providers, reasoning budgets and session execution remain pending. Freeze app/detector/fixture/task/grader/settings per pair and keep earlier outcomes bound to their original versions. Independently authored private variants are needed for holdout claims; public development cases remain public. Human results are still pending. See STATUS for current evidence and LAUNCH for the narrower launch demonstration.

See [TESTING](TESTING.md) for demo steps and [BENCHMARK](BENCHMARK.md) for scoring policy.
