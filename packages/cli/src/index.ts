import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { diagnose } from '@anwc/diagnostics';
import { errorEnvelopeSchema, inspectOptionsSchema, snapshotSchema } from '@anwc/protocol';
import type { ErrorEnvelope, InspectOptions, RawCapture, Snapshot } from '@anwc/protocol';
import { chromium, type Page } from 'playwright';

type RuntimeApi = { capture(options?: { textLimit?: number; timeoutMs?: number }): Promise<RawCapture> };
export type CliIo = { stdout(message: string): void; stderr(message: string): void };

class CliError extends Error {
  constructor(readonly code: ErrorEnvelope['error']['code'], message: string, readonly details: Record<string, unknown> | null = null) {
    super(message);
  }
}

let bundledRuntime: Promise<string> | undefined;

async function runtimeScript(): Promise<string> {
  bundledRuntime ??= build({
    entryPoints: [fileURLToPath(new URL('../../runtime/src/browser-entry.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent'
  }).then((result) => result.outputFiles[0]!.text);
  return bundledRuntime;
}

function positiveInteger(value: string, option: string): number {
  if (!/^\d+$/.test(value) || Number(value) <= 0) throw new CliError('INVALID_USAGE', `${option} must be a positive integer.`);
  return Number(value);
}

function viewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new CliError('INVALID_USAGE', '--viewport must use WIDTHxHEIGHT.');
  return { width: positiveInteger(match[1]!, '--viewport width'), height: positiveInteger(match[2]!, '--viewport height') };
}

export function parseArguments(arguments_: string[]): InspectOptions {
  if (arguments_[0] !== 'inspect' || !arguments_[1] || arguments_[1].startsWith('-')) throw new CliError('INVALID_USAGE', 'Usage: anwc inspect URL [options]');
  const input: Record<string, unknown> = { url: arguments_[1] };
  for (let index = 2; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    if (option === '--runtime-only') { input.runtimeOnly = true; continue; }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new CliError('INVALID_USAGE', `${option} requires a value.`);
    index += 1;
    if (option === '--viewport') input.viewport = viewport(value);
    else if (option === '--format' && (value === 'text' || value === 'json')) input.format = value;
    else if (option === '--output') input.output = value;
    else if (option === '--limit') input.limit = positiveInteger(value, option);
    else if (option === '--max-chars') input.maxChars = positiveInteger(value, option);
    else if (option === '--timeout-ms') input.timeoutMs = positiveInteger(value, option);
    else if (option === '--ready-selector') input.readySelector = value;
    else if (option === '--fail-on' && (value === 'error' || value === 'warning' || value === 'none')) input.failOn = value;
    else throw new CliError('INVALID_USAGE', `Unknown or invalid option: ${option}.`);
  }
  try {
    return inspectOptionsSchema.parse(input);
  } catch (error) {
    throw new CliError('INVALID_USAGE', error instanceof Error ? error.message : 'Invalid options.');
  }
}

async function capturePage(page: Page, options: InspectOptions): Promise<RawCapture> {
  if (options.runtimeOnly) await page.addScriptTag({ content: await runtimeScript() });
  try {
    await page.waitForFunction(() => Boolean((window as Window & { __ANWC__?: unknown }).__ANWC__), undefined, { timeout: Math.min(options.timeoutMs, 2_000) });
    return await page.evaluate(async (captureOptions) => {
      const api = (window as Window & { __ANWC__?: RuntimeApi }).__ANWC__;
      if (!api) throw new Error('ANWC runtime is not present on this page.');
      return api.capture(captureOptions);
    }, { textLimit: 160, timeoutMs: options.timeoutMs });
  } catch (error) {
    throw new CliError('RUNTIME_MISSING', error instanceof Error ? error.message : 'ANWC runtime is not present on this page.');
  }
}

export async function inspect(options: InspectOptions): Promise<Snapshot> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: options.viewport });
    try {
      const page = await context.newPage();
      try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      } catch (error) {
        throw new CliError('NAVIGATION_FAILED', error instanceof Error ? error.message : 'Navigation failed.');
      }
      if (options.readySelector) {
        try {
          await page.locator(options.readySelector).waitFor({ state: 'attached', timeout: options.timeoutMs });
        } catch (error) {
          throw new CliError('TIMEOUT', error instanceof Error ? error.message : 'Readiness selector timed out.');
        }
      }
      const capture = await capturePage(page, options);
      const rulesStarted = performance.now();
      const findings = diagnose(capture);
      const rules = Math.round(performance.now() - rulesStarted);
      const serializeStarted = performance.now();
      const snapshot = snapshotSchema.parse({ ...capture, timingsMs: { ...capture.timingsMs, rules, serialize: 0 }, findings });
      snapshot.timingsMs.serialize = Math.round(performance.now() - serializeStarted);
      return snapshot;
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

function printable(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`);
}

export function formatText(snapshot: Snapshot, limit: number, maxChars: number): string {
  const lines = [`ANWC ${snapshot.schemaVersion} | ${snapshot.page.viewport.width}x${snapshot.page.viewport.height} | capture ${snapshot.captureId} | ${snapshot.coverage.complete ? 'complete' : 'partial'}${snapshot.readiness.settled ? ', settled' : ', unsettled'}`];
  let shown = 0;
  for (const finding of snapshot.findings) {
    if (shown >= limit) break;
    const source = finding.source ? `${finding.source.file}:${finding.source.line}:${finding.source.column}` : 'source unavailable';
    lines.push(`${finding.severity.toUpperCase()} ${finding.code} ${finding.nodeId} ${JSON.stringify(printable(finding.message))}`);
    lines.push(`  ${source}${finding.relatedNodeIds.length ? ` | related ${finding.relatedNodeIds.join(', ')}` : ''}`);
    shown += 1;
  }
  const omitted = snapshot.findings.length - shown;
  lines.push(`${shown} findings | ${omitted} omitted | ${snapshot.coverage.complete ? 'complete capture' : 'partial capture'} | paint visibility unknown | no screenshots captured`);
  let output = lines.join('\n');
  if (output.length > maxChars) output = `${output.slice(0, Math.max(0, maxChars - 45))}\n... text output truncated by --max-chars ...`;
  return output;
}

function exitCode(snapshot: Snapshot, failOn: InspectOptions['failOn']): number {
  if (!snapshot.coverage.complete || !snapshot.readiness.settled) return 3;
  if (failOn === 'error' && snapshot.findings.some((finding) => finding.severity === 'error')) return 1;
  if (failOn === 'warning' && snapshot.findings.some((finding) => finding.severity === 'error' || finding.severity === 'warning')) return 1;
  return 0;
}

function envelope(error: CliError): ErrorEnvelope {
  return errorEnvelopeSchema.parse({ schemaVersion: '0.1', error: { code: error.code, message: error.message, details: error.details } });
}

export async function run(arguments_: string[], io: CliIo = { stdout: (message) => process.stdout.write(message), stderr: (message) => process.stderr.write(message) }): Promise<number> {
  let options: InspectOptions | undefined;
  try {
    options = parseArguments(arguments_);
    const snapshot = await inspect(options);
    const output = options.format === 'json' ? `${JSON.stringify(snapshot)}\n` : `${formatText(snapshot, options.limit, options.maxChars)}\n`;
    if (options.output) {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, output, 'utf8');
    } else io.stdout(output);
    return exitCode(snapshot, options.failOn);
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError('INTERNAL', error instanceof Error ? error.message : 'Unexpected CLI failure.');
    const report = envelope(cliError);
    if (options?.format === 'json') io.stdout(`${JSON.stringify(report)}\n`);
    else io.stderr(`ANWC ${report.error.code}: ${report.error.message}\n`);
    return cliError.code === 'PARTIAL_CAPTURE' ? 3 : 2;
  }
}
