# ANWC status

Updated 2026-09-16. P04 bounded grading lifecycle and failure-mode coverage is complete; remaining Phase 2 work moves to P05 (cross-app rehearsal evidence).

## Start here

ANWC is a working development-only React/Vite inspection prototype. Its compiler adds source identity; its browser collector measures layout, clipping, text and sampled pointer access. It does not replace the browser or prove paint visibility.

P01–P04 now have an implementation pass and acceptance certification: ordered independent checks, 18 fixture registry entries, receipt/result contract `0.3`, fresh staged grader, proven matrix/detectors, strict provenance, and robust process lifecycle/failure handling. P05 rehearsal evidence remains before M1 can be claimed.

**Next task: P05 finish the cross-app rehearsal evidence**, in [ROADMAP](ROADMAP.md): prepare one representative fault per app (shop, pricing, dashboard), both conditions, running broken, valid repair, and runnable destructive deletion (18 grade runs) at both required viewports with durable reports under `bench/rehearsals/`. P04 lifecycle and failure-mode acceptance is complete: process group termination on Linux, healthy decoy port rejection, install/startup timeouts, syntax crash and destructive deletion failure modes, port release, and file immutability are verified. Phase 2 then delivers trustworthy evaluation (P01–P05), then an external-project alpha (P06–P08). The founder-run pilot is P09.

The W01–W14 implementation rollout shipped through `d616943`. **The previous blanket completion claim was too broad:** some original acceptance criteria remain unmet. The roadmap records concrete source-review gaps and follow-ups. The commands are useful for development practice; current generated subjects/grades are not yet certified for a blinded scored experiment.

## Evidence and current limits

| Area | What exists | What remains |
| --- | --- | --- |
| Installed Vite/runtime | JSX/source linkage, on-demand inspect, HMR and production stripping tests | Independently installable packages/external-consumer acceptance: P06 |
| Public fixture corpus | 10 shop, 4 landing, 4 dashboard broken/healthy pairs with independent two-viewport browser truth; [public matrix](../bench/fixture-matrix.json); paired target-specific detector evidence; representative materialized states pass/fail correctly | Review P02 evidence; keep public fixtures practice-only |
| prepare-pair / check-pair | 18 registered app states; neutral TASK.md; contract `0.3` practice/scored receipts; dirty/scored and path traversal acceptance verified | P05 cross-app rehearsal evidence |
| grade | Ordered exact checks; evaluator-hash gate with separate tree verification; fresh staged install; strict loopback port; process group cleanup; occupied-port decoy rejection; bounded timeouts; syntax/deletion failure modes | P04 done; cross-app rehearsal evidence: P05 |
| rehearse | Ordinary-side runs for pricing and dashboard at two widths | Both arms and shop, source-link/build evidence, durable report: P05 |
| Agent benefit | No real paired results recorded | Pilot P08–P09; no cost/speed claim yet |
| Arbitrary URLs | Experimental `--runtime-only` injection exists | Supported default still requires installed runtime; R02–R06 deferred |

The evaluator-foundation batch passed `npm run typecheck`, 22 focused benchmark unit tests, and 22 Chromium browser tests on Windows. The P02 matrix and detector slice validates every public broken/healthy pair at mobile and desktop widths plus target-specific codes. The fresh `npm run test:integration` gate passed on Linux: TypeScript, 55 unit tests (covering P01-P04 contracts, provenance, separate evaluator trees, occupied decoy rejection, install/startup timeouts, syntax/deletion failure modes, port release, and file immutability), 26 Chromium browser tests, and production builds for all three apps. Untested platforms: macOS.

The existing local W14 report was read during this review: pricing-blocked and dashboard-outside-save each record broken failure, repair pass and deletion failure at 390×844 and 1440×900. It uses caller-supplied revision labels and lives in a temp directory; it is limited historical evidence. See [HISTORY](HISTORY.md).

## Run the existing demo

From the repository root:

```powershell
npm install
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 4175
```

In another terminal:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format json
```

The storefront at `/` is the healthy demo; the lab URL deliberately reveals its seeded fault. For other apps and practice exports see [TESTING](TESTING.md) and [EVALUATOR_SETUP](EVALUATOR_SETUP.md). Use plain URLs, not pasted Markdown link syntax.

## Working agreement

Inspect git status first. This batch intentionally groups P01–P04 because their checker, fixture, receipt, and grader contracts are coupled; preserve its boundary in one reviewable commit. Update this file and HISTORY with actual evidence, and push completed work under the existing authorization. Run meaningful focused checks and `npm run test:integration` for code changes. Docs-only changes need link, command and consistency checks. Never upgrade historical results to a fresh pass.

Keep snapshot schema `0.1`; Phase 2's planned benchmark `0.3` is separate. Capture stays read-only; evaluator setup may interact. CSS geometry and pointer findings do not establish intent or whole-page paint visibility. Agents need source plus a URL to repair, and should not receive this evaluator repository.

## Document map

| Need | Read |
| --- | --- |
| Current phase, exact next task, acceptance | [ROADMAP](ROADMAP.md) |
| Human demo and small pilot procedure | [TESTING](TESTING.md) |
| Commands for exporting/grading practice subjects | [EVALUATOR_SETUP](EVALUATOR_SETUP.md) |
| Scoring policy and interpretation | [BENCHMARK](BENCHMARK.md) |
| Browser snapshot/CLI contract | [PROTOCOL](PROTOCOL.md) |
| Deferred arbitrary-site inspector | [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md) |
| Evidence and decisions | [HISTORY](HISTORY.md), [DECISIONS](DECISIONS.md) |
| Historical implementation cards | [W archive](archive/W_ROLLOUT.md), [TASKS](TASKS.md), [PLAN](PLAN.md) |


