# ANWC

**A proposed compiler and browser inspection layer that helps AI agents diagnose rendered UI defects using compact, source-linked evidence.**

Status on 2026-09-15: T00–T09 are complete: the source-linked compiler/runtime MVP and its integration freeze. The remaining work is the paired-agent experiment described in the benchmark protocol.

The first experiment: keep normal React, CSS, Vite, and Chromium; add a JSX instrumentation plugin and a browser runtime that report overflow, clipping, text layout, and blocked pointer interactions. Compare an agent using its usual browser tools with the same agent additionally using ANWC.

The browser still performs layout. The compiler adds source identity and optional layout expectations. ANWC turns browser measurements into an agent-friendly report. It does not replace Node, Bun, React's renderer, or Chromium, and it cannot prove arbitrary pixel visibility without additional evidence.

## Start here

1. [Detailed architecture and implementation plan](docs/PLAN.md): scope, algorithms, integration, limits, milestones.
2. [Shared progress board](docs/PROGRESS.md): current state, proposed owners, dependencies, evidence, next actions.
3. [Small module task briefs](docs/TASKS.md): copyable instructions for cheaper coding models.
4. [Protocol contract](docs/PROTOCOL.md): identity, snapshots, findings, CLI behavior, example output.
5. [Benchmark protocol](docs/BENCHMARK.md): defect fixtures, controls, fair comparison, scoring, cost measurement.
6. [Decision log](docs/DECISIONS.md): agreed planning defaults and questions to revisit after the experiment.

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
```

The shop has a clean default plus deterministic public scenarios, such as `/?scenario=blocked-checkout`. Inspect a Vite development page with `npm run anwc -- inspect http://127.0.0.1:5173 --format text`, or inspect a page without the plugin using `--runtime-only`.

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

Claim a task in `docs/PROGRESS.md`, implement only its owned paths, attach command output to the task's evidence entry, and move it to `review` before calling it complete. Schema changes require a coordinated update to producers, consumers, and examples. Suggested roles are placeholders until the two collaborators choose them.

This checkout is connected to `git@github.com:somerandomguy-coder/anwc.git`. T00–T09 are published to the shared remote. Each completed task is recorded in `docs/PROGRESS.md` and committed separately.
