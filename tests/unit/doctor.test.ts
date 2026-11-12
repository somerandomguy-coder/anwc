import { describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envelopeSchema } from '@anwc/protocol';
import {
  checkNodeVersion,
  checkChromium,
  checkLocalhostNetworking,
  checkProjectConfig,
  runDoctor,
  formatDoctorText,
  run
} from '../../packages/cli/src/index.js';

describe('Q10 anwc doctor and setup diagnostics', () => {
  test('checkNodeVersion validates Node runtime version satisfies requirement', async () => {
    const check = await checkNodeVersion();
    expect(check.id).toBe('node-version');
    expect(check.status).toBe('passed');
    expect(check.message).toContain('satisfies >= 18.0.0 requirement');
  });

  test('checkChromium validates Playwright Chromium availability', async () => {
    const check = await checkChromium();
    expect(check.id).toBe('chromium-browser');
    expect(check.status).toBe('passed');
    expect(check.message).toContain('Chromium');
    expect(check.details?.executablePath).toBeDefined();
  });

  test('checkLocalhostNetworking binds ephemeral port on 127.0.0.1', async () => {
    const check = await checkLocalhostNetworking();
    expect(check.id).toBe('localhost-networking');
    expect(check.status).toBe('passed');
    expect(check.message).toContain('Successfully bound to 127.0.0.1');
  });

  test('checkProjectConfig reports skipped when outside project, warning when unconfigured, passed when configured', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-doc-test-'));
    try {
      // 1. Empty directory -> skipped (standalone CLI mode)
      const emptyCheck = await checkProjectConfig(tmp);
      expect(emptyCheck.status).toBe('skipped');
      expect(emptyCheck.message).toContain('No package.json');

      // 2. Project without anwc -> warning with recovery
      await writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'test-app' }), 'utf8');
      const unconfigCheck = await checkProjectConfig(tmp);
      expect(unconfigCheck.status).toBe('warning');
      expect(unconfigCheck.recovery).toContain('@anwc/vite-plugin');

      // 3. Project with anwc in vite.config.ts -> passed
      await writeFile(join(tmp, 'vite.config.ts'), "import { anwc } from '@anwc/vite-plugin';\nexport default { plugins: [anwc()] };", 'utf8');
      const configCheck = await checkProjectConfig(tmp);
      expect(configCheck.status).toBe('passed');
      expect(configCheck.message).toContain('@anwc/vite-plugin configured');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('runDoctor returns structured DoctorResult and formatDoctorText produces clean output', async () => {
    const result = await runDoctor();
    expect(result.schemaVersion).toBe('0.1');
    expect(result.ok).toBe(true);
    expect(result.platform).toBe(process.platform);
    expect(result.checks.length).toBeGreaterThanOrEqual(4);

    const formatted = formatDoctorText(result);
    expect(formatted).toContain('ANWC Doctor 0.1');
    expect(formatted).toContain('[PASS] Node.js Runtime Version');
    expect(formatted).toContain('[PASS] Chromium Browser Executable');
    expect(formatted).toContain('[PASS] Localhost Networking');
    expect(formatted).toContain('System is healthy and ready for ANWC inspection.');
  });

  test('CLI run(["doctor"]) outputs formatted text and run(["doctor", "--json"]) outputs valid JSON', async () => {
    // 1. Text mode
    const textOut: string[] = [];
    const textIo = { stdout: (m: string) => textOut.push(m), stderr: () => {} };
    const exit1 = await run(['doctor'], textIo);
    expect(exit1).toBe(0);
    const textOutput = textOut.join('');
    expect(textOutput).toContain('ANWC Doctor 0.1');
    expect(textOutput).toContain('[PASS] Node.js Runtime Version');

    // 2. JSON mode
    const jsonOut: string[] = [];
    const jsonIo = { stdout: (m: string) => jsonOut.push(m), stderr: () => {} };
    const exit2 = await run(['doctor', '--json'], jsonIo);
    expect(exit2).toBe(0);
    const envelope = JSON.parse(jsonOut.join(''));
    expect(envelopeSchema.parse(envelope)).toMatchObject({ version: '0.1', ok: true, command: 'doctor' });
    const parsed = envelope.data;
    expect(parsed.schemaVersion).toBe('0.1');
    expect(parsed.ok).toBe(true);
    expect(parsed.checks).toBeInstanceOf(Array);
  });
});
