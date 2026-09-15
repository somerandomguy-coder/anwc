# ANWC

**A proposed compiler and browser inspection layer that helps AI agents diagnose rendered UI defects using compact, source-linked evidence.**

Status on 2026-09-16: W01–W08 are complete. The current product requires an installed ANWC integration; arbitrary-site runtime-only inspection is a future track.

The first experiment: keep normal React, CSS, Vite, and Chromium; add a JSX instrumentation plugin and a browser runtime that report overflow, clipping, text layout, and blocked pointer interactions. Compare an agent using its usual browser tools with the same agent additionally using ANWC.

The browser still performs layout. The compiler adds source identity and optional layout expectations. ANWC turns browser measurements into an agent-friendly report. It does not replace Node, Bun, React's renderer, or Chromium, and it cannot prove arbitrary pixel visibility without additional evidence.

## Start here

Start with [Status](docs/STATUS.md). It gives the current task, exact verification command, demo commands, boundaries, and a short document map. [Roadmap](docs/ROADMAP.md) contains the W09–W14 task cards. The [arbitrary URL plan](docs/ARBITRARY_URL_PLAN.md) is a separate future track.

1. [Status](docs/STATUS.md): current task, commands, boundaries, and document map.
2. [Short-term roadmap](docs/ROADMAP.md): active task cards W09–W14.
3. [Testing guide](docs/TESTING.md) and [evaluator setup](docs/EVALUATOR_SETUP.md): manual checks and fair comparisons.
4. [Protocol](docs/PROTOCOL.md) and [benchmark](docs/BENCHMARK.md): stable contracts.
5. [History](docs/HISTORY.md), [decisions](docs/DECISIONS.md), [plan](docs/PLAN.md), and [tasks](docs/TASKS.md): reference material.

## Run the current workspace

```sh
npm install
npx playwright install chromium
npm run dev
npm run typecheck
npm run test:unit
npm run test:browser
npm run build
npm run test:integration
npm run bench -- validate bench/pilot.example.json
```

The shop has a clean default plus deterministic public scenarios, such as `/?scenario=blocked-checkout`. Inspect a Vite development page with `npm run anwc -- inspect http://127.0.0.1:5173 --format text`. The current supported path is an app using the ANWC Vite/runtime integration.

Use plain URL strings in terminal commands, not Markdown links. Runtime-only inspection is a future path because injection is not yet reliable under strict site script policies. See the [arbitrary URL plan](docs/ARBITRARY_URL_PLAN.md) for its planned scope.

For an explicit manual defect page, open `http://127.0.0.1:5173/lab?case=blocked-checkout`. The public lab has ten selectable defect cases and clean storefront routes at `/`, `/catalog`, `/checkout`, and `/account`. It is for learning and regression checks, never as a blinded agent subject.

The paired-agent pilot uses a versioned non-secret manifest and result ledger. Validate the examples with `npm run bench -- validate bench/pilot.example.json` and `npm run bench -- validate-results bench/pilot.example.json bench/pilot.example.results.json`. Generate local runbooks or summaries with `npm run bench -- runbook PLAN.json --output artifacts/benchmark/pilot.runbook.md` and `npm run bench -- summarize PLAN.json RESULTS.json --output artifacts/benchmark/pilot.summary.md`. Copy the examples and replace their placeholders before marking a plan `scored`; evaluator truth and logs must stay outside the subject agent checkout.

## Tonight's target

A working source transform, an on-demand browser inspection runtime, a CLI that writes JSON and concise text, and a React shop containing isolated defects plus healthy controls. At least six supported defect cases must pass independent checks at desktop and mobile widths, with production instrumentation disabled by default.

Recommended implementation order: **T00 → T01 → T02/T03 → T04 → T05/T06 → T07 → T08 → T09**. The two founders can take separate module branches after the protocol is frozen; these documents do not start or assign any agents automatically.

Time estimates are planning ranges, not promises. Cut MCP, live deltas, custom framework components, and Next.js integration before cutting evidence quality or benchmark controls.

## Proposed developer experience

```ts
// Design target, not a currently available package.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { anwc } from '@anwc/vite-plugin';

export default defineConfig({ plugins: [anwc(), react()] });
```

Existing JSX and CSS remain the application source. An optional declaration such as `data-anwc-max-lines="1"` expresses design intent; without it, wrapping alone is an observation, not a defect.

Proposed command:

```sh
npm run anwc -- inspect http://127.0.0.1:5173 --viewport 1440x900 --format text
```

## Collaboration

Choose the next task from `docs/ROADMAP.md`, implement only its owned paths, update `docs/STATUS.md` and `docs/HISTORY.md` when complete, then commit and push. Schema changes require a coordinated update to producers, consumers, and examples.

This checkout is connected to `git@github.com:somerandomguy-coder/anwc.git`. T00–T09 are published to the shared remote. Each completed task is committed separately.
