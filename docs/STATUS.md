# ANWC status

## Start here

ANWC is a development-only Vite/React inspection layer. It attaches source identity to JSX and reports browser geometry, clipping, text layout, CSS-hidden controls, overflow, and sampled pointer blockers. It does not take screenshots or prove paint-level visibility.

**Current work:** W13 in [ROADMAP](ROADMAP.md): grade returned repairs independently. W01–W12 are complete. The installed Vite/runtime integration is the supported product path. Inspecting arbitrary uninstrumented sites is future work in [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md).

**Repository:** `git@github.com:somerandomguy-coder/anwc.git` on `main`.

## Before changing code

```sh
npm install
npx playwright install chromium
npm run test:integration
```

The latest W12 verification passes TypeScript, 40 unit tests, 20 Chromium tests, and production builds for shop, landing, and dashboard. A standalone ordinary subject also completes `npm ci` and its production build.

Make one roadmap task per commit. Run its focused tests while working, run `npm run test:integration` before committing, update this file only when the current task or verification baseline changes, then push `main`.

## Run and inspect the demo

Terminal one:

```sh
npm run dev -- --host 127.0.0.1 --port 4175
```

Terminal two:

```sh
npm run anwc -- inspect "http://127.0.0.1:4175/" --viewport 1440x900 --format text
npm run anwc -- inspect "http://127.0.0.1:4175/lab?case=blocked-checkout" --viewport 390x844 --format json
```

The default storefront at `/` is clean. `/lab?case=blocked-checkout` is an intentionally answer-bearing learning fixture and must never be used as a blinded agent subject. See [TESTING](TESTING.md) for its cases and [EVALUATOR_SETUP](EVALUATOR_SETUP.md) for the isolated-subject model.

## Boundaries that matter

- Capture is read-only: it does not click, fill, scroll, focus, mutate styles, or take screenshots.
- Pointer findings prove sampled event delivery only. Paint visibility remains unknown.
- An unsettled capture exits as incomplete; do not treat a clean, unsettled report as reliable.
- A source-editing repair agent needs an editable isolated subject plus its URL. A URL-only agent can inspect but cannot repair source.
- Public fixtures, expected codes, grader answers, docs, and Git history must not enter blinded subjects.

## Reference map

| Need | Read |
| --- | --- |
| Current task and acceptance criteria | [ROADMAP](ROADMAP.md) |
| How to test manually or run an A/B pilot | [TESTING](TESTING.md), [BENCHMARK](BENCHMARK.md) |
| Subject isolation and evaluator setup | [EVALUATOR_SETUP](EVALUATOR_SETUP.md) |
| Snapshot and CLI contract | [PROTOCOL](PROTOCOL.md) |
| Future arbitrary-site support | [ARBITRARY_URL_PLAN](ARBITRARY_URL_PLAN.md) |
| Decisions and completed-work record | [DECISIONS](DECISIONS.md), [HISTORY](HISTORY.md) |
| Original architecture proposal | [PLAN](PLAN.md) |


