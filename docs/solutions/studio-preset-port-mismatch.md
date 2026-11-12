---
title: Studio shop presets pointed at port 4173 while the demo shop runs on 4175
module: [packages/studio, packages/cli]
symptoms:
  - "127.0.0.1 refused to connect"
  - "studio ground-truth pane is blank for the shop preset"
tags: [studio, ports, config]
date: 2026-11-12
sources:
  - commit cea99eb (fix(studio): point shop presets at the demo shop port 4175)
  - docs/HISTORY.md (2026-11-12 entry, P10)
  - packages/studio/src/data/targets.ts (EXAMPLE_TARGETS)
  - packages/cli/src/studio-presets.ts
  - packages/studio/src/data/presets.ts
  - playwright.config.ts
  - .claude/launch.json
---

# Studio presets pointed at a port where nothing runs

## Symptom

Opening a shop preset in the studio showed the browser's "127.0.0.1 refused to connect" in the ground-truth pane instead of the shop (commit `cea99eb` message).

## Cause

The shop presets in `packages/studio/src/data/presets.ts` and `packages/cli/src/studio-presets.ts` used `http://127.0.0.1:4173/…`. Port 4173 is only where `playwright.config.ts` starts the shop for browser tests. The documented demo shop (README, TESTING, `.claude/launch.json`) runs on 4175, so with the demo running nothing answered on 4173.

## Fix

1. Commit `cea99eb` changed the four shop preset URLs from 4173 to 4175 in both preset files.
2. Phase 4 P10 ([HISTORY](../HISTORY.md), 2026-11-12) added a single catalog, `EXAMPLE_TARGETS` in `packages/studio/src/data/targets.ts` (shop 4175, pricing 4176, dashboard 4177), that the studio app's presets (`packages/studio/src/data/presets.ts`) derive their URLs from, plus a `GET /api/target-status` probe (`probeTarget` in `packages/cli/src/studio.ts`). When nothing answers, the pane now says "Nothing is answering at …" and shows the example's start command and a Retry button. Covered by `tests/unit/studio-target-health.test.ts`.

## How to avoid it again

- Take example ports from `EXAMPLE_TARGETS`; do not hard-code a port in a new preset. The CLI-side copy, `packages/cli/src/studio-presets.ts`, still spells out `http://127.0.0.1:4175` literally; `targets.ts` asks to keep it in sync by hand.
- 4173 belongs to `playwright.config.ts` only. The port table in [AGENTS.md](../../AGENTS.md#ports) lists the rest.
- When a page "refuses to connect", first check what is actually listening on that port before debugging the app.
