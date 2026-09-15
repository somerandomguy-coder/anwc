# Co-founder handoff — 2026-09-15

Start here, then read [PROGRESS](PROGRESS.md), [BENCHMARK](BENCHMARK.md), and [DECISIONS](DECISIONS.md). This is the operational handoff for the frozen MVP, not a replacement for those detailed documents.

## Current baseline

- Repository: `git@github.com:somerandomguy-coder/anwc.git`
- Branch: `main`
- Frozen integration commit: `4c6cafe` (`chore: freeze MVP integration candidate`)
- Working tree at handoff: clean
- Remaining board task: **T10 — paired-agent experiment**. No cost, accuracy, or repair-effectiveness claim has been measured yet.

The MVP is a normal React/Vite shop with a development-only ANWC Vite plugin, a source-preserving JSX transform, an on-demand browser collector, pure diagnostics, and a Playwright CLI. It does not replace Vite, React, Chromium, Node, or ordinary browser automation.

## Verify the baseline first

Use Node 24 and npm. A fresh checkout needs the packages and the Playwright browser once:

```sh
npm install
npx playwright install chromium
npm run test:integration
```

Expected result: TypeScript succeeds, 19 unit tests pass, 9 Chromium tests pass, and the production shop build succeeds. The production output contains no ANWC instrumentation by default.

`npm run test:integration` is the one command to use before and after any shared change. It runs typecheck, unit tests, browser tests, and the production build in that order.

## Run the product locally

Terminal one:

```sh
npm run dev --workspace=@anwc/shop -- --host 127.0.0.1 --port 4175
```

Terminal two:

```sh
npm run anwc -- inspect "http://127.0.0.1:4175/?scenario=clean" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/?scenario=blocked-checkout" --viewport 390x844 --format json
```

The frozen checks establish these baseline outcomes:

| URL scenario | Viewport | Required result |
| --- | --- | --- |
| `clean` | 1440×900 | complete capture; no findings |
| `blocked-checkout` | 390×844 | complete capture; `POINTER_BLOCKED_AT_SAMPLES` |
| all six isolated defect scenarios | 1440×900 and 390×844 | their specified supported code is present |

The public development scenario IDs are `horizontal-overflow`, `ancestor-clip`, `line-budget`, `hidden-checkout`, `blocked-checkout`, and `partial-checkout`. `combined` is a demonstration page, not a scored benchmark case. Their source lives in `examples/shop/src/main.tsx`, `examples/shop/src/scenarios.ts`, and `examples/shop/src/styles.css`.

Ignored example reports are regenerated at `artifacts/integration/`. At the freeze they showed clean desktop with zero findings and blocked mobile with only the expected pointer finding. They are evidence aids, not committed benchmark results.

## What ANWC can and cannot say in this MVP

It can return source-linked evidence for instrumented Vite JSX elements, supported rectangular ancestor clipping, direct-text Range fragments, declared line budgets, CSS-hidden expected targets, horizontal overflow, and 5×5 pointer hit samples. The CLI is read-only: it does not capture screenshots, click, type, scroll, focus, or mutate styles.

It cannot prove pixel or paint visibility. It explicitly reports paint visibility as unknown. Non-rectangular clips, masks, clip paths, transformed geometry, vertical writing, and complex positioned clipping remain outside the certified model. Pointer samples are evidence of event delivery at sampled points, not covered-area percentages. Keep these boundaries intact when describing the result.

## T10: tomorrow's only product decision

Run a small, paired repair pilot to answer whether ANWC helps the **same** agent/model repair the **same** app faster, more cheaply, or more reliably than its ordinary workflow. [BENCHMARK](BENCHMARK.md) is the detailed protocol; follow it rather than improvising a comparison between unrelated layers such as Bun and the compiler.

1. Freeze the agent/model identifier, reasoning setting, prompt, time/token cap, browser version, target commit, viewport/state, and scoring rules before any scored run.
2. Materialize each scored defect into a separate evaluator checkout. Do not expose the public scenario switch, this documentation, expected codes, detector tests, or grading answers to the subject agent. A readable `private` directory is not isolation.
3. Run a fresh ordinary-workflow session (A) and a fresh ANWC-assisted session (B) for each selected case. Give both the same source, normal tools, and repair prompt; B alone gets the ANWC command.
4. Apply each patch in a clean evaluator checkout. Score repairs and regressions with independent checks at the required viewport/state. Save logs, usage records, timings, patches, and exclusions outside the subject checkout.
5. Report all runs, including timeouts and failures. If provider billing data is unavailable, write `NA`; do not infer dollar savings from report length.

Do not start Next.js support, an MCP server, a framework rewrite, background observers, paint inference, or package publishing before this pilot creates evidence that one of those investments is justified.

## Prepare the pilot manifest

The repository now includes a small local manifest validator and runbook generator. It checks that every A/B pair has one ordinary run and one ANWC-assisted run with identical fixture, replicate, viewport, state, and subject URL. It produces no hidden truth, repair score, or agent result.

```sh
npm run bench -- validate bench/pilot.example.json
npm run bench -- runbook bench/pilot.example.json --output artifacts/benchmark/pilot.runbook.md
npm run bench -- validate-results bench/pilot.example.json bench/pilot.example.results.json
npm run bench -- summarize bench/pilot.example.json bench/pilot.example.results.json --output artifacts/benchmark/pilot.summary.md
```

`bench/pilot.example.json` is intentionally not scoreable: it uses `kind: "example"` and placeholder agent/prompt fields. Copy it outside the subject workspace, fill the exact model/settings and prompt identifier, materialize neutral held-out fixture IDs, then change `kind` to `"scored"`. The validator refuses placeholder agent/prompt data for a scored plan.

`bench/pilot.example.results.json` is a zero-result ledger: every run is `planned`, with metrics set to `null`. Complete it outside the subject workspace as runs finish. The results validator requires each planned run exactly once and prevents a planned/failed/excluded run from being silently counted as success. The summary reports medians only where enough values are available and preserves unavailable cost as `NA`.

## Change discipline

- Keep the protocol at `0.1` unless a versioned, cross-package change is explicitly agreed and tested.
- Preserve the production-off default for instrumentation.
- Add a normal browser assertion for every new layout fixture before adding an ANWC assertion.
- Treat a clean fixture producing an actionable finding as a bug; T09 added a regression for this after correcting a text-clip false positive caused by normal glyph overhang.
- Run `npm run test:integration`, update [PROGRESS](PROGRESS.md), commit one completed task, and push `main` after each reviewable slice.

## Where to look

| Need | Primary location |
| --- | --- |
| Current state, gates, handoffs | [PROGRESS](PROGRESS.md) |
| Evaluation design, prompts, scoring | [BENCHMARK](BENCHMARK.md) |
| Immutable protocol shape | [PROTOCOL](PROTOCOL.md) |
| Why the project has this scope | [DECISIONS](DECISIONS.md) |
| Original architecture and deferred work | [PLAN](PLAN.md) |
| Compiler | `packages/compiler/src/index.ts` |
| Vite adapter | `packages/vite-plugin/src/index.ts` |
| Collector | `packages/runtime/src/index.ts` |
| Diagnostics | `packages/diagnostics/src/index.ts` |
| CLI | `packages/cli/src/index.ts` |
| Pilot manifest/runbook/ledger tool | `packages/benchmark/src/` and `bench/pilot.example*.json` |
| Real-layout tests | `tests/browser/` |
