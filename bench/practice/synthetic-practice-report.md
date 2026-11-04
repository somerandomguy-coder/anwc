# ANWC Synthetic Six-Run Practice Report

> **Tooling Acceptance Only.** This report records an automated dry-run of the evaluation lifecycle using synthetic submissions. No human agent or model provider was invoked; no billing conclusions may be drawn.

- Generated at: `2026-11-04T14:47:21.484Z`
- Source revision: `ae8c58c75ee7bacef97b72f16077ac08c3d4f022`
- Detector revision: `ae8c58c75ee7bacef97b72f16077ac08c3d4f022`
- Total synthetic runs: 6
- Repaired / Passed: 2
- Broken / Failed: 3
- Deletion / Failed: 1
- All ledger imports succeeded: Yes
- Negative integrity checks passed: Yes

## Run Outcomes

| Run ID | Pair | Condition | Port | Submission Type | Grade Status | Exit Code | Verified Fix | Ledger Imported | Failing Checks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shop-ordinary` | shop | ordinary | 4301 | broken | failed | 1 | false | true | checkout-confirms |
| `shop-assisted` | shop | anwc-assisted | 4302 | repaired | passed | 0 | true | true | none |
| `pricing-assisted` | pricing | anwc-assisted | 4303 | deletion | failed | 1 | false | true | content-1 |
| `pricing-ordinary` | pricing | ordinary | 4304 | broken | failed | 1 | false | true | growth-selects |
| `dashboard-ordinary` | dashboard | ordinary | 4305 | repaired | passed | 0 | true | true | none |
| `dashboard-assisted` | dashboard | anwc-assisted | 4306 | broken | failed | 1 | false | true | save-in-viewport |

## Negative Integrity Checks

| Check | Result |
| --- | --- |
| Wrong receipt rejected | PASS |
| Duplicate output path rejected | PASS |
| Unrelated ledger rows preserved | PASS |

## Disclosures & Limitations

- This report records an automated synthetic tooling dry-run; no human model sessions or billing data were generated.
- The public development fixtures (shop, pricing, dashboard) are unblinded practice cases, not holdout benchmarks.
- Paint, transform, and canvas rendering visibility remain outside ANWC guarantees.
- Human pilot results (P09) remain pending until founder-selected model sessions are conducted.
