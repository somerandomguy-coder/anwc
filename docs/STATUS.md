# ANWC status

Updated 2026-09-17, Australia/Sydney. Launch triage pulled `947931b`; fixes are `467d612` (dependency lockfile) and `6bd4cc4` (conservative diff guards). Read [LAUNCH](LAUNCH.md) for tonight's handoff. [ROADMAP](ROADMAP.md) remains the engineering backlog.

## What is ready to demonstrate

ANWC is a development-only React/Vite inspection alpha using Chromium. Its compiler adds JSX source identity; its collector measures supported layout, text, clipping and sampled pointer access. `inspect` produces JSON or readable text. `report` renders an existing snapshot as offline HTML, Markdown, text or report JSON. No model/API key is required for these operations.

The seeded mobile checkout demo reports 25/25 blocked pointer samples, identifies the cookie notice and links both elements to source. The report's severity filters work offline. This is measured browser evidence, not a hardcoded diagnosis. The fixture deliberately reveals its fault and is not a blinded benchmark.

Scope remains installed React/Vite integration, local developer apps and Chromium. Experimental runtime-only injection, arbitrary sites, Next.js, full paint visibility and measured agent savings are outside the launch promise.

## Verification in this launch pass

| Check | Result |
| --- | --- |
| Dependency refresh | `npm install --ignore-scripts --no-audit --no-fund` passed; refreshed workspace links and corrected stale CLI/report lockfile entry |
| `npm run typecheck` | Passed after dependency refresh |
| Focused Vitest: report, diff, CLI, conformance and consumer files | **42 tests passed**; includes 18 diff tests and real browser CLI checks |
| External consumer test | Packed six packages, installed into another React/Vite app, typechecked, built production output and inspected through the installed JS entry; Windows npm shim remains Q10 work |
| Playwright: shop-scenarios and conformance | **4 tests passed**, covering public broken/healthy shop controls and the 29-case conformance runner |
| Actual documented CLI demo | Saved `artifacts/launch/blocked.json`; rendered `blocked.html`; target, blocker and source evidence present |
| Offline HTML browser smoke | Filters work; no HTTP requests or browser errors; screenshot at `artifacts/launch/report-evidence.png` |
| Documented CSS repair | Applied the exact demonstration CSS in the browser: blocker finding disappeared, cookie notice remained visible and checkout opened its confirmation dialog; fixture source was left intact |
| Entire integration gate / other operating systems | **Not rerun in this bounded triage**; these focused checks are not a full release certification |

The conformance artifact at `tests/conformance/conformance-matrix.json` was refreshed. It contains 10 defective, 10 healthy and 9 boundary cases, not 29 matched pairs. Healthy controls had zero actionable false positives in this run. Boundary acceptance currently uses an overly broad paint-unknown fallback; it does not establish feature-specific unsupported detection. See LAUNCH task L3.

## Implementation and remaining acceptance

| Area | Status and next work |
| --- | --- |
| Q01–Q02 benchmark integrity | Implementations exist; full scored-pilot acceptance is not established by this triage. Real agent sessions and savings claims remain pending. |
| Q03–Q04 shared report and renderers | Available and focused tests pass. Redaction is not a guarantee that arbitrary app content is safe to publish; use the synthetic demo for launch assets. |
| Q05 conformance corpus | Runner passes; strengthen the boundary oracle before claiming full acceptance. |
| Q06 state replay | `anwc check` exists; simple CLI test passes. Dedicated multi-state browser suite is still explicitly skipped. Capture findings/readiness currently do not determine `passedAll`; this is replay/assertion success, not a clean-UI verdict. Acceptance incomplete. |
| Q07 comparison | `anwc diff` exists. Launch fix rejects URL/scenario, runtime and scale mismatches, unsettled/incomplete evidence, empty repair baselines and heuristic-only identity as repair proof. Disappearing findings without an explicit passing behavior check are inconclusive. CLI does not connect behavior evidence yet, so it cannot certify successful repair and exits 1 for inconclusive comparisons. Acceptance incomplete. |
| Q08–Q09 engine edges and compact drilldown | Pending; do not start broad feature work during the launch window. |
| Q10 installed workflow/CI | Local consumer test passes; fresh-clone setup, actual executable shims and cross-platform workflow checks remain. |
| Q11 operator handoff and human evidence | Engineering handoff pending; no paired human/model outcome data recorded. |

Launch artifacts are local and ignored by Git. Public npm publication, a hosted product page, license choice and Product Hunt submission have not been performed by this pass.

## Continue from here

Tonight: follow [LAUNCH](LAUNCH.md), use its demonstrated `inspect → report` route, and complete the fresh-clone check before promoting it. After launch, repair Q06/Q07 acceptance gaps and Q05 boundary tests, then continue Q08–Q11. Commit one completed task at a time; test relevant changes in a coherent batch.

For a local demonstration, follow [README](../README.md#run-the-repository-demo). `npm run build` is required after a fresh install because workspace imports resolve compiled packages. Evaluation instructions live in [TESTING](TESTING.md), [EVALUATOR_SETUP](EVALUATOR_SETUP.md) and [BENCHMARK](BENCHMARK.md). Historical evidence remains in [HISTORY](HISTORY.md); snapshot contracts are in [PROTOCOL](PROTOCOL.md).
