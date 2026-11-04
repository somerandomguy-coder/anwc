# ANWC Interactive Studio: Visual Split-Screen Workbench

- **Status:** Approved
- **Date:** 2026-11-05
- **Package:** `packages/studio` & `@anwc/cli`
- **Command:** `anwc studio [URL] [--port 4180] [--capture FILE.json]`

---

## 1. Executive Summary & Goals

ANWC provides source-linked, layout-aware inspection for React/Vite web applications. While AI agents consume compact structured JSON (`AgentSummary 0.1` and `AgentFindingDetail 0.1`) and CLI users receive formatted text or offline HTML reports, human developers, design partners, and evaluators need an **interactive visual workbench** to directly compare:
1. **Ground Truth Reality:** The actual rendered UI in an interactive, responsive device viewport.
2. **ANWC Geometric X-Ray:** The engine's spatial model showing bounding boxes $(x, y, w, h)$, blocking interceptor layers, and color-coded pointer raycast hit samples (🟢 reachable, 🔴 blocked, 🟠 clipped).
3. **Verbal Finding Verification:** Bidirectional synchronization between verbal diagnostic finding descriptions (e.g., *"Target button blocked at 75% of samples by cookie notice"*) and the physical canvas elements.

---

## 2. Architecture & Package Structure

```
anwc/
├── packages/
│   ├── studio/                         # Interactive React SPA (Private Workspace)
│   │   ├── index.html                  # HTML shell
│   │   ├── package.json                # @anwc/studio
│   │   ├── vite.config.ts              # Vite bundle config outputting to dist/
│   │   ├── src/
│   │   │   ├── main.tsx                # Bootstrap
│   │   │   ├── App.tsx                 # Core state coordinator (URL, Viewport, Active Finding)
│   │   │   ├── types.ts                # Studio UI state interfaces
│   │   │   ├── components/
│   │   │   │   ├── Header.tsx          # Presets, URL bar, Viewport presets, Inspect button
│   │   │   │   ├── SplitView.tsx       # Dual-pane container with zoom/scale sync
│   │   │   │   ├── GroundTruthPane.tsx # <iframe> rendering target app + highlight overlay
│   │   │   │   ├── XRayPane.tsx        # SVG viewport canvas with rects and hit sample dots
│   │   │   │   ├── FindingDrawer.tsx   # Categorized finding list, metrics, and source links
│   │   │   │   ├── FindingCard.tsx     # Single finding card with severity badge & code
│   │   │   │   └── SampleTooltip.tsx   # Detailed sample raycast inspection tooltip
│   │   │   └── data/
│   │   │       └── demo-presets.ts     # Pre-packaged demo captures (Shop, Pricing, Dashboard)
│   ├── cli/
│   │   ├── src/
│   │   │   ├── studio.ts               # Local studio HTTP server & background runner
│   │   │   └── index.ts                # CLI entry point registering `anwc studio`
│   │   └── dist/
│   │       └── studio/                 # Compiled static assets from packages/studio
```

---

## 3. Data Flow & Server API

When the user runs `npx anwc studio [URL]`:
1. Node.js starts an HTTP server on `127.0.0.1:4180` (falls back to ephemeral port if occupied).
2. Serves pre-compiled static assets from `packages/cli/dist/studio/`.
3. Opens the system browser automatically to `http://127.0.0.1:4180`.
4. Handles live background inspection and file uploads via JSON endpoints:

### Endpoints:
- **`GET /api/health`**: Returns engine status, Node version, and Chromium availability.
- **`GET /api/presets`**: Returns the catalog of demo fixture scenarios with pre-computed captures and active server URLs if running locally.
- **`POST /api/inspect`**:
  - Request: `{ url: string, viewport: { width: number, height: number } }`
  - Launches headless Chromium via Playwright, injects the ANWC runtime collector, generates findings via `@anwc/report`, and returns `{ ok: true, snapshot, report, summary }`.
- **`POST /api/upload`**:
  - Accepts arbitrary uploaded `capture.json` or `diff.json` files and parses them into studio state.

---

## 4. Frontend Component Design & Interactions

### 4.1 Header Bar (`Header.tsx`)
- **Preset Quick Picker:** Instant switching between Shop (`blocked-checkout`), Pricing (`blocked-selection`), Dashboard (`outside-save`), and healthy controls.
- **Custom URL Input:** Direct input for local development URLs (e.g., `http://127.0.0.1:5173`).
- **Viewport Presets:** Mobile ($390\times 844$), Tablet ($768\times 1024$), Desktop ($1440\times 900$), or manual width/height inputs.
- **Scale / Zoom:** Dropdown ($50\%$, $75\%$, $100\%$, Fit to Screen) to ensure both panes fit comfortable desktop displays while preserving true internal pixel coordinate systems.
- **Inspect Button:** Triggers `/api/inspect` with loading spinner indicator.
- **Load Capture Button:** File input for drag-and-drop JSON exploration.

### 4.2 Dual-Pane Split View (`SplitView.tsx`)
- **Left Pane (Ground Truth Reality):**
  - Renders an `<iframe>` pointing to the target URL.
  - Sized to exact viewport dimensions $(W \times H)$.
  - Overlaid with an unobtrusive SVG highlight box when a finding is selected.
- **Right Pane (ANWC Geometric X-Ray):**
  - High-DPI SVG canvas matching exact $(W \times H)$ dimensions.
  - Draws target element bounding box in vibrant accent color (blue/violet).
  - Draws blocker element bounding box in translucent red with crosshatch shading and `z-index` label.
  - Overlays pointer hit-test sample dots:
    - 🟢 **Reachable:** Pointer hit the intended target.
    - 🔴 **Blocked:** Pointer hit intercepted by another element.
    - 🟠 **Clipped:** Out of bounds or hidden by overflow ancestor.
  - Interactive tooltip on sample dot hover: displays exact coordinates, hit element tag/class, and blocker hierarchy.
- **Split Ratio & Blend Controls:**
  - Slider to resize dual panes side-by-side ($50/50$, $70/30$, $30/70$).
  - Toggle for **Overlay Mode** (superimposes the X-Ray SVG directly on top of the live rendered app).

### 4.3 Finding Drawer (`FindingDrawer.tsx`)
- Bottom panel listing all findings sorted by severity.
- Filtering chips: `All`, `Critical`, `Actionable Only`, `Pointer Blocked`, `Clipped/Overflow`.
- **Finding Card:**
  - Severity badge (`CRITICAL`, `WARNING`, `INFO`).
  - Diagnostic code pill (`POINTER_BLOCKED_AT_SAMPLES`, `CLIPPED_BY_ANCESTOR`, etc.).
  - Human explanation sentence.
  - Source file and line reference (`examples/shop/src/main.tsx:128`) with copy button.
  - Geometric metrics table: Target $(x, y, w, h)$, Blocker $(x, y, w, h)$, Reachability ratio.
  - Toggle to preview the exact `AgentFindingDetail 0.1` payload supplied to AI models.
- **Bidirectional Selection:**
  - Clicking a finding card highlights its target and blocker on both left and right panes.
  - Clicking an element in the SVG X-Ray scrolls to and selects its finding card.

---

## 5. Security & Boundary Invariants

1. **Local Loopback Only:** Studio server strictly binds to `127.0.0.1` (never `0.0.0.0`).
2. **Safe Target Navigation:** `/api/inspect` validates that target URLs use `http:` or `https:` protocols and prevents file system scheme access (`file://`).
3. **Strict Content Isolation:** The target iframe runs with appropriate sandbox attributes while preserving local script execution for development components.
4. **No External Network Dependencies:** All client assets, fonts, icons, and demo fixtures are bundled locally. Studio functions completely offline.

---

## 6. Verification & Acceptance Criteria

1. **`anwc studio` CLI Command:**
   - Launches server on `127.0.0.1:4180` (or ephemeral fallback) and automatically opens default browser.
   - Clean shutdown with `Ctrl+C` releasing network ports.
2. **Preset Demonstrations:**
   - First-time launch without running apps displays Shop, Pricing, and Dashboard fixtures with accurate bounding boxes and hit dots.
3. **Live Inspection:**
   - Navigating to a live running React/Vite app captures snapshot, computes findings, and renders the dual-pane visualization.
4. **Synchronized Inspection:**
   - Selecting a finding pulses the element in both the live iframe and the geometric X-ray view.
   - Sample dot hover displays exact interceptor and coordinates.
5. **Testing Suite:**
   - Unit tests for studio server API routes (`/api/health`, `/api/presets`, `/api/inspect`, `/api/upload`).
   - Component tests for dual-pane scaling, SVG raycast rendering, and finding drawer filtering.
