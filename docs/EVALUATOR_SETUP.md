# Evaluator setup

Updated 2026-09-16 against `d616943`. These commands exist today, but the generated subjects and grader remain **development practice tools**. P01–P05 in [ROADMAP](ROADMAP.md) close acceptance gaps before certified scored runs. Do not confuse command availability with benchmark validity.

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

Current IDs: `pricing-title`, `pricing-description`, `pricing-blocked`, `pricing-hidden`, `dashboard-clipped-save`, `dashboard-long-title`, `dashboard-blocked-input`, `dashboard-outside-save`. Shop is not currently in this preparer registry.

The command creates ordinary/, assisted/, and receipt.json. Current revision arguments are recorded labels, not verified provenance. TASK.md currently hints at the selected defect, and materialized source retains fixture machinery. Keep these runs explicitly unblinded until P02/P03 land.

Install/build/start each subject in its own terminal. Substitute the generated path; do not type PLACEHOLDER literally:

```powershell
Set-Location "PLACEHOLDER\ordinary"
npm ci
npm run typecheck
npm run build
npm run dev --workspace=@anwc/landing -- --host 127.0.0.1 --port 4301
```

Repeat in assisted/ on 4302. For a dashboard fixture use @anwc/dashboard as the workspace. Open the root URL; do not append the public lab query. Verify which port Vite actually reports: these generated scripts do not yet guarantee strict port ownership. The receipt records chosen ports, but does not itself start/configure servers. `check-pair` is intended before agent edits/build artifacts; it is not a returned-repair check.

Give each agent only its own folder and matching URL. Assisted can run its available `npm run anwc -- inspect "http://127.0.0.1:4302/" --viewport 390x844 --format text`. Both may use screenshots and ordinary DOM tools. Stop the agent's server before grading.

From the evaluator repository, grade a practice submission on an unused port:

```powershell
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\ordinary" --condition ordinary --port 4311 --output "$anwcPair\ordinary-result.json"
npm run bench -- grade --receipt "$anwcPair\receipt.json" --subject "$anwcPair\assisted" --condition anwc-assisted --port 4312 --output "$anwcPair\assisted-result.json"
```

The current grader installs and runs inside the submitted folder, uses the current evaluator registry, and checks some frozen config/tool inputs. It does not yet freeze source intent or verify Git/grader provenance. P03/P04 will grade a new evaluator copy with strict deadlines and process ownership.

Current result labels: `passed`, `failed`, `integrity-failed`, `infrastructure-failed`. These are provisional check results, not complete repair certification. Current CLI returns 0 for passed and 1 for all other grade results (2 for invocation/caught errors); P04's refined exits are planned only. Inspect failed check IDs/evidence: a timeout/crash is not proof that the intended seeded defect was detected. Preserve missing usage as NA and do not infer detection precision/recall from grades.

## Existing rehearsal

```powershell
$anwcRehearsal = Join-Path (Split-Path (Get-Location).Path -Parent) ("anwc-rehearsal-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
npm run bench -- rehearse . --out "$anwcRehearsal" --source-revision "$anwcRevision" --detector-revision "$anwcRevision"
```

Current rehearsal creates both subjects but grades only ordinary for pricing-blocked and dashboard-outside-save. It uses ports 4511–4513 and 4521–4523, changes the ordinary source through repaired and deletion variants, and leaves those modified outputs as evidence. Do not reuse them as fresh agent subjects. It does not cover shop or verify assisted source linkage. The repeated grades reuse dependencies after the initial install. P05 owns the full three-app/two-arm certified rehearsal.

Wait for the actual process exit and report. A partial log or observation timeout does not establish completion. Retain reports outside subjects; no model calls occur.

## Manual overlay path

`package-subject SOURCE DEST --overlay PRIVATE_OVERLAY --condition ordinary|anwc-assisted` and `check-subject SUBJECT --condition ordinary|anwc-assisted` are older shop-default commands. The overlay materializes application files; the packager generates condition-specific configs afterward. Do not instruct operators to hand-author two different Vite overlays. Their leakage gate is advisory, not proof of clean installation, hidden answers, protected source intent, or OS isolation.

## Scored workflow after Phase 2

P01–P05 establish reliable checks, neutral subjects, strict versioned receipts and isolated grading. P06/P07 establish adoption outside this repo. P08 freezes the pilot kit and explicit ledger import; P09 supplies real agent observations. Freeze app/detector/fixture/task/grader/settings per pair and keep earlier outcomes bound to their original versions. Independently authored private variants are needed for holdout claims; public development cases remain public.

See [TESTING](TESTING.md) for demo steps and [BENCHMARK](BENCHMARK.md) for scoring policy.
