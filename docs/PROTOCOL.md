# ANWC v0.1 protocol contract

Status: frozen in T01. The executable TypeScript types and Zod validators live in `@anwc/protocol`; all producers and consumers must import this package rather than copying its shapes. Unknown and incomplete are first-class outcomes.

## 1. Core conventions

- `schemaVersion`: literal `0.1`; incompatible changes increment it and update fixtures.
- Rectangles and hit points: viewport-relative CSS pixels, floating point. Keep raw precision in JSON; round only in text output.
- Source lines/columns: one-based. Files: repository-relative, forward slashes.
- `siteId`: source location identity, repeatable for unchanged input only.
- `nodeId`: live DOM identity, unique within one document session. Repeated JSX sites do not collapse instances.
- A node may retain a `siteId` while `source` is `null` when the runtime has source-site metadata but no matching manifest entry. This is source linkage unavailable, not a fabricated source location.
- `sessionId`: regenerated after document navigation; `captureId`: unique for each capture.
- `null`: no value known. Do not use `0`, an empty string, or a made-up selector as a replacement.
- Findings describe a captured state. They do not grant permission to act and are not durable action handles.
- Text is data; normalize whitespace, escape newlines/control characters, and mark truncation. Do not include form values, credentials, or event-handler code.

## 2. Proposed TypeScript shapes

```ts
type Rect = { x: number; y: number; width: number; height: number };
type SourceRef = {
  siteId: string;
  file: string;
  line: number;
  column: number;
  tag: string;
};
type Assessment<T> =
  | { status: 'known'; value: T; method: string; limitations: string[] }
  | { status: 'estimated'; value: T; method: string; limitations: string[] }
  | { status: 'unknown'; value: null; method: string; limitations: string[] };

type HitSample = {
  x: number;
  y: number;
  result: 'target-or-descendant' | 'blocked' | 'no-target';
  blockerNodeId: string | null;
};

type Measurement = {
  nodeId: string;
  siteId: string | null;
  source: SourceRef | null;
  parentNodeId: string | null;
  tag: string;
  semanticKey: string | null;
  role: string | null;
  label: string;
  labelMethod: 'aria-label' | 'aria-labelledby' | 'text' | 'none';
  textTruncated: boolean;
  box: Rect | null;
  render: {
    hasBox: boolean;
    cssHiddenReasons: string[];
    effectiveOpacityZero: Assessment<boolean>;
  };
  viewport: Assessment<{ intersection: Rect | null; boxFraction: number }>;
  clip: Assessment<{
    intersection: Rect | null;
    boxFraction: number;
    ancestors: Array<{ nodeId: string; axes: 'x' | 'y' | 'xy'; box: Rect }>;
  }>;
  overflow: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    scrollableX: boolean;
    scrollableY: boolean;
  } | null;
  text: Assessment<{
    lineCount: number;
    fragmentRects: Rect[];
    clippedFragmentCount: number;
  }>;
  pointer: Assessment<{
    samples: HitSample[];
    tested: number;
    blocked: number;
    noTarget: number;
    blockedSampleFraction: number;
  }>;
  interaction: {
    candidate: boolean;
    disabled: boolean;
    inert: boolean;
    pointerEvents: string;
  };
  paintVisibility: Assessment<'painted' | 'not-painted'>;
  intent: {
    expectedCurrent: 'visible' | 'interactive' | null;
    maxLines: number | null;
    allow: Array<'horizontal-scroll' | 'text-truncation'>;
  };
  truncated?: true; // P05, see "Partial captures"
};

type Finding = {
  findingId: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  nodeId: string;
  source: SourceRef | null;
  message: string;
  evidence: DiagnosticEvidence;
  relatedNodeIds: string[];
  limitations: string[];
  acknowledged: boolean;
  suggestion: string | null;
};

type Snapshot = {
  schemaVersion: '0.1';
  sessionId: string;
  captureId: string;
  capturedAt: string;
  page: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number };
    devicePixelRatio: number;
    visualViewportScale: number;
    scenario: string | null;
  };
  environment: {
    browser: string;
    browserVersion: string;
    compilerVersion: string | null;
    runtimeVersion: string;
  };
  readiness: {
    settled: boolean;
    waitMs: number;
    reasons: string[];
    lastObserved?: { phase: 'fonts' | 'geometry'; stableFrames: number; movingCount: number; movingNodeIds: string[] }; // P05, unsettled only
  };
  coverage: {
    complete: boolean;
    discoveredNodes: number;
    inspectedNodes: number;
    skippedNodes: number;
    reasons: string[];
    capabilities: string[];
    unsupportedFeatures: string[];
    nodesObserved?: number; // P05, equals inspectedNodes
  };
  timingsMs: { capture: number; rules: number; serialize: number };
  nodes: Measurement[];
  findings: Finding[];
};
```

`evidence` is now a discriminated union covering the first six planned rule families, plus a deliberately marked generic escape hatch for later rule work. The shared Zod schema validates JSON before a producer or consumer accepts it, so CLI JSON cannot silently drift. T04–T06 may narrow a rule's evidence only through a coordinated protocol change.

`paintVisibility` is unknown in v0 even when hit samples reach the target. `render` describes non-paint facts that callers may use independently. This avoids implying that pointer tests detect opaque overlays with `pointer-events:none`.

Pointer samples are collected only from the intersection of the target border rectangle and the current viewport. The deterministic sequence starts at the center, has at most 25 interior locations, and is deduplicated by physical browser hit-test location. `capture({ maxSamplesPerNode })` accepts only integers from 1 through 25 (default 25). A target with no viewport intersection returns an unknown pointer assessment with a no-samples limitation; it is not evidence that pointer delivery succeeds. A lower configured cap is recorded as a method limitation. Pointer evidence and clipping evidence remain separate. When an element has more than one client rectangle (a wrapped inline link), samples are taken only inside its viewport-visible fragments, each grid position across all fragments in order, under the same 25-sample cap; the limitations then say so. Elements with one client rectangle keep the plain grid. The outermost samples sit one sixth of the box in from each edge, so a thin edge overlay (for example 8px on a 140px button) can be missed: that is a documented sampling limit, not a claim that the edge is reachable.

For `visibility`, the collector uses the target's computed value. CSS inheritance permits a descendant to restore `visibility:visible` under a hidden ancestor, so ancestor iteration would misreport that child. `display:none` and zero opacity are still collected across the element's ancestry, and so is `content-visibility:hidden` on an ancestor box (not on the element itself, whose own box is still rendered, and not on boxes it does not apply to, such as inline elements). These are render-state facts, not paint-visibility guarantees.

Clip boxes are fractional: an overflow ancestor's border box minus its borders and any classic scrollbar. Element edges within 0.01px of the clip edge count as unclipped (layout units are 1/64px). The root element is the exception: its clip is the integer viewport client size. A scroll container clips at its current scroll position; content that can be scrolled into view is still reported as clipped in the captured state.

The label is a best-effort label with provenance, not a conforming computed accessible name. Prefer platform semantics and test common roles; do not claim a full accessibility audit.

### Partial captures (P05)

A partial capture is a success (`ok:true`, exit 3 for `inspect`) that says what it did not see. All fields are optional additions to `0.1`: captures and reports saved before P05 still parse; builds older than P05 reject captures that carry the new fields, because the schemas are strict.

- `coverage.nodesObserved`: nodes actually measured. Always written by the runtime; equals `inspectedNodes`.
- `coverage.complete` is `false`, with a reason, when the node cap was reached (`max node cap reached`), when an open shadow root with rendered content was not traversed (`open shadow root content is not inspected`), or when a frame, object or embed with area was not entered (`embedded frame content is not inspected`). The two boundary reasons leave `skippedNodes` at 0: how many nodes lie behind a boundary is unknown. A closed shadow root and canvas pixels are not detectable this way and remain known gaps.
- `truncated: true` (never `false`) marks the affected nodes: the nearest captured ancestor of each skipped element, each uninspected boundary host, and on a settle timeout the elements that last moved plus their captured descendants. If nothing was seen moving (for example fonts never became ready), every captured node is marked, because no geometry is final. It is invalid in a complete, settled capture.
- `readiness.lastObserved` (unsettled only): the phase that was waited for, stable frames seen, how many candidate elements last moved, and up to 20 of their node ids.

`Report 0.1` carries the same facts as optional `coverage.nodesObserved`, `coverage.truncatedNodes` (present when above 0) and `readiness.lastObserved`. The text header starts with `PARTIAL CAPTURE` or `UNSETTLED CAPTURE`; HTML and Markdown put the facts in their header warning; with zero findings none of them prints a clean result.

## 3. Intent attributes

```tsx
<button data-anwc-key="checkout" data-anwc-expect="interactive">
  Checkout
</button>
<h2 data-anwc-max-lines="2">Product name</h2>
<p data-anwc-allow="text-truncation">A deliberately shortened preview</p>
<div data-anwc-allow="horizontal-scroll">...</div>
```

`data-anwc-expect` applies to the current captured state and viewport. It is not a command to inspect absent DOM: expected-but-not-mounted targets need an external expectation selector supplied by the evaluator or future API. A target hidden intentionally inside a closed menu should not declare a current visibility requirement in that state.

Invalid intent attributes produce configuration diagnostics; they must not crash traversal. Accept only positive finite integer line budgets. Multiple allowances may be a whitespace-separated list. Record acknowledged facts in JSON so policy cannot erase measurements.

Benchmark rules: the same application intent attributes are visible to every condition. No defect labels, expected result lists, or private answer keys may be inserted as ANWC metadata.

## 4. Compiler/runtime boundaries

```ts
// @anwc/compiler — Node-side, independent of Vite/browser globals.
instrument(code: string, options: {
  filename: string; root: string; mode: 'development' | 'production';
}): InstrumentResult | null;

// @anwc/runtime — browser-side, no Node imports.
capture(options: {
  maxNodes?: number; maxSamplesPerNode?: number; textLimit?: number;
}): Promise<RawCapture>;

// @anwc/diagnostics — pure functions over normalized browser measurements.
diagnose(capture: RawCapture): Finding[];

// @anwc/cli — Node-side browser owner.
inspect(options: InspectOptions): Promise<Snapshot>;
```

T01 defines the named aliases referenced above. `RawCapture` contains page/readiness/coverage/nodes and `{ capture, serialize }` timing, without rule output. `Snapshot` adds findings and rule timing. Compiler manifest joins belong in the capture orchestration path; diagnostics should not fetch source files. In Vite dev, `window.__ANWC__` exposes versioned `capture` and source lookup for the current page. In runtime-only mode, inject the same bundled capture implementation once.

The Vite development adapter retains source records by module and makes registration order-independent: a transformed module writes its latest record to a pending registry before it calls the runtime, and the runtime drains that registry at startup. Re-registering a module replaces its previous sites. This is development-only source-link plumbing; the default production build has neither the virtual runtime nor generated `data-anwc-site` attributes.

Every capture creates a consistent session context. If navigation or teardown occurs mid-capture, fail explicitly or mark the capture incomplete. Do not concatenate node lists from different document sessions.

Readiness is a bounded heuristic: the runtime waits for browser font readiness and then requires two successive animation-frame geometry comparisons, with a 1 CSS px tolerance, across interactive and expected targets. A timeout or continuing movement produces `readiness.settled: false` with a specific reason. This prevents a clean finding list from being treated as a reliable result while layout is still moving; it does not prove that a page will remain stable indefinitely.

## 5. CLI contract

Commands below are targets to implement, not commands that run in this documentation-only repository today.

```sh
npm run dev
npm run anwc -- inspect http://127.0.0.1:5173 --viewport 1440x900 --format text
npm run anwc -- inspect http://127.0.0.1:5173 --viewport 390x844 --format json --output artifacts/mobile.json
npm run anwc -- inspect http://127.0.0.1:5173 --runtime-only --format json
npm run anwc -- inspect http://127.0.0.1:5173 --fail-on error
```

| Option | Default | Semantics |
| --- | --- | --- |
| `--viewport WxH` | `1440x900` | Positive integers; reject malformed/out-of-budget dimensions |
| `--format text\|json` | `text` | JSON preserves full structured evidence |
| `--output path` | stdout | Write the bare payload (or text) to file when supplied; errors still go to stdout (JSON) or stderr (text); see §7 |
| `--limit N` | 40 | Text findings cap; JSON findings remain complete within capture budget |
| `--max-chars N` | 12000 | Text cap with explicit truncation marker and counts |
| `--timeout-ms N` | 15000 | Navigation/readiness/capture overall bound with cleanup |
| `--ready-selector S` | none | Optional app-specific readiness signal |
| `--runtime-only` | false | Inject collector without requiring compiler metadata |
| `--fail-on error\|warning\|none` | `none` | Controls CI failure threshold |

Exit codes (all commands, since P01; see §7): `0` ok; `1` structured error (`ok:false`, any code except `INVALID_USAGE`) **or** `ok:true` with a failed verdict gate — for `inspect` that is a `--fail-on` threshold match; `2` usage/parse error (`INVALID_USAGE`), with the envelope still printed in JSON mode; `3` (`inspect` only) `ok:true` but partial coverage or an unsettled capture. Incomplete capture takes precedence over the defect threshold. No-findings with code `0` means no findings within stated capabilities, never universal proof of correct appearance. Exit 1 is ambiguous on purpose for CI compatibility; agents branch on the envelope's `ok`, not the exit code.

JSON output must remain parseable when there are warnings, timers, or browser console logs. Text output ends with omitted finding count and capture completeness. A CLI-owned browser is always closed, including error paths. The read-only inspection operation never clicks, fills, changes CSS, or scrolls; a separate trusted runner performs scenario setup.

## 6. Example finding and text output

Illustrative synthetic data; these are not measured results.

```json
{
  "findingId": "f_pointer_n17",
  "code": "POINTER_BLOCKED_AT_SAMPLES",
  "severity": "error",
  "nodeId": "n17",
  "source": {
    "siteId": "s_example",
    "file": "examples/shop/src/Cart.tsx",
    "line": 24,
    "column": 5,
    "tag": "button"
  },
  "message": "Checkout: all 25 tested points hit the cookie banner.",
  "evidence": {
    "tested": 25,
    "blocked": 25,
    "blockedSampleFraction": 1,
    "method": "browser-hit-test-grid",
    "expectedCurrent": "interactive"
  },
  "relatedNodeIds": ["n31"],
  "limitations": ["Sampling is not pixel coverage or proof that every point is blocked."],
  "acknowledged": false,
  "suggestion": "Check the banner position and checkout container in this viewport."
}
```

A 5×5 grid already includes the center for a rectangular region, so the example has 25 distinct samples. A separate center addition must be deduplicated.

```text
ANWC 0.1 | 390x844 | scroll 0,0 | capture c_example | complete, settled
ERROR POINTER_BLOCKED_AT_SAMPLES n17 "Checkout"
  examples/shop/src/Cart.tsx:24:5 | blocked 25/25 samples | blocker n31 "Cookie banner"
ERROR TEXT_LINE_BUDGET_EXCEEDED n8 "Product name"
  examples/shop/src/ProductCard.tsx:18:7 | observed 3 lines | expected <=2
2 findings | 0 omitted | paint visibility unknown | no screenshots captured
```

Do not remove uncertainty to shorten the report. Give details only for affected elements by default; allow full JSON drill-down. Reporting zero screenshots requires that the inspection path actually does not invoke screenshot APIs; it does not describe what the evaluating human or another tool may have done.

## 7. Result envelope 0.1 (P01)

Every JSON result a CLI command prints on stdout is one `Envelope 0.1`. Executable schemas: `packages/protocol/src/envelope.ts` (`envelopeSchema`, `successEnvelopeSchema`, `errorEnvelopeSchema`, `envelopeOf(payloadSchema)`, `unwrapEnvelope`). Builders: `packages/cli/src/output.ts`.

```ts
type Envelope<T> =
  | { version: '0.1'; ok: true; command: Command; data: T }
  | { version: '0.1'; ok: false; command: Command; error: EnvelopeError };

type Command = 'inspect' | 'check' | 'diff' | 'report' | 'doctor' | 'studio' | 'unknown'; // 'unknown': first argument is not a command

type EnvelopeError = {
  code: ErrorCode;
  message: string;
  details?: { kind: string; [key: string]: unknown }; // kind: precise original failure, UPPER_SNAKE_CASE
  recovery?: {
    strategy: 'fix_input' | 'start_target' | 'instrument_target' | 'adjust_csp' | 'wait_and_retry'
      | 'increase_budget' | 'recapture' | 'disambiguate_target' | 'fix_environment' | 'report_bug';
    retryable: boolean;            // re-running the identical command may succeed
    requiresFreshCapture: boolean; // evidence from the failed attempt must not be reused; capture again
    hint?: string;                 // human-readable next step (was details.recovery)
  };
  retry: 'safe' | 'unsafe' | 'unknown'; // can a re-run duplicate an effect?
};
```

Empty optional fields are omitted, never `null`. `data` is always present when `ok` is true and is the unchanged payload:

| Command and mode | `data` |
| --- | --- |
| `inspect --format json` | Snapshot 0.1 |
| `report --format json` | Report 0.1 |
| `report --query summary --format json` | AgentSummary 0.1 |
| `report --query detail --format json` | AgentFindingDetail 0.1 |
| `diff --format json` | DiffReport 0.1 (with P03 verdicts, §9) |
| `check` (always JSON) | CheckRunResult 0.1 (with P03 verdicts, §9) |
| `doctor --json` / `doctor --format json` | DoctorResult 0.1 |

**Findings and verdicts are data.** A capture with findings, a `check` with failed checkpoints, a `diff` that is not `verified-repair` and an unhealthy `doctor` are all `ok:true`; only the exit code reports the gate (§5 and below).

### Error codes

The list is closed; adding a code is a protocol change. Each code has a default recovery; `details.kind` keeps the precise failure.

| Code | Exit | Default recovery (`strategy`, retryable, requiresFreshCapture) | Produced today by (`details.kind`) |
| --- | --- | --- | --- |
| `INVALID_USAGE` | 2 | `fix_input`, no, no | `USAGE`, `UNKNOWN_COMMAND`, `UNKNOWN_OPTION`, `MISSING_OPTION`, `MISSING_OPTION_VALUE`, `INVALID_OPTION_VALUE`, `INVALID_OPTIONS`, `INVALID_URL`, `MARKDOWN_URL`, `INPUT_UNREADABLE`, `INPUT_NOT_JSON`, `INPUT_SCHEMA_MISMATCH`, `INPUT_IS_ERROR_ENVELOPE`, `FINDING_NOT_FOUND`, `UNSCOPED_NODE_ID`, `NODE_NOT_FOUND` |
| `TARGET_UNREACHABLE` | 1 | `start_target`, yes, no | `NAVIGATION_FAILED` (inspect `page.goto` failed) |
| `RUNTIME_MISSING` | 1 | `instrument_target`, no, no | `RUNTIME_MISSING` (no `window.__ANWC__` within the wait) |
| `CSP_BLOCKED` | 1 | `adjust_csp`, no, no | `RUNTIME_SCRIPT_BLOCKED_BY_CSP` (`--runtime-only` injection refused, or the runtime is missing after a browser CSP violation for a script) |
| `NOT_SETTLED` | 1 | `wait_and_retry`, yes, yes | `READY_SELECTOR_TIMEOUT` (`--ready-selector` never attached) |
| `CAPTURE_STALE` | 1 | `recapture`, yes, yes | `DOCUMENT_REPLACED_DURING_CAPTURE` (the document navigated mid-capture and the one retry on the new document also failed); `REF_FROM_OTHER_CAPTURE` (`report` ref from another capture, not retryable, §10) |
| `AMBIGUOUS_TARGET` | 1 | `disambiguate_target`, no, no | `REF_MATCHES_MULTIPLE_INSTANCES`, `NODE_HAS_MULTIPLE_FINDINGS` (`report`, §10; `details.candidates` lists refs). `check` reports an ambiguous selector as a failed checkpoint inside `data`, not as a command error. |
| `SOURCE_UNMAPPED` | 1 | `instrument_target`, no, no | none yet: an unmapped node is `source: null` data. Reserved for P02/P03. |
| `BUDGET_EXCEEDED` | 1 | `increase_budget`, yes, yes | `CAPTURE_TIMEOUT` (runtime capture exceeded `--timeout-ms`) |
| `INTERNAL` | 1 | `report_bug` (or `fix_environment`), no, no | `RUNTIME_CAPTURE_FAILED`, `BROWSER_MISSING`, `BROWSER_LAUNCH_FAILED` (both `fix_environment`), `UNCAUGHT_EXCEPTION` |

An unsettled or incomplete Snapshot is **not** `NOT_SETTLED`: it is `ok:true` data with `readiness.settled:false` or `coverage.complete:false` and `inspect` exit 3 (P05 refines partial results).

### Retry safety

`retry:"safe"` appears only where re-running cannot duplicate an effect: every `INVALID_USAGE` (nothing ran), and every error from `inspect`, `report`, `diff`, `doctor` and `studio` (read-only; `--output` rewrites the same path). `check` replays declared clicks and fills against a live app, so its non-usage errors are `retry:"unknown"`. Nothing is `unsafe` today. `retry` answers "is it safe to re-run?"; `recovery.retryable` answers "may an unchanged re-run succeed?".

### Exit codes

| Exit | Meaning |
| --- | --- |
| 0 | `ok:true`, no gate failed |
| 1 | `ok:false` with a code other than `INVALID_USAGE`; or `ok:true` with a failed gate: `inspect --fail-on` threshold met, `check` `passedAll:false`, `diff` verdict other than `verified-repair`, `doctor` `ok:false` |
| 2 | `ok:false`, `INVALID_USAGE` (envelope still printed in JSON mode) |
| 3 | `inspect` only: `ok:true`, but coverage incomplete or readiness unsettled (takes precedence over `--fail-on`) |

Exit 3 is kept from Phase 3 so CI cannot read unsettled evidence as a clean pass. `--fail-on` keeps working: it changes only the exit code, never `ok`.

### Where JSON goes

- **JSON mode** is chosen by `--format json` (any command), `doctor --json`, or `check` (JSON-only; `check --format json` is accepted). It is decided from the raw arguments, so parse errors also print an envelope. In JSON mode stdout holds exactly one envelope and stderr stays empty for CLI errors.
- **Text, Markdown and HTML** formats are unchanged; errors in those modes still print `ANWC CODE: message` and `  Recovery: hint` on stderr.
- **`--output FILE` writes the bare payload**, not an envelope (Snapshot, Report, AgentSummary, AgentFindingDetail, DiffReport). Saved files are durable artifacts that `report`, `diff`, the studio and earlier tooling read; the envelope describes one invocation. On success stdout is then empty; on error the envelope still goes to stdout and no file is written. `check --output DIR` artifacts (`*.json` captures, `check-summary.json`) also stay bare.
- **Readers accept both.** `report`, `diff`, `studio --capture` and the studio `/api/upload` route unwrap an `ok:true` envelope (for example `inspect --format json > before.json`). A saved `ok:false` envelope is rejected as `INVALID_USAGE` / `INPUT_IS_ERROR_ENVELOPE`. The studio's in-browser file loader (`packages/studio/src/App.tsx`) still expects bare payloads.

## 8. Migration from bare payloads (consumer impact)

Before P01, `--format json` stdout was the bare payload and errors were `{ schemaVersion: '0.1', error: { code, message, details } }`.

| Consumer | Before | After | Change needed |
| --- | --- | --- | --- |
| Parses `inspect`/`report`/`diff --format json` stdout | Snapshot / Report / DiffReport at the root | Same object under `data` | Read `.data`; check `.ok` first. `envelopeOf(schema)` validates both layers. |
| Parses `check` stdout | CheckRunResult at the root; errors as text on stderr | Under `data`; errors as an `ok:false` envelope on stdout | Read `.data`; read errors from stdout. |
| Parses `doctor --json` | DoctorResult at the root (`ok` meant "healthy") | Envelope `ok` = command succeeded; health is `data.ok` | Read `.data.ok`; do not confuse the two `ok`s. |
| Reads files written with `--output` | Bare payload | Bare payload | None. |
| Redirects stdout to a file and feeds it to `report`/`diff`/studio server | Bare payload | Envelope | None: readers unwrap envelopes. |
| Parses error JSON | `schemaVersion`, `error.details.recovery` (string), `details: null` allowed | `version`, `ok:false`, `command`; hint at `error.recovery.hint`; `details` omitted or `{ kind, ... }`; new `retry` | Switch on `error.code`; read `error.recovery`. |
| Old error codes | `NAVIGATION_FAILED`, `TIMEOUT`, `PARTIAL_CAPTURE` | `TARGET_UNREACHABLE` (kind `NAVIGATION_FAILED`); `TIMEOUT` split into `NOT_SETTLED` (kind `READY_SELECTOR_TIMEOUT`) and `BUDGET_EXCEEDED` (kind `CAPTURE_TIMEOUT`); `PARTIAL_CAPTURE` removed (it had no producer; partial captures are `ok:true` data with exit 3) | Map codes; use `details.kind` for the precise case. |
| Relies on exit 2 for runtime/navigation failures | 2 for every error | 1 for structured errors; 2 only for `INVALID_USAGE` | CI scripts that treated 2 as "tool failed" should treat 1 or 2 with `ok:false` as failure. |
| `@anwc/protocol` `errorEnvelopeSchema` / `ErrorEnvelope` | Old error shape | Same names, new `ok:false` envelope shape | Recompile; old-shape fixtures fail validation. |

## 9. Finding verdicts (P03)

`diff` and `check` say what their evidence proves about each finding: `verdict` (`verified | unverified | contradicted`) plus one `reason` from a closed enum. Executable source: `packages/report/src/verdict-schema.ts` (`verdictSchema`, `verdictReasonSchema`, `VERDICT_BY_REASON`, `VERDICT_REASON_TEXT`). Every reason implies exactly one verdict, and `diffReportSchema` rejects any other pairing. Adding a reason is a protocol change.

| Reason | Verdict | Means | `diff` | `check` |
| --- | --- | --- | --- | --- |
| `finding_absent_target_retained` | verified | The rule could have fired on the same retained target, did not, and behavior was executed | pure API only | never |
| `behavior_not_checked` | unverified | The finding is gone, but no executed behavior check is bound to the result | yes | yes |
| `target_ambiguous` | unverified | Several elements could be the target | yes | yes |
| `state_not_reproduced` | unverified | URL, scenario, viewport, scroll, scale or runtime differ; or a declared state was not reached | yes | yes |
| `coverage_reduced` | unverified | Incomplete coverage, a lost measurement capability, or (`check`) nothing captured | yes | yes |
| `capture_not_settled` | unverified | Layout was still moving | yes | yes |
| `measurement_unsupported` | unverified | The property behind the finding was not measurable on the target afterwards (pointer not sampled, disabled, clip unknown, text gone, hidden on both sides, Report input) | yes | no |
| `intent_changed` | unverified | `data-anwc-max-lines` / `data-anwc-expect` was removed or relaxed, so the rule cannot fire | yes | no |
| `target_identity_heuristic` | unverified | No author key, or the key moved to another tag/role | pure API, and the CLI when the matched element is hidden | no |
| `target_retention_unknown` | unverified | No author key and no match, or a Report input that omits healthy nodes | yes | no |
| `finding_acknowledged` | unverified | Declared acceptable (on both sides, in `diff`), so not a repair target | yes | yes |
| `no_baseline` | unverified | A clean checkpoint with held assertions; nothing to compare a repair with | no | yes |
| `finding_persists` | contradicted | Still measured on the target, including a pointer blocker that became partial or a finding silenced only afterwards | yes | no |
| `finding_present` | contradicted | Measured in this state | no | yes |
| `new_finding` | contradicted | Appears only in the after capture of a comparable, complete, settled pair | yes | no |
| `target_unmounted` | contradicted | A uniquely keyed target is missing from a complete, settled after Snapshot | yes | no |
| `target_hidden` | contradicted | The target is in the DOM but newly hidden | yes | no |
| `behavior_assertion_failed` | contradicted | A declared assertion was executed and did not hold | pure API only | yes |

`verified` needs all of: the same URL, scenario, viewport, scroll, scale and runtime version; complete and settled captures on both sides with no lost capability; an after Snapshot (not a Report); the target matched by a unique author key on the same tag and role, rendered, not newly hidden, with unchanged intent; the rule's measurement supported on it; the finding absent; **and** executed behavior evidence. **The CLI has no source of bound behavior evidence, so `anwc diff` never prints `verified`**: its best result is `unverified(behavior_not_checked)`. No flag changes that (LAUNCH L2).

**DiffReport 0.1.** Each entry of `findings` has `verdict` and `reason`; `summary.verdicts` is `{ verified, unverified, contradicted }` and sums to `findings.length`. `status`, `repairIntegrityVerdict` and the exit code keep their meaning; `status: 'verified-fixed'` and `verdict: 'verified'` imply each other. Text, Markdown and HTML show both.

**CheckRunResult 0.1.** Each checkpoint has `findingVerdicts` (every finding of every capture in it) and its own `verdict`, `reason`, `explanation`. `verdictSummary` holds `{ findings, checkpoints }` counts and `checkpointsNotRun` (declared checkpoints after a failure, counted as `unverified(state_not_reproduced)`). `passedAll` and the exit code are unchanged: a checkpoint can be `passed: true` and `contradicted(finding_present)`.

**UI helper.** `listFindingVerdicts(before: Snapshot, after: Snapshot): FindingVerdictList` (`packages/report/src/verdict.ts`) is pure and browser-bundle safe. It takes no behavior option and never returns `verified`. `after` is `null` whenever no after box may be drawn. `findingVerdictsFromDiff(diff)` does the same for an existing DiffReport.

Consumer impact: the new fields are required, so a DiffReport saved before P03 no longer validates against `diffReportSchema`; re-run `anwc diff` on the saved captures. Captures and Reports are unaffected. A pure-API `status` can now be `inconclusive` where it was `verified-fixed`: newly hidden target, removed or relaxed intent, unmeasurable property, partially blocked pointer, or a key moved to another element kind.

## 10. Capture-scoped references (P02)

A bare node id (`n34`) is only meaningful inside one capture: after HMR or a re-capture the same id can belong to a different `.map()` instance. A reference is `c_<8 hex>:<id>`, where the hex is the start of the capture hash (`report.input.captureHash`). Executable source: `packages/protocol/src/node-ref.ts` (`nodeRefSchema`, `formatNodeRef`, `parseNodeRef`, `captureScope`); resolution: `resolveNodeRef` and `resolveFindingRef` in `packages/report/src/query.ts`.

- AgentSummary 0.1 and AgentFindingDetail 0.1 targets, blockers, ancestors and related nodes carry `nodeRef`; findings carry `findingRef`. Both are optional, so results saved before P02 still validate, and are omitted when a stored Report's hash is not hexadecimal. `nodeId` and `findingId` stay bare. Snapshot 0.1 and Report 0.1 are unchanged, so old captures stay viewable and refs are computed on read.
- `report --node-id REF` filters by ref, or with `--query detail` selects the node's single finding. `--finding-id` accepts a `findingRef` (what the text output prints) and, for compatibility, a bare finding id. **A bare finding id is not scoped**: it resolves in whatever file it is given. Use `findingRef` whenever the page may have been captured again.
- The id part may also be a source `siteId` when the file is a Snapshot; `.map()` siblings share one, so that can be ambiguous.

| Given | Refusal (`details.kind`) |
| --- | --- |
| `--node-id n34` | `INVALID_USAGE` (`UNSCOPED_NODE_ID`) |
| A ref from another capture | `CAPTURE_STALE` (`REF_FROM_OTHER_CAPTURE`, with `refScope` and `captureScope`) |
| A ref matching several live instances | `AMBIGUOUS_TARGET` (`REF_MATCHES_MULTIPLE_INSTANCES`, with `candidates`) |
| `--query detail --node-id` on a node with several findings | `AMBIGUOUS_TARGET` (`NODE_HAS_MULTIPLE_FINDINGS`, with finding refs as `candidates`) |
| A ref to a node not in the file | `INVALID_USAGE` (`NODE_NOT_FOUND`) |

Consumer impact: `--node-id n34` used to filter and now fails. `--query detail --finding-id` no longer accepts a node id in place of a finding id. The hash covers the schema-parsed Snapshot, so reformatting a saved file keeps its refs valid, while any change of content does not. Refs computed in the studio's browser bundle differ from the CLI's, because its `node:crypto` alias (`packages/studio/src/crypto-shim.ts`) is not SHA-256; do not paste one into the other.
