# Phase 2: a trustworthy, installable ANWC alpha

Planning review: 2026-09-16. The P01–P04 evaluator-foundation implementation batch is in review. It has targeted unit/browser evidence, but it is not acceptance-certified; retain the remaining acceptance work below.

## Outcome and sequence

A developer should be able to add ANWC to an existing React/Vite application, inspect it with a plain local URL, get useful source-linked evidence, repair a problem, and check the result. The evaluator should be able to compare that workflow with ordinary agent tools without leaking answers or accepting superficial repairs.

Build in two milestones: **M1 — trustworthy evaluation (P01–P05)**, then **M2 — external-project alpha (P06–P08)**. P09 is the founder-run experiment and next-scope decision. P06 can start while human testing is pending; human model runs are not a dependency for engineering. Do not grow the fixture count beyond the existing 18 development pairs during this phase.

The long-term AI-native framework remains a direction. This phase establishes the part a normal React developer can adopt with a small configuration change. Keep installed ANWC as the supported default. Arbitrary-site `--runtime-only` remains experimental; R02–R06 in [the future inspector plan](ARBITRARY_URL_PLAN.md) are deferred. Next.js compiler integration, MCP, persistent browser sessions, a new router, and paint-engine research are not this phase's implementation scope.

## What the W rollout actually established

W01–W14 have shipped implementations. Earlier blanket “all complete” statements overstated acceptance coverage. Preserve that work and its history; the corrections below finish the evidence needed to use it confidently. Original cards are in [the W archive](archive/W_ROLLOUT.md); [STATUS](STATUS.md) holds the current baseline.

These are source-review findings, not new browser reproduction results:

| Current evidence or gap | Source | Follow-up |
| --- | --- | --- |
| Checks share a page through `Promise.all`; clicks may change state/scroll while geometry is measured | `fixtures/index.ts:runChecks` | P01 |
| Empty check arrays pass; line count can accept zero lines; element box width does not establish text fit; input fill does not prove pointer access | `fixtures/index.ts`, `fixtures/evaluator.ts` | P01 |
| Opacity is not independently checked by the rendered-action rule; state text is only checked after a click, without proving a transition | same checker | P01 |
| Landing/dashboard broken tests mainly assert target presence; their full independent defect/healthy matrix is absent | `tests/browser/landing.spec.ts`, `dashboard.spec.ts` | P02 |
| Materialization removes the entire first nav, including dashboard tabs; it retains `broken = true` and unused conditional source. TASK requirements disclose the selected problem | `fixtures/registry.ts` | P02 |
| Eight landing/dashboard IDs are preparable; shop is absent from the preparer/grader registry | `fixtures/registry.ts`, `evaluator.ts` | P02 |
| Receipt revision strings are accepted from the caller without Git verification; grader uses current evaluator definitions; intent inside editable src is not frozen | `prepare.ts`, `grade.ts` | P03 |
| Grader installs/runs inside the returned folder; server startup lacks strict port ownership and bounded fetch; child errors/logs are insufficient | `grade.ts` | P04 |
| W14 prepares two arms but grades only ordinary, for two apps; reports have caller-supplied short revisions | `rehearse.ts`; local historical report | P05 |
| Package manifests are private and export raw TypeScript within the monorepo; no independently installed alpha has been established | package manifests and Vite/CLI entrypoints | P06 |
| No real paired agent runs or verified time/cost savings | history and benchmark ledger examples | P08–P09 |

## Fixed decisions for implementers

- Keep TypeScript, React, Vite, Chromium/Playwright, npm workspaces, Zod, and the existing parser/toolchain. Add no service, database, account, model API, or new framework.
- Snapshot schema stays `0.1`. P03 introduces a separate benchmark receipt/result contract `0.3`; never silently reinterpret old `0.2` receipts as certified. Old artifacts remain readable as historical records.
- Capture remains read-only. Evaluator setup may click, fill and scroll; its actions must be recorded separately. Paint visibility stays unknown.
- Both arms get the same app, legitimate intent, task, browser tools, and budget; only assisted gets ANWC. Screenshots remain allowed in the initial comparison.
- Frozen intent means preserving declarations' meaning, not freezing an entire source file or its line numbers. Valid CSS/JSX alternatives must remain possible.
- Keep evaluator definitions, patches, receipts, reports, and Git history outside agent subjects. Local folders are sufficient; no new repo or npm publication is authorized by this plan.
- One task per reviewable commit, update STATUS/HISTORY and push under existing user authorization. Sequential is the default; this document does not request subagents.
- Run meaningful focused checks during implementation, then the full integration gate for code changes before handoff. Docs-only work needs links/commands/consistency checks, not a new browser run.
- Do not label a command available until its CLI and acceptance checks exist. Proposed flags below are contracts for the owning task.
- Escalate only a requirement that cannot be resolved with these decisions. Provider choice/payment, public publication, and a broader framework adapter require founder input.

## Task board

| Task | Concrete result | Depends on | Status |
| --- | --- | --- | --- |
| P01 | Deterministic independent checks that reject false repairs | shipped W09/W13 | implemented; acceptance evidence in progress |
| P02 | Faithful, neutral subjects and a proven 18-pair matrix | P01 | implemented registry; matrix evidence in progress |
| P03 | Verified provenance and frozen intent/grade contracts | P02 | implemented contract; provenance acceptance in progress |
| P04 | Bounded grading in a clean evaluator copy | P03 | implemented lifecycle; failure-mode coverage in progress |
| P05 | Both arms, all three apps, durable reproducible evidence | P01–P04 | queued |
| P06 | Installable local alpha packages and external consumer | existing Vite/CLI; independent of pilot | ready after M1 by default |
| P07 | Clear first-inspection workflow on an unfamiliar app | P06 | queued |
| P08 | Small runnable pilot kit and explicit ledger import | P05, P07 | queued |
| P09 | Founder-run comparison and next-product decision | P08 | requires human runs |

P01 → P02 → P03 → P04 → P05 is the default first sequence. Then P06 → P07 → P08. If human experiments are delayed, finish M2 and freeze the kit; do not manufacture results or start R/Next.js work automatically.

## P01 — Make independent checks reliable

**Own:** `packages/benchmark/src/fixtures/index.ts`, evaluator definitions as needed, focused checker/browser tests.

**Build:**
1. Execute checks in a recorded order. Measure layout/current viewport before actions. Mutating checks get fresh pages with recorded setup unless explicitly defined as one sequential journey; no parallel actions on one page.
2. Require nonempty required checks. Missing/ambiguous targets, empty required text, zero text fragments, unsupported required geometry, and duplicate check IDs cannot yield a verified repair.
3. Define supported CSS render checks explicitly: target visibility and display, opacity-zero ancestry, a nonempty box, and supported active client clipping. Do not describe these as paint visibility. Distinguish rendered, inside viewport, and pointer-reachable.
4. Check overflowing text with Range/scroll evidence and position relative to the intended content boundary, not just the heading element's own width. Apply active ancestor clips for supported normal-flow rectangles; unsupported clip/transform cases stay unverified. Preserve text and meaningful readable styling; document any minimum font size as public design intent.
5. Give action checks exact/scoped locators. Prove the pre-action status differs, the physical interaction reaches the intended control, and the expected new status appears within a bounded wait. A normal locator click checks actionability; it does not inherently bypass overlays. Use explicit mouse points when testing partial obstruction, with no forced click.
6. Input obstruction checks use a real pointer/focus/typing path and assert the resulting value. A programmatic fill alone cannot prove pointer access. Keep viewport checks before scrolling; record permitted scrolls separately.
7. Bound every lookup/evaluation/action (default 2 seconds, max 10 seconds per declared check); absent targets must not consume repeated default 30-second waits.

**Acceptance:** healthy passes; fully transparent/hidden/clipped targets fail the relevant rule; blocker fails a click; partially blocked input fails its specified point; prefilled success status fails the transition rule; unchanged required content survives; deleted target/text, empty checks, zero lines, and ambiguous duplicate names fail; delayed valid status passes; repeated ordered checks produce consistent outcomes. Include an ordinary below-fold reachable action and an explicitly initial-viewport-required action so their contracts differ.

**Handoff:** checker semantics and failed/unsupported evidence documented; regression tests demonstrate errors that old checks could miss. No ANWC diagnostic/geometry imports in scorer code.

## P02 — Preserve the app and remove benchmark answers

**Own:** fixture registry/materialization, landing/dashboard/shop fixtures, independent browser matrix, shared public requirements.

**Build:**
1. Use one registry for each case's app, viewports, route, setup, public requirements and evaluator sidecar. Keep defect classification/expected outcomes evaluator-only. Public requirements describe the app's full behavior/design, consistently across its variants; no “fix the hidden Growth action” hints.
2. Replace broad nav-removal/boolean substitutions with explicit app-specific materialization boundaries or parser-based transformations using existing dependencies. Produce ordinary app source with one fault; preserve dashboard tabs/drawer, pricing selection, and shop navigation/cart/confirmation. Remove case lists, dead variants, repair switches, preview prose, healthy answers, and defect-revealing identifiers.
3. Freeze all ten shop cases as well as four landing/four dashboard cases into editable subjects. Do not export the public lab or history. Keep identical application files and shared expectations in both arms.
4. Validate all 18 broken/healthy pairs at 390×844 and 1440×900 independently of ANWC, then test the expected detector evidence separately. For truly viewport-specific faults explicitly designate the other width as a control. If an authored “healthy” version fails its public contract, repair the fixture; do not loosen the grader or detector to call it healthy.
5. Prove preserved content and real actions, including inactive/disabled/scrollable healthy controls required by the W cards. Resolve public-task/check inconsistencies such as dashboard drawer save promises missing from grading.
6. TASK.md contains neutral requirements, viewports/state, editable paths, install/dev/build commands, and URL/port instructions. Tool usage for assisted belongs in a separate condition instruction, not altered app intent.

**Acceptance:** all declared pairs have measured broken evidence and passing healthy counterparts; valid alternative CSS repair passes; removing unrelated content/actions fails; exported dashboard Tasks and drawer controls still work; no variant switch or explicit defect label remains. Browser-check at least one materialized subject per app before passing to P03.

**Handoff:** machine-readable 18-pair matrix and explicit unsupported cells. Public cases remain practice data, never statistical holdout.

## P03 — Freeze what was actually evaluated

**Own:** `prepare.ts`, `subject.ts`, strict receipt/result schemas, CLI argument validation and filesystem tests.

**Build:**
1. Introduce benchmark contract `0.3` with strict Zod validation. Record full Git revisions, fixture/registry and grader hashes, source/detector inputs, Node/npm/browser versions, viewports/setup/task, all app and immutable tool/config hashes, and approved editable paths.
2. Default preparation verifies clean Git HEAD matching the requested revision; detector initially comes from that same checkout. Reject misleading arbitrary revision strings or different claimed detector commits. Add a clearly labelled practice mode for dirty work only if needed, recording hashes and dirty state; never mark it scored.
3. Freeze evaluator sidecars outside subjects and bind each grade to their hashes. A mismatched grader version must refuse certified grading or be explicitly recorded as a new evaluation, never silently replace the original grader.
4. Extract and compare legitimate source intent semantically with the existing parser. Editing CSS/JSX/source locations is permitted; removing/changing required expectations or line budgets fails integrity. Dynamic/unverifiable intent has an explicit limitation and cannot silently pass.
5. Validate paths, app IDs, condition, hashes, and port range 1–65535. Reject traversal, symlinks/junctions, overlapping roots and existing outputs before writing. Create unique staging atomically; cleanup removes only the verified directory created by that invocation, never a concurrent/preexisting folder.
6. Readiness before work compares both application hashes; returned-repair integrity allows approved edits. Record submitted artifact hashes and unchanged inputs in the grade. Keep the evaluator receipt immutable.
7. Give old `0.2` receipts a clear migration message: regenerate from the original pinned source or retain as historical, uncertified results. Do not overwrite previous receipts or ledger rows.

**Acceptance:** wrong/dirty revision rejected in scored mode; wrong grader/fixture hash rejected; one-arm change fails preflight; CSS repair permitted after submission; disabled tool/removed intent/config changes rejected; malformed receipt/path/symlink rejected before I/O outside allowed roots; existing output and concurrent creation remain intact after failure.

**Handoff:** versioned schemas and exact current CLI help/commands in EVALUATOR_SETUP.

## P04 — Own the evaluator process from start to finish

**Own:** `grade.ts`, process/copy helpers, CLI result exits, lifecycle tests.

**Build:**
1. Validate submitted inputs, then stage a new evaluator-owned copy containing only frozen inputs plus allowed source edits. Exclude returned dependencies/build/cache/logs; install from the frozen lockfile there. Leave the returned subject untouched. Do not depend on `cleanInstall:false` for certified grading.
2. Launch the intended Vite process directly with loopback binding and strict port selection. Refuse an occupied port; never grade an existing page because Vite selected a different port. Observe child exit/error and bounded readiness requests; establish ownership of the served root.
3. Bound install (120 seconds), startup (15 seconds), navigation/setup/checks (declared limits), and overall grade (180 seconds default). Use cancellation and finally cleanup. Terminate owned descendants and wait for shutdown on Windows/Linux; never kill a unrelated process using a port.
4. Retain bounded stdout/stderr, page errors, failing stage, versions and artifact hashes in evaluator output. Syntax errors/runtime crashes, unsupported checks, and infrastructure failures cannot be interpreted as successful repairs. A syntax-invalid deletion is not evidence that behavioral deletion checking works.
5. Separate return codes: 0 verified; 1 behavioral failure; 2 invalid invocation/integrity; 3 infrastructure/incomplete. Update CLI tests and ledger mapping together; browser inspect exits are unchanged.
6. Output outside submitted source; validate overlap before starting. Record both success and failure results, including timeout and cleanup outcome. No indefinite fetch/locator or orphaned development servers.

**Acceptance:** healthy completes; broken/deleted fail behavior; syntax crash and stalled install/server give bounded labelled results; occupied port running a healthy decoy cannot pass; missing targets finish promptly; repeated grades leave original files unchanged and release all owned processes/ports. Run lifecycle coverage on Windows and Linux; list untested platforms.

## P05 — Finish the cross-app rehearsal evidence

**Own:** `rehearse.ts`, evaluator-only patches, rehearsal tests/report, history.

**Build:**
1. Prepare one representative fault per app (shop, pricing, dashboard), both conditions. For each condition run broken, valid repair, and runnable destructive deletion: **18 grade runs**, each at both required viewports.
2. Assert the broken failure is the intended measured check, repaired checks all pass, and deletion fails required content/action checks. Reject a generic timeout/crash as satisfying a seeded-defect assertion.
3. Independently prove ordinary has no runtime API and assisted produces source-linked CLI evidence. Build/install both from independent folders outside repo ancestry without parent dependencies.
4. Include unchanged-control journeys and at least one alternative CSS repair; verify source expectation/tool tampering separately. Do not hand answer patches to agent subjects before grading.
5. Write full `0.3` provenance and measured per-check evidence. Save a compact sanitized report under `bench/rehearsals/` in Git, full logs outside subject folders. No sole reliance on a developer's temp path.
6. One documented command creates new output, stops on unexpected outcomes, and retains a failure report. Use owned available ports instead of fixed global rehearsal ports; record selected endpoints.

**Acceptance:** the complete matrix succeeds with no skipped arm/app; selected checks identify the original bug, preserved controls pass, destructive repairs fail for behavior, clean install/build and source-link evidence present. A second run can complete without stale processes or prior generated inputs.

**Milestone M1:** the evaluator can reliably verify a returned repair. This does not yet establish cheaper agents.

## P06 — Make ANWC installable outside this repository

**Own:** compiler/runtime/protocol/diagnostics/Vite/CLI package manifests/build/export/bin definitions and external-consumer acceptance harness.

**Build:**
1. Create compiled ESM and declaration outputs using the existing toolchain. Define explicit exports, dependency/peer edges, files allowlists, versioned local prerelease artifacts, and an `anwc` CLI bin. Keep evaluator package and app fixtures private.
2. Produce local `npm pack` tarballs for required packages; verify no tests, benchmark truth, app files or absolute source paths leak into distributions. This is local packaging, not npm publication.
3. Install the tarballs into a fresh plain React/Vite consumer outside repo ancestry. No monorepo aliases, TS loader, copied tool src, parent node_modules or ANWC-specific application components.
4. Verify `import { anwc } from '@anwc/vite-plugin'` with `anwc()` works from the consumer's Vite config. Resolve default source root against the consumer, correct relative filenames, and source-null for genuinely uninstrumented nodes.
5. Run the installed CLI binary from the consumer; inspect root URL, lazy/HMR updates, and repeated list instances. Confirm default production bundles omit runtime/site identifiers and ordinary UI behavior is unchanged.
6. Document the tested Node/npm/Vite/React/OS versions, not an untested compatibility range. Provide local package install/uninstall steps. Browser installation must be explicit and errors actionable.

**Acceptance:** clean install/typecheck/dev/CLI/build from the consumer on supported platforms; source points to consumer JSX; no evaluator checkout needed at runtime; packed-file audit passes; published registry availability is never assumed.

**Milestone:** another developer can try the integration on their own local Vite project.

## P07 — Make the first real inspection understandable

**Own:** developer quickstart in README, installed CLI text/errors, source navigation, one neutral external-consumer demo. No new framework adapter.

**Build:**
1. Provide a five-minute walkthrough: install local alpha, add plugin before React, start app, inspect a plain URL at two widths, follow source/blocker evidence, fix, inspect again. Include an ordinary custom component and repeated instances.
2. Use existing snapshot fields for concise severity/rule, target name, relative source, measured versus expected geometry, blocker description and limitation. Show how to drill into JSON; do not produce a universal visibility score or guess business intent.
3. Give specific recovery for missing runtime, invalid pasted Markdown URL, absent browser, incompatible API and unsettled/incomplete capture. Show page scope/source availability; zero findings describes inspected evidence only.
4. Keep full JSON authoritative. If text is bounded/truncated, state omitted count and how to get remaining data. P03's benchmark schema change must not silently change snapshot `0.1`.
5. Measure output bytes/characters, findings count and inspection latency on fixed inputs before/after any report edits. Do not claim token/cost savings from character counts; provider usage comes from P09.
6. Verify on the external app without defect-revealing queries/classes. Capture remains read-only; run actual interactions through the ordinary browser for repair verification.

**Acceptance:** a reader can install, diagnose and fix using only the documented consumer workflow; errors tell them the next action; stable JSON/exit regressions pass; title/label changes leave geometric findings unchanged; no hidden intent inferred for arbitrary divs.

## P08 — Freeze a small usable agent pilot

**Own:** pilot manifests, EVALUATOR_SETUP/TESTING/BENCHMARK, explicit grade-to-ledger import and tests.

**Build:**
1. After M1 and M2, freeze three cases spanning the three apps, one model, one ordinary and one assisted run per case: six initial runs. Choose and record the exact provider model label and thinking setting at execution time. Respect the founder's high-thinking preference; no ultra, automatic billing, API calls, or invented model availability.
2. Keep prompt, requirements, editable source, viewports/setup, normal browser/DOM/screenshot access, and 20-minute initial cap matched. Counterbalance A/B order, reset session/storage/context, and record interventions.
3. Retain provider input/cache/output/cost and wall time only when observed. Unknown is null/NA. Include ANWC help/report/tool context costs; keep failed/capped runs in the ledger.
4. Implement an explicit grade import keyed by run ID and frozen receipt identity. Import verified repair/regression outcomes only; preserve unrelated runs and usage. Detection precision/recall stays human-adjudicated, never inferred from repaired checks.
5. Generate a practice operator runbook and neutral subject briefs, with current commands and distinct ports. Existing public fixtures are unblinded practice. A subsequent held-out claim requires independently authored, frozen material outside agent access; a random seed is insufficient.
6. Keep required evidence together: full versions/hashes, prompt, tool access, start/end times, transcript, submitted patch, grader report, screenshots used, usage and interventions. Reports stay evaluator-side.

**Acceptance:** dry-run manifest validation, mismatched grade/run rejected, duplicate import handled explicitly, unrelated records unchanged, missing costs retained as NA. An operator can follow the runbook without reading historical task cards. No model outcomes fabricated.

## P09 — Decide what to build from observed use

**Owner:** founders run agents; implementation models prepare/validate artifacts. This step waits for actual results.

Review the six matched runs individually before any aggregate claim. The small sample provides workflow evidence, not general statistical superiority. Expand repetitions/models only after setup and grading are stable and within a founder-approved run budget.

Record one decision in DECISIONS and update STATUS:
- If the tool saves repair effort with similar or better verified outcomes, address concrete onboarding/report friction and prepare an alpha release review.
- If reports are accurate but do not help agents, improve report scope/navigation based on transcripts before expanding the engine.
- If adopters need arbitrary-site inspection, activate the existing R02–R06 cards deliberately; preserve source-null and strict-CSP limitations.
- If real Next.js adopters are blocked by integration, scope a runtime adapter first, then original-JSX source mapping with separate SSR/hydration/bundler acceptance.
- If required defects are paint-only, scope a measured research task. Do not advertise pointer samples as a substitute for paint.
- If no model runs have occurred, mark “awaiting pilot” and stop inventing product claims. M1/M2 work remains useful.

## Copyable implementation brief

> Implement Pxx from docs/ROADMAP.md. First read STATUS, the complete task card, its dependencies and fixed decisions, relevant executable contracts and tests, and git status. Work only on this card and necessary acceptance fixes. Reuse existing tools and dependencies. Keep benchmark truth outside subjects and inspection read-only. Add independent checks that prove the requested behavior, not merely current implementation output. Run focused checks, then the full integration gate for code changes; record exact outcomes, revisions, platforms, limits and remaining gaps. Update STATUS and HISTORY, commit the completed task, and push using the existing authorization. Do not mark a task complete from a summary count alone or silently broaden to a later phase. Ask the founder only for missing product choices or external authorization beyond the fixed decisions.


