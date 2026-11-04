import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
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
      } catch {
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
  const staticDir = resolve(options.staticDir ?? defaultStaticDir);

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
          limit: 40,
          maxChars: 12000,
          output: null,
          readySelector: null,
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
      const filePath = resolve(join(staticDir, relativePath));

      // Security check: prevent directory traversal
      if (!filePath.startsWith(staticDir)) {
        return sendJson(res, 403, { ok: false, error: 'Forbidden' });
      }

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

  return new Promise((resolveHandle, reject) => {
    let retried = false;

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && requestedPort !== 0 && !retried) {
        retried = true;
        // Fallback to ephemeral free port
        server.listen(0, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr ? addr.port : 0;
          resolveHandle({
            port: actualPort,
            url: `http://${host}:${actualPort}`,
            server,
            close: () => new Promise<void>((resClose, rejClose) => {
              server.closeAllConnections?.();
              server.close((closeErr) => {
                if (closeErr) rejClose(closeErr);
                else resClose();
              });
            })
          });
        });
      } else {
        reject(err);
      }
    });

    server.listen(requestedPort, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
      resolveHandle({
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        server,
        close: () => new Promise<void>((resClose, rejClose) => {
          server.closeAllConnections?.();
          server.close((closeErr) => {
            if (closeErr) rejClose(closeErr);
            else resClose();
          });
        })
      });
    });
  });
}
