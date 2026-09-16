# ANWC status

Updated 2026-09-16. P07 understandable inspection workflow and external consumer demo is complete; Phase 2 moves to P08 (freeze a small usable agent pilot).

## Start here

ANWC is a working development-only React/Vite inspection prototype. Its compiler adds source identity; its browser collector measures layout, clipping, text and sampled pointer access. It does not replace the browser or prove paint visibility.

Milestone M1 (trustworthy evaluation: P01–P05) is certified. Milestone M2 (external adoption: P06–P07) is certified: independently installable local alpha packages (`0.1.0-alpha.0`), 5-minute developer quickstart in README, actionable CLI error recovery, understandable CLI text formatting with measured vs expected geometry and blocker details, neutral external consumer verification, title/label invariance, and zero hidden intent for arbitrary divs.

**Next task: finish P08's usable agent pilot kit**, in [ROADMAP](ROADMAP.md): freeze three representative cases across all three apps, one model, one ordinary and one assisted run per case (six initial runs), matched prompts, editable paths, and frozen receipts. The [six-run practice manifest](../bench/pilot.practice.json) is validated; scored run manifests require a receipt hash per run, and `import-grade` binds a single behavioral result to it. Selecting a model, private subjects, and actual receipts remains founder-run preparation. Phase 2 delivers trustworthy evaluation (P01–P05, complete), external adoption (P06–P07, complete), then the founder-run pilot (P08–P09).

The W01–W14 implementation rollout shipped through `d616943`. The roadmap records concrete source-review gaps and follow-ups. The commands are useful for development practice; current generated subjects/grades are verified for reproducible evaluation before any agent pilot.

## Evidence and current limits

| Area | What exists | What remains |
| --- | --- | --- |
| Installed Vite/runtime | Compiled ESM/declaration packages, audited local tarballs (`0.1.0-alpha.0`), zero-config `anwc()`, production stripping, installed CLI bin, 5-min quickstart, and understandable text reports | Certified (Milestone M2 complete) |
| Public fixture corpus | 10 shop, 4 landing, 4 dashboard broken/healthy pairs with independent two-viewport browser truth; [public matrix](../bench/fixture-matrix.json); paired target-specific detector evidence; representative materialized states pass/fail correctly | Review P02 evidence; keep public fixtures practice-only |
| prepare-pair / check-pair | 18 registered app states; neutral TASK.md; contract `0.3` practice/scored receipts; dirty/scored and path traversal acceptance verified | Milestone M1 complete; P06-P07 external consumer complete |
| grade | Ordered exact checks; evaluator-hash gate with separate tree verification; fresh staged install; strict loopback port; process group cleanup; occupied-port decoy rejection; bounded timeouts; syntax/deletion failure modes | Milestone M1 complete; P06-P07 external consumer complete |
| rehearse | 18 grade runs across Shop, Pricing, and Dashboard; both ordinary and anwc-assisted arms; broken, repaired, and deletion states at 390×844 and 1440×900; durable report in Git at `bench/rehearsals/rehearsal-report.json` | Milestone M1 complete; P06-P07 external consumer complete |
| Agent benefit | No real paired results recorded | Pilot P08–P09; no cost/speed claim yet |
| Arbitrary URLs | Experimental `--runtime-only` injection exists | Supported default still requires installed runtime; R02–R06 deferred |

The evaluator-foundation batch passed `npm run typecheck`, 22 focused benchmark unit tests, and 22 Chromium browser tests on Windows. The P02 matrix and detector slice validates every public broken/healthy pair at mobile and desktop widths plus target-specific codes. The fresh `npm run test:integration` gate passed on Linux: TypeScript, 61 unit tests (covering P01-P07 contracts, 18-run rehearsal report schema, tarball leak audits, external consumer installation, typecheck, production stripping, CLI inspection, actionable error recovery, understandable text formatting, title/label invariance, and zero hidden intent for arbitrary divs), 26 Chromium browser tests, and production builds for all three apps. Untested platforms: macOS.

The complete 18-run cross-app rehearsal evidence is committed at `bench/rehearsals/rehearsal-report.json` under contract `0.3` with full evaluator hashes. All 18 runs matched expectations: 6 broken runs failed on expected checks, 6 repaired runs passed, and 6 runnable deletion runs failed. See [HISTORY](HISTORY.md).

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


