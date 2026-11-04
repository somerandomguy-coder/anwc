# ANWC Interactive Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ANWC Interactive Studio — a visual split-screen workbench comparing live target apps with ANWC geometric X-ray raycasting, packaged as a private React SPA (`packages/studio`) served via the CLI (`anwc studio [url] [--port 4180]`).

**Architecture:** Node `http.createServer` in `@anwc/cli` serves static Vite-built assets from `dist/studio/` and exposes four JSON API routes (`/api/health`, `/api/presets`, `/api/inspect`, `/api/upload`). The frontend React SPA renders a synchronized dual-pane viewport (live `<iframe>` on the left, interactive SVG geometric X-ray with colored pointer raycast hit-test sample dots on the right) linked bidirectionally to a bottom diagnostic finding drawer.

**Tech Stack:** Node.js 22 (HTTP & Playwright), TypeScript 5.7, React 19, Vite 6, Vitest 3, `@anwc/protocol`, `@anwc/report`, `@anwc/diagnostics`.

## Global Constraints

- **Host & Loopback:** Server strictly binds to `127.0.0.1` (never `0.0.0.0`).
- **Default Port:** `4180`; automatically falls back to an ephemeral free port if occupied.
- **Offline Integrity:** 100% self-contained; zero remote CDNs, web fonts, or external analytics.
- **URL Safety:** Inspect target URLs must use `http:` or `https:`; reject `file://` or markdown syntax.
- **Packaging Safety:** Static studio assets bundle into `packages/cli/dist/studio/`; must not trigger tarball audit filters (no uncompiled `.ts`, no test files, no forbidden strings in file paths).
- **ES Modules:** All packages use ESM (`"type": "module"`).

---

### Task 1: Studio HTTP Server & API Endpoints in `@anwc/cli`

**Files:**
- Create: `packages/cli/src/studio.ts`
- Test: `tests/unit/studio-server.test.ts`

**Interfaces:**
- Consumes:
  - `@anwc/protocol`: `snapshotSchema`, `type Snapshot`, `type ErrorEnvelope`
  - `@anwc/report`: `createReport`, `type Report`
  - `@anwc/cli/src/index.js`: `inspect(options: InspectOptions): Promise<Snapshot>`
- Produces:
  - `startStudioServer(options?: StudioServerOptions): Promise<StudioServerHandle>`
  - `export interface StudioServerOptions { port?: number; host?: string; staticDir?: string; openBrowser?: boolean; capturePath?: string; inspectFn?: (options: any) => Promise<Snapshot>; }`
  - `export interface StudioServerHandle { port: number; url: string; server: import('node:http').Server; close(): Promise<void>; }`

- [ ] **Step 1: Write the failing unit test for studio server and API endpoints**

Create `tests/unit/studio-server.test.ts`:
```ts
import { describe, expect, test, afterAll } from 'vitest';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

describe('ANWC Studio HTTP Server', () => {
  let studio: StudioServerHandle | undefined;

  afterAll(async () => {
    if (studio) {
      await studio.close();
    }
  });

  test('starts on 127.0.0.1 with ephemeral or custom port and serves health endpoint', async () => {
    studio = await startStudioServer({
      port: 0,
      host: '127.0.0.1',
      openBrowser: false,
      inspectFn: async () => validSnapshotFixture
    });

    expect(studio.port).toBeGreaterThan(0);
    expect(studio.url).toBe(`http://127.0.0.1:${studio.port}`);

    const res = await fetch(`${studio.url}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      version: '0.1.0-alpha.0',
      service: 'anwc-studio'
    });
  });

  test('serves presets catalog via GET /api/presets', async () => {
    const res = await fetch(`${studio!.url}/api/presets`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThanOrEqual(3);
    expect(body.presets[0]).toHaveProperty('id');
    expect(body.presets[0]).toHaveProperty('title');
    expect(body.presets[0]).toHaveProperty('snapshot');
  });

  test('handles POST /api/inspect with validation and returns snapshot + report', async () => {
    const res = await fetch(`${studio!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://127.0.0.1:4174',
        viewport: { width: 390, height: 844 }
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot).toBeDefined();
    expect(body.report).toBeDefined();
    expect(body.report.schemaVersion).toBe('0.1');
  });

  test('rejects unsafe target URLs in POST /api/inspect', async () => {
    const res = await fetch(`${studio!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Only http: and https:');
  });

  test('accepts uploaded capture payload via POST /api/upload', async () => {
    const res = await fetch(`${studio!.url}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSnapshotFixture)
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot).toBeDefined();
    expect(body.report).toBeDefined();
  });

  test('serves fallback HTML when static dir does not yet contain custom index.html', async () => {
    const res = await fetch(`${studio!.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('ANWC Studio');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/studio-server.test.ts`
Expected: FAIL with "Cannot find module '../../packages/cli/src/studio.js'"

- [ ] **Step 3: Implement `packages/cli/src/studio.ts`**

Create `packages/cli/src/studio.ts`:
```ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotSchema, type Snapshot } from '@anwc/protocol';
import { createReport, type Report } from '@anwc/report';
import { inspect, type InspectOptions } from './index.js';
import { STUDIO_PRESETS } from './studio-presets.js';

export interface StudioServerOptions {
  port?: number;
  host?: string;
  staticDir?: string;
  openBrowser?: boolean;
  capturePath?: string;
  inspectFn?: (options: InspectOptions) => Promise<Snapshot>;
}

export interface StudioServerHandle {
  port: number;
  url: string;
  server: Server;
  close(): Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(payload);
}

function parseJsonBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function defaultHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ANWC Studio</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; }
    h1 { margin-bottom: 0.5rem; }
    p { color: #94a3b8; }
    .badge { background: #3b82f6; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
  </style>
</head>
<body>
  <h1>ANWC Studio <span class="badge">0.1.0-alpha.0</span></h1>
  <p>Local Split-Screen Geometric Workbench</p>
  <div id="root">Loading UI bundle...</div>
</body>
</html>`;
}

export async function startStudioServer(options: StudioServerOptions = {}): Promise<StudioServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 4180;
  const inspectHandler = options.inspectFn ?? inspect;

  const defaultStaticDir = fileURLToPath(new URL('../dist/studio', import.meta.url));
  const staticDir = options.staticDir ?? defaultStaticDir;

  let preloadedSnapshot: Snapshot | undefined;
  if (options.capturePath) {
    try {
      const raw = await readFile(options.capturePath, 'utf8');
      preloadedSnapshot = snapshotSchema.parse(JSON.parse(raw));
    } catch {
      // Ignored if invalid
    }
  }

  const server = createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${host}`);
    const pathname = parsedUrl.pathname;

    // API Routes
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        version: '0.1.0-alpha.0',
        service: 'anwc-studio',
        preloadedCapture: Boolean(preloadedSnapshot)
      });
    }

    if (pathname === '/api/presets' && req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        presets: STUDIO_PRESETS
      });
    }

    if (pathname === '/api/inspect' && req.method === 'POST') {
      try {
        const body = await parseJsonBody<{ url?: string; viewport?: { width: number; height: number } }>(req);
        if (!body.url || typeof body.url !== 'string') {
          return sendJson(res, 400, { ok: false, error: "Missing required 'url' field." });
        }
        const targetUrl = body.url.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
          return sendJson(res, 400, { ok: false, error: "Unsupported URL protocol. Only http: and https: URLs are supported." });
        }

        const snapshot = await inspectHandler({
          url: targetUrl,
          viewport: body.viewport ?? { width: 390, height: 844 },
          timeoutMs: 30000,
          textLimit: 256,
          runtimeOnly: false,
          failOn: 'none',
          format: 'json'
        });

        const report = createReport(snapshot);
        return sendJson(res, 200, { ok: true, snapshot, report });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const parsed = snapshotSchema.safeParse(body);
        if (!parsed.success) {
          return sendJson(res, 400, { ok: false, error: 'Invalid snapshot format', details: parsed.error.issues });
        }
        const report = createReport(parsed.data);
        return sendJson(res, 200, { ok: true, snapshot: parsed.data, report });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' });
      }
    }

    // Static Asset Serving
    if (req.method === 'GET') {
      let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      const filePath = join(staticDir, relativePath);

      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const ext = extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          const content = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': mime });
          res.end(content);
          return;
        }
      } catch {
        // Fall back to index.html for SPA client-side routing
        try {
          const indexContent = await readFile(join(staticDir, 'index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexContent);
          return;
        } catch {
          // Fallback minimal HTML
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(defaultHtml());
          return;
        }
      }
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && requestedPort !== 0) {
        // Fallback to ephemeral free port
        server.listen(0, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : 0;
          resolve({
            port: actualPort,
            url: `http://${host}:${actualPort}`,
            server,
            close: () => new Promise<void>((resClose) => server.close(() => resClose()))
          });
        });
      } else {
        reject(err);
      }
    });

    server.listen(requestedPort, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
      resolve({
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        server,
        close: () => new Promise<void>((resClose) => server.close(() => resClose()))
      });
    });
  });
}
```

Create `packages/cli/src/studio-presets.ts` with the 4 demo fixture scenarios.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/studio-server.test.ts`
Expected: PASS (all 6 tests pass)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/studio.ts packages/cli/src/studio-presets.ts tests/unit/studio-server.test.ts
git commit -m "feat(cli): implement studio local http server and api endpoints"
```

---

### Task 2: CLI Command Registration for `anwc studio`

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/package.json`
- Test: `tests/unit/cli.test.ts`

**Interfaces:**
- Consumes:
  - `startStudioServer` from `./studio.js`
- Produces:
  - CLI subcommand `anwc studio [url] [--port 4180] [--capture path] [--no-open]`
  - Function `parseStudioArguments(args: string[]): StudioCliOptions`

- [ ] **Step 1: Write failing test in `tests/unit/cli.test.ts`**

Add to `tests/unit/cli.test.ts`:
```ts
test('parses studio command arguments correctly', () => {
  const options = parseStudioArguments(['studio', 'http://127.0.0.1:5173', '--port', '4500', '--capture', 'test.json', '--no-open']);
  expect(options).toEqual({
    url: 'http://127.0.0.1:5173',
    port: 4500,
    capture: 'test.json',
    open: false
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cli.test.ts`
Expected: FAIL with "parseStudioArguments is not defined"

- [ ] **Step 3: Implement argument parser and command handler in `packages/cli/src/index.ts`**

In `packages/cli/src/index.ts`:
1. Export `parseStudioArguments`:
```ts
export interface StudioCliOptions {
  url?: string;
  port?: number;
  capture?: string;
  open: boolean;
}

export function parseStudioArguments(arguments_: string[]): StudioCliOptions {
  let url: string | undefined;
  let port: number | undefined;
  let capture: string | undefined;
  let open = true;

  for (let i = 1; i < arguments_.length; i++) {
    const arg = arguments_[i]!;
    if (arg === '--port') {
      const next = arguments_[++i];
      if (!next || !/^\d+$/.test(next)) throw new CliError('INVALID_USAGE', '--port must be a positive integer.');
      port = Number(next);
    } else if (arg === '--capture') {
      const next = arguments_[++i];
      if (!next) throw new CliError('INVALID_USAGE', '--capture requires a file path.');
      capture = next;
    } else if (arg === '--no-open') {
      open = false;
    } else if (!arg.startsWith('-') && !url) {
      url = parseUrl(arg);
    } else {
      throw new CliError('INVALID_USAGE', `Unknown studio argument '${arg}'.`);
    }
  }

  return { url, port, capture, open };
}
```
2. In `run(...)` in `packages/cli/src/index.ts`, add:
```ts
if (arguments_[0] === 'studio') {
  const studioOpts = parseStudioArguments(arguments_);
  const handle = await startStudioServer({
    port: studioOpts.port,
    openBrowser: studioOpts.open,
    capturePath: studioOpts.capture
  });
  io.stdout(`ANWC Studio running at ${handle.url}\n`);
  if (studioOpts.url) {
    io.stdout(`Target URL: ${studioOpts.url}\n`);
  }
  // In non-interactive test mode or SIGINT handler
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts tests/unit/cli.test.ts
git commit -m "feat(cli): add anwc studio command parser and execution handler"
```

---

### Task 3: Scaffold `packages/studio` & Data Presets

**Files:**
- Create: `packages/studio/package.json`
- Create: `packages/studio/tsconfig.json`
- Create: `packages/studio/vite.config.ts`
- Create: `packages/studio/src/types.ts`
- Create: `packages/studio/src/data/presets.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `@anwc/protocol` types (`Snapshot`, `NodeSnapshot`, `Finding`, `HitSample`)
- Produces: Studio types & preset fixture records

- [ ] **Step 1: Create `packages/studio/package.json`**

```json
{
  "name": "@anwc/studio",
  "private": true,
  "version": "0.1.0-alpha.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --build && vite build",
    "typecheck": "tsc --build"
  },
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@anwc/protocol": "*",
    "@anwc/report": "*",
    "@types/react": "19.0.10",
    "@types/react-dom": "19.0.4",
    "@vitejs/plugin-react": "4.3.4",
    "typescript": "5.7.3",
    "vite": "6.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/studio/tsconfig.json` and update root `tsconfig.json`**

Create `packages/studio/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "composite": true,
    "outDir": "./dist-types"
  },
  "include": ["src/**/*"]
}
```
Update root `tsconfig.json` to add `{ "path": "./packages/studio" }`.

- [ ] **Step 3: Create `packages/studio/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../cli/dist/studio'),
    emptyOutDir: true
  }
});
```

- [ ] **Step 4: Create `packages/studio/src/types.ts` & `presets.ts`**

Define `StudioPreset`, `ActiveFindingSelection`, `ViewportPreset`, `HoveredSampleInfo` and embed realistic demo snapshots (Shop `blocked-checkout`, Pricing `ancestor-clip`, Dashboard `outside-viewport`, Healthy `clean-shop`).

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/studio/package.json packages/studio/tsconfig.json packages/studio/vite.config.ts packages/studio/src/types.ts packages/studio/src/data/presets.ts tsconfig.json
git commit -m "feat(studio): scaffold packages/studio with types, vite config and demo presets"
```

---

### Task 4: Interactive Studio SVG X-Ray Canvas & Sample Tooltip

**Files:**
- Create: `packages/studio/src/components/XRayPane.tsx`
- Create: `packages/studio/src/components/SampleTooltip.tsx`
- Test: `tests/unit/studio-xray.test.ts`

**Interfaces:**
- Consumes:
  - `Snapshot`, `NodeSnapshot`, `Finding` from `@anwc/protocol`
  - `HoveredSampleInfo` from `../types.js`
- Produces:
  - `<XRayPane snapshot={snapshot} activeFinding={activeFinding} onSelectSample={...} />`
  - `<SampleTooltip sample={hoveredSample} />`

- [ ] **Step 1: Write failing test in `tests/unit/studio-xray.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { computeXRayBoundingBoxes, mapSampleColor } from '../../packages/studio/src/components/xray-utils.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

describe('Studio X-Ray Canvas Utilities', () => {
  test('maps hit sample results to correct status colors', () => {
    expect(mapSampleColor('target-or-descendant')).toBe('#22c55e'); // Green
    expect(mapSampleColor('blocked')).toBe('#ef4444'); // Red
    expect(mapSampleColor('no-target')).toBe('#f59e0b'); // Amber
  });

  test('extracts target and blocker bounding boxes for active finding', () => {
    const finding = validSnapshotFixture.findings[0]!;
    const boxes = computeXRayBoundingBoxes(validSnapshotFixture, finding);
    expect(boxes.target).toBeDefined();
    expect(boxes.blockers).toBeInstanceOf(Array);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/studio-xray.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `xray-utils.ts`, `XRayPane.tsx`, and `SampleTooltip.tsx`**

1. Create `packages/studio/src/components/xray-utils.ts`:
   - `mapSampleColor(result)`
   - `computeXRayBoundingBoxes(snapshot, finding)`
2. Create `packages/studio/src/components/XRayPane.tsx`:
   - Renders `<svg viewBox="0 0 W H">`
   - Target bounding box `<rect>` with stroke, fill, and text label
   - Blocker bounding box `<rect>` with striped stroke pattern and z-index tag
   - Sample circles `<circle cx={s.x} cy={s.y} r="4" fill={color}>` with hover handlers
3. Create `packages/studio/src/components/SampleTooltip.tsx`:
   - Floating HTML card showing coordinates $(x, y)$, hit element details, and blocker reason.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/studio-xray.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/components/xray-utils.ts packages/studio/src/components/XRayPane.tsx packages/studio/src/components/SampleTooltip.tsx tests/unit/studio-xray.test.ts
git commit -m "feat(studio): implement svg geometric x-ray canvas and sample tooltip"
```

---

### Task 5: Ground Truth Pane, Split View & Synchronized Highlighting

**Files:**
- Create: `packages/studio/src/components/GroundTruthPane.tsx`
- Create: `packages/studio/src/components/SplitView.tsx`

**Interfaces:**
- Consumes:
  - `activeFinding: Finding | null`
  - `viewport: { width: number, height: number }`
  - `zoom: number`
  - `targetUrl: string | null`
- Produces:
  - `<GroundTruthPane url={url} viewport={viewport} activeFindingBox={box} />`
  - `<SplitView left={<GroundTruthPane />} right={<XRayPane />} splitRatio={0.5} overlayMode={false} />`

- [ ] **Step 1: Implement `GroundTruthPane.tsx`**

- Renders an `<iframe>` pointing to the target app with sandboxed permissions (`sandbox="allow-scripts allow-same-origin allow-forms"`).
- Sized strictly to `viewport.width` $\times$ `viewport.height`.
- If no live URL is active (viewing saved capture), renders an SVG blueprint representation of the DOM tree.
- Overlays an animated highlight pulse on the active target element.

- [ ] **Step 2: Implement `SplitView.tsx`**

- Responsive split layout with CSS Grid/Flex.
- Supports side-by-side ($50/50$, $70/30$, $30/70$) and single-pane toggling.
- Supports **Overlay Mode**: transforms the X-Ray SVG into an absolute positioned overlay directly on top of the live iframe.
- Applies consistent CSS `transform: scale(zoom)` with `transform-origin: top center` so high-resolution mobile ($390\times 844$) or desktop ($1440\times 900$) views fit any screen.

- [ ] **Step 3: Run typecheck to verify interface conformity**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/studio/src/components/GroundTruthPane.tsx packages/studio/src/components/SplitView.tsx
git commit -m "feat(studio): implement ground truth pane and synchronized split view"
```

---

### Task 6: Finding Drawer, Finding Cards & Agent JSON Inspector

**Files:**
- Create: `packages/studio/src/components/FindingCard.tsx`
- Create: `packages/studio/src/components/FindingDrawer.tsx`
- Test: `tests/unit/studio-drawer.test.ts`

**Interfaces:**
- Consumes:
  - `report: Report`
  - `selectedFindingId: string | null`
  - `onSelectFinding(id: string): void`
- Produces:
  - `<FindingDrawer report={report} selectedFindingId={selectedFindingId} onSelectFinding={...} />`

- [ ] **Step 1: Write failing test in `tests/unit/studio-drawer.test.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { filterFindings, formatSourceReference } from '../../packages/studio/src/components/drawer-utils.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { createReport } from '../../packages/report/src/index.js';

describe('Studio Finding Drawer Utilities', () => {
  const report = createReport(validSnapshotFixture);

  test('filters findings by severity and category', () => {
    const all = filterFindings(report.findings, 'all');
    expect(all.length).toBe(report.findings.length);

    const pointer = filterFindings(report.findings, 'pointer');
    expect(pointer.every((f) => f.code.includes('POINTER'))).toBe(true);
  });

  test('formats source references with line and column', () => {
    const node = validSnapshotFixture.nodes[0]!;
    if (node.source) {
      const formatted = formatSourceReference(node.source);
      expect(formatted).toBe(`${node.source.file}:${node.source.line}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/studio-drawer.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `drawer-utils.ts`, `FindingCard.tsx`, and `FindingDrawer.tsx`**

1. Create `drawer-utils.ts`:
   - `filterFindings(findings, filterType)`
   - `formatSourceReference(source)`
2. Create `FindingCard.tsx`:
   - Severity badge: CRITICAL (red), WARNING (amber), INFO (blue)
   - Code pill: `POINTER_BLOCKED_AT_SAMPLES`
   - One-sentence human explanation
   - File link badge: `examples/shop/src/main.tsx:128` with click-to-copy
   - Reachability metric pill: `0% reachable (4/4 blocked)`
3. Create `FindingDrawer.tsx`:
   - Header with finding counter and filter chips: All, Critical, Pointer Blocked, Clipped
   - Tab switcher: "Findings (N)" vs "Agent Summary Payload"
   - In "Agent Summary Payload" tab: displays formatted `AgentSummary 0.1` and `AgentFindingDetail 0.1` JSON

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/studio-drawer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/components/drawer-utils.ts packages/studio/src/components/FindingCard.tsx packages/studio/src/components/FindingDrawer.tsx tests/unit/studio-drawer.test.ts
git commit -m "feat(studio): implement finding drawer, cards, and agent json inspector"
```

---

### Task 7: Header Bar, App Coordinator & Full Offline Assembly

**Files:**
- Create: `packages/studio/src/components/Header.tsx`
- Create: `packages/studio/src/App.tsx`
- Create: `packages/studio/src/main.tsx`
- Create: `packages/studio/index.html`
- Create: `packages/studio/src/index.css`

**Interfaces:**
- Connects: `Header`, `SplitView`, `GroundTruthPane`, `XRayPane`, `FindingDrawer` into a unified application state.

- [ ] **Step 1: Implement `Header.tsx`**

- Preset dropdown: Switch between Shop, Pricing, Dashboard, Healthy.
- URL input + Inspect button with spinner.
- Viewport selector: Mobile ($390\times 844$), Tablet ($768\times 1024$), Desktop ($1440\times 900$).
- Zoom level dropdown: $50\%$, $75\%$, $100\%$, Fit.
- Overlay Mode toggle button.
- Load Capture button with `<input type="file" accept=".json">`.

- [ ] **Step 2: Implement `App.tsx` & `index.css`**

- Coordinates state:
  - `snapshot`: active snapshot (from preset, live inspect, or uploaded file).
  - `report`: active report computed via `@anwc/report`.
  - `selectedFindingId`: highlighted finding.
  - `hoveredSample`: active raycast dot tooltip data.
  - `zoom`: current zoom ratio.
  - `splitRatio`: left/right proportion.
  - `overlayMode`: boolean.
- Modern dark-mode UI styling in `index.css` (neutral slate palette, responsive flex/grid, zero external font downloads).

- [ ] **Step 3: Implement `main.tsx` and `index.html`**

- Mounts React 19 root: `createRoot(document.getElementById('root')!).render(<App />);`
- `index.html` with `<div id="root"></div>`.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/components/Header.tsx packages/studio/src/App.tsx packages/studio/src/main.tsx packages/studio/index.html packages/studio/src/index.css
git commit -m "feat(studio): assemble interactive studio app coordinator, header, and dark-theme layout"
```

---

### Task 8: Build Pipeline Integration & End-to-End Verification

**Files:**
- Modify: `scripts/build.js`
- Test: `tests/unit/studio-integration.test.ts`

**Interfaces:**
- Root `npm run build` builds `@anwc/studio` and outputs dist into `packages/cli/dist/studio/`.
- `npm run pack:packages` audits `@anwc/cli` and verifies no unauthorized files leak into the package tarball.

- [ ] **Step 1: Update `scripts/build.js` to build studio and copy dist to `@anwc/cli/dist/studio`**

In `scripts/build.js`, after workspace builds finish:
Build `packages/studio` with `vite build`.

- [ ] **Step 2: Write end-to-end integration test `tests/unit/studio-integration.test.ts`**

```ts
import { describe, expect, test, afterAll } from 'vitest';
import { run } from '../../packages/cli/src/index.js';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('ANWC Studio End-to-End Integration', () => {
  let handle: StudioServerHandle | undefined;

  afterAll(async () => {
    if (handle) await handle.close();
  });

  test('studio bundle index.html is generated in cli/dist/studio', () => {
    const indexPath = join(process.cwd(), 'packages', 'cli', 'dist', 'studio', 'index.html');
    expect(existsSync(indexPath)).toBe(true);
  });

  test('anwc studio starts and serves bundled client app and api', async () => {
    handle = await startStudioServer({ port: 0, openBrowser: false });
    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');

    const health = await (await fetch(`${handle.url}/api/health`)).json();
    expect(health.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run full build and test verification**

Run:
```bash
npm run build
npx vitest run tests/unit/studio-integration.test.ts
node scripts/pack.js
```
Expected: PASS (builds cleanly, studio assets bundled into `packages/cli/dist/studio`, packaging audit passes).

- [ ] **Step 4: Commit**

```bash
git add scripts/build.js tests/unit/studio-integration.test.ts
git commit -m "feat(studio): integrate studio build pipeline and verify end-to-end asset packaging"
```
