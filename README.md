# ANWC

**Source-linked browser evidence for AI agents repairing web UIs.**

ANWC adds a development-only JSX transform and browser collector to a React/Vite app. It reports overflow, supported clipping, text layout and sampled pointer blockers with source locations. Existing React and CSS remain your application; Chromium still performs layout.

Status, 2026-09-16: the W implementation rollout shipped through `d616943`. Phase 2 is planned: strengthen repair evaluation, then deliver a locally installable alpha for an external React/Vite project. Some W acceptance gaps remain; no verified agent time/cost savings or general paint-visibility claims are made.

## Start here

- [STATUS](docs/STATUS.md): current capability, evidence and next task.
- [ROADMAP](docs/ROADMAP.md): Phase 2 P01–P09 with fixed decisions and acceptance checks.
- [TESTING](docs/TESTING.md): try the public demos.
- [EVALUATOR_SETUP](docs/EVALUATOR_SETUP.md): existing practice export/grade commands and limits.
- [BENCHMARK](docs/BENCHMARK.md): fair comparison and scoring policy.
- [PROTOCOL](docs/PROTOCOL.md): snapshot/CLI contract.
- [HISTORY](docs/HISTORY.md) and [DECISIONS](docs/DECISIONS.md): evidence and rationale.

Original W cards are in [the archive](docs/archive/W_ROLLOUT.md). Arbitrary-site inspection remains in [the deferred inspector plan](docs/ARBITRARY_URL_PLAN.md).

## Run the repository demo

```powershell
npm install
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 4175
```

In a second terminal:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format text
```

The root storefront is healthy; the lab intentionally contains defects and revealing labels. It is for learning and regression checks, not blinded evaluation. Plain terminal URLs must not use Markdown's `[label](URL)` syntax.

```powershell
npm run test:integration
npm run bench -- validate bench/pilot.example.json
```

The integration command covers TypeScript, unit/CLI tests, Chromium tests and production builds. Current and historical evidence live in STATUS rather than duplicated test counts here.

## Integration direction

The plugin already works in the monorepo examples:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { anwc } from '@anwc/vite-plugin';

export default defineConfig({ plugins: [anwc(), react()] });
```

Packages currently use private workspace manifests and TypeScript source exports. P06 will provide tested local tarballs and an installed CLI for an unrelated project; public npm availability is not claimed.

An expectation such as `data-anwc-max-lines="2"` supplies a design contract. Wrapping without that contract is an observation. Pointer hits measure event targeting, not whether every pixel of an element is painted visibly. Capture does not click, fill, scroll or take screenshots.

Current support requires installed ANWC integration. `--runtime-only` is an experimental injection path whose strict-CSP/arbitrary-site compatibility remains unproven. Next.js source integration is deferred.

## Collaboration

Start with P01 in ROADMAP. Complete one task, verify its acceptance, update STATUS/HISTORY, commit and push to `git@github.com:somerandomguy-coder/anwc.git`. Paid agent runs and public package publication are separate decisions. A fresh repair agent receives its subject folder and local URL, not this evaluator repository.
