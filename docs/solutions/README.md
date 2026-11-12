# Solutions: lessons from past mistakes

One file per lesson: a problem someone already hit in this repository, how it showed up, why it happened, and how it was fixed. Search here before debugging something that looks familiar, and add an entry when you fix something a later agent could trip over again.

These are lessons, not status. [STATUS](../STATUS.md) says what works now; if a lesson and STATUS disagree, STATUS wins and the lesson needs updating.

## Entries

| Lesson | Module |
| --- | --- |
| [Text clipped by its own glyph overhang](text-clip-glyph-overhang.md) | `packages/runtime` |
| [Studio presets pointed at a port where nothing runs](studio-preset-port-mismatch.md) | `packages/studio`, `packages/cli` |
| [Docs said a seeded defect makes `inspect` exit 1](inspect-exit-code-default.md) | `packages/cli`, docs |

## Frontmatter

Every entry starts with YAML frontmatter so it can be found with a plain text search (for example `rg "symptoms:.*refused" docs/solutions`):

```yaml
---
title: Short statement of the problem
module: packages/runtime          # package or folder where the fix lives; a list if several
symptoms:                          # what you see, in the words you would search for
  - "TEXT_CLIPPED on a healthy page"
tags: [false-positive, text, clipping]
date: 2026-09-15                   # when it was found or fixed
sources:                           # repo files or commits that back every claim in the entry
  - docs/HISTORY.md (T09)
---
```

- `module`: the package or folder an agent would be editing. Use the real path (`packages/cli`, `examples/shop`, `docs`).
- `symptoms`: exact error text, finding codes or user-visible messages. Quote them; they are what people paste into a search.
- `tags`: a few lowercase words. Reuse existing tags before inventing new ones: `false-positive`, `text`, `clipping`, `studio`, `ports`, `config`, `cli`, `exit-codes`, `docs-drift`.
- `date` and `sources`: required. Every claim in the body must be traceable to a file or commit in this repository.

## Adding an entry

1. Create `docs/solutions/<short-kebab-name>.md` with the frontmatter above.
2. Body sections: **Symptom**, **Cause**, **Fix**, **How to avoid it again**. Keep it short; link to the code and tests instead of pasting them.
3. Cite sources inline (file path, ADR number, HISTORY entry or commit hash). Do not write anything you cannot point to.
4. Add a row to the table above.
5. Do not use an entry to claim a capability; put capability evidence in STATUS and HISTORY.
