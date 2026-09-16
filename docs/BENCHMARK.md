# ANWC benchmark policy

Updated 2026-09-17. No real paired-agent results or verified time/cost savings are recorded. Export, grade, rehearsal and pilot import exist, with trust gaps assigned to Q01/Q02 and operator handoff to Q11 in [ROADMAP](ROADMAP.md). [STATUS](STATUS.md) owns current test evidence; [EVALUATOR_SETUP](EVALUATOR_SETUP.md) owns existing runnable commands.

Current public corpus: ten shop, four pricing and four dashboard defect/healthy pairs. Public lab URLs and source reveal their cases; they are practice data, not holdout. The committed rehearsal contains 18 grades across all three apps and both arms, with broken/repaired/deletion states at two widths. Preserve its recorded revisions without treating it as a current integration pass or a model experiment.

## 1. The comparison that answers the product question

Node and Bun run JavaScript; Vite bundles/serves the application; Chromium lays out and renders it; Playwright automates the browser. ANWC adds instrumentation and interpreted browser evidence. Comparing “Bun versus our compiler” would mix unrelated layers.

Primary comparison:

| Condition | Agent receives | Screenshots | Purpose |
| --- | --- | --- | --- |
| A — ordinary workflow | Same app source, normal shell/build/test tools, browser DOM/accessibility/Playwright tools | Allowed | Practical baseline |
| B — assisted workflow | Everything in A, plus ANWC inspect report and JSON drill-down | Allowed, usage recorded | Measures incremental practical value |
| C — screenshot-free assisted, optional | Everything in B except screenshot/image inspection tools | Disallowed and enforced by tool availability | Tests the narrower screenshot-free claim |
| D — runtime-only, later ablation | A plus ANWC collector without compiler source linkage | Allowed | Separates runtime diagnostics from compiler value |

Start with A and B. Use the same exact agent/model/version/reasoning setting, context budget, output limit, task wording, app source, viewport, browser build, machine, and wall-time cap. If “Antigravity Gemini” is the chosen agent, record the actual model identifier shown by the tool; do not assume a product label identifies one immutable model. Do not compare one cheap model with ANWC against a different expensive model without ANWC and attribute the result to ANWC.

A may use competent browser APIs and write its own DOM probes. The baseline should represent the user's real workflow, not an artificially restricted strawman. B's only advantage should be the packaged ANWC interface and source linkage. Tool schema/help text contributes to B's context cost.

## 2. Two experiments, separated

**Detection:** agent reports defects without editing. Score precision/recall and cost to diagnosis. This isolates the quality of observations from skill at CSS repair.

**Repair:** agent modifies the app, verifies it, and submits a patch. Score independently verified repairs, regressions, total cost, and time. Do not give the repair agent the evaluator's list of seeded defects. The task is “inspect and repair this page,” not “fix the six named bugs below.”

For the first pilot, use three matched cases spanning the three apps, with one fresh A session and one fresh B session per case: six runs with one exact model. Expand repetitions or models only after validating the workflow and agreeing on a run budget. This is a directional pilot; it cannot establish broad cross-website performance. Expand to unfamiliar apps, held-out layouts and more repeats before general claims.

Reserve different fixture variations for detector development and evaluation. Useful held-out variations include a different wrapping width, nested clipping instead of a single parent, a differently positioned blocker, and longer product names. Do not tune rules on scored runs and then treat reruns as independent holdout results.

## 3. Shop design and state controls

Build a believable but small shop: header/search, promotional hero, six product cards, cart summary, checkout button, cookie notice, and a checkout modal. Use local assets, system or bundled fonts, fixed data, stable prices, and deterministic responsive CSS. A shopping cart action should visibly increment quantity or open a local confirmation; no real payments or external services are needed.

Use a clean default and isolated defect variants. A combined “stress” page is useful for demonstration but should not be the only benchmark, because one overlay can hide several unrelated defects and make scoring ambiguous.

Required viewports: desktop 1440×900 and mobile 390×844, device scale factor 1. Record scroll position and scenario setup explicitly. Include top-of-page, checkout scrolled into view, and modal open states where relevant. Do not evaluate a below-fold target as if the page were scrolled to it.

Disable decorative animations in all conditions or wait for the same bounded stable state. Prefer local assets; wait for fonts with a timeout. Use a new browser context per independent case. Reset cart, cookies, local storage, focus, URL and scroll to the specified state. A trusted runner may set state through ordinary UI actions before giving control to the agent; it records the action sequence.

## 4. Defect and control matrix

Evaluator IDs below belong in evaluator documentation, not readable DOM attributes or answer-bearing URLs. Public scenario IDs should be neutral. Ground truth includes viewport and state; some cases are only errors after an explicit current-visibility expectation applies.

| ID | Fixture | Independent truth evidence | Expected ANWC outcome |
| --- | --- | --- | --- |
| D01 | Unbroken SKU/title exceeds narrow card width | Text range extends beyond available inline bounds | Horizontal overflow evidence |
| D02 | Text cropped by fixed-height overflow-hidden box | Text fragments extend past active client clip | Text-clipped finding |
| D03 | Product title wraps to 3 lines with visible/shared max-2 contract | Independent Range line grouping + human check | Line-budget violation |
| D04 | Checkout clipped by normal-flow cart container | Independent client-bound intersection and click behavior | Ancestor clipping; intent violation |
| D05 | Cookie banner blocks expected checkout button | Normal click cannot deliver to checkout; banner receives point hits | Pointer-blocked-at-samples, blocker identity |
| D06 | Expected current button has display:none or hidden ancestor | Known state should contain visible action; computed render state | Expected-visible-but-hidden |
| D07 | Required header action pushed beyond right viewport edge | Required action box outside viewport at stated state | Outside-viewport intent violation |
| D08 | Transparent overlay intercepts input | Click is intercepted despite visually clear target | Pointer obstruction; no opaque-paint claim |
| D09 | Part of the expected action is covered | Independent click probes reach both target and blocker | Partial sample obstruction, caveated |
| D10 | Huge child z-index remains below another stacking context | Normal hit delivery follows browser's context order | Correct blocker, no z-index summation |
| L01 | Opaque overlay uses pointer-events:none | Human/independent screenshot sees target covered; click still reaches it | Paint unknown; limitation correctly retained |
| L02 | Rounded mask/clip-path/rotation changes true region | Independent visual evidence plus CSS shape | Unsupported geometry/paint precision |
| L03 | Canvas-painted fake button | No corresponding accessible DOM action | Unsupported content observation, not fabricated node semantics |
| C01 | Normal multiline product description | All content readable; no line budget | No wrap defect |
| C02 | Intentional ellipsis preview with allowance | Declared truncation and functioning full-detail action | Acknowledged truncation, no actionable defect |
| C03 | Intentional horizontal carousel | Scroll interaction reveals remaining content | Scroll observation, no default defect |
| C04 | Products below the fold | Ordinary page scrolling reveals them | Offscreen fact, no default defect |
| C05 | Button contains span/icon | Normal click succeeds on descendants | Descendant hits accepted |
| C06 | Transparent pointer-events:none decorative layer | Label visible and action receives events | No pointer blocker |
| C07 | Menu intentionally closed without current expectation | Hidden state matches task state | Hidden observation, no error |
| C08 | Disabled unavailable item | Disabled behavior matches displayed state | Disabled fact, no occlusion claim |

The table describes evaluation requirements, not a current implementation checklist. Use STATUS for shipped coverage and Q05 for the next conformance matrix. At least L01 should be present before claiming any screenshot-free visibility capability; inability to diagnose it is acceptable when explicitly reported as unknown.

If a defect is viewport-specific, declare its failing viewport and other-width control in the case registry; do not add faults simply to meet a count. The repair pilot retains the existing 18 development pairs; Q05's conformance corpus is a separate engineering test set. The combined page can use natural responsive behavior; isolated fixtures make exact gates achievable.

Ground truth has two layers: the seeded mutation and observed behavior. A mutation is not automatically a bug if it has no effect at the selected width/state. Validate every scored fixture with independent browser assertions and a human visual check before freezing it. The human can use screenshots while building the corpus; those costs and activities are not agent inspection results.

## 5. Prevent answer leakage and invalid repairs

Create a separate subject checkout containing only the app and ordinary public tests/contracts. Keep detector development tests, defect manifest, this planning pack, expected findings, grading scripts and golden answers outside that agent's readable workspace. Both conditions get the same app source and public intent declarations. B accesses a prebuilt ANWC tool; it must not receive the private evaluator files through tool output.

Renaming an answer file to `private.json` inside the subject checkout is insufficient. If the agent environment cannot restrict filesystem access, label the run unblinded and do not claim a blinded evaluation. Record this limitation honestly.

For repair, freeze evaluator and detector versions outside the agent's editable paths. Only app source may change. Disallow deleting the product title, removing checkout, weakening expectations, hiding overflow globally without preserving required content, disabling the detector, editing grading tests, or hard-coding viewport-specific test answers. Do not reveal the hidden checks themselves; publish ordinary behavioral requirements such as preserving visible content, accessible actions, and responsive operation to both arms.

If source variants use an obvious `bugMode` switch, the experiment becomes a switch-disabling test. For scored runs, materialize the selected CSS/JSX mutation into a separate subject revision and strip answer-bearing scenario switches. Keep the convenient switchable demo only for development/demonstration.

## 6. Copyable agent prompts

Use this shared repair prompt, replacing bracketed run inputs:

> Inspect the supplied application at [URL] in [VIEWPORT] after [PUBLIC STATE SETUP]. Find and repair layout and interaction problems that affect the intended UI. Preserve all public content, navigation, application behavior, accessibility, and responsive layout described in TASK.md. You may edit only approved application source. Verify the result using the tools available to you. Stop after [20 minutes or the agreed budget] and return a short defect list, files changed, verification evidence, and unresolved limitations. Do not edit tests, tool implementations, or weaken layout expectation declarations to make checks pass.

For B add only:

> You also have ANWC inspect available. It reports source-linked layout evidence and limitations for the current page state. Use its documented command/interface when useful. Its hit samples are not a pixel-visibility proof.

For C use B with screenshot tools actually removed and add:

> Image/screenshot inspection is unavailable in this run. Use browser and ANWC evidence, and identify conclusions that remain unknown.

Detection prompt substitutes “Report defects and supporting evidence; do not edit source” for the repair instruction. Both prompts include the same visible product requirements and time/token budget. Record system prompts/tool descriptions if the environment permits, because they affect tokens and behavior.

## 7. Run procedure

1. Freeze source revision, detector revision, Chromium version, fixture truth, prompts, budget, and evaluation code.
2. Predeclare three cross-app case/viewport/state combinations for the first pilot. Public cases are unblinded practice; independently authored private variants are required before describing a later set as held-out.
3. Predeclare condition order: alternate A then B and B then A; for three pairs, record which order occurs twice. Use fresh sessions and isolated app copies. Do not reuse agent memory, conversation history or patches between conditions.
4. Launch the same ordinary app. A has instrumentation disabled; B has it enabled. Verify beforehand that instrumentation does not change application layout or behavior on the corpus. If it does, fix that before evaluating.
5. Record readiness and environment, start the clock at the same task boundary, give the prompt, and capture complete tool and usage logs outside the subject checkout.
6. Stop at completion or the fixed cap. Save patch, console/tool failures, unresolved findings and agent claims. Failed runs remain in the dataset.
7. Apply each patch in a clean evaluator environment. Run hidden behavior/layout checks and inspect applicable healthy controls at both widths.
8. Have an evaluator label reported defects using the frozen truth policy, blinded to condition where practical. Investigate legitimate unseeded defects and apply any adjudication consistently to all runs.
9. Aggregate paired results and publish sanitized evidence. Mark unavailable usage, contaminated runs, and exclusions with reasons decided independently of which condition won.

Do not introduce the user's previous run results into subsequent agent prompts. Human hints during a run count as intervention and must be recorded; prefer a separate assisted category rather than mixing them into autonomous results.

## 8. Metrics and scoring

### Detection

- True positive: correct defect category and affected element/state with supporting evidence, matched once to frozen truth.
- False positive: actionable defect claim on a healthy condition or an incorrect diagnosis. “Unknown paint visibility” is not an actionable defect.
- False negative: in-scope true defect not identified. Report out-of-scope limitations separately rather than silently excluding them from the broader user task.
- Precision = TP / (TP + FP); recall = TP / (TP + FN); use `NA` for zero denominators.
- Deduplicate multiple phrasings of the same defect. Report diagnosis quality separately from code-change success.

### Repair

- Verified defect repair: independent check passes after the patch and the required feature/content remains intact.
- Full task success: all task-critical checks pass and no new regressions on applicable controls/widths.
- New regressions: count and describe; do not offset them invisibly against repaired bugs.
- Time to first correct diagnosis and final verified repair; wall-time cap failures remain failures, not missing samples.
- Tool calls, agent iterations, screenshot count, human interventions, infrastructure failures.

### Cost

Record provider-reported input, cached input, output and any separately metered image/reasoning usage where available. Use the provider's pricing rules valid at run time, save the price source and date, and avoid double-counting image usage already included in input totals.

Where categories are disjoint and separately priced:

```text
run_cost = sum(category_usage * category_unit_price)
cost_per_verified_task = total_cost_of_all_runs / number_of_fully_verified_successes
```

If there are no verified successes, cost per success is undefined/infinite, not zero. Include unsuccessful runs in total cost. Report subscription/tool environments with unavailable usage as `NA`; do not invent dollar savings from message length. Tool-output bytes/characters and offline tokenizer counts are useful proxies, clearly labeled, but not actual billed tokens. Include ANWC tool definitions, reports, JSON follow-ups and normal source/tool outputs in the agent's total cost, not only the shortest report.

Measure browser launch, navigation/readiness, ANWC extraction, rule execution, serialization, and LLM time separately where available. Shorter report size alone does not establish cheaper end-to-end repair. A report may cause extra turns or miss important context.

### Result table template

| Run | Scenario/width/state | Condition | Model/settings | TP/FP/FN | Verified repairs/total | Regressions | Full success | Wall sec | Input/cached/output | Screenshots | Cost | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pending | pending | A/B | pending | NA | NA | NA | NA | NA | NA | NA | NA | Not run |

Save a machine-readable run manifest with runId, start/end timestamps, app commit, detector commit, browser version, OS, viewport/scroll/state, condition order, prompt hash, model settings, budgets, patch hash, log paths, usage source, independent scoring, and exclusions.

### Pilot manifest helper

`bench/pilot.example.json` is a public, non-secret starting plan. `npm run bench -- validate PLAN.json` rejects unfair A/B pairs: each pair must contain exactly one ordinary and one ANWC-assisted run with the same fixture, replicate, viewport, state, and subject URL. `npm run bench -- runbook PLAN.json --output artifacts/benchmark/RUNBOOK.md` creates a local execution checklist.

`bench/pilot.example.results.json` is the matching zero-result ledger. `npm run bench -- validate-results PLAN.json RESULTS.json` ensures it covers every planned run once and that only completed/time-capped runs have outcome fields. `npm run bench -- summarize PLAN.json RESULTS.json --output artifacts/benchmark/SUMMARY.md` emits a descriptive condition summary; unavailable cost remains `NA` rather than zero.

The helper validates run setup and entered result consistency. `import-grade` checks the supplied receipt against a completed/time-capped run's frozen hash, but the grade itself has no receipt identity; Q01 closes this substitution gap and validates check completeness. Current import also assigns full success from repair status without independent regression adjudication. Do not treat that field as certified success. It does not execute agents or infer usage. Copy examples outside the subject checkout and replace placeholder model/prompt fields. Use scored plans only after Q01/Q02 acceptance and exact receipt assignment. Keep generated runbooks, logs, patches, usage records, and scoring output outside the agent-readable workspace.

Before each agent receives a subject folder, run `npm run bench -- check-subject SUBJECT_PATH --condition ordinary` or `--condition anwc-assisted`. The gate rejects known leakage: `docs/`, `bench/`, `tests/`, `.git/`, the public scenario switch, and ANWC CLI code in the ordinary condition. It also requires the CLI in the assisted condition. It is a deterministic preflight check, not a substitute for host-level filesystem and network isolation.

`npm run bench -- package-subject SOURCE_ROOT DESTINATION --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` creates a new condition-specific export and invokes the gate. The overlay is evaluator-owned and must replace public scenario setup with the one materialized held-out fixture. For ordinary subjects it must also replace the app's Vite config so ANWC is unavailable. Do not commit overlays or evaluator fixtures into this repository.

## 9. Pilot decision policy

Pre-register these as engineering targets, not statistically validated thresholds:

- Correctness gate: required supported fixtures pass; healthy controls do not generate erroneous actionable findings; unknown paint cases remain explicit.
- Usefulness signal: B has equal or better independent task success and lower median paired cost or time, with no material regression increase.
- Candidate improvement target: at least 25% median cost reduction at comparable success would justify expanding the corpus. Missing billing data means this target cannot yet be evaluated.
- Reliability warning: fewer tokens with more missed task-critical defects is not a win.

With three initial pairs, show every paired outcome and range; avoid sweeping significance claims. With larger repeats, choose an appropriate paired uncertainty analysis and report failed/time-capped runs separately. Generalize only after testing unrelated application layouts and other models.

The human pilot decision remains whether source-linked evidence helps agents preserve behavior while repairing UI, and which observed adoption problems should guide subsequent work. Phase 3 adds a usable replay/report/comparison workflow; its engineering acceptance cannot replace that experiment.
