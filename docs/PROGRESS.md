# Shared progress and handoff

Last updated: 2026-09-15, Australia/Sydney.

**Current state: planning handoff ready. Implementation 0/11 tasks complete.**

SSH access to `git@github.com:somerandomguy-coder/anwc.git` was verified and the empty repository was cloned locally. The supplied sample snippets were reviewed as design inputs. No application packages, lockfile, compiler, browser runtime, demo, or tests exist yet. No commits or pushes were made during the planning task.

## Current deliverables

| Deliverable | Status | Evidence |
| --- | --- | --- |
| Read supplied concept notes | done | Three pasted attachments reviewed |
| Connect to repository | done | SSH clone succeeded; remote empty on initial inspection |
| Architecture and tonight's scope | done | [PLAN](PLAN.md) |
| Shared protocol proposal | ready for T01 review | [PROTOCOL](PROTOCOL.md) |
| Small coding task briefs | done | [TASKS](TASKS.md) |
| Benchmark and scoring design | done | [BENCHMARK](BENCHMARK.md) |
| Decision record | done | [DECISIONS](DECISIONS.md) |
| Compiler/runtime/demo | not started | No implementation claimed |
| Actual benchmark/cost results | not started | No results claimed |
| Publish planning files to GitHub | not performed | Local planning handoff only |

## Status vocabulary

`ready`: dependencies complete and task can be claimed. `queued`: waiting on a dependency. `in progress`: one named owner currently working. `blocked`: exact missing input/interface recorded. `review`: implementation and evidence ready for another collaborator. `done`: acceptance checks passed and reviewer acknowledged them.

Names below are proposed roles, not assignments: **Builder A** handles toolchain/compiler/integration; **Builder B** handles capture/demo. Either person can take either role. Do not assign an absent friend work without agreement.

## Task board

| ID | Module | Status | Suggested role | Dependencies | Branch / evidence |
| --- | --- | --- | --- | --- | --- |
| T00 | Workspace/toolchain | ready | A | none | unclaimed |
| T01 | Protocol/schema | queued | A; B reviews | T00 | unclaimed |
| T02 | Source compiler | queued | A | T01 | unclaimed |
| T03 | Vite integration | queued | A | T02, runtime entry | unclaimed |
| T04 | Browser capture | queued | B | T01 | unclaimed |
| T05 | Text/clip geometry | queued | first available | T04 | unclaimed |
| T06 | Pointer/rules | queued | B | T04; T05 for final rules | unclaimed |
| T07 | CLI/serializer | queued | A | T03–T06 | unclaimed |
| T08 | Demo and controls | queued | B | T00/T01; T07 for integration | unclaimed |
| T09 | Integration/freeze | queued | both; one integrator | T02–T08 | unclaimed |
| T10 | Paired experiment | queued | evaluator | T09 | unclaimed |

## Tonight's gates

| Gate | Acceptance | Status | Evidence to attach |
| --- | --- | --- | --- |
| G0 | Clean app builds/runs, toolchain pinned | not run | Version log and commands |
| G1 | JSX site links to live node and original source | not run | Actual capture and compiler tests |
| G2 | Supported text/clip/pointer rules pass independent checks | not run | Browser test output |
| G3 | CLI emits valid JSON + bounded text and cleans up | not run | Actual reports and error-path tests |
| G4 | Six supported defects + six controls, two widths | not run | Fixture matrix and independent assertions |
| G5 | Production clean; instrumentation preserves app behavior | not run | Production output check and behavior tests |
| G6 | Reproducible benchmark candidate frozen | not run | Commit/version manifest and setup steps |

“Done tonight” requires G0–G6, or a clearly documented reduced scope with unmet gates. These boxes are not progress estimates. Do not mark a gate passed because code was written or because an agent says it works.

## Next three actions

1. Choose Builder A/Builder B and claim T00. If only one person is coding, follow the same task order sequentially.
2. Implement and review T01 before separate modules create competing snapshot formats.
3. Build the first source-linked button capture; then add one defect and one healthy control before expanding the shop.

## Collaboration workflow

Use one task branch per module and one integrator for root config/lockfile changes. Suggested names are `feat/t02-compiler`, `feat/t04-capture`, and `feat/t08-demo`. These branches do not exist yet. Keep PRs small enough that a friend can review their owned module and one end-to-end example.

Before starting, record owner and branch in this board. Before handing off, record files, commands, observed output, supported cases, unknowns, and next dependency. A failed command is evidence too; retain the error summary. Review against acceptance behavior, not matching implementation internals.

Use a stronger reasoning model for schema changes, ambiguous CSS correctness, and interpretation of experimental results. Use cheaper models for the bounded briefs once interfaces and acceptance tests are clear. This is a workflow suggestion, not a claim about a particular model's current capabilities or pricing.

Keep raw captures/logs out of routine Git commits. Commit small sanitized examples and a run manifest when results exist. Keep hidden evaluator answers outside the subject agent's accessible repository. Do not let test agents read this planning pack during a blinded benchmark.

## Handoff entry template

```md
### Txx — date/time — owner
- Status: in progress / blocked / review / done
- Branch and commit:
- Owned files changed:
- Interface changes: none, or coordinated decision link
- Acceptance commands and outcomes:
- Actual evidence/artifact paths:
- Unsupported cases or remaining failures:
- Next task now unblocked:
- Reviewer and review outcome:
```

## Risks that currently affect scope

| Risk | Resolution/default | Owner to confirm |
| --- | --- | --- |
| General visual coverage is not observable through pointer hits | Paint unknown in v0; limitation fixtures included | T01/T06 |
| Clipping is more complex for positioned/transformed elements | Certify restricted geometry and return unknown elsewhere | T05 |
| Wrapping may be intentional | Intent contracts plus healthy controls | T05/T08 |
| Tonight's work exceeds an evening | Cut later features; preserve the six-defect vertical slice | Both |
| Cheap-model modules drift apart | Shared protocol, owned paths, one integration gate | T01/T09 |
| Benchmark leaks answers or rewards superficial fixes | Separate evaluator checkout and hidden behavior checks | T08/T10 |
| Agent platform does not expose billed usage | Record NA and timing/usage proxies separately | T10 |

## Planning session log

- 2026-09-15: Reviewed three user-supplied concept notes; verified authenticated SSH connection; cloned an empty repository.
- 2026-09-15: Chose React/Vite plugin + browser runtime as the first slice, with compiler/source mapping separated from actual layout observations.
- 2026-09-15: Added detailed module briefs, protocol proposal, collaboration board, scoped visibility limits, and fair benchmark design.
- 2026-09-15: Prepared local shareable planning artifacts. No implementation, tests, benchmark results, commits or remote publication performed.
