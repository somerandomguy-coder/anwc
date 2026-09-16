# ANWC

**Source-linked browser evidence for AI agents repairing web UIs.**

ANWC adds a development-only JSX transform and browser collector to a React/Vite app. It reports overflow, supported clipping, text layout and sampled pointer blockers with source locations. Existing React and CSS remain your application; Chromium still performs layout.

Status, 2026-09-16: the W implementation rollout shipped through `d616943`; P01–P04 now have an evaluator-foundation implementation pass, and P02 has a public 18-pair matrix with independent two-viewport and target-specific detector coverage. The remaining work is provenance/lifecycle acceptance, rehearsal evidence, and then a locally installable alpha. No verified agent time/cost savings or general paint-visibility claims are made.

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

## Local alpha packages and external consumer

P06 compiles standard ESM (`.js`) and TypeScript declaration (`.d.ts`) artifacts and packages audited local tarballs (`0.1.0-alpha.0`) for installation in external React/Vite projects outside this repository:

1. **Pack the local tarballs:**
   ```bash
   npm run pack:packages
   ```
   This generates audited tarballs in `dist/packages/` for `@anwc/protocol`, `@anwc/compiler`, `@anwc/runtime`, `@anwc/diagnostics`, `@anwc/vite-plugin`, and `@anwc/cli`.

2. **Install in your consumer React/Vite project:**
   ```bash
   npm install /path/to/anwc/dist/packages/*.tgz
   npx playwright install chromium
   ```

3. **Add plugin to `vite.config.ts`:**
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { anwc } from '@anwc/vite-plugin';

   export default defineConfig({
     plugins: [anwc(), react()]
   });
   ```
   Calling `anwc()` with no arguments automatically resolves the project root against the consumer's Vite config. In production (`vite build`), runtime attributes and identifiers are completely stripped.

4. **Inspect with the installed CLI:**
   ```bash
   npx anwc inspect "http://127.0.0.1:5173/" --viewport 1440x900 --format text
   ```
   Source locations point to consumer JSX (e.g., `src/App.tsx:L:C`).

Tested environment matrix:
- **Node.js**: v22.x (supported: Node.js >= 20.6.0)
- **npm**: v9.x / v11.x
- **Vite**: v6.x (peer dependency: `^5.0.0 || ^6.0.0`)
- **React**: v19.x (and React 18.x)
- **OS**: Linux (x86_64), Windows 11
- **Browser prerequisite**: Chromium via Playwright (`npx playwright install chromium`).

An expectation such as `data-anwc-max-lines="2"` supplies a design contract. Wrapping without that contract is an observation. Pointer hits measure event targeting, not whether every pixel of an element is painted visibly. Capture does not click, fill, scroll or take screenshots.

Current support requires installed ANWC integration. `--runtime-only` is an experimental injection path whose strict-CSP/arbitrary-site compatibility remains unproven. Next.js source integration is deferred.

## Collaboration

Start with P01 in ROADMAP. Complete one task, verify its acceptance, update STATUS/HISTORY, commit and push to `git@github.com:somerandomguy-coder/anwc.git`. Paid agent runs and public package publication are separate decisions. A fresh repair agent receives its subject folder and local URL, not this evaluator repository.
