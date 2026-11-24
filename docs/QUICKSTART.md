# ANWC Quickstart Guide

This guide walks you through installing, configuring, inspecting, and verifying UI repairs using ANWC (**Automated Non-Visual Web Checker**) in a React/Vite development environment.

---

## 1. Prerequisites

- **Node.js:** v18.0.0 or later (v20+ recommended)
- **Chromium:** Playwright Chromium browser binary

Verify your local environment health at any time:

```bash
npx anwc doctor
```

If Chromium is missing, install it:

```bash
npx playwright install chromium
```

---

## 2. Installation

Install the ANWC Vite plugin and CLI in your React/Vite project:

```bash
npm install --save-dev @anwc/vite-plugin @anwc/cli
```

---

## 3. Configuration

In your `vite.config.ts` (or `vite.config.js`), import and add `anwc()` to your plugins array:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { anwc } from '@anwc/vite-plugin';

export default defineConfig({
  plugins: [
    anwc(), // Zero-config ANWC compiler & runtime instrumentation
    react()
  ]
});
```

> **Note:** ANWC instrumentation is strictly development-only. Production builds (`vite build`) automatically strip all runtime scripts, event interceptors, and source location attributes.

Start your development server:

```bash
npm run dev
```

---

## 4. Inspecting Pages (`anwc inspect`)

With your Vite development server running (e.g. at `http://127.0.0.1:5173/`), run inspection from another terminal:

### 4.1. Text Summary Mode (Terminal / Human Readable)

```bash
npx anwc inspect "http://127.0.0.1:5173/" --viewport 1440x900 --format text
```

Output highlights actionable layout, clipping, and pointer access findings:
```
ANWC 0.1 | 1440x900 | capture session-1:capture-1 | complete, settled
0 actionable findings for inspected rules (note: paint visibility unknown, no screenshots captured)
```

### 4.2. JSON Snapshot Mode (Machine Readable / Agent Input)

```bash
npx anwc inspect "http://127.0.0.1:5173/" --viewport 1440x900 --format json --output artifacts/before.json
```

Options:
- `--viewport WIDTHxHEIGHT`: Browser viewport (default `1440x900`).
- `--fail-on error|warning|none`: Control exit code (exits `1` on matching finding severity; the result is still `ok:true`).
- `--limit <N>`: Maximum findings to report.
- `--output <path>`: Write the bare snapshot to disk (stdout stays empty on success).

Without `--output`, JSON stdout is a result envelope: `{"version":"0.1","ok":true,"command":"inspect","data":<snapshot>}`, or `{"version":"0.1","ok":false,"command":"inspect","error":{"code":"RUNTIME_MISSING",...}}` on failure. Exit codes: `0` ok, `1` error or `--fail-on` match, `2` usage error, `3` incomplete or unsettled capture. See [PROTOCOL §7](PROTOCOL.md).

---

## 5. Generating Offline Reports (`anwc report`)

You can generate single-file offline visual HTML reports or structured Markdown summaries from any saved capture snapshot:

### 5.1. Interactive HTML Report

```bash
npx anwc report artifacts/before.json --format html --output artifacts/report.html
```

Features:
- Single-file standalone HTML (no network or CDN dependencies).
- Interactive severity and rule filters.
- Responsive SVG viewport diagram rendering target elements, blocking layers, and sampled hit points.
- Concrete repair suggestions mapped directly to source JSX files.

### 5.2. Markdown Summary Report

```bash
npx anwc report artifacts/before.json --format markdown --output artifacts/report.md
```

---

## 6. Compact Agent Evidence & Drilldown Queries

To minimize token usage and context window consumption for coding agents, ANWC provides offline summary and detail queries over saved reports:

### 6.1. Compact Summary Query

Emits **68% fewer characters** than full page snapshots while preserving all actionable finding targets, blocker sources, and contrast evidence:

```bash
npx anwc report artifacts/before.json --query summary --format json
```

Or in compact text format:
```bash
npx anwc report artifacts/before.json --query summary --format text
```

Filter by code, severity, or source file:
```bash
npx anwc report artifacts/before.json --query summary --code POINTER_BLOCKED_AT_SAMPLES --format text
```

### 6.2. Precise Detail Drilldown

Retrieve deep repair facts (exact sample coordinates, clipping ancestor bounding boxes, overflow pixels, source coordinates) for a specific finding:

```bash
npx anwc report artifacts/before.json --query detail --finding-id f_n16_pointer_blocked_at_samples --format text
```

---

## 7. Comparing Repairs (`anwc diff`)

When fixing a bug, verify that the repair actually fixed the root cause without masquerading deletions or unmounting as fixes:

```bash
# Capture after applying code fix
npx anwc inspect "http://127.0.0.1:5173/" --format json --output artifacts/after.json

# Diff the before and after captures
npx anwc diff artifacts/before.json artifacts/after.json --format markdown
```

Every finding gets a verdict with a closed reason ([PROTOCOL §9](PROTOCOL.md)):
- `verified`: resolved on the same retained, measured target, with executed behavior evidence. The CLI does not collect bound behavior evidence yet, so `anwc diff` never prints it.
- `unverified(reason)`: the evidence cannot decide, for example `behavior_not_checked` (the finding is gone; confirm the interaction yourself), `target_ambiguous`, `coverage_reduced` or `intent_changed`.
- `contradicted(reason)`: the claim of a fix conflicts with the evidence, for example `finding_persists`, `new_finding`, `target_unmounted` or `target_hidden`.

---

## 8. Reproducing State Flows (`anwc check`)

Replay deterministic user flows (drawers, modals, scrolled states) declared in a state manifest:

```bash
npx anwc check anwc.checks.json --output artifacts/check-results
```

Each checkpoint and each measured finding carries a `verdict` and `reason`; `verdictSummary` counts them. `passedAll` only means that replay and assertions succeeded, and `check` never says `verified` because it has no before capture.

Example `anwc.checks.json`:
```json
{
  "schemaVersion": "0.1",
  "baseUrl": "http://127.0.0.1:5173",
  "scenarios": [
    {
      "id": "storefront-flow",
      "title": "Storefront Modal and Scrolled Flow",
      "viewport": { "width": 1440, "height": 900 },
      "checkpoints": [
        {
          "name": "home-initial",
          "steps": [
            { "action": "navigate", "path": "/" },
            { "action": "capture", "name": "01-home" }
          ],
          "assertions": [
            { "id": "heading-visible", "selector": "h1", "expected": "visible" }
          ]
        },
        {
          "name": "scrolled-nav",
          "steps": [
            { "action": "scroll", "y": 400 },
            { "action": "capture", "name": "02-scrolled" }
          ],
          "assertions": [
            { "id": "nav-sticky", "selector": "nav.site-nav", "expected": "visible" }
          ]
        }
      ]
    }
  ]
}
```
