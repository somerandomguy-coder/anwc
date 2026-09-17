# Evaluator setup

Updated 2026-09-17. The evaluator uses receipt `0.3`, grade result `0.4`, materialized subjects and fresh staging for grading. Q01 closes grade identity/result validation; use it as a **development practice workflow** while Q02 closes target-bound intent gaps. Q11 in [ROADMAP](ROADMAP.md) owns the complete operator handoff. Do not confuse command availability with benchmark validity.

## Separate evaluator and agents

Keep three areas: the ANWC evaluator checkout, an ordinary subject folder, and an assisted subject folder. Only the evaluator sees fixture definitions, receipts, graders, reports, patches from other runs and Git history. Both agents get identical application inputs and ordinary browser/shell tools; assisted additionally gets ANWC.

An agent with only a URL cannot change application source. An ANWC clone exposes answers and history. Use a fresh exported folder plus its own development URL for a repair task. Folder layout alone is not an access-control boundary if the agent can browse its parent directories.

## Existing practice workflow

Commands below use PowerShell and create a new timestamped output beside the repo. Run from the ANWC root. Do not run a subject inside the evaluator repo or give an agent the enclosing pair directory.

```powershell
$anwcRevision = git rev-parse HEAD
$anwcPair = Join-Path (Split-Path (Get-Location).Path -Parent) ("anwc-practice-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
npm run bench -- prepare-pair . --fixture pricing-blocked --out "$anwcPair" --source-revision "$anwcRevision" --detector-revision "$anwcRevision" --ordinary-port 4301 --assisted-port 4302
npm run bench -- check-pair "$anwcPair"
```

The default command requires a clean checkout and both full revision labels to equal `git rev-parse HEAD`. For an explicitly unscored local experiment from a dirty checkout, append `--practice`; the receipt records `scored: false` and dirty state. It never becomes a scored result later.

Current IDs are ten `shop-*` cases (`shop-horizontal-overflow` through `shop-outside-viewport`), `pricing-title`, `pricing-description`, `pricing-blocked`, `pricing-hidden`, `dashboard-clipped-save`, `dashboard-long-title`, `dashboard-blocked-input`, and `dashboard-outside-save`.

The command creates ordinary/, assisted/, and receipt.json. The receipt records full Git revision, evaluator checker/registry/sidecar hashes, app and immutable hashes, source intent values, task, route/viewports, allowed editable paths, and available toolchain identifiers. Current intent hashing covers `main.tsx` values without binding them to targets; Q02 expands this. TASK.md describes common app behavior without naming a seeded defect, but materialized source may retain hints. These public development cases remain unblinded even after tooling improvements.

Install/build/start each subject in its own terminal. Substitute the generated path; do not type PLACEHOLDER literally:

```powershell
Set-Location "PLACEHOLDER\ordinary"
npm ci
npm run typecheck
npm run build
npm run dev --workspace=@anwc/landing -- --host 127.0.0.1 --port 4301
```

Repeat in assisted/ on 4302. For a dashboard fixture use @anwc/dashboard; for shop use @anwc/shop. Open the root URL; do not append the public lab query. `check-pair` is intended before agent edits/build artifacts; it is not a returned-repair check.

Give each agent only its own folder and matching URL. Assisted can run its available `npm run anwc -- inspect "http://127.0.0.1:4302/" --viewport 390x844 --format text`. Both may use screenshots and ordinary DOM tools. Stop the agent's server before grading.

From the evaluator repository, grade a practice submission on an unused port:

```powershell
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\ordinary" --condition ordinary --port 4311 --run pricing-ordinary --output "$anwcPair\ordinary-result.json"
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\assisted" --condition anwc-assisted --port 4312 --run pricing-assisted --output "$anwcPair\assisted-result.json"
```

The grader first checks immutable inputs, its current intent-value digest, and evaluator hashes. It then copies the returned subject to an evaluator-owned temporary directory, verifies the staged artifact hash, excludes dependencies/build/cache/logs, runs `npm ci --ignore-scripts`, and starts Vite directly on loopback with `--strictPort`. It leaves the returned subject untouched. Use a fresh output path outside the submitted subject and distinct from the receipt; the CLI will not overwrite an existing result. For a ledger import, pass the exact ledger run ID with `--run`. Install, startup, per-check, and overall grade deadlines are bounded; retained output includes capped install/server logs and page errors.

Current result labels: `passed`, `failed`, `integrity-failed`, `infrastructure-failed`. CLI exits are 0 verified, 1 behavioral failure, 2 integrity/invalid invocation, and 3 infrastructure/incomplete. These are still provisional development-case checks, not complete repair certification. Inspect failed check IDs/evidence: a timeout/crash is not proof that the intended seeded defect was detected. Preserve missing usage as NA and do not infer detection precision/recall from grades.

## Pilot grade import

Scored-plan validation requires each prepared receipt hash in that run's `receiptHash` field. Q01 makes a `0.4` grade bind the same receipt bytes, named run, staged submission, evaluator identity and expected check inventory; dependable scored use still awaits Q02:

```powershell
npm run bench -- receipt-hash C:\evaluator\pairs\run-01\receipt.json
```

After recording the agent's completed or time-capped row in the ledger, import its evaluator result without editing scoring by hand:

```powershell
npm run bench -- import-grade C:\pilot\plan.json C:\pilot\results.json --run run-01 --receipt C:\evaluator\pairs\run-01\receipt.json --grade C:\evaluator\results\run-01.json --output C:\pilot\results.with-grade.json
```

Import rejects unknown runs, supplied-receipt/plan mismatches, fixture/condition mismatches, practice/dirty receipts, historical grade `0.3` files, receipt/run substitution, incomplete/contradictory check evidence, existing manual scoring and duplicate imports. It records a grade hash and keeps full success `null` while regressions remain unadjudicated. Detection precision, recall and regression counts require separate evaluator adjudication.

Use a new output path every time and preserve the inputs: current import can overwrite an existing output, including the input ledger if pointed there. Q01 will enforce safe file/version handling. The example's separate output path is intentional.

## Existing rehearsal

```powershell
$anwcRehearsal = Join-Path (Split-Path (Get-Location).Path -Parent) ("anwc-rehearsal-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
npm run bench -- rehearse . --out "$anwcRehearsal" --source-revision "$anwcRevision" --detector-revision "$anwcRevision"
```

The committed rehearsal covers Shop, Pricing, and Dashboard in ordinary and ANWC-assisted conditions, for broken, repaired, and runnable deletion states at both required viewports: 18 grades in total. Its durable report is [bench/rehearsals/rehearsal-report.json](../bench/rehearsals/rehearsal-report.json). Do not reuse any rehearsal subject or patch as a fresh agent subject. Each grade uses its own clean evaluator stage.

Wait for the actual process exit and report. A partial log or observation timeout does not establish completion. Retain reports outside subjects; no model calls occur.

## Manual overlay path

`package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` and `check-subject SUBJECT --condition ordinary|anwc-assisted` are older shop-default commands. The overlay materializes application files; the packager generates condition-specific configs afterward. Do not instruct operators to hand-author two different Vite overlays. Their leakage gate is advisory, not proof of clean installation, hidden answers, protected source intent, or OS isolation.

## Remaining scored-workflow acceptance

Phase 2 implemented the foundation, packaging and pilot helpers. Q01/Q02 close the remaining trust gaps; Q11 dry-runs the complete procedure with explicitly synthetic submissions before real model sessions. The roadmap proposes benchmark contract `0.4`; it is not implemented yet. Freeze app/detector/fixture/task/grader/settings per pair and keep earlier outcomes bound to their original versions. Independently authored private variants are needed for holdout claims; public development cases remain public. Human results are still pending.

See [TESTING](TESTING.md) for demo steps and [BENCHMARK](BENCHMARK.md) for scoring policy.
