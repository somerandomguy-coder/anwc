# ANWC status

Updated 2026-09-16. Planning review of `d616943bcb07597cc6424bbb53ff0894e99143f7`.

## Start here

ANWC is a working development-only React/Vite inspection prototype. Its compiler adds source identity; its browser collector measures layout, clipping, text and sampled pointer access. It does not replace the browser or prove paint visibility.

**Next task: P01 — reliable independent repair checks**, in [ROADMAP](ROADMAP.md). Phase 2 delivers trustworthy evaluation (P01–P05), then an external-project alpha (P06–P08). The founder-run pilot is P09. This update plans that work; none of those tasks is implemented yet.

The W01–W14 implementation rollout shipped through `d616943`. **The previous blanket completion claim was too broad:** some original acceptance criteria remain unmet. The roadmap records concrete source-review gaps and follow-ups. The commands are useful for development practice; current generated subjects/grades are not yet certified for a blinded scored experiment.

## Evidence and current limits

| Area | What exists | What remains |
| --- | --- | --- |
| Installed Vite/runtime | JSX/source linkage, on-demand inspect, HMR and production stripping tests | Independently installable packages/external-consumer acceptance: P06 |
| Public fixture corpus | 10 shop, 4 landing, 4 dashboard broken/healthy pairs | Full independent matrix for the newer apps: P01–P02 |
| prepare-pair / check-pair | Eight landing/dashboard cases, matching application hashes | Shop exports, faithful neutral source, verified revisions/intent: P02–P03 |
| grade | Independent browser checks and immutable config/tool hashes | Stronger checks, frozen grader, clean evaluator staging and bounded lifecycle: P01/P03/P04 |
| rehearse | Ordinary-side runs for pricing and dashboard at two widths | Both arms and shop, source-link/build evidence, durable report: P05 |
| Agent benefit | No real paired results recorded | Pilot P08–P09; no cost/speed claim yet |
| Arbitrary URLs | Experimental `--runtime-only` injection exists | Supported default still requires installed runtime; R02–R06 deferred |

Historical test counts are not fresh certification: the preceding work recorded 41 unit tests, 20 Chromium tests and three production builds. The final W14 checkpoint recorded TypeScript plus a two-app rehearsal; its final full integration gate is not established by those results. No test suite was rerun for this docs-only review.

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

Inspect git status first. Use one roadmap task per reviewable commit, update this file and HISTORY with actual evidence, and push completed work under the existing authorization. Run meaningful focused checks and `npm run test:integration` for code changes. Docs-only changes need link, command and consistency checks. Never upgrade historical results to a fresh pass.

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


