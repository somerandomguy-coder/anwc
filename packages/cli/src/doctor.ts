import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

export interface DoctorCheck {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  message: string;
  recovery?: string;
  details?: Record<string, unknown>;
}

export interface DoctorResult {
  schemaVersion: '0.1';
  ok: boolean;
  platform: string;
  nodeVersion: string;
  checks: DoctorCheck[];
}

export async function checkNodeVersion(): Promise<DoctorCheck> {
  const version = process.version;
  const match = /^v(\d+)\./.exec(version);
  const major = match ? Number(match[1]) : 0;

  if (major >= 18) {
    return {
      id: 'node-version',
      name: 'Node.js Runtime Version',
      status: 'passed',
      message: `${version} satisfies >= 18.0.0 requirement.`
    };
  }

  return {
    id: 'node-version',
    name: 'Node.js Runtime Version',
    status: 'failed',
    message: `${version} is below the required v18.0.0.`,
    recovery: 'Upgrade Node.js to v18, v20, or v22 (https://nodejs.org/).'
  };
}

export async function checkChromium(): Promise<DoctorCheck> {
  try {
    const execPath = chromium.executablePath();
    // Test a bounded headless launch probe
    const browser = await Promise.race([
      chromium.launch({ headless: true }),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Browser launch timed out after 3000ms.')), 3_000))
    ]);
    if (browser) {
      const version = browser.version();
      await browser.close();
      return {
        id: 'chromium-browser',
        name: 'Chromium Browser Executable',
        status: 'passed',
        message: `Chromium ${version} is available.`,
        details: { executablePath: execPath, browserVersion: version }
      };
    }
    return {
      id: 'chromium-browser',
      name: 'Chromium Browser Executable',
      status: 'failed',
      message: 'Browser launch returned null.',
      recovery: 'Run: npx playwright install chromium'
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      id: 'chromium-browser',
      name: 'Chromium Browser Executable',
      status: 'failed',
      message: `Chromium browser is not operational: ${msg}`,
      recovery: 'Run: npx playwright install chromium'
    };
  }
}

export async function checkLocalhostNetworking(): Promise<DoctorCheck> {
  return new Promise<DoctorCheck>((resolveCheck) => {
    const server = createServer();
    server.once('error', (err) => {
      resolveCheck({
        id: 'localhost-networking',
        name: 'Localhost Networking',
        status: 'failed',
        message: `Cannot bind to 127.0.0.1: ${err.message}`,
        recovery: 'Ensure loopback networking (127.0.0.1) is enabled and not blocked by firewall or proxy.'
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      server.close(() => {
        resolveCheck({
          id: 'localhost-networking',
          name: 'Localhost Networking',
          status: 'passed',
          message: `Successfully bound to 127.0.0.1 (ephemeral test port ${port}).`
        });
      });
    });
  });
}

export async function checkProjectConfig(cwd = process.cwd()): Promise<DoctorCheck> {
  let pkgContent: string | null = null;
  try {
    pkgContent = await readFile(join(cwd, 'package.json'), 'utf8');
  } catch {
    // Not in a project root
    return {
      id: 'project-config',
      name: 'Project Configuration',
      status: 'skipped',
      message: 'No package.json in current directory (standalone CLI inspection mode).'
    };
  }

  const hasPluginDep = pkgContent.includes('@anwc/vite-plugin');

  let viteContent: string | null = null;
  for (const configName of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
    try {
      viteContent = await readFile(join(cwd, configName), 'utf8');
      break;
    } catch {}
  }

  const hasVitePluginConfig = viteContent ? viteContent.includes('@anwc/vite-plugin') || viteContent.includes('anwc(') : false;

  if (hasPluginDep || hasVitePluginConfig) {
    return {
      id: 'project-config',
      name: 'Project Configuration',
      status: 'passed',
      message: '@anwc/vite-plugin configured in project.'
    };
  }

  return {
    id: 'project-config',
    name: 'Project Configuration',
    status: 'warning',
    message: '@anwc/vite-plugin was not found in package.json or vite.config.*.',
    recovery: "Add '@anwc/vite-plugin' to devDependencies and include anwc() in your vite.config.ts plugins array."
  };
}

export async function runDoctor(options: { cwd?: string } = {}): Promise<DoctorResult> {
  const [nodeCheck, chromiumCheck, netCheck, projectCheck] = await Promise.all([
    checkNodeVersion(),
    checkChromium(),
    checkLocalhostNetworking(),
    checkProjectConfig(options.cwd)
  ]);

  const checks = [nodeCheck, chromiumCheck, netCheck, projectCheck];
  const ok = checks.every((c) => c.status !== 'failed');

  return {
    schemaVersion: '0.1',
    ok,
    platform: process.platform,
    nodeVersion: process.version,
    checks
  };
}

export function formatDoctorText(result: DoctorResult): string {
  const lines: string[] = [
    `ANWC Doctor 0.1 | Platform: ${result.platform} | Node: ${result.nodeVersion}`,
    ''
  ];

  for (const c of result.checks) {
    const badge = c.status === 'passed' ? '[PASS]' : c.status === 'failed' ? '[FAIL]' : c.status === 'warning' ? '[WARN]' : '[SKIP]';
    lines.push(`${badge} ${c.name}: ${c.message}`);
    if (c.recovery) {
      lines.push(`       Recovery: ${c.recovery}`);
    }
  }

  lines.push('');
  if (result.ok) {
    lines.push('System is healthy and ready for ANWC inspection.');
  } else {
    lines.push('One or more diagnostics failed. See concrete recovery instructions above.');
  }

  return lines.join('\n');
}
