# ANWC

**Source-linked browser evidence for AI agents repairing web UIs.**

ANWC adds a development-only JSX transform and browser collector to a React/Vite app. It reports overflow, supported clipping, text layout and sampled pointer blockers with source locations. Existing React and CSS remain your application; Chromium still performs layout.

Status, 2026-09-17: React/Vite inspection, local alpha packages and cross-app evaluation tooling exist. Phase 3 is planned: trustworthy repair results, human reports, reproducible UI states and honest before/after comparison. Start with Q01's result-integrity corrections; current verification gaps are recorded in STATUS. No verified agent time/cost savings or general paint-visibility claims are made.

## Start here

- [STATUS](docs/STATUS.md): current capability, evidence and next task.
- [ROADMAP](docs/ROADMAP.md): active Phase 3 Q01–Q11, ordered batches and bounded implementation briefs.
- [PHASE_4](docs/PHASE_4.md): proposed next phase (P01–P20 task cards for subagents) and lessons from [agent-desktop](docs/reference/AGENT_DESKTOP.md). Not started.
- [TESTING](docs/TESTING.md): try the public demos.
- [EVALUATOR_SETUP](docs/EVALUATOR_SETUP.md): existing practice export/grade commands and limits.
- [BENCHMARK](docs/BENCHMARK.md): fair comparison and scoring policy.
- [PROTOCOL](docs/PROTOCOL.md): snapshot/CLI contract.
- [HISTORY](docs/HISTORY.md) and [DECISIONS](docs/DECISIONS.md): evidence and rationale.

Original W cards and [Phase 2](docs/archive/PHASE_2.md) are archived. Arbitrary-site inspection remains in [the deferred inspector plan](docs/ARBITRARY_URL_PLAN.md).

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

## Developer quickstart (5-minute walkthrough)

ANWC provides source-linked browser layout and pointer evidence directly to developers and AI repair agents. Here is how to install and inspect any React/Vite project in five minutes:

### 1. Build and install local alpha packages
From the ANWC repository, build and pack the local alpha tarballs (`0.1.0-alpha.0`):
```bash
npm run build && npm run pack:packages
```
In your target React/Vite consumer project, install the tarballs and Playwright browser binary:
```bash
npm install /path/to/anwc/dist/packages/*.tgz
npx playwright install chromium
```

### 2. Configure Vite
Add `anwc()` to your `vite.config.ts` **before** the React plugin:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { anwc } from '@anwc/vite-plugin';

export default defineConfig({
  plugins: [anwc(), react()]
});
```
*Note: `anwc()` automatically resolves source locations against the consumer project root. In production builds (`vite build`), all runtime attributes and virtual modules are stripped cleanly with zero residual overhead.*

### 3. Start your development server
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

### 4. Inspect your page at two viewports
In a second terminal, run `npx anwc inspect` at desktop (`1440x900`) and mobile (`390x844`):
```bash
# Desktop inspection (bounded text)
npx anwc inspect "http://127.0.0.1:5173/" --viewport 1440x900 --format text

# Mobile inspection (bounded text)
npx anwc inspect "http://127.0.0.1:5173/" --viewport 390x844 --format text
```

### 5. Follow source and blocker evidence
When an issue is detected (such as an overlay blocking an interactive control, or horizontal overflow), ANWC outputs concise, structured evidence:
```text
ANWC 0.1 | 390x844 | capture c_1a2b | complete, settled
ERROR POINTER_BLOCKED_AT_SAMPLES <button> "Save Profile" (node n-12)
  source: src/ProfileSection.tsx:14:9
  message: Save Profile has 25/25 pointer samples blocked.
  evidence: tested 25 sample points, 25 blocked
  blocker: <div className="announcement-banner"> (node n-15) at src/ProfileSection.tsx:21:9
1 findings | 0 omitted | complete capture, settled | paint visibility unknown | no screenshots captured
Drilldown: re-run with --format json or --output report.json for full raw layout, hit samples, and DOM tree.
```

- **Target and JSX source**: `src/ProfileSection.tsx:14:9` points directly to the exact `<button>` in your code.
- **Measured evidence**: `tested 25 sample points, 25 blocked` provides empirical pointer hit evidence across a 5×5 interior grid.
- **Blocker identity & source**: `src/ProfileSection.tsx:21:9` names the blocking element and its source location.

### 6. Fix the issue and re-inspect
Adjust your code or CSS (e.g. remove the blocking overlay or adjust stacking contexts), then re-inspect:
```bash
npx anwc inspect "http://127.0.0.1:5173/" --viewport 390x844 --format text
```
Output:
```text
ANWC 0.1 | 390x844 | capture c_3d4e | complete, settled
0 actionable findings for inspected rules (note: paint visibility unknown, no screenshots captured)
Drilldown: re-run with --format json or --output report.json for full raw layout, hit samples, and DOM tree.
```

### 7. Custom components, repeated items, and JSON drilldown
- **Custom components**: Nested components (e.g. `<ProfileSection />`) are resolved to their JSX host elements.
- **Repeated list items**: Instances inside `.map()` map to the same JSX source site with distinct live runtime node IDs.
- **Drilldown**: Pass `--format json` or `--output report.json` to inspect authoritative raw layout rectangles, clip chains, hit sample coordinates, and font readiness timings.

### Common error recovery
- **Pasted Markdown link**: Plain URLs must not use Markdown syntax (e.g. `[url](url)` or `<url>`). If provided, the CLI suggests the exact plain URL to run.
- **Missing runtime**: If you see `ANWC RUNTIME_MISSING`, ensure `@anwc/vite-plugin` is listed in `vite.config.ts`, the app is running in dev mode (`npm run dev`), or pass `--runtime-only` for non-instrumented pages.
- **Missing browser**: If Chromium is absent, run `npx playwright install chromium`.
- **Navigation failed**: Check that your dev server is active and accessible on the specified port.

Tested environment matrix:
- **Node.js**: v24.18.0 (supported: Node.js >= 20.6.0)
- **npm**: v11.13.0
- **TypeScript**: 5.7.3
- **Vite**: 6.1.0 (peer dependency: `^5.0.0 || ^6.0.0`)
- **React**: 19.0.0 (and React 18.x)
- **Vitest**: 3.0.7
- **Playwright / Chromium**: 1.51.1 / Chromium build 1161
- **OS**: Linux (x86_64), Windows 11
- **Untested platforms**: macOS

An expectation such as `data-anwc-max-lines="2"` supplies a design contract. Wrapping without that contract is an observation. Pointer hits measure event targeting, not whether every pixel of an element is painted visibly. Capture does not click, fill, scroll or take screenshots.

Current support requires installed ANWC integration. `--runtime-only` is an experimental injection path whose strict-CSP/arbitrary-site compatibility remains unproven. Next.js source integration is deferred.

## Collaboration

Start with Q01 in ROADMAP. Commit each completed card, use focused checks during work, and run full integration once per coherent batch before updating STATUS/HISTORY and pushing to `git@github.com:somerandomguy-coder/anwc.git`. Record actual outcomes, including failures. Paid agent runs and public package publication are separate decisions. A fresh repair agent receives its subject folder and local URL, not this evaluator repository.
