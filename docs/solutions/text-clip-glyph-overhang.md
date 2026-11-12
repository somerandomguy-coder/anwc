---
title: Text reported as clipped because glyphs overhang their own element box
module: packages/runtime
symptoms:
  - "TEXT_CLIPPED on a healthy page"
  - "clean scenario reports an actionable text-clip finding"
tags: [false-positive, text, clipping]
date: 2026-09-15
sources:
  - docs/HISTORY.md (T09 entry)
  - docs/DECISIONS.md (ADR-016)
  - packages/runtime/src/clipping.ts (observeOwnTextClip)
  - packages/runtime/src/text.ts (observeText)
  - tests/browser/shop-scenarios.spec.ts ("the clean scenario has no unacknowledged ANWC findings")
---

# Text clipped by its own glyph overhang

## Symptom

During the T09 integration run, the clean shop scenario produced a text-clip finding although nothing was clipped ([HISTORY](../HISTORY.md), T09: "an initial false-positive text clip caused by glyph overhang").

## Cause

Text fragment rectangles come from a DOM `Range`. A Range rectangle can extend past its own element's box: glyph ink, line height or inline layout overhang. Comparing fragments with the element's own measured box therefore counted normal overhang as clipping. The comment above `observeOwnTextClip` in `packages/runtime/src/clipping.ts` records this.

## Fix

T09 intersects each text fragment only with the node's actual clipping ancestors and, if the element itself clips overflow, with its own client box (`observeOwnTextClip` in `packages/runtime/src/clipping.ts`, called from `observeText` in `packages/runtime/src/text.ts`). The clean-scenario regression in `tests/browser/shop-scenarios.spec.ts` asserts that `diagnose` returns no findings for `/?scenario=clean`.

The incident became [ADR-016](../DECISIONS.md): actionable findings on a clean fixture are release blockers, because detector trust depends on healthy controls.

## How to avoid it again

- Any new geometry rule needs a healthy control in the same change, and a clean-fixture finding blocks the change (ADR-016).
- Compare measurements against what actually clips (clip ancestors, own `overflow`), not against a summary box.
- See [CONCEPTS: Clip](../CONCEPTS.md#pointer-vs-paint).
