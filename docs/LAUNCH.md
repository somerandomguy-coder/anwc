# Launch handoff: a useful inspection alpha

Prepared 2026-09-17, Australia/Sydney. Start here during the launch window. This is a release checklist and a small selection of Q work, not another product roadmap. Current results: [STATUS](STATUS.md). Engineering backlog: [ROADMAP](ROADMAP.md).

## Tonight's scope

Demonstrate **source-linked UI evidence for developers and AI agents using React/Vite**: a blocked action, measured browser evidence, exact source locations and an offline report. The core path works in current focused checks. Launch it explicitly as an early alpha.

Do not make finishing every Q task, publishing to npm, a new marketing site or broad model benchmarking prerequisites for this small launch. A public GitHub repository can be the destination; Product Hunt's [preparation guide](https://www.producthunt.com/launch/preparing-for-launch) explicitly allows it. Confirm anonymous access before using that URL. The authenticated Git pull does not establish public access.

| Safe to demonstrate | Keep out of the launch promise |
| --- | --- |
| Supported overflow, clipping, text expectations and sampled pointer blockers | Every visual defect, pixel-perfect visibility, arbitrary websites |
| JSX source identity in an integrated React/Vite app | Next.js source integration or replacing Chromium |
| JSON/text for agents; offline HTML/Markdown for humans | Autonomous repairs or certified functional correctness |
| Inspection without a model API key | Quantified token savings, faster agents or benchmark superiority |
| A deliberately seeded demonstration | A blinded agent benchmark or real customer case study |

`check` and `diff` are experimental. CLI `diff` cannot yet consume behavior proof; disappearing findings remain inconclusive. The pure API's explicit behavior flag is a trusted caller signal, not independent certification.

## Your work: start now

1. **Confirm your actual Product Hunt date.** Open the draft/scheduler and record its displayed date/time. Another country's midnight does not close your launch. The official [scheduling update](https://www.producthunt.com/p/producthunt/changelog-september-2-changelog-draft-launches-and-scheduling-updates) describes choosing a day and launching at midnight Pacific time; [current help](https://help.producthunt.com/en/articles/2724119-how-to-schedule-a-post) explains drafts and scheduling. Do not infer an 18-hour countdown from Sydney time or this document.
2. **Choose a public destination and feedback route.** Use the repository if no working product page already exists. Open it logged out, including the README and setup links. Confirm Issues or another feedback route works. Agree with your co-founder on the repository license before calling it open source; no LICENSE file was found. License selection is yours.
3. **Record the demo below in 60–90 seconds.** Say the fault is seeded. Show the actual report and source locations. Explain that samples measure pointer blocking, not every painted pixel.
4. **Prepare the visual assets.** Suggested gallery: obstructed checkout, then evidence report. The [asset guide](https://www.producthunt.com/launch/preparing-for-launch) recommends a 240×240 thumbnail, 1270×760 gallery images and at least two gallery images. Follow the current form if different. A real report screenshot is already at `artifacts/launch/report-evidence.png`; review it before uploading.
5. **Write your story.** Describe the UI bug that frustrated you, why an agent needs inspectable evidence, what works in this alpha and what feedback you want. Add your co-founder as a maker. Ask “Which layout makes this report wrong or confusing?” rather than asking for votes.
6. **Own the final submission and replies.** Preview all links from another browser, schedule/submit through your account, and reserve time for setup questions. This pass has not posted, published packages or contacted anyone.

Tagline you can adapt: **“Source-linked UI bug reports for AI coding agents”**. Factual description to rewrite in your voice: “ANWC inspects integrated React/Vite apps in Chromium and reports overflow, clipping and sampled pointer blockers with JSX source locations. Give agents structured evidence and open the same capture as an offline HTML report. Early alpha; full paint visibility and agent savings are not claimed.”

## The demonstration

Prerequisites: Git, Node/npm and space for Chromium. Use a current Node release compatible with the repository (minimum declared support is Node 20.6). The build matters: a fresh clone has no compiled workspace packages.

Terminal 1, from a parent folder for a disposable checkout:

```powershell
git clone https://github.com/somerandomguy-coder/anwc.git anwc-demo
cd anwc-demo
npm install
npm run build
npx playwright install chromium
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

For an existing checkout, use `git pull --ff-only`, install and build again, then start the server. If 4175 is occupied, use another port consistently. `--strictPort` prevents silently inspecting the wrong server.

Terminal 2, in the same repository:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format json --fail-on none --output artifacts/launch/blocked.json
npm run anwc -- report artifacts/launch/blocked.json --format html --output artifacts/launch/blocked.html
```

Open the URL in a browser at mobile width and try checkout. Then open the HTML file. Expected: `POINTER_BLOCKED_AT_SAMPLES`, “Checkout now,” 25 blocked samples, a cookie notice blocker and source locations in `examples/shop/src/main.tsx`. Scroll to Findings and try Errors/Warnings/All. The report worked with zero HTTP requests and browser errors in this pass.

The first command normally exits **1 because a defect was found**. Execution/usage errors exit 2; incomplete or unsettled captures exit 3. `--fail-on none` allows an intentionally defective complete capture to exit 0 without removing evidence. A JSON filename alone does not select JSON format.

Show a healthy control, clearly labeled as a control:

```powershell
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout&variant=healthy" --viewport 390x844 --format text
```

For an actual code repair, stay in the disposable `anwc-demo` checkout, keep the **same broken URL**, and append this CSS to `examples/shop/src/styles.css`:

```css
.blocked.obstacle-fixture { height: auto; }
.blocked.obstacle-fixture > button { min-height: 4.5rem; }
.blocked .cookie-obstacle { position: static; margin-top: .5rem; min-height: 2.5rem; }
```

This moves the notice into normal flow while retaining it and checkout. Refresh, inspect the same viewport, then click checkout and confirm the local “Checkout confirmed” dialog. The blocker finding should disappear. Show the measurement change and working click separately. Do not commit this demo override into the fixture repo: it intentionally breaks the defective control. Switching between variant URLs is not proof of a code repair.

An agent can rehearse with source and CLI access: “Use ANWC's report to locate the blocked checkout. Repair its CSS, preserve the cookie notice and checkout behavior, and show same-state before/after evidence. Do not change intent attributes or tests.” This public exercise is intentionally non-blind. Fair model comparisons later use exported subjects, not this evaluator repository; see [TESTING](TESTING.md).

## Co-founder or cheaper-model tasks

Run **L0 first**. Only take another card if the core path works and there is time. Use one model and one bounded card per session. Give it this document and the named files, not every historical plan. Commit each completed card; run one relevant test batch after editing. After two attempts at the same unexplained failure, stop with exact reproduction and changed files. Do not invent a pass or spend the remaining credit just to fill the remaining hours.

### L0 — Fresh-clone launch gate (before submission; Q10 slice)

**Owner:** co-founder or cheaper model. **Timebox:** about 30 minutes. **Scope:** setup/package/docs only.

- Follow the demo in a separate checkout without copying `dist` or `node_modules`. Use `npm ci` once to verify the lockfile, then build and inspect. Preserve the main checkout.
- Verify the blocked target, blocker, source links, offline HTML and healthy control. Record revision, OS, Node/npm/browser versions and exit codes. Prefer a second machine.
- If promoting external installation tonight, pack all six tarballs, install them together in a disposable React/Vite app, configure `anwc()` before `react()`, and use the actual `npx anwc inspect` command. Current consumer tests exercise the installed JS entry, not the Windows npm shim. If external setup fails, promote the repository demo only.
- Fix only reproduced setup failures; no dependency upgrades, new adapters or npm publication. Acceptance: a person follows README without hidden prebuilt files. Record outcomes in STATUS and commit.

### L1 — Complete replay acceptance (Q06; after launch unless promoting `check`)

**Files:** `packages/cli/src/{manifest,runner}.ts`, `tests/browser/check.spec.ts`, CLI tests. **Scope:** runner reliability, not new actions.

- Enable the skipped browser suite. It incorrectly expects equal raw capture hashes across runs despite varying timestamps/session IDs. Compare reproducible state, stable keys and relevant findings instead; preserve genuine artifact hashes.
- Keep `passedAll` documented as replay/assertion success, not clean UI. Incomplete/unsettled captures must fail checkpoints. Bound all selector, evaluate and assertion operations; the current between-checkpoint elapsed-time check is not a hard scenario deadline.
- Validate safe capture filenames and global uniqueness before launch: names currently go directly into `join(outputDir, name + '.json')`, allowing escapes/collisions. Require values for text/attribute assertions; omitted text must not become an always-passing empty string.
- Acceptance: repeat initial/modal/scrolled states, storage isolation, prompt ambiguous/missing-selector failures, no writes for unsafe names, partial captures fail. Run typecheck, CLI tests and the enabled check browser suite as one batch. Behavior binding to diff stays separate.

### L2 — Validate diff input and explanations (Q07)

**Files:** `packages/cli/src/index.ts`, `packages/report/src/diff.ts`, `tests/unit/diff.test.ts`. **Scope:** validation and honest reporting; no new verification flag.

- CLI casts parsed JSON to Snapshot without schema validation. Validate supported Snapshot/Report inputs and return `INVALID_USAGE` (exit 2) for malformed objects. Replace hand-written diff mock nodes with valid protocol fixtures; current mocks bypass the Snapshot schema.
- Preserve the launch guards. Never add a flag that merely switches on “verified.” A future behavior proof needs scenario, retained-target, capture and executed-assertion binding; leave that larger work for a separate card.
- Fix ambiguity explanations: the missing-after-node branch currently precedes the ambiguous branch. Empty clean captures mean no repair to verify. New findings across incompatible pages must not be described as proven regressions.
- Acceptance: stable usage errors, accurate duplicate-key explanations and existing 18 diff regressions green. Run typecheck and diff/CLI tests. Full Q07 acceptance still needs rule-specific measurement and behavior-evidence checks.

### L3 — Strengthen conformance boundary checks (Q05; after launch)

**Files:** `tests/conformance/{matrix,runner,types}.ts`, `tests/browser/conformance.spec.ts`.

- The boundary branch accepts all-node paint-unknown, which is true by design even without detecting the specific boundary. Require per-case unsupported features, measurement status/reasons or a coverage cap. Add a negative test removing the expected signal that must fail.
- Isolate styles/state: replacing body HTML retains the shop's head CSS. Preserve the independent browser oracle.
- Report actual counts: 29 cases = 10 defective + 10 healthy + 9 boundary, not 29 pairs. Use `f.code`, not nonexistent `f.ruleId`, for false-positive explanations. Write new generated artifacts under ignored `artifacts/` instead of modifying a tracked report during every test; update its documented location.
- Acceptance: meaningful feature-specific boundary checks, readable failure codes, and passing conformance unit/browser tests without broader claims.

## Finish line

Use the real deadline in your Product Hunt dashboard. First confirm the slot and public destination, then L0 and assets, then review the draft together. Reserve the last two hours for links, copy, scheduling and replies. Freeze features then.

**Go for this narrow alpha** when anonymous access, fresh-clone demo, offline report, honest scope and a feedback route work. Cut unvalidated features from the announcement. If core install/demo fails, fix it before claiming usability; a video alone is not installation evidence.

After launch, collect three developer reports: what they tried, the source/capture evidence and what was wrong or confusing. Use those to choose Q08 fixes. Broad model grids, dashboards and arbitrary-site crawling can wait. The next useful result is another developer understanding and fixing one real layout problem.
