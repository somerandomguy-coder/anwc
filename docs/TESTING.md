# Testing ANWC with coding agents

Use this guide for two distinct activities. The public scenario workflow verifies that ANWC and an agent can work together. The paired pilot measures whether ANWC improves an agent's repair work. Do not present the public workflow as a blinded benchmark.

## 1. Verify the repository

Run these once from the repository root:

```sh
git pull
npm install
npx playwright install chromium
npm run test:integration
```

The frozen baseline passes typecheck, 22 unit tests, 9 Chromium tests, and the production build. The production bundle has no ANWC instrumentation by default.

## 2. Public workflow smoke test

Start the instrumented development app:

```sh
npm run dev --workspace=@anwc/shop -- --host 127.0.0.1 --port 4175
```

In a second terminal, inspect a healthy page and a defective page:

```sh
npm run anwc -- inspect "http://127.0.0.1:4175/?scenario=clean" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/?scenario=blocked-checkout" --viewport 390x844 --format text
```

The clean page must have zero findings. The blocked page must report `POINTER_BLOCKED_AT_SAMPLES` and a source location. The six public defects provide a quick full smoke matrix:

| Scenario | Required code |
| --- | --- |
| `horizontal-overflow` | `HORIZONTAL_OVERFLOW` |
| `ancestor-clip` | `CLIPPED_BY_ANCESTOR` |
| `line-budget` | `TEXT_LINE_BUDGET_EXCEEDED` |
| `hidden-checkout` | `EXPECTED_VISIBLE_BUT_HIDDEN` |
| `blocked-checkout` | `POINTER_BLOCKED_AT_SAMPLES` |
| `partial-checkout` | `POINTER_PARTIALLY_BLOCKED` |

This stage is intentionally unblinded: the scenario URL, source switch, tests, and expected behavior are all in this repository. It proves the tool path, not a model advantage.

## 3. Calibrate one model

Use the same model and the same high reasoning setting for both conditions. Record the exact model label shown by the provider UI, rather than a family name alone. Set a fixed wall-time cap; 20 minutes is a good initial cap.

Create two fresh copies of the same broken app. Do not reuse a chat, agent memory, patch, browser session, screenshot, or log between them.

For condition A, give the agent normal source access, its normal browser/shell tools, and screenshots if those are normally available. Do not provide ANWC.

For condition B, give the same source, prompt, browser/shell tools, viewport, and cap. Add only:

> ANWC is available. When useful, run `npm run anwc -- inspect URL --viewport WIDTHxHEIGHT --format text` to obtain source-linked layout and interaction evidence. Pointer samples are not a pixel-visibility proof.

Give both agents this repair prompt:

> Inspect and repair the supplied React shop at [URL] and [VIEWPORT]. Preserve product content, navigation, cart behavior, accessibility, and responsive layout. You may edit application source only. Verify the result with the tools available to you. Return the defects found, files changed, verification evidence, and unresolved limitations.

Use `blocked-checkout` at `390×844` for this calibration. It has an ordinary independent hit-test check and a clear ANWC report. Do not run the existing scenario tests after repairing the public fixture: they intentionally expect its seeded defect to remain. Verify the repaired page independently instead.

## 4. Scale to several models without wasting runs

Start with one ordinary/assisted pair per model at high reasoning. This is 14 runs for seven models. Record wall time, tool failures, screenshots used, provider-reported tokens/cost where available, and independent repair outcome.

Shortlist the two most promising models. Run the six supported defect classes for each shortlisted model at their specified desktop or mobile viewport. Counterbalance order: use A then B for half the pairs and B then A for the rest. Repeat only after the first pass works.

Seven models across all six defects and both conditions is 84 runs before repeats. Calibration and shortlisting make the comparison practical.

## 5. Run a scoreable pilot

A scoreable pilot must use a separate subject workspace for each run. It must contain the app and only the permitted condition tools. It must not expose `docs/`, `bench/`, `tests/`, `.git/`, public scenario switching, defect labels, prior patches, evaluator truth, or grading scripts. A Git worktree or normal clone alone is not sufficient because the agent can inspect history and planning files.

Materialize one neutral held-out defect into each subject copy. Keep its mutation and independent grading checks outside the subject workspace. The ordinary subject must not have ANWC. The assisted subject may have the ANWC CLI, but no evaluator truth.

Validate a prepared subject before giving it to an agent:

```sh
npm run bench -- check-subject PATH_TO_SUBJECT --condition ordinary
npm run bench -- check-subject PATH_TO_SUBJECT --condition anwc-assisted
```

The checker is a leakage gate, not a security sandbox. It verifies the repository inventory and known public scenario switch. It cannot stop an agent from accessing files or services made available by the surrounding host.

## 6. Record the run plan and results

Copy `bench/pilot.example.json` and `bench/pilot.example.results.json` outside the subject workspace. Replace placeholder provider/model/reasoning/prompt data, give the plan a unique ID, change `kind` to `scored`, and create one ordinary plus one assisted row for every pair.

```sh
npm run bench -- validate PATH_TO_PLAN.json
npm run bench -- runbook PATH_TO_PLAN.json --output artifacts/benchmark/runbook.md
npm run bench -- validate-results PATH_TO_PLAN.json PATH_TO_RESULTS.json
npm run bench -- summarize PATH_TO_PLAN.json PATH_TO_RESULTS.json --output artifacts/benchmark/summary.md
```

The ledger preserves planned, completed, time-capped, infrastructure-failed, and excluded runs. Record unavailable billing as `null`; the summary renders it as `NA`, never as zero. The summary describes entered data only. Use the independent evaluator checks and the scoring policy in [BENCHMARK](BENCHMARK.md) to decide true positives, verified repairs, regressions, and full success.

## 7. Interpret the first pilot honestly

The initial decision is narrow: does ANWC help this same model repair this shop under the fixed conditions? A shorter report or fewer tokens alone is not success. A useful signal requires equal or better independently verified repair success with lower paired time/cost and no material increase in regressions.

ANWC still cannot prove paint visibility. Keep masks, clip paths, transforms, complex positioned clips, and pixel-visibility claims outside scored v0 capability assertions.
