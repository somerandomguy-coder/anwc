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

async function stopOwnedProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || !child.pid) return;
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else child.kill('SIGTERM');
  await Promise.race([exited, new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 5_000))]);
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

      await writeFile(join(consumerRoot, 'src', 'ProfileSection.tsx'), `export function ProfileSection({ blocked, actionLabel }: { blocked: boolean; actionLabel: string }) {
  return (
    <section className="profile-section" style={{ position: 'relative', marginTop: '20px' }}>
      <h2>Account Profile</h2>
      <div className="profile-card">
        <button id="profile-action" type="button" style={{ padding: '10px 20px' }}>
          {actionLabel}
        </button>
      </div>
      {blocked && (
        <div
          className="announcement-banner"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 10
          }}
        >
          <span>Maintenance Announcement</span>
        </div>
      )}
    </section>
  );
}
`, 'utf8');

      await writeFile(join(consumerRoot, 'src', 'App.tsx'), `import React, { Suspense, useState } from 'react';
import { ProfileSection } from './ProfileSection.js';
const LazyWidget = React.lazy(() => import('./LazyWidget.js'));

export function App({ blocked = false, actionLabel = 'Save Profile' }: { blocked?: boolean; actionLabel?: string }) {
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
      <ProfileSection blocked={blocked} actionLabel={actionLabel} />
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
  const urlParams = new URLSearchParams(window.location.search);
  const blocked = urlParams.get('blocked') === '1';
  const label = urlParams.get('label') || 'Save Profile';
  createRoot(rootElement).render(<App blocked={blocked} actionLabel={label} />);
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

      // Run the installed anwc CLI binary in JSON mode
      const anwcCli = join(consumerRoot, 'node_modules', '@anwc', 'cli', 'dist', 'main.js');
      const startJson = performance.now();
      const { stdout: cliOutput } = await pExecFile(process.execPath, [anwcCli, 'inspect', devUrl, '--format', 'json'], {
        cwd: consumerRoot,
        windowsHide: true
      });
      const latencyJsonMs = Math.round(performance.now() - startJson);

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

      // Assert custom component source mapping
      const profileBtnNode = snapshot.nodes.find((n) => n.tag === 'button' && n.label.includes('Save Profile'));
      expect(profileBtnNode).toBeDefined();
      expect(profileBtnNode?.source?.file).toBe('src/ProfileSection.tsx');
      expect(profileBtnNode?.source?.tag).toBe('button');

      // Assert no hidden intent is inferred for arbitrary divs
      const profileCardDiv = snapshot.nodes.find((n) => n.tag === 'div' && n.parentNodeId === profileBtnNode?.parentNodeId);
      if (profileCardDiv) {
        expect(profileCardDiv.intent.expectedCurrent).toBeNull();
        expect(profileCardDiv.intent.maxLines).toBeNull();
      }

      // Assert genuinely uninstrumented nodes have source: null
      const rootNode = snapshot.nodes.find((n) => n.nodeId === 'n-root' || (n.tag === 'div' && n.label === ''));
      if (rootNode) {
        expect(rootNode.source).toBeNull();
      }

      // 9. Inspect clean state in text mode with latency & byte measurements
      const startText = performance.now();
      const { stdout: textOutput } = await pExecFile(process.execPath, [anwcCli, 'inspect', devUrl, '--viewport', '1440x900', '--format', 'text'], {
        cwd: consumerRoot,
        windowsHide: true
      });
      const latencyTextMs = Math.round(performance.now() - startText);

      expect(textOutput).toContain('ANWC 0.1 | 1440x900');
      expect(textOutput).toContain('0 actionable findings for inspected rules');
      expect(textOutput).toContain('paint visibility unknown');
      expect(textOutput).toContain('Drilldown: re-run with --format json');

      // 10. Inspect blocked state (?blocked=1) in text mode: verify understandable evidence & blocker details
      const blockedUrl = `http://127.0.0.1:${devPort}/?blocked=1`;
      let blockedText = '';
      try {
        const res = await pExecFile(process.execPath, [anwcCli, 'inspect', blockedUrl, '--viewport', '390x844', '--format', 'text', '--fail-on', 'warning'], {
          cwd: consumerRoot,
          windowsHide: true
        });
        blockedText = res.stdout;
      } catch (err: unknown) {
        const error = err as { stdout?: string; exitCode?: number; code?: number };
        expect(error.code ?? error.exitCode).toBe(1);
        blockedText = error.stdout || '';
      }

      expect(blockedText).toContain('POINTER_BLOCKED_AT_SAMPLES');
      expect(blockedText).toContain('<button> "Save Profile"');
      expect(blockedText).toContain('src/ProfileSection.tsx');
      expect(blockedText).toContain('evidence: tested 25 sample points, 25 blocked');
      expect(blockedText).toContain('blocker:');
      expect(blockedText).toContain('Maintenance Announcement');

      // 11. Title/label change invariance: verify renaming label leaves geometric findings unchanged
      const renamedUrl = `http://127.0.0.1:${devPort}/?blocked=1&label=Update+Settings`;
      const { stdout: renamedJson } = await pExecFile(process.execPath, [anwcCli, 'inspect', renamedUrl, '--viewport', '390x844', '--format', 'json', '--fail-on', 'none'], {
        cwd: consumerRoot,
        windowsHide: true
      });
      const renamedSnapshot = snapshotSchema.parse(JSON.parse(renamedJson));
      const renamedFinding = renamedSnapshot.findings.find((f) => f.code === 'POINTER_BLOCKED_AT_SAMPLES');
      expect(renamedFinding).toBeDefined();
      expect(renamedFinding?.evidence.kind).toBe('pointer-blocked');
      if (renamedFinding?.evidence.kind === 'pointer-blocked') {
        expect(renamedFinding.evidence.tested).toBe(25);
        expect(renamedFinding.evidence.blocked).toBe(25);
        expect(renamedFinding.evidence.blockerNodeIds.length).toBeGreaterThan(0);
      }

      // 12. Actionable error recovery verification via installed CLI binary
      let mdUrlError = '';
      try {
        await pExecFile(process.execPath, [anwcCli, 'inspect', `[App](${devUrl})`], {
          cwd: consumerRoot,
          windowsHide: true
        });
      } catch (err: unknown) {
        const error = err as { stderr?: string; exitCode?: number; code?: number };
        expect(error.code ?? error.exitCode).toBe(2);
        mdUrlError = error.stderr || '';
      }
      expect(mdUrlError).toContain('ANWC INVALID_USAGE');
      expect(mdUrlError).toContain('Recovery: Strip Markdown formatting');

      // Log report size and latency benchmarks for P07
      const measurements = {
        cleanJsonChars: cliOutput.length,
        cleanTextChars: textOutput.length,
        blockedTextChars: blockedText.length,
        latencyJsonMs,
        latencyTextMs
      };
      expect(measurements.cleanTextChars).toBeLessThan(measurements.cleanJsonChars);

    } finally {
      await stopOwnedProcess(devProcess);
      await rm(consumerRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }, 180_000);
});
