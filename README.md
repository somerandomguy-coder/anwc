# ANWC

**The check an AI coding agent has to pass before it can say a web UI bug is fixed.**

A coding agent can change your page, but it cannot tell whether the button now works. ANWC measures a React/Vite app in real Chromium, names the source line behind each layout or pointer defect, and judges a repair as verified, unverified or contradicted.

See it in about ten seconds, on a disposable copy of the example shop:

```powershell
npm install
npm run build
npx playwright install chromium
npm run demo
npm run demo:cheat
```

The first demo repairs a covered checkout button and ends in **VERIFIED**, because a click that failed before now works on the same button. The second hides the button to make the error disappear and ends in **CONTRADICTED**. The bug is planted.

Alpha, 2026-11-25: React and Vite, Chromium, development only, no model calls. A verified result covers one finding in one state, and currently only pointer defects proven by a click. No agent time or cost savings have been measured, and no general paint-visibility claim is made.

## Start here

- [Pitch runbook](docs/PITCH.md): demo script, likely questions, and what not to claim. [Study notes](docs/PITCH_STUDY_NOTES.md) explain the nine checks in plain words.
- [Try with an agent](docs/TRY_WITH_AN_AGENT.md): copy-paste prompts and the ANWC instructions for building a demo app with a coding agent.
- [Launch handoff](docs/LAUNCH.md): tonight's scope, demo, founder checklist and bounded tasks for a cheaper model.
- [STATUS](docs/STATUS.md): current capability, evidence and next task.
- [ROADMAP](docs/ROADMAP.md): Phase 3 Q01–Q11 cards (implemented; see STATUS for open acceptance gaps).
- [PHASE_4](docs/PHASE_4.md): proposed next phase (P01–P20 task cards for subagents) and lessons from [agent-desktop](docs/reference/AGENT_DESKTOP.md). In progress; see STATUS.
- [TESTING](docs/TESTING.md): try the public demos.
- [EVALUATOR_SETUP](docs/EVALUATOR_SETUP.md): existing practice export/grade commands and limits.
- [BENCHMARK](docs/BENCHMARK.md): fair comparison and scoring policy.
- [PROTOCOL](docs/PROTOCOL.md): snapshot/CLI contract.
- [HISTORY](docs/HISTORY.md) and [DECISIONS](docs/DECISIONS.md): evidence and rationale.
- Contributing agents: [AGENTS.md](AGENTS.md) (where the truth lives, commands, definition of done) and the [CONCEPTS](docs/CONCEPTS.md) glossary.

Original W cards and [Phase 2](docs/archive/PHASE_2.md) are archived. Arbitrary-site inspection remains in [the deferred inspector plan](docs/ARBITRARY_URL_PLAN.md).

## Run the repository demo

```powershell
git clone https://github.com/somerandomguy-coder/anwc.git
cd anwc
npm install
npm run build
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

In a second terminal:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format text
```

Build once before running the demo: workspace packages resolve their compiled `dist` files. After pulling changes, run `npm install` and `npm run build` again. `inspect` exits 0 when it completes, even if it reports defects (the default is `--fail-on none`); pass `--fail-on error` or `--fail-on warning` to exit 1 on findings, for example in CI. Status 1 also means a structured error (runtime missing, target unreachable, timeout); status 2 means a usage error; status 3 means incomplete or unsettled evidence. `--format json` prints one result envelope, `{ version, ok, command, data | error }`, on stdout; files written with `--output` keep the bare snapshot or report ([PROTOCOL §7](docs/PROTOCOL.md)).

Save a capture and open a human-readable report:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format json --fail-on none --output artifacts/launch/blocked.json
npm run anwc -- report artifacts/launch/blocked.json --format html --output artifacts/launch/blocked.html
```

Open `artifacts/launch/blocked.html` in your browser. The report works offline and includes source locations, measured blocker geometry and severity filters. `--fail-on none` lets this intentional-defect capture exit successfully; it does not remove findings. `--output` chooses a path; `--format` chooses its contents.

Or run the repair loop end to end (about 10 seconds, nothing in `examples/` is edited):

```powershell
npm run demo
```

It records the broken checkout, repairs a disposable copy, and ends with `VERIFIED` only if the finding is gone and a real click on the same button now opens the confirmation (`anwc check --baseline`, rules in [PROTOCOL §9](docs/PROTOCOL.md)). That covers one finding in one state, not the whole UI.

The root storefront is healthy; the lab intentionally contains defects and revealing labels. It is for learning and regression checks, not blinded evaluation. Plain terminal URLs must not use Markdown's `[label](URL)` syntax.

```powershell
npm run test:integration
npm run bench -- validate bench/pilot.example.json
```

The integration command covers TypeScript, unit/CLI tests, Chromium tests and production builds. Current and historical evidence live in STATUS rather than duplicated test counts here.

## Use ANWC in your own React/Vite app

ANWC provides source-linked browser layout and pointer evidence directly to developers and AI repair agents. Distribution currently uses local alpha tarballs; public npm publication is not part of this quickstart.

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
Drilldown: re-run with --format json --output report.json for full raw layout, hit samples, and DOM tree.
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
Drilldown: re-run with --format json --output report.json for full raw layout, hit samples, and DOM tree.
```

### 7. Custom components, repeated items, and JSON drilldown
- **Custom components**: Nested components (e.g. `<ProfileSection />`) are resolved to their JSX host elements.
- **Repeated list items**: Instances inside `.map()` map to the same JSX source site with distinct live runtime node IDs.
- **Drilldown**: Pass `--format json --output report.json` to save authoritative raw layout rectangles, clip chains, hit sample coordinates, and font readiness timings.

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

For the launch window, start with LAUNCH and STATUS. ROADMAP remains the Phase 3 backlog; Q05–Q07 have acceptance gaps and Q08–Q11 remain pending. Commit each completed task and batch relevant checks before pushing. Record actual outcomes, including failures. Paid agent runs and public package publication are separate decisions. A fresh evaluation agent receives its subject folder and local URL, not this evaluator repository.
