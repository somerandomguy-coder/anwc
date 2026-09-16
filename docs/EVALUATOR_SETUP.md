# Evaluator setup

Updated 2026-09-16. The evaluator uses receipt/result contract `0.3`, neutral materialized subjects, and a fresh staging copy for grading. It remains a **development practice workflow** until the P02 matrix and P03/P04 acceptance coverage are complete. Do not confuse command availability with benchmark validity.

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

The command creates ordinary/, assisted/, and receipt.json. The receipt binds full Git revision, evaluator checker/registry/sidecar hashes, app and immutable hashes, declared source intent, task, route/viewports, allowed editable paths, and available toolchain identifiers. TASK.md describes common app behavior and the local environment without naming a seeded defect. Keep these public development cases explicitly unblinded until P05 lands.

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
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\ordinary" --condition ordinary --port 4311 --output "$anwcPair\ordinary-result.json"
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\assisted" --condition anwc-assisted --port 4312 --output "$anwcPair\assisted-result.json"
```

The grader first rejects changed immutable inputs, declared intent, or evaluator hashes. It then copies the returned subject to an evaluator-owned temporary directory, excludes dependencies/build/cache/logs, runs `npm ci --ignore-scripts`, and starts Vite directly on loopback with `--strictPort`. It leaves the returned subject untouched. Result output must stay outside the submitted subject. Install, startup, per-check, and overall grade deadlines are bounded; retained output includes capped install/server logs and page errors.

Current result labels: `passed`, `failed`, `integrity-failed`, `infrastructure-failed`. CLI exits are 0 verified, 1 behavioral failure, 2 integrity/invalid invocation, and 3 infrastructure/incomplete. These are still provisional development-case checks, not complete repair certification. Inspect failed check IDs/evidence: a timeout/crash is not proof that the intended seeded defect was detected. Preserve missing usage as NA and do not infer detection precision/recall from grades.

## Existing rehearsal

```powershell
$anwcRehearsal = Join-Path (Split-Path (Get-Location).Path -Parent) ("anwc-rehearsal-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
npm run bench -- rehearse . --out "$anwcRehearsal" --source-revision "$anwcRevision" --detector-revision "$anwcRevision"
```

The committed rehearsal covers Shop, Pricing, and Dashboard in ordinary and ANWC-assisted conditions, for broken, repaired, and runnable deletion states at both required viewports: 18 grades in total. Its durable report is [bench/rehearsals/rehearsal-report.json](../bench/rehearsals/rehearsal-report.json). Do not reuse any rehearsal subject or patch as a fresh agent subject. Each grade uses its own clean evaluator stage.

Wait for the actual process exit and report. A partial log or observation timeout does not establish completion. Retain reports outside subjects; no model calls occur.

## Manual overlay path

`package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` and `check-subject SUBJECT --condition ordinary|anwc-assisted` are older shop-default commands. The overlay materializes application files; the packager generates condition-specific configs afterward. Do not instruct operators to hand-author two different Vite overlays. Their leakage gate is advisory, not proof of clean installation, hidden answers, protected source intent, or OS isolation.

## Scored workflow after Phase 2

P01–P05 establish reliable checks, neutral subjects, strict versioned receipts and isolated grading. P06/P07 establish adoption outside this repo. P08 freezes the pilot kit and explicit ledger import; P09 supplies real agent observations. Freeze app/detector/fixture/task/grader/settings per pair and keep earlier outcomes bound to their original versions. Independently authored private variants are needed for holdout claims; public development cases remain public.

See [TESTING](TESTING.md) for demo steps and [BENCHMARK](BENCHMARK.md) for scoring policy.
