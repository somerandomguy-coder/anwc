# ANWC concepts

A glossary of the words ANWC uses, each tied to the package, folder or type where it lives. Use these words, with these meanings, in code, folder names, tests and docs. When you need a new term, add it here in the same change. [STATUS](STATUS.md) remains the source of truth for what works; this page only defines words.

Terms marked **(planned)** are named in [PHASE_4](PHASE_4.md) but not built. Do not describe them as existing.

## Capture and evidence

**Capture.** One read-only measurement of the current page at one viewport and state. The browser side produces a `RawCapture` (page, readiness, coverage, nodes, timings; no rule output). Lives in `packages/runtime/src/index.ts` (`capture`), shape in `packages/protocol/src/schema.ts` (`rawCaptureSchema`, `RawCapture`). A capture never clicks, fills, scrolls or takes screenshots ([PROTOCOL §5](PROTOCOL.md)). Each has a `captureId`; `sessionId` changes after navigation.

**Snapshot.** A capture plus the findings computed from it and rule timing. This is what `anwc inspect --format json --output FILE` writes, and the `data` of the result envelope `inspect --format json` prints on stdout (`envelopeSchema` in `packages/protocol/src/envelope.ts`, [PROTOCOL §7](PROTOCOL.md)). `snapshotSchema` / `Snapshot` in `packages/protocol/src/schema.ts`; produced by `inspect` in `packages/cli/src/index.ts`. Contract version `0.1` (`SCHEMA_VERSION`).

**Measurement (node).** One measured element inside a capture: box, render state, viewport and clip intersection, overflow, text fragments, pointer samples, paint visibility, intent. `measurementSchema` / `Measurement` in `packages/protocol/src/schema.ts`.

**Assessment.** The `known | estimated | unknown` wrapper around a measured value, always with a `method` and `limitations`. Unknown is a first-class result with `value: null`, never a zero. `assessmentSchema` in `packages/protocol/src/schema.ts`.

**Readiness / settled.** Whether layout had stopped moving before measurement (`readiness.settled`, with `reasons`). Unsettled evidence makes `inspect` exit 3. Implemented in `packages/runtime/src/index.ts`; described in [PROTOCOL §4](PROTOCOL.md).

**Coverage.** What a capture did and did not inspect: `complete`, `discoveredNodes = inspectedNodes + skippedNodes`, `reasons`, `capabilities`, `unsupportedFeatures` (currently `paint-visibility`, `non-rectangular-clipping`, `transformed-geometry`). `coverageSchema` in `packages/protocol/src/schema.ts`; filled in `packages/runtime/src/index.ts`. A clean result only speaks for what coverage says was inspected.

**Finding.** A rule result about one node in one captured state: `findingId`, `code`, `severity` (`error | warning | info`), `nodeId`, `source`, typed `evidence`, `limitations`, `acknowledged`. `findingSchema` / `Finding` in `packages/protocol/src/schema.ts`; produced by `diagnose` in `packages/diagnostics/src/index.ts`. Codes in use: `HORIZONTAL_OVERFLOW`, `CLIPPED_BY_ANCESTOR`, `TEXT_CLIPPED`, `TEXT_LINE_BUDGET_EXCEEDED`, `EXPECTED_VISIBLE_BUT_HIDDEN`, `POINTER_BLOCKED_AT_SAMPLES`, `POINTER_PARTIALLY_BLOCKED`, `OUTSIDE_VIEWPORT`, `UNSUPPORTED_VISIBILITY`. A finding describes a state; it is not permission to act and not a durable handle.

**Acknowledged finding.** A finding whose fact the author declared acceptable through intent (for example `data-anwc-allow="horizontal-scroll"`). It stays in JSON with severity `info` so policy cannot erase the measurement. `acknowledged` in `packages/diagnostics/src/index.ts`.

**Actionable finding.** A finding a repair should address; counted as `actionable` in the report summary (`reportSummarySchema` in `packages/report/src/schema.ts`).

## Source identity

**Source site vs instance.** A *source site* is one JSX element location in a file; the compiler stamps it as `data-anwc-site="s_…"` and records `siteId`, `file`, `line`, `column`, `tag` (`packages/compiler/src/index.ts`, `sourceRefSchema` in `packages/protocol/src/schema.ts`). An *instance* is one live DOM element, identified by `nodeId`, unique within a document session (`packages/runtime/src/index.ts`). Items rendered by `.map()` share one `siteId` and have distinct `nodeId`s ([ADR-008](DECISIONS.md)). A node can keep a `siteId` while `source` is `null`: linkage unavailable, not a made-up location.

**Semantic key / author key.** A stable, author-chosen name for a target: `data-anwc-key`, read into `semanticKey` (`packages/runtime/src/index.ts`). Diff matching prefers it (`'author-key'` strategy in `packages/report/src/diff-schema.ts`).

## Intent

**Intent.** What the author says should be true, as distinct from what was measured. Declared with `data-anwc-*` attributes and read in `packages/runtime/src/index.ts` into `Measurement.intent`:

- `data-anwc-expect="visible|interactive"` → `expectedCurrent` (for the current state and viewport only);
- `data-anwc-max-lines="N"` → `maxLines`;
- `data-anwc-allow="horizontal-scroll text-truncation"` → `allow`;
- `data-anwc-key` → `semanticKey` (above).

Wrapping or scrolling without intent is an observation, not an error ([ADR-009](DECISIONS.md), [PROTOCOL §3](PROTOCOL.md)).

**Page scenario.** The value of `data-anwc-scenario` on the rendered tree, recorded as `page.scenario` (`packages/runtime/src/index.ts`). Not the same as a manifest scenario (below).

## Pointer vs paint

**Pointer evidence.** Browser hit tests at a bounded grid of interior sample points of an interaction candidate; each sample is `target-or-descendant`, `blocked` (with `blockerNodeId`) or `no-target`. `pointerSchema` / `hitSampleSchema` in `packages/protocol/src/schema.ts`; sampling in `packages/runtime/src/hit-test.ts`. It measures where events go.

**Paint visibility.** Whether pixels are actually painted visibly. `paintVisibility` exists in the schema but is always `unknown` in v0 (`packages/runtime/src/index.ts`). Pointer evidence is not paint visibility ([ADR-004](DECISIONS.md), [ADR-006](DECISIONS.md)): never turn a hit-test result into a visibility claim.

**Clip.** Intersection of a node's box with its clipping ancestors (`clip` in `measurementSchema`; `packages/runtime/src/clipping.ts`). Text clipping is computed per text fragment against actual clip ancestors and own overflow clips (`observeOwnTextClip`), not against the element's own box; see [the glyph-overhang lesson](solutions/text-clip-glyph-overhang.md).

## Reports and comparison

**Report.** The shared, renderer-neutral model derived from a snapshot: grouped findings, summary counts, `captureHash` (SHA-256), budgets. `reportSchema` / `Report` in `packages/report/src/schema.ts`, built by `createReport` in `packages/report/src/model.ts`. Rendered as text (`format.ts`), single-file offline HTML (`html.ts`) or Markdown (`markdown.ts`) by `anwc report`. Version `0.1` (`REPORT_SCHEMA_VERSION`).

**Agent summary / finding detail.** Compact query views over a report for agents: `AgentSummary 0.1` and `AgentFindingDetail 0.1` (`packages/report/src/query-schema.ts`, `packages/report/src/query.ts`), exposed as `anwc report --query summary|detail`.

**Diff report.** A conservative before/after comparison of two captures: compatibility checks, target matches (`author-key`, `source-site`, `semantic-heuristic`, `ambiguous`, `unmatched`), per-finding status (`verified-fixed`, `persistent`, `new-finding`, `inconclusive`, `non-comparable`) and a summary. `diffReportSchema` / `DiffReport` in `packages/report/src/diff-schema.ts`; engine `compareRepairs` in `packages/report/src/diff.ts`; `anwc diff`. Version `0.1`. STATUS lists its open gap: CLI `diff` does not validate input JSON or bind behavior evidence, so it cannot certify a repair yet (LAUNCH L2).

**Repair integrity verdict (exists).** The diff summary's single overall outcome, `summary.repairIntegrityVerdict`: `verified-repair`, `unresolved-defects`, `regressions-introduced`, `inconclusive-evidence`, `incompatible-comparison` (`packages/report/src/diff-schema.ts`).

**Verdict (planned, P03).** A per-finding `verdict: verified | unverified | contradicted` with a closed `reason` enum for `diff` and `check`. Not built; see [PHASE_4 P03](PHASE_4.md). Until it lands, "verdict" in code means only `repairIntegrityVerdict`.

## State replay

**State manifest.** A declared, replayable list of UI states: `StateManifest 0.1` with `baseUrl` and `scenarios`. `stateManifestSchema` in `packages/cli/src/manifest.ts`; run by `anwc check` via `packages/cli/src/runner.ts`.

**Manifest scenario / checkpoint / step.** A manifest *scenario* has an id, viewport and *checkpoints*; a checkpoint is a list of *steps* (`navigate`, `click`, `fill`, `scroll`, `wait-for-selector`, `capture`) plus *behavior assertions* (`visible`, `hidden`, `text-contains`, `attribute-equals`). `scenarioSchema`, `checkpointSchema`, `checkpointStepSchema`, `behaviorAssertionSchema` in `packages/cli/src/manifest.ts`. The runner, not capture, performs interactions.

**Check run result.** The outcome of `anwc check`: `CheckRunResult` in `packages/cli/src/manifest.ts`. Its `passedAll` means replay and assertions succeeded, not that the UI is clean (STATUS, LAUNCH L1).

## Studio

**Studio.** The local UI served by `anwc studio` (default port 4180): server in `packages/cli/src/studio.ts`, app in `packages/studio/src`, built into `packages/cli/dist/studio`.

**Preset / sample data.** A built-in, pre-recorded example capture shown in the studio, labelled "Sample data" in the header (`STUDIO_PRESETS` in `packages/studio/src/data/presets.ts` and `packages/cli/src/studio-presets.ts`). When no preset is active the badge reads "Live capture" (`packages/studio/src/components/Header.tsx`).

**Target / target health.** The URL the studio's ground-truth pane loads. `GET /api/target-status` (`probeTarget` in `packages/cli/src/studio.ts`) checks whether anything answers there; the example catalog with ports and start commands is `EXAMPLE_TARGETS` in `packages/studio/src/data/targets.ts`.

## Evaluator

**Receipt / grade.** Evaluator records for prepared broken/healthy pairs and their grading, contract `0.4`: `PreparedPairReceipt` in `packages/benchmark/src/prepare.ts`, `GradeResult` in `packages/benchmark/src/grade.ts`. See [EVALUATOR_SETUP](EVALUATOR_SETUP.md).

**Condition.** Which arm a benchmark subject belongs to: `'ordinary' | 'anwc-assisted'` (`SubjectCondition` in `packages/benchmark/src/subject.ts`).
