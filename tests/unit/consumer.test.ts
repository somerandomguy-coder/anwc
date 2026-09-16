import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { snapshotSchema } from '../../packages/protocol/src/index.js';
import { auditTarballEntries, listTarballFiles, packAndAuditPackages, PUBLIC_PACKAGES } from '../../scripts/pack.js';

const pExecFile = promisify(execFile);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
      } else {
        server.close(() => rejectPort(new Error('cannot determine available port')));
      }
    });
    server.on('error', rejectPort);
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server at ${url} did not become ready: ${lastError}`);
}

describe('P06 package distribution and external consumer integration', () => {
  let packsDir: string;
  let tarballs: Record<string, { tarballPath: string; files: string[] }>;

  beforeAll(async () => {
    packsDir = await mkdtemp(join(tmpdir(), 'anwc-packs-'));
    tarballs = (await packAndAuditPackages({ sourceRoot, destination: packsDir })) as unknown as Record<string, { tarballPath: string; files: string[] }>;
  }, 120_000);

  afterAll(async () => {
    if (packsDir) {
      await rm(packsDir, { recursive: true, force: true });
    }
  });

  test('audits local npm pack tarballs for leaked tests, fixtures, or absolute paths', async () => {
    expect(Object.keys(tarballs)).toHaveLength(6);

    for (const [pkgName, data] of Object.entries(tarballs)) {
      expect(data.files.length).toBeGreaterThan(0);
      const issues = auditTarballEntries(pkgName, data.files);
      expect(issues).toEqual([]);

      // Explicit assertions on absence of leaked source / test paths
      for (const entry of data.files) {
        if (!entry.endsWith('.d.ts')) {
          expect(entry).not.toMatch(/\.ts$/);
        }
        expect(entry).not.toMatch(/\/(?:test|tests)\/|\.(?:test|spec)\.[jd]ts$/);
        expect(entry).not.toContain('fixture');
        expect(entry).not.toContain('examples');
        expect(entry).not.toContain('.map');
      }

      // Assert presence of dist/index.js and dist/index.d.ts
      expect(data.files).toContain('package/dist/index.js');
      expect(data.files).toContain('package/dist/index.d.ts');
    }

    // CLI package specifically has dist/main.js
    expect(tarballs['@anwc/cli']!.files).toContain('package/dist/main.js');
    expect(tarballs['@anwc/cli']!.files).toContain('package/dist/main.d.ts');

    // Runtime package specifically has browser-entry
    expect(tarballs['@anwc/runtime']!.files).toContain('package/dist/browser-entry.js');
    expect(tarballs['@anwc/runtime']!.files).toContain('package/dist/browser-entry.d.ts');
  });

  test('external plain React/Vite consumer installs tarballs, typechecks, builds clean production bundle, and inspects via installed CLI binary', async () => {
    const consumerRoot = await mkdtemp(join(tmpdir(), 'anwc-consumer-app-'));
    let devProcess: ChildProcess | undefined;

    try {
      const tarballPaths = Object.values(tarballs).map((t) => t.tarballPath);

      // 1. Create consumer package.json
      const consumerPkg = {
        name: 'external-consumer-app',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc --noEmit && vite build',
          typecheck: 'tsc --noEmit'
        },
        dependencies: {
          react: '19.0.0',
          'react-dom': '19.0.0'
        },
        devDependencies: {
          '@types/react': '19.0.10',
          '@types/react-dom': '19.0.4',
          '@vitejs/plugin-react': '4.3.4',
          typescript: '5.7.3',
          vite: '6.1.0'
        }
      };
      await writeFile(join(consumerRoot, 'package.json'), `${JSON.stringify(consumerPkg, null, 2)}\n`, 'utf8');

      // 2. Install all 6 tarballs directly into consumer
      const rawNpm = process.env.npm_execpath;
      const cmd = rawNpm ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
      const baseArgs = rawNpm ? [rawNpm.replace(/npx-cli\.js$/, 'npm-cli.js').replace(/npx$/, 'npm')] : [];

      await pExecFile(cmd, [...baseArgs, 'install', '--ignore-scripts', ...tarballPaths], {
        cwd: consumerRoot,
        windowsHide: true
      });

      // 3. Create consumer tsconfig.json
      const consumerTsconfig = {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          jsx: 'react-jsx',
          strict: true,
          skipLibCheck: true,
          noEmit: true
        },
        include: ['src/**/*.ts', 'src/**/*.tsx', 'vite.config.ts']
      };
      await writeFile(join(consumerRoot, 'tsconfig.json'), `${JSON.stringify(consumerTsconfig, null, 2)}\n`, 'utf8');

      // 4. Create consumer vite.config.ts using zero-config anwc()
      const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { anwc } from '@anwc/vite-plugin';

export default defineConfig({
  plugins: [anwc(), react()]
});
`;
      await writeFile(join(consumerRoot, 'vite.config.ts'), viteConfig, 'utf8');

      // 5. Create index.html and consumer source files
      await writeFile(join(consumerRoot, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Consumer Application</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`, 'utf8');

      await mkdir(join(consumerRoot, 'src'), { recursive: true });

      await writeFile(join(consumerRoot, 'src', 'LazyWidget.tsx'), `export default function LazyWidget() {
  return (
    <div className="lazy-widget">
      <h3>Lazy Widget Heading</h3>
      <p>Loaded dynamically.</p>
    </div>
  );
}
`, 'utf8');

      await writeFile(join(consumerRoot, 'src', 'App.tsx'), `import React, { Suspense, useState } from 'react';
const LazyWidget = React.lazy(() => import('./LazyWidget.js'));

export function App() {
  const [showLazy, setShowLazy] = useState(false);
  const items = ['Item Alpha', 'Item Beta', 'Item Gamma'];

  return (
    <main>
      <h1>Consumer Heading</h1>
      <p className="intro">External consumer test paragraph.</p>
      <button id="toggle-button" onClick={() => setShowLazy((v) => !v)}>
        Toggle Lazy Component
      </button>
      <ul className="items-list">
        {items.map((item) => (
          <li key={item} className="item-row">{item}</li>
        ))}
      </ul>
      {showLazy && (
        <Suspense fallback={<div>Loading...</div>}>
          <LazyWidget />
        </Suspense>
      )}
    </main>
  );
}
`, 'utf8');

      await writeFile(join(consumerRoot, 'src', 'main.tsx'), `import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
`, 'utf8');

      // 6. Test consumer typechecking
      const tscPath = join(consumerRoot, 'node_modules', 'typescript', 'bin', 'tsc');
      const tscResult = await pExecFile(process.execPath, [tscPath, '--noEmit'], {
        cwd: consumerRoot,
        windowsHide: true
      });
      expect(tscResult.stdout).toBe('');

      // 7. Test consumer production build stripping
      const viteBin = join(consumerRoot, 'node_modules', 'vite', 'bin', 'vite.js');
      await pExecFile(process.execPath, [viteBin, 'build'], {
        cwd: consumerRoot,
        windowsHide: true
      });

      const distDir = join(consumerRoot, 'dist');
      const distFiles = await readdir(distDir, { recursive: true });
      let productionCode = '';
      for (const f of distFiles) {
        if (typeof f === 'string' && (f.endsWith('.js') || f.endsWith('.html'))) {
          productionCode += await readFile(join(distDir, f), 'utf8');
        }
      }

      // Assert default production bundles completely omit runtime/site identifiers
      expect(productionCode).not.toContain('data-anwc-site');
      expect(productionCode).not.toContain('__ANWC__');
      expect(productionCode).not.toContain('virtual:anwc-runtime');
      expect(productionCode).toContain('Consumer Heading');

      // 8. Test consumer dev server & installed CLI inspection
      const devPort = await getAvailablePort();
      devProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(devPort), '--strictPort'], {
        cwd: consumerRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const devUrl = `http://127.0.0.1:${devPort}/`;
      await waitForServer(devUrl, 15_000);

      // Run the installed anwc CLI binary
      const anwcBin = join(consumerRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'anwc.cmd' : 'anwc');
      const { stdout: cliOutput } = await pExecFile(anwcBin, ['inspect', devUrl, '--format', 'json'], {
        cwd: consumerRoot,
        windowsHide: true
      });

      const snapshot = snapshotSchema.parse(JSON.parse(cliOutput));
      expect(snapshot.schemaVersion).toBe('0.1');
      expect(snapshot.coverage.complete).toBe(true);

      // Assert source references point to consumer JSX
      const headingNode = snapshot.nodes.find((n) => n.tag === 'h1' && n.label.includes('Consumer Heading'));
      expect(headingNode).toBeDefined();
      expect(headingNode?.source).toBeDefined();
      expect(headingNode?.source?.file).toBe('src/App.tsx');
      expect(headingNode?.source?.tag).toBe('h1');

      // Assert repeated list items map to the same consumer JSX site
      const listItems = snapshot.nodes.filter((n) => n.tag === 'li');
      expect(listItems).toHaveLength(3);
      const firstSiteId = listItems[0]?.siteId;
      expect(firstSiteId).toBeDefined();
      for (const li of listItems) {
        expect(li.siteId).toBe(firstSiteId);
        expect(li.source?.file).toBe('src/App.tsx');
        expect(li.source?.tag).toBe('li');
      }

      // Assert genuinely uninstrumented nodes have source: null
      const rootNode = snapshot.nodes.find((n) => n.nodeId === 'n-root' || (n.tag === 'div' && n.label === ''));
      if (rootNode) {
        expect(rootNode.source).toBeNull();
      }
    } finally {
      if (devProcess && devProcess.pid) {
        try {
          devProcess.kill('SIGTERM');
        } catch { /* ignore */ }
      }
      await rm(consumerRoot, { recursive: true, force: true });
    }
  }, 180_000);
});
