# Phase 4: from inspection tool to the UI verifier agents rely on

Status: **proposed, not started.** Written 2026-11-12 after Phase 3 (Q01–Q11) and the interactive studio landed. Nothing in this document is implemented. [STATUS](STATUS.md) remains the source of truth for what works; [ROADMAP](ROADMAP.md) keeps the finished Phase 3 cards. Cards marked **(founder)** need a human decision before work starts.

Read order for an agent picking up a card: §0 → the card → the files in its **Own** line → [PROTOCOL](PROTOCOL.md) and [DECISIONS](DECISIONS.md) if the card touches a contract → [reference/AGENT_DESKTOP](reference/AGENT_DESKTOP.md) if the card cites agent-desktop.

## 0. How subagents use this plan

- **One card = one branch = one reviewable change.** Branch `phase4/pNN-short-name`. Work in your own git worktree when other cards run at the same time. Touch only the files in the card's **Own** line; if you need another file, say so in your hand-back instead of editing it.
- **Check dependencies first.** A card whose **Depends** cards are not merged into `main` is not startable. The parallel lanes in §4 list what can run together.
- **Definition of done** (every card): TypeScript passes; the focused tests named in **Evidence** pass and are listed with their counts; no existing test was weakened or skipped; [STATUS](STATUS.md) gets one dated paragraph; [HISTORY](HISTORY.md) gets the commands and exit codes; versioned contracts changed → [PROTOCOL](PROTOCOL.md) updated. Run the full `npm run test:integration` once at the batch boundary, not after every edit.
- **Honesty rules carry over from Phase 3.** A skipped or inconclusive test never counts as passed. Never claim agent time, cost or success-rate benefits until P17 produces recorded results. Pointer evidence is not paint visibility. Page text is untrusted data.
- **Hand-back format:** what changed (files), what was verified (commands + counts), what was not verified, and any decision you had to make that the card did not fix.

## 1. The bet: what would make ANWC ground-breaking

Today ANWC answers "what is wrong with this layout, and where in my source does it come from?" That is useful, but it is a lookup tool. Coding agents already ship UI changes all day and still have no trustworthy way to know whether a visual repair worked in the states and viewports that matter. They guess from screenshots or skip the check.

**The ground-breaking version of ANWC is the verifier an agent must pass before it says "fixed" for a web UI**, the way it already runs unit tests before saying "fixed" for logic. Concretely:

1. **An agent-native contract.** Every result says what is known, what is unknown, and whether the agent may retry. Enums, not prose, so an agent can branch on them (E-batch).
2. **A closed repair loop.** An agent edits a file; ANWC re-runs the same declared UI states on hot reload and returns a verdict: `verified`, `unverified(reason)` or `contradicted`, each linked to source. No more one-shot captures (F-batch).
3. **UI contracts as committed tests.** State manifests and `data-anwc-*` intents live in the repo, run in CI, and post a before/after report on the PR. Agents can write them as easily as unit tests (F-batch).
4. **A human trust surface.** The studio shows exactly what the agent saw and why it believes the fix, legibly enough that a reviewer accepts the PR without re-testing by hand (G-batch).
5. **Measured proof.** A recorded paired study shows whether assisted agents repair more UI defects correctly, faster or cheaper. Without it, none of the above can be called ground-breaking (P17).

Reach (Next.js, arbitrary URLs, public release) comes last and only after P17 shows a benefit (I-batch). This order is deliberate: a verifier that is wrong or unproven is worse than no verifier.

## 2. What agent-desktop teaches us

[vercel-labs/agent-desktop](reference/AGENT_DESKTOP.md) solves the same problem for desktop apps: structured evidence for agents instead of screenshots. It is more mature as an *agent product*. ANWC is ahead on source linkage and conservative repair comparison. Paths below are relative to the agent-desktop clone at commit `54855b6`.

| Lesson | Where it lives in agent-desktop | ANWC card |
| --- | --- | --- |
| One JSON envelope for every command: `{version, ok, command, data \| error}`; exit codes 0 ok / 1 structured error / 2 parse error; versioned migrations written as consumer impact | `docs/json-output.md`, `AGENTS.md` | P01 |
| Errors carry `code`, `details.kind`, a closed `recovery.strategy` enum and `disposition.retry: safe \| unsafe` | `crates/core/src/response/` | P01 |
| Refs are scoped to the snapshot that produced them (`@s8f3k2p9:e8`); reuse after change fails with `STALE_REF` or `AMBIGUOUS_TARGET` instead of hitting the wrong element | `README.md`, refs code | P02 |
| Results say `delivered_verified` vs `delivered_unverified` (with `verification_reason`) vs contradicted; "a flag that every successful call carried proved nothing" | `crates/core/src/actions/post_action.rs`, `docs/json-output.md` | P03 |
| Skeleton first, then drill one region with `--root`; cut containers report `children_count` | skeleton/drill-down docs | P04 |
| Partial observations are successes with `complete:false` and per-node `subtree_truncated`; timeouts carry `last_observed` | `docs/json-output.md` | P05 |
| The usage skill is compiled into the binary (`skills get desktop`), so it always matches the version; the skill has a "load this reference only when…" table and defers flags to `--help` | `crates/core/src/commands/skills.rs`, `skills/agent-desktop/SKILL.md` | P06 |
| The MCP server is derived from the CLI definition and runs the CLI underneath, so there is one source of truth; its instructions string is a ten-line mini-skill | `src/mcp/catalog.rs` | P07 |
| Act → settle → verify with explicit budgets and "a fixed sleep is a race"; sessions are explicit, with a JSONL trace | `post_action.rs`, session/trace code | P08 |
| Visual debug artifact: numbered boxes matched to a numbered list, role-group checkboxes filter the overlay, click-to-isolate, a one-sentence legend per mode, a "why it is here" line per item, refuse to draw misaligned overlays | `src/visual_debug/` | P11 |
| Trace viewer: command-grouped timeline with status stripes, ✓/✗/○ badges, durations, `/` filter, j/k keys, light and dark tokens, redacted JSON detail | `crates/core/src/trace/trace_read/viewer.*` | P13 |
| Contributor knowledge for agents: `AGENTS.md` ("where the truth lives", definition of done), `CONCEPTS.md` glossary that names folders, `docs/solutions/` lessons with searchable frontmatter | repo root, `docs/solutions/` | P14 |
| Every effect verified by an independent oracle, "never by the command's own ok:true"; doc-literal drift tests; architecture gate that plants a violation of every rule before scanning, so a dead rule fails | `tests/e2e-linux/oracle/`, `src/cli/doc_literal_drift_tests.rs`, `scripts/check_architecture.py` | P15 |
| Key-based redaction of sensitive fields in traces; gitleaks with privacy rules (home paths, emails); secrets via `--stdin` | `crates/core/src/trace/trace_sanitize.rs`, `.gitleaks.toml` | P16 |

**On cloning the UI.** agent-desktop has no app UI to clone: its visual surfaces are single-file, vanilla-JS HTML debug artifacts drawn over a static screenshot. ANWC's studio, with a live iframe, is the richer base. Keep the studio and adopt agent-desktop's *encoding and interactions* (P11–P13), written from scratch. Do not copy its code, CSS or branding; see the rules in [reference/AGENT_DESKTOP](reference/AGENT_DESKTOP.md).

**Not adopted:** an LLM inside the tool (agent-desktop's `jev` loop). ANWC keeps "no model dependency for inspection or reports" from Phase 3. Physical input and multi-agent `--agent-id` policy are also out of scope; ANWC's replay runner only performs interactions declared in a manifest.

## 3. Cards

Size: S ≈ under a day for one agent, M ≈ 1–3 days, L ≈ a week or more.

### D0-batch: close Phase 3 acceptance gaps first

The 2026-09-17 launch triage ([LAUNCH](LAUNCH.md), merged 2026-11-12) found gaps that make `check` and `diff` untrustworthy as a verifier. A verifier that is wrong is worse than none, so these come before new contract work. The full briefs are LAUNCH **L1–L3**; follow them as written, with these Phase 4 notes:

- **L1 (Q06 replay acceptance)** — owns `packages/cli/src/{manifest,runner}.ts`, `tests/browser/check.spec.ts`. Prerequisite for P03 and P08.
- **L2 (Q07 diff input validation and explanations)** — owns `packages/cli/src/index.ts` diff path, `packages/report/src/diff.ts`, `tests/unit/diff.test.ts`. Overlaps P01/P03 files: finish L2 before starting either.
- **L3 (Q05 boundary checks)** — owns `tests/conformance/*`, `tests/browser/conformance.spec.ts`. Note the matrix now has 34 cases (12 defective, 13 healthy, 9 boundary) after Q08, not the 29 LAUNCH mentions. Overlaps P15: finish L3 first.
- **L0 (fresh-clone launch gate)** belongs to whoever runs the launch, not to Phase 4.

### E-batch: agent contract

#### P01 — One result envelope and error taxonomy (M)

**Own:** `packages/protocol` (new `envelope` schema), `packages/cli/src/index.ts` output paths, `tests/unit/cli.test.ts`, PROTOCOL. **Depends:** none.

Build:
1. `Envelope 0.1`: `{ version, ok, command, data }` or `{ version, ok:false, command, error }` for every `--format json` output of `inspect`, `check`, `diff`, `report`, `doctor`. Omit empty fields. Snapshot `0.1`, Report `0.1`, DiffReport `0.1` and the other existing payloads stay unchanged inside `data`.
2. `error = { code, message, details?: { kind, ... }, recovery?: { strategy, retryable, requiresFreshCapture } , retry: "safe" | "unsafe" | "unknown" }`. Closed code list to start with: `INVALID_USAGE`, `TARGET_UNREACHABLE`, `RUNTIME_MISSING`, `CSP_BLOCKED`, `NOT_SETTLED`, `CAPTURE_STALE`, `AMBIGUOUS_TARGET`, `SOURCE_UNMAPPED`, `BUDGET_EXCEEDED`, `INTERNAL`. Map each existing `CliError` to one.
3. Exit codes: 0 ok, 1 structured error, 2 usage/parse error with the envelope still printed. Text format keeps its current look.

**Acceptance:** every JSON command output validates against the envelope schema; each code has a test that produces it; `retry:"safe"` appears only where re-running cannot duplicate an effect. **Evidence:** schema tests and CLI tests per code. **Handoff:** document migration from bare payloads in PROTOCOL.

#### P02 — Capture-scoped node references (M)

**Own:** `packages/protocol` node id types, `packages/report` query engine, CLI `report --query detail`. **Depends:** P01.

Build: qualify node ids by capture (`c_<8-hex>:n34`, from the capture hash). `--node-id` with a bare `n34` → `INVALID_USAGE`; with an id from another capture → `CAPTURE_STALE`; matching more than one live instance → `AMBIGUOUS_TARGET` with candidates in `details`. Keep accepting old saved captures for viewing.

**Acceptance:** a drilldown after HMR or a re-capture can never silently resolve to a different `.map()` instance. **Evidence:** unit tests for each refusal plus one re-capture test.

#### P03 — Verification verdicts instead of bare "0 findings" (M)

**Own:** `packages/report` diff engine and renderers, `packages/cli` check/diff output. **Depends:** P01.

Build: each targeted finding in `diff` and `check` gets `verdict: "verified" | "unverified" | "contradicted"` plus `reason` from a closed enum (`finding_absent_target_retained`, `target_unmounted`, `target_ambiguous`, `state_not_reproduced`, `coverage_reduced`, `behavior_assertion_failed`, `measurement_unsupported`). A clean run with reduced coverage is `unverified(coverage_reduced)`, never "verified". Top-level summary counts per verdict.

**Acceptance:** the existing deletion/unmount invariants still hold and now surface as `contradicted`/`unverified` with the right reason. **Evidence:** extend `tests/unit/diff.test.ts`; one CLI test per reason.

#### P04 — Skeleton first, then drill (M)

**Own:** `packages/report` query engine, CLI `inspect`/`report` flags. **Depends:** P02.

Build: `--skeleton` groups findings by source file → component → region with counts and one drill ref per group; `--root <ref>` returns the detail for that group only. Cut groups show `childrenCount`. Target: first response under 1,500 characters on the dashboard example.

**Acceptance:** totals in skeleton equal totals in full output; drilling every group reproduces the full finding set. **Evidence:** invariant tests on all three example apps.

#### P05 — Partial-but-successful captures (S)

**Own:** `packages/runtime` collector limits, `packages/protocol` snapshot fields, report renderers. **Depends:** P01.

Build: when the 1,500-element cap, settle timeout or unsupported boundary cuts coverage, mark affected nodes `truncated:true`, add `nodesObserved` and, on settle timeout, `lastObserved`. Text/HTML show it in the header.

**Acceptance:** a zero-finding partial capture is never rendered as clean. **Evidence:** conformance cases with the cap lowered.

### F-batch: reaching agents and closing the loop

#### P06 — `anwc skills get` (S)

**Own:** new `skills/anwc/SKILL.md` + `skills/anwc/references/*.md`, CLI `skills` command, build step that bundles them. **Depends:** P01.

Build: a skill covering the loop (inspect → read finding → edit source → `check`/`diff` → act on verdict), capture refs, verdicts and retry rules, plus a "load this reference only when…" table. Bundle it into the CLI so `anwc skills get` prints the version-matched text. Add a two-line AGENTS.md snippet to QUICKSTART.

**Acceptance:** a fresh agent given only the installed tarball and `anwc skills get` repairs the `blocked-checkout` lab case (dogfood "as a stranger"; record transcript summary in HISTORY). **Evidence:** CLI test that the printed skill matches the bundled file and mentions only commands that exist.

#### P07 — MCP server derived from the CLI (M) (founder)

**Decision needed:** ADR-007 and the Phase 3 scope deferred MCP. Record ADR-021 accepting it before starting.

**Own:** `packages/cli/src/mcp/*`, CLI `mcp` command. **Depends:** P01, P06.

Build: `anwc mcp` serves each command as an MCP tool over stdio (`anwc_inspect`, `anwc_check`, `anwc_diff`, `anwc_report_query`, `anwc_skills_get`). Generate tool schemas from the same option definitions the CLI parser uses; execute through the CLI path so there is one implementation. Server instructions: a short mini-skill pointing to `anwc_skills_get` first.

**Acceptance:** every tool's schema matches CLI flags (drift test); tool results are the P01 envelope. **Evidence:** MCP protocol test with a scripted client.

#### P08 — Live session and watch loop (L) (founder)

**Decision needed:** PLAN §8 and ADR-007 call a long-lived browser session "later work". Record ADR-022 before starting.

**Own:** new `packages/cli/src/session/*`, runner reuse, trace format in `packages/protocol`. **Depends:** P02, P03.

Build: `anwc session start --manifest states.json` keeps one Chromium context alive against the dev server. `anwc watch` re-runs every declared state on Vite HMR or file save, then emits a DiffReport against the session baseline with P03 verdicts. Settle with explicit budgets (no fixed sleeps); write a JSONL trace (`session.start`, `state.replay`, `capture`, `diff`) with redaction (P16).

**Acceptance:** editing the shop's cookie-notice CSS flips `blocked-checkout` from `unverified` to `verified` within one watch cycle, and breaking another state is reported as `contradicted`. **Evidence:** browser test driving a real edit in a temp copy of `examples/shop`.

#### P09 — UI contracts in CI and on pull requests (M)

**Own:** `.github/actions/anwc-check/*` (composite action), Markdown diff renderer tweaks, docs. **Depends:** P03.

Build: a reusable GitHub Action that starts the app, runs committed state manifests at base and head, and posts the Markdown DiffReport as one PR comment (update in place). Fails the job only on `contradicted` or new errors; `unverified` is a warning.

**Acceptance:** demo PR on a fork shows the comment for a fix and for a regression. **Evidence:** workflow run links in HISTORY. Posting to real PRs needs the user's go-ahead.

### G-batch: the studio as the human trust surface

#### P10 — Target health and honest sample labelling (S) — done 2026-11-12, Playwright test outstanding

**Own:** `packages/studio/src/components/{Header,GroundTruthPane}.tsx`, `packages/studio/src/data/presets.ts`, `packages/cli/src/studio*.ts`. **Depends:** none. Start here; it fixes the "127.0.0.1 refused to connect" experience from 2026-11-11.

Build: before loading the iframe, the studio server checks the target URL and shows "Target not running at …, start it with …" instead of the browser error. Preset URLs come from one config with the documented ports (4175/4176/4177). Findings from built-in presets carry a visible "sample data" badge until the user clicks Inspect; preset source paths must point at real files.

**Acceptance:** each preset opened with its app stopped shows the guidance; with it running shows the page. **Evidence:** studio unit tests plus one Playwright test.

#### P11 — Studio encoding, legend and isolation (M) — done 2026-11-13, hallway test outstanding

**Own:** `packages/studio/src/components/{XRayPane,FindingDrawer,FindingCard,SampleTooltip}.tsx`, `index.css`. **Depends:** P10.

Build, written from scratch:
1. Numbered boxes in the x-ray match numbered finding cards; hover or select links both ways.
2. A fixed legend and a one-sentence explanation of what the boxes mean for the current view. Visual encoding: target, blocker, clipping ancestor and context each get a distinct color *and* line style (solid / dashed / dotted), so it works without color. Hit samples: reachable, blocked, clipped.
3. Rule-category checkboxes that filter the overlay and list together; "show all" resets; click a finding to isolate its boxes.
4. Each card has a "why this is reported" line taken from the finding's measured relation, and its limitations.
5. Light and dark themes from tokens; keyboard: j/k between findings, `/` to filter, Esc to clear.
6. Refuse to draw the overlay when the iframe viewport and capture viewport differ, with a message, instead of drawing misaligned boxes.

**Acceptance:** a first-time viewer can say which element blocks Checkout and where it lives in source within 30 seconds (five-person hallway test, note results). **Evidence:** component tests for numbering, filtering, isolation and the mismatch refusal.

#### P12 — Before/after on one stage (M)

**Own:** studio `SplitView`/`XRayPane`, new `DiffStage.tsx`, studio server `/api/diff`. **Depends:** P03, P11.

Build: load a DiffReport (or two captures), toggle Before/After on the same stage, show verdict chips per finding, and never draw "after" boxes for an unmounted or ambiguous target.

**Acceptance:** the deletion case is visibly `contradicted`, not green. **Evidence:** component tests plus one browser test.

#### P13 — Run timeline (M)

**Own:** new studio view `Timeline.tsx`, studio server `/api/trace`. **Depends:** P08 (trace format); can start against `check` results first.

Build: a timeline grouped by state/step with status stripe, ✓/✗/○ badge and duration; search with match count; selecting a row shows its redacted evidence and the P12 stage.

**Acceptance:** a 20-state watch session stays responsive and readable. **Evidence:** component tests with a recorded trace fixture.

### H-batch: trust, knowledge and proof

#### P14 — Knowledge base for contributing agents (S)

**Own:** new `AGENTS.md`, `docs/CONCEPTS.md`, `docs/solutions/README.md` + first entries. **Depends:** none. Do early; every other card benefits.

Build: AGENTS.md with where the truth lives (STATUS, PROTOCOL, PHASE_4), commands, definition of done, honesty rules. CONCEPTS.md glossary (capture, finding, intent, coverage, verdict, source site vs instance, pointer vs paint) whose words code and folder names must use. `docs/solutions/` with frontmatter (`module`, `symptoms`, `tags`) and three seed lessons from history, for example the text-clip glyph-overhang false positive (ADR-016) and the studio preset port mismatch.

**Acceptance:** links resolve; no statement contradicts STATUS. **Evidence:** a doc link check.

#### P15 — Independent oracles, drift tests and gates that cannot silently die (M)

**Own:** `tests/conformance` oracle helpers, new `tests/unit/doc-drift.test.ts`, gate script. **Depends:** none.

Build: for each rule, a gate table (healthy control, defect, boundary) checked by an oracle that does not import ANWC code (plain Playwright `elementFromPoint`, `scrollWidth`, range rects). A doc-drift test fails when README/QUICKSTART commands or counts disagree with the CLI. Each custom gate plants a known violation first and fails if it is not detected.

**Acceptance:** deleting a detector rule makes the suite fail. **Evidence:** run with one rule disabled on purpose; record the failure in HISTORY.

#### P16 — Privacy and redaction (S)

**Own:** `packages/report` redaction module, trace writer hooks, `.gitleaks.toml`. **Depends:** P01.

Build: key-based redaction (labels, text, URLs with query strings, input values, absolute home paths) for shared exports and traces; error messages report shapes, not raw values. Gitleaks config with privacy rules for home paths and emails; ignore committed synthetic fixtures explicitly.

**Acceptance:** a capture of a page with an email, a token in the URL and a filled input exports with all three redacted. **Evidence:** unit tests and a gitleaks run on the repo.

#### P17 — The paired pilot (founder)

**Decision needed:** which model(s), budget, and who operates. This is human-run work with paid model sessions.

Run the Q11 operator kit ([EVALUATOR_SETUP](EVALUATOR_SETUP.md)): six counterbalanced runs, ordinary vs assisted, three apps. Add a third arm once P06/P07 exist: assisted via skill + MCP. Record correctness, regressions, wall time, tokens and cost per run in the ledger. Then commission at least six independently authored holdout defects before any generalisation claim.

**Acceptance:** recorded results in the ledger, written up in HISTORY with limits, whichever way they point. This card is the gate for calling ANWC ground-breaking and for the I-batch.

### I-batch: reach (only after P17 shows a benefit)

#### P18 — Next.js source adapter (L) (founder)

Revisit ADR-015. SWC/Turbopack transform with the same source-site identity, dev-only, production stripped. Acceptance mirrors the Vite consumer tests.

#### P19 — Runtime-only arbitrary URLs (L)

Execute R02–R06 from [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md): `source unavailable` reported honestly, CSP-compatible injection, coverage reporting.

#### P20 — Public alpha release and agent-readable docs (M) (founder)

npm publication of the packages, a docs site with per-page Markdown and `llms.txt`, a skills.sh listing for the P06 skill, CHANGELOG with consumer-impact breaking-change notes.

## 4. Order and parallel lanes

| Lane | Cards in order | Notes |
| --- | --- | --- |
| Gaps (D0) | L1, L2, L3 | Independent of each other; L2 before P01/P03, L3 before P15, L1 before P03/P08 |
| Contract | P01 → P02 → P04; P01 → P03; P01 → P05 | P01 first; P02, P03 and P05 can run in parallel after it (disjoint files except PROTOCOL: merge PROTOCOL edits last) |
| Studio | P10 → P11 → P12 → P13 | P10 and P11 can start immediately; P12 waits for P03 |
| Knowledge and trust | P14, P15, P16 | Independent; P14 first if only one agent is free |
| Agents | P06 → P07 (founder); P03 → P09; P02 + P03 → P08 (founder) | P08 is the largest single card |
| Proof | P17 (founder) | Can start with the current CLI arm any time; add the MCP arm after P07 |
| Reach | P18, P19, P20 | Blocked on P17 results |

Suggested first wave: **P10 → P11** (studio, no overlap with D0), plus **L1**, **L2**, **L3** and **P14** in parallel. Then P01 and P15. Batch boundary gates: after D0, after E (P01–P05), after F+G, after H.

## 5. Decisions the founder needs to make

1. Accept MCP (P07) and long-lived sessions (P08) by recording ADR-021/ADR-022, which revise ADR-007's deferral.
2. Budget and model choice for P17, and who runs the sessions.
3. Whether CI comments (P09) may run on the real repository's pull requests.
4. Public npm publication and a docs site (P20).

Until then, L1–L3, P01–P06 and P09–P16 can proceed without human input.
