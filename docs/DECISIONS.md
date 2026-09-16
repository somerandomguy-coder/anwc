# Architecture decision record

These began as planning defaults on 2026-09-15. T00–T09 implemented the MVP consistent with them and froze it at `4c6cafe`; they may be revised only with evidence and a recorded follow-up decision. They do not claim that both collaborators have already reviewed or accepted every detail.

| ID | Decision | Reason | Revisit when |
| --- | --- | --- | --- |
| ADR-001 | Start with a Vite/React plugin, not a forked framework | Minimal migration and fastest complete experiment | Proven demand for framework-owned routing/SSR |
| ADR-002 | Separate source compiler from browser measurements | Compile time cannot know final viewport/state geometry | Never merge these concepts; improve integration only |
| ADR-003 | Runtime-only inspection remains possible | Supports existing/Next/vanilla apps and isolates compiler value | Source mapping becomes universally available |
| ADR-004 | Distinguish render state, clip bounds, hit tests, and paint visibility | Prevent incorrect visual guarantees | A validated paint adapter adds stronger evidence |
| ADR-005 | Use browser pointer hit testing; no handwritten z-index sum | Browser resolves actual pointer stacking | Only for measured performance limitations |
| ADR-006 | No universal `visiblePercent` in v0 | Arbitrary paint and compositing exceed DOM hit evidence | Restricted compositing model is independently validated |
| ADR-007 | Snapshot on demand; CLI before MCP/deltas | Keeps state, lifecycle and debugging manageable | Repeated captures or agent integration justify transport work |
| ADR-008 | Source-site identity plus live instance identity | Repeated list elements share source but differ on screen | Future cross-session semantic identity requirements |
| ADR-009 | Wrap/scroll facts need intent before becoming errors | Otherwise healthy layouts become false positives | Better externally validated intent inference exists |
| ADR-010 | JSON canonical, concise findings view for agents | Inspectable and easy to measure | Token experiments justify a denser representation |
| ADR-011 | Development-only instrumentation by default | Avoid production overhead and source metadata exposure | Users explicitly need audited production instrumentation |
| ADR-012 | npm workspaces and pinned browser/toolchain | Node available; unnecessary infrastructure delays testing | Actual workflow needs another package manager |
| ADR-013 | Same-agent matched benchmark, competent baseline | Separates tool benefit from model/tool handicaps | Later cross-model/real-world replication |
| ADR-014 | Independent truth and held-out variations | Detector must not grade itself or memorize scored fixtures | Always retain independence |
| ADR-015 | Defer Next.js compiler integration; offer runtime-only path | Vite integration does not establish SSR/Turbopack compatibility | Vite source linkage demonstrates measurable value |
| ADR-016 | Treat clean-fixture actionable findings as release blockers | T09 exposed a text-clip false positive from normal glyph overhang; detector trust depends on healthy controls | A broader corpus establishes a better regression policy |

### ADR-017 — Continue correctness work while human experiments are pending

Date: 2026-09-15. Context: the prototype suite passes, but source review found incomplete export isolation, weak independent fixture checks, and missing-value accounting gaps. The founder requested a concrete implementation backlog for cheaper models while manual testing takes time.

Decision: execute the bounded W01–W14 backlog in [original W roadmap](archive/W_ROLLOUT.md). Preserve each actual experiment's app, detector, fixture, prompt, and grader revisions; do not require development to stop globally. Prioritize reliable exports, healthy controls, functional fixtures, independent grading, and two additional app layouts. Defer Next.js source adapters, MCP, and paint-engine expansion to an evidence-informed scope discussion. New work is planned; no new capability or benchmark improvement is claimed by this decision.

### ADR-018 — Arbitrary URL inspection is a core product path

Context: the founder attempted uninstrumented Amazon/Instagram URLs and reported a runtime timeout and CSP evaluation failure. The current default requires a preinstalled runtime and the injection/error path is insufficient for general sites.

Decision: plan R01–R06 in [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md). The intended default reuses compatible installed instrumentation or attaches the collector to a temporary inspection session. Preserve source-null behavior on uninstrumented sites, measure without fixture names, distinguish intent from geometry, and report unsupported coverage explicitly. Keep CSP enabled in the default path and validate strict-CSP compatibility locally. This track may start before additional benchmark apps. W12 remains a separate subject-preparation capability. The user requested planning only this turn; no runtime change is claimed.

## Questions to resolve with evidence

1. Does source linkage reduce repair time beyond runtime measurements alone? Run condition D after A/B.
2. Do agents need a compact report, a structured query API, or both? Measure actual follow-up calls and total context.
3. How often does visual coverage outside the v0 capability set block useful repairs? Count it rather than optimizing hypothetical cases.
4. How many annotations are acceptable? Compare automatic observations with a small number of legitimate shared layout expectations.
5. What creates false positives on unfamiliar apps? Expand beyond the authored shop before selecting global defaults.
6. Do adopters primarily want a development plugin or an externally injected inspection tool? Ship the useful entry point first.

## Change template

```md
### ADR-xxx — title
Date / owner:
Context and observed evidence:
Decision:
Alternatives considered:
Effect on protocol, modules and tests:
Migration required:
Review acknowledgement:
```

Do not reopen every decision during each small coding task. Escalate an interface conflict or correctness issue with a minimal concrete example and a proposed contract change.

### ADR-019 — Phase 2: trustworthy evaluation and external-project adoption

Date: 2026-09-16. Context: W01–W14 implementations shipped through `d616943`; source review found that blanket completion exceeded the recorded acceptance evidence. The founder requested next-phase planning and current collaborator docs.

Decision: use P01–P09 in ROADMAP. First fix independent checks, neutral materialization, provenance/intent and clean grader execution; then complete the three-app/two-arm rehearsal. Next package a local alpha and prove installation/source linkage on an external React/Vite app. Freeze a small pilot and await real founder-run observations before broader product claims. Keep development progressing while human tests are pending.

The first supported product remains installed ANWC. The user’s arbitrary-site goal is retained in R02–R06, but is not activated by W rollout completion. Next.js source adapters, MCP, persistent sessions, paint research and public npm publication remain separately scoped decisions. No need to invent more fixture apps before proving the existing 18 pairs.

Protocol effect: browser snapshots remain 0.1. P03 will introduce a strict benchmark 0.3 contract because current 0.2 provenance/integrity semantics are insufficient; retain historical records and require explicit regeneration for certification. All P tasks are planned, not newly delivered features.

This planning decision does not authorize paid model runs or claim a reviewed public release. Next implementation at that time: P01. Founder input is needed at the pilot/broader-product gates, not for routine task implementation choices.

### ADR-020 — Phase 3: a dependable UI repair workflow

Date: 2026-09-17. Context: the founder requested a useful next phase, edge-case coverage and human-readable output. Review at `4093fcb` found real collector/package/evaluator capabilities, but no recorded human model comparison, a reproduced ledger regression, and source-reviewed gaps in grade identity, result semantics and target-bound intent. Phase 2's blanket certification wording exceeded current evidence.

Decision: Q01–Q11 in [ROADMAP](ROADMAP.md) is the sole active backlog. Repair provenance/intent first, then ship a shared evidence model and offline human reports early. Add independently checked browser conformance cases, explicitly replayed local states, conservative before/after matching, targeted engine fixes, compact agent drill-down, and installed Windows/Linux acceptance. Finish the operator kit; actual model sessions remain a human gate. Archive P cards and keep STATUS short enough for a collaborator to resume without reading historical plans.

The phase-end proof is a source repair in an unrelated React/Vite app, replayed at named states and two widths, with a readable report distinguishing measured change, retained behavior and unknown coverage. Source identity, stable public intent, independent browser oracles and reproducible repair evidence are the intended cumulative advantage. This is a product hypothesis, not demonstrated uniqueness or agent savings.

Alternatives: merely add fixture sites or polish text (misses repair verification); start arbitrary-site/Next.js/MCP work (expands scope before installed adoption evidence); stop all development until model tests (leaves actionable engineering gaps and usability work idle). Keep those broader product tracks deferred, not cancelled.

Contracts: preserve snapshot `0.1` compatibility; version report/state/diff separately. Propose benchmark receipt/result `0.4` with explicit migration instead of silently certifying old grades. Capture remains read-only; declared replay is a separate runner. Supported scope stays local installed React/Vite/Chromium; no hosted service or public package publication in this phase.

Delivery: four coherent batches, a commit for each completed card, focused checks during work and one exit-recorded full integration run per batch. Q05 may complete its measurement harness while recording engine failures for Q08; failures never become passes. No automatic sub-agent delegation. Stop after engineering acceptance with human evidence explicitly pending rather than creating another speculative backlog. This decision records planning only; Q01 is next.
