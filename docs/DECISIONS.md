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
