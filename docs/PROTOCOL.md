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
  readiness: { settled: boolean; waitMs: number; reasons: string[] };
  coverage: {
    complete: boolean;
    discoveredNodes: number;
    inspectedNodes: number;
    skippedNodes: number;
    reasons: string[];
    capabilities: string[];
    unsupportedFeatures: string[];
  };
  timingsMs: { capture: number; rules: number; serialize: number };
  nodes: Measurement[];
  findings: Finding[];
};
```

`evidence` is now a discriminated union covering the first six planned rule families, plus a deliberately marked generic escape hatch for later rule work. The shared Zod schema validates JSON before a producer or consumer accepts it, so CLI JSON cannot silently drift. T04–T06 may narrow a rule's evidence only through a coordinated protocol change.

`paintVisibility` is unknown in v0 even when hit samples reach the target. `render` describes non-paint facts that callers may use independently. This avoids implying that pointer tests detect opaque overlays with `pointer-events:none`.

Pointer samples are collected only from the intersection of the target border rectangle and the current viewport. The deterministic sequence starts at the center, has at most 25 interior locations, and is deduplicated by physical browser hit-test location. `capture({ maxSamplesPerNode })` accepts only integers from 1 through 25 (default 25). A target with no viewport intersection returns an unknown pointer assessment with a no-samples limitation; it is not evidence that pointer delivery succeeds. A lower configured cap is recorded as a method limitation. Pointer evidence and clipping evidence remain separate.

For `visibility`, the collector uses the target's computed value. CSS inheritance permits a descendant to restore `visibility:visible` under a hidden ancestor, so ancestor iteration would misreport that child. `display:none` and zero opacity are still collected across the element's ancestry. These are render-state facts, not paint-visibility guarantees.

The label is a best-effort label with provenance, not a conforming computed accessible name. Prefer platform semantics and test common roles; do not claim a full accessibility audit.

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
| `--output path` | stdout | Write report to file when supplied; diagnostics go to stderr |
| `--limit N` | 40 | Text findings cap; JSON findings remain complete within capture budget |
| `--max-chars N` | 12000 | Text cap with explicit truncation marker and counts |
| `--timeout-ms N` | 15000 | Navigation/readiness/capture overall bound with cleanup |
| `--ready-selector S` | none | Optional app-specific readiness signal |
| `--runtime-only` | false | Inject collector without requiring compiler metadata |
| `--fail-on error\|warning\|none` | `none` | Controls CI failure threshold |

Exit codes: `0` successful complete capture with no selected threshold violation; `1` successful complete capture with selected threshold violation; `2` invalid usage/navigation/runtime/tool failure; `3` partial coverage or unsettled capture. Incomplete capture takes precedence over defect threshold. No-findings with code `0` means no findings within stated capabilities, never universal proof of correct appearance.

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
