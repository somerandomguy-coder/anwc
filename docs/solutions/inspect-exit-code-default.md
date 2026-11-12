---
title: Docs claimed a seeded defect makes inspect exit 1, but --fail-on defaults to none
module: [packages/cli, docs]
symptoms:
  - "blocked-checkout inspect exits 0 although a defect was reported"
  - "expected exit code 1 for a finding"
tags: [cli, exit-codes, docs-drift]
date: 2026-11-12
sources:
  - docs/HISTORY.md (2026-11-12 entry, merge of the launch triage)
  - packages/cli/src/index.ts (exitCode)
  - packages/protocol/src/schema.ts (inspectOptionsSchema, failOn default)
  - docs/PROTOCOL.md (§5 CLI contract)
  - README.md and docs/LAUNCH.md as of commit 1fef919
---

# Docs said a seeded defect makes `inspect` exit 1

## Symptom

At the launch-triage revision `1fef919`, README said "A seeded defect normally exits with status 1" and LAUNCH said the blocked-checkout command "normally exits **1 because a defect was found**". Running it exited 0 ([HISTORY](../HISTORY.md), 2026-11-12: "seeded `blocked-checkout` inspect reported the blocker and exited 0").

## Cause

The code never did what the docs said. `inspectOptionsSchema` in `packages/protocol/src/schema.ts` defaults `failOn` to `'none'`, and `exitCode` in `packages/cli/src/index.ts` returns 1 only when `failOn` is `error` or `warning` and a matching finding exists. [PROTOCOL §5](../PROTOCOL.md) already documented `--fail-on` with default `none`. The README/LAUNCH prose drifted from both.

## Fix

During the 2026-11-12 merge (`f2ffb45`), README and LAUNCH were corrected: `inspect` exits 0 when a capture completes, even with findings; `--fail-on error|warning` exits 1 on matching findings; 2 is a usage/execution error; 3 is incomplete or unsettled evidence.

## How to avoid it again

- Before documenting an exit code, read `exitCode` in `packages/cli/src/index.ts` and run the command; record the observed code in HISTORY.
- Exit 0 from `inspect` does not mean "no defects". In CI, pass `--fail-on error`.
- Phase 4 P15 plans a doc-drift test that fails when README/QUICKSTART commands disagree with the CLI; until it exists, this check is manual.
