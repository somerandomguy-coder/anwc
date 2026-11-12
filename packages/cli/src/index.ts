import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { diagnose } from '@anwc/diagnostics';
import { inspectOptionsSchema, rawCaptureSchema, snapshotSchema, unwrapEnvelope } from '@anwc/protocol';
import type { Envelope, EnvelopeCommand, ErrorEnvelope, InspectOptions, RawCapture, Snapshot } from '@anwc/protocol';
export type { Envelope, ErrorEnvelope, InspectOptions, RawCapture, Snapshot };
import {
  createReport,
  formatReportText,
  renderReportHtml,
  renderReportMarkdown,
  compareRepairs,
  parseDiffInput,
  DiffInputError,
  type DiffInput,
  formatDiffText,
  renderDiffHtml,
  renderDiffMarkdown,
  queryReportSummary,
  queryFindingDetail,
  formatAgentSummaryText,
  formatAgentDetailText,
  reportSchema,
  type Report
} from '@anwc/report';
import { chromium, type Page } from 'playwright';
import { stateManifestSchema, type StateManifest, type CheckRunResult } from './manifest.js';
import { runDoctor, formatDoctorText, type DoctorResult, type DoctorCheck } from './doctor.js';
import { runCheckSuite } from './runner.js';
import { startStudioServer } from './studio.js';
import { CliError, commandName, errorEnvelope, exitCodeForError, successEnvelope, toCliError } from './output.js';

type RuntimeApi = { capture(options?: { textLimit?: number; timeoutMs?: number }): Promise<RawCapture> };
export type CliIo = { stdout(message: string): void; stderr(message: string): void };

/**
 * Reads a saved payload that may be bare or wrapped in an Envelope 0.1 (for example stdout
 * redirected to a file). A wrapped error envelope is not evidence and is rejected.
 */
function unwrapSavedPayload(json: unknown, label: string): unknown {
  const unwrapped = unwrapEnvelope(json);
  if (unwrapped.wrapped && 'error' in unwrapped) {
    throw new CliError('INVALID_USAGE', `${label} contains an error envelope (${unwrapped.error.code}), not a capture.`, 'INPUT_IS_ERROR_ENVELOPE', {
      hint: 'Re-run the command that produced it and save a successful result.'
    });
  }
  return unwrapped.value;
}

let bundledRuntime: Promise<string> | undefined;

async function runtimeScript(): Promise<string> {
  let entryPoint: string;
  try {
    entryPoint = fileURLToPath(import.meta.resolve('@anwc/runtime/browser-entry'));
  } catch {
    entryPoint = fileURLToPath(new URL('../../runtime/src/browser-entry.ts', import.meta.url));
  }
  bundledRuntime ??= build({
    entryPoints: [entryPoint],
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
  if (!/^\d+$/.test(value) || Number(value) <= 0) throw new CliError('INVALID_USAGE', `${option} must be a positive integer.`, 'INVALID_OPTION_VALUE');
  return Number(value);
}

function viewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new CliError('INVALID_USAGE', '--viewport must use WIDTHxHEIGHT.', 'INVALID_OPTION_VALUE');
  return { width: positiveInteger(match[1]!, '--viewport width'), height: positiveInteger(match[2]!, '--viewport height') };
}

function parseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  const mdMatch = /^\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)$/.exec(trimmed)
    || /^<(https?:\/\/[^>]+)>$/.exec(trimmed)
    || /^\[(https?:\/\/[^\]]+)\]$/.exec(trimmed);
  if (mdMatch) {
    throw new CliError(
      'INVALID_USAGE',
      `Invalid URL '${raw}'. Markdown link syntax is not allowed; provide a raw URL like '${mdMatch[1]}'.`,
      'MARKDOWN_URL',
      { hint: `Strip Markdown formatting. Run: anwc inspect "${mdMatch[1]}"` }
    );
  }
  if (trimmed.startsWith('[') || (trimmed.endsWith(')') && !trimmed.includes('('))) {
    throw new CliError(
      'INVALID_USAGE',
      `Invalid URL '${raw}'. It appears to contain Markdown formatting characters.`,
      'MARKDOWN_URL',
      { hint: "Provide a plain HTTP or HTTPS URL, e.g. 'http://127.0.0.1:5173/'." }
    );
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol '${parsed.protocol}'. Only http: and https: URLs are supported.`);
    }
  } catch (error) {
    throw new CliError(
      'INVALID_USAGE',
      `Invalid URL '${raw}': ${error instanceof Error ? error.message : 'Must be a valid HTTP or HTTPS URL.'}`,
      'INVALID_URL',
      { hint: "Provide a valid absolute URL, e.g. 'http://127.0.0.1:5173/'." }
    );
  }
  return trimmed;
}

function missingValue(option: string): CliError {
  return new CliError('INVALID_USAGE', `${option} requires a value.`, 'MISSING_OPTION_VALUE');
}

function unknownOption(option: string): CliError {
  return new CliError('INVALID_USAGE', `Unknown or invalid option: ${option}.`, 'UNKNOWN_OPTION');
}

export function parseArguments(arguments_: string[]): InspectOptions {
  if (arguments_[0] !== 'inspect' || !arguments_[1] || arguments_[1].startsWith('-')) {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc inspect URL [options]',
      arguments_[0] === 'inspect' ? 'USAGE' : 'UNKNOWN_COMMAND',
      { hint: "Run 'anwc inspect http://127.0.0.1:5173/ [options]'. Options: --viewport WIDTHxHEIGHT, --format text|json, --fail-on error|warning|none, --runtime-only." }
    );
  }
  const url = parseUrl(arguments_[1]);
  const input: Record<string, unknown> = { url };
  for (let index = 2; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    if (option === '--runtime-only') { input.runtimeOnly = true; continue; }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw missingValue(option);
    index += 1;
    if (option === '--viewport') input.viewport = viewport(value);
    else if (option === '--format' && (value === 'text' || value === 'json')) input.format = value;
    else if (option === '--output') input.output = value;
    else if (option === '--limit') input.limit = positiveInteger(value, option);
    else if (option === '--max-chars') input.maxChars = positiveInteger(value, option);
    else if (option === '--timeout-ms') input.timeoutMs = positiveInteger(value, option);
    else if (option === '--ready-selector') input.readySelector = value;
    else if (option === '--fail-on' && (value === 'error' || value === 'warning' || value === 'none')) input.failOn = value;
    else throw unknownOption(option);
  }
  try {
    return inspectOptionsSchema.parse(input);
  } catch (error) {
    throw new CliError('INVALID_USAGE', error instanceof Error ? error.message : 'Invalid options.', 'INVALID_OPTIONS');
  }
}

export interface ReportCommandOptions {
  captureFile: string;
  format: 'html' | 'markdown' | 'text' | 'json';
  output?: string;
  redact: boolean;
  query?: 'summary' | 'detail';
  findingId?: string;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  file?: string;
  nodeId?: string;
  actionableOnly?: boolean;
  limit?: number;
}

export function parseReportArguments(arguments_: string[]): ReportCommandOptions {
  if (arguments_[0] !== 'report' || !arguments_[1] || arguments_[1].startsWith('-')) {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc report CAPTURE_FILE [options]',
      'USAGE',
      { hint: "Run 'anwc report capture.json [--query summary|detail] [--finding-id <id>] [--format html|markdown|text|json] [--output path] [--redact]'." }
    );
  }
  const captureFile = arguments_[1];
  let format: 'html' | 'markdown' | 'text' | 'json' = 'html';
  let output: string | undefined;
  let redact = false;
  let query: 'summary' | 'detail' | undefined;
  let findingId: string | undefined;
  let code: string | undefined;
  let severity: 'error' | 'warning' | 'info' | undefined;
  let file: string | undefined;
  let nodeId: string | undefined;
  let actionableOnly: boolean | undefined;
  let limit: number | undefined;

  for (let index = 2; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    if (option === '--redact') {
      redact = true;
      continue;
    }
    if (option === '--actionable-only') {
      actionableOnly = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw missingValue(option);
    index += 1;
    if (option === '--format') {
      if (value === 'html' || value === 'markdown' || value === 'text' || value === 'json') {
        format = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --format '${value}'. Supported formats: html, markdown, text, json.`, 'INVALID_OPTION_VALUE');
      }
    } else if (option === '--output') {
      output = value;
    } else if (option === '--query') {
      if (value === 'summary' || value === 'detail') {
        query = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --query '${value}'. Supported queries: summary, detail.`, 'INVALID_OPTION_VALUE');
      }
    } else if (option === '--finding-id' || option === '--finding') {
      findingId = value;
    } else if (option === '--code' || option === '--filter-code') {
      code = value;
    } else if (option === '--severity' || option === '--filter-severity') {
      if (value === 'error' || value === 'warning' || value === 'info') {
        severity = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --severity '${value}'. Supported: error, warning, info.`, 'INVALID_OPTION_VALUE');
      }
    } else if (option === '--file' || option === '--filter-file') {
      file = value;
    } else if (option === '--node-id' || option === '--filter-node') {
      nodeId = value;
    } else if (option === '--limit') {
      limit = positiveInteger(value, option);
    } else {
      throw unknownOption(option);
    }
  }

  const hasFormatArg = arguments_.includes('--format');
  if (query && !hasFormatArg) {
    format = 'text';
  }

  if (query === 'detail' && !findingId) {
    throw new CliError('INVALID_USAGE', '--query detail requires --finding-id <id>.', 'MISSING_OPTION');
  }

  return { captureFile, format, output, redact, query, findingId, code, severity, file, nodeId, actionableOnly, limit };
}

export interface CheckCommandOptions {
  manifestFile: string;
  outputDir?: string;
}

export function parseCheckArguments(arguments_: string[]): CheckCommandOptions {
  if (arguments_[0] !== 'check' || !arguments_[1] || arguments_[1].startsWith('-')) {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc check MANIFEST_FILE [--output DIR]',
      'USAGE',
      { hint: "Run 'anwc check anwc.checks.json [--output artifacts/ui]'." }
    );
  }
  const manifestFile = arguments_[1];
  let outputDir: string | undefined;

  for (let index = 2; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw missingValue(option);
    index += 1;
    if (option === '--output') {
      outputDir = value;
    } else if (option === '--format' && value === 'json') {
      // check only emits JSON; '--format json' is accepted for symmetry with the other commands.
    } else {
      throw unknownOption(option);
    }
  }

  return { manifestFile, outputDir };
}

export interface DiffCommandOptions {
  beforeFile: string;
  afterFile: string;
  format: 'html' | 'markdown' | 'text' | 'json';
  output?: string;
}

export function parseDiffArguments(arguments_: string[]): DiffCommandOptions {
  if (arguments_[0] !== 'diff' || !arguments_[1] || arguments_[1].startsWith('-') || !arguments_[2] || arguments_[2].startsWith('-')) {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc diff BEFORE_CAPTURE AFTER_CAPTURE [options]',
      'USAGE',
      { hint: "Run 'anwc diff before.json after.json [--format html|markdown|text|json] [--output path]'." }
    );
  }
  const beforeFile = arguments_[1];
  const afterFile = arguments_[2];
  let format: 'html' | 'markdown' | 'text' | 'json' = 'html';
  let output: string | undefined;

  for (let index = 3; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw missingValue(option);
    index += 1;
    if (option === '--format') {
      if (value !== 'html' && value !== 'markdown' && value !== 'text' && value !== 'json') {
        throw new CliError('INVALID_USAGE', `Unsupported diff format '${value}'. Use 'html', 'markdown', 'text', or 'json'.`, 'INVALID_OPTION_VALUE');
      }
      format = value;
    } else if (option === '--output') {
      output = value;
    } else {
      throw unknownOption(option);
    }
  }

  return { beforeFile, afterFile, format, output };
}

export interface StudioCliOptions {
  url?: string;
  port?: number;
  capture?: string;
  open: boolean;
}

export function parseStudioArguments(arguments_: string[]): StudioCliOptions {
  if (arguments_[0] !== 'studio') {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc studio [url] [--port <n>] [--capture <path>] [--no-open]',
      'USAGE',
      { hint: "Run 'anwc studio [url] [--port 4180] [--capture path] [--no-open]'." }
    );
  }
  let url: string | undefined;
  let port: number | undefined;
  let capture: string | undefined;
  let open = true;

  for (let i = 1; i < arguments_.length; i++) {
    const arg = arguments_[i]!;
    if (arg === '--port') {
      const next = arguments_[++i];
      if (!next || !/^\d+$/.test(next)) throw new CliError('INVALID_USAGE', '--port must be a positive integer.', 'INVALID_OPTION_VALUE');
      port = Number(next);
    } else if (arg === '--capture') {
      const next = arguments_[++i];
      if (!next) throw new CliError('INVALID_USAGE', '--capture requires a file path.', 'MISSING_OPTION_VALUE');
      capture = next;
    } else if (arg === '--no-open') {
      open = false;
    } else if (!arg.startsWith('-') && !url) {
      url = parseUrl(arg);
    } else {
      throw new CliError('INVALID_USAGE', `Unknown studio argument '${arg}'.`, 'UNKNOWN_OPTION');
    }
  }

  return { url, port, capture, open };
}

const RUNTIME_SETUP_HINT = "Ensure '@anwc/vite-plugin' is added to plugins in vite.config.ts before '@vitejs/plugin-react', the dev server is running in development mode (e.g. 'npm run dev'), and the page loaded without errors. For uninstrumented pages, pass '--runtime-only'.";

function isDocumentReplaced(message: string): boolean {
  return message.includes('Execution context was destroyed') || message.includes('navigation');
}

async function evaluateCapture(page: Page, options: InspectOptions): Promise<RawCapture> {
  return page.evaluate(async (captureOptions) => {
    const api = (window as Window & { __ANWC__?: RuntimeApi }).__ANWC__;
    if (!api) throw new Error('ANWC runtime disappeared before capture.');
    return api.capture(captureOptions);
  }, { textLimit: 160, timeoutMs: options.timeoutMs });
}

function cspBlocked(cause: string, violations: readonly string[], runtimeOnly: boolean): CliError {
  return new CliError(
    'CSP_BLOCKED',
    "The page's Content Security Policy blocked the ANWC runtime script.",
    'RUNTIME_SCRIPT_BLOCKED_BY_CSP',
    {
      details: { cause, violations: violations.slice(0, 3) },
      hint: runtimeOnly
        ? "This page's CSP forbids the injected collector. Inspect the page through the Vite dev server with '@anwc/vite-plugin', or allow the script in the development CSP."
        : "Allow the ANWC development runtime in the page's development CSP (script-src), or remove the CSP in development mode."
    }
  );
}

async function capturePage(page: Page, options: InspectOptions, cspViolations: readonly string[]): Promise<RawCapture> {
  if (options.runtimeOnly) {
    try {
      await page.addScriptTag({ content: await runtimeScript() });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      if (/Content Security Policy/i.test(cause)) throw cspBlocked(cause, cspViolations, true);
      throw error;
    }
  }
  try {
    await page.waitForFunction(() => Boolean((window as Window & { __ANWC__?: unknown }).__ANWC__), undefined, { timeout: Math.min(options.timeoutMs, 2_000) });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    if (cspViolations.length > 0) throw cspBlocked(cause, cspViolations, options.runtimeOnly);
    throw new CliError('RUNTIME_MISSING', 'ANWC runtime is not present on this page.', 'RUNTIME_MISSING', { details: { cause }, hint: RUNTIME_SETUP_HINT });
  }
  try {
    return await new Promise<RawCapture>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new CliError(
        'BUDGET_EXCEEDED',
        'Runtime capture exceeded the timeout budget.',
        'CAPTURE_TIMEOUT',
        {
          details: { timeoutMs: options.timeoutMs },
          hint: `Capture timed out after ${options.timeoutMs}ms. Check for infinite loops or pending fonts, or increase the timeout using '--timeout-ms ${options.timeoutMs * 2}'.`
        }
      )), options.timeoutMs);
      async function doCapture(): Promise<RawCapture> {
        try {
          return await evaluateCapture(page, options);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!isDocumentReplaced(msg)) throw err;
          // The document was replaced mid-capture. Retry once on the new document; never merge the two.
          try {
            await page.waitForFunction(() => Boolean((window as Window & { __ANWC__?: unknown }).__ANWC__), undefined, { timeout: Math.min(options.timeoutMs, 5_000) });
            return await evaluateCapture(page, options);
          } catch (retryError: unknown) {
            const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
            throw new CliError(
              'CAPTURE_STALE',
              'The document was replaced during capture, twice; no consistent capture was produced.',
              'DOCUMENT_REPLACED_DURING_CAPTURE',
              {
                details: { firstCause: msg, retryCause: retryMessage },
                hint: 'The page navigated or reloaded while ANWC was reading it. Wait for the page to stop navigating (for example with --ready-selector) and capture again.'
              }
            );
          }
        }
      }
      doCapture().then(
        (capture) => { clearTimeout(timeout); resolve(capture); },
        (error: unknown) => { clearTimeout(timeout); reject(error); }
      );
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('INTERNAL', error instanceof Error ? error.message : 'The ANWC runtime failed during capture.', 'RUNTIME_CAPTURE_FAILED');
  }
}

export async function inspect(options: InspectOptions): Promise<Snapshot> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist") || message.includes('playwright install')) {
      throw new CliError(
        'INTERNAL',
        "Playwright browser executable is missing. Please run 'npx playwright install chromium' to install the required browser.",
        'BROWSER_MISSING',
        { recovery: { strategy: 'fix_environment' }, hint: "Run 'npx playwright install chromium' in your project terminal." }
      );
    }
    throw new CliError('INTERNAL', message, 'BROWSER_LAUNCH_FAILED', { recovery: { strategy: 'fix_environment' } });
  }
  try {
    const context = await browser.newContext({ viewport: options.viewport });
    try {
      const page = await context.newPage();
      const cspViolations: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error' && /Content Security Policy/i.test(text) && /script/i.test(text)) cspViolations.push(text);
      });
      try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      } catch (error) {
        throw new CliError(
          'TARGET_UNREACHABLE',
          error instanceof Error ? error.message : 'Navigation failed.',
          'NAVIGATION_FAILED',
          { details: { url: options.url }, hint: `Could not navigate to '${options.url}'. Ensure the development server is running and accessible (e.g. 'npm run dev').` }
        );
      }
      if (options.readySelector) {
        try {
          await page.locator(options.readySelector).waitFor({ state: 'attached', timeout: options.timeoutMs });
        } catch (error) {
          throw new CliError(
            'NOT_SETTLED',
            error instanceof Error ? error.message : 'Readiness selector timed out.',
            'READY_SELECTOR_TIMEOUT',
            { details: { readySelector: options.readySelector, timeoutMs: options.timeoutMs }, hint: `Selector '${options.readySelector}' was not attached within ${options.timeoutMs}ms.` }
          );
        }
      }
      const capture = rawCaptureSchema.parse(await capturePage(page, options, cspViolations));
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
  const report = createReport(snapshot);
  return formatReportText(report, { limit, maxChars });
}

/**
 * Inspect exit codes. Findings are data, so a capture is `ok:true` whatever it finds:
 * 3 = the evidence is incomplete or unsettled (takes precedence), 1 = `--fail-on` threshold met, 0 = otherwise.
 */
function exitCode(snapshot: Snapshot, failOn: InspectOptions['failOn']): number {
  if (!snapshot.coverage.complete || !snapshot.readiness.settled) return 3;
  if (failOn === 'error' && snapshot.findings.some((finding) => finding.severity === 'error')) return 1;
  if (failOn === 'warning' && snapshot.findings.some((finding) => finding.severity === 'error' || finding.severity === 'warning')) return 1;
  return 0;
}

function formatOption(arguments_: readonly string[]): string | undefined {
  const index = arguments_.indexOf('--format');
  return index >= 0 ? arguments_[index + 1] : undefined;
}

/** JSON mode is decided from the raw arguments so a parse failure still prints an envelope. */
function wantsJsonOutput(command: EnvelopeCommand, arguments_: readonly string[]): boolean {
  if (command === 'check') return true; // check only emits JSON
  if (command === 'doctor' && arguments_.includes('--json')) return true;
  return formatOption(arguments_) === 'json';
}

async function readJsonInput(file: string, label: string, unreadable: string): Promise<{ content: string; json: unknown }> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    throw new CliError('INVALID_USAGE', `${unreadable} '${file}': ${error instanceof Error ? error.message : String(error)}`, 'INPUT_UNREADABLE', { details: { file } });
  }
  try {
    return { content, json: JSON.parse(content) };
  } catch {
    throw new CliError('INVALID_USAGE', `${label} '${file}' is not valid JSON.`, 'INPUT_NOT_JSON', { details: { file } });
  }
}

async function writeOutput(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/**
 * Runs one CLI command. In JSON mode stdout carries exactly one Envelope 0.1. Files written with
 * --output keep the bare payload (Snapshot, Report, DiffReport, ...) so saved artifacts stay
 * readable by report, diff and the studio; in that case stdout stays empty on success.
 * Exit codes: 0 ok; 1 structured error, or ok with a failed verdict gate; 2 usage error;
 * 3 (inspect only) ok but evidence incomplete or unsettled.
 */
export async function run(arguments_: string[], io: CliIo = { stdout: (message) => process.stdout.write(message), stderr: (message) => process.stderr.write(message) }): Promise<number> {
  const command = commandName(arguments_);
  const json = wantsJsonOutput(command, arguments_);
  const printEnvelope = (envelope: Envelope, indent?: number) => io.stdout(`${JSON.stringify(envelope, null, indent)}\n`);
  try {
    if (command === 'doctor') {
      const result = await runDoctor();
      if (json) printEnvelope(successEnvelope('doctor', result), 2);
      else io.stdout(`${formatDoctorText(result)}\n`);
      return result.ok ? 0 : 1;
    }

    if (command === 'report') {
      const reportOptions = parseReportArguments(arguments_);
      const { json: parsedJson } = await readJsonInput(reportOptions.captureFile, 'Capture file', 'Cannot read capture file');
      const payload = unwrapSavedPayload(parsedJson, `Capture file '${reportOptions.captureFile}'`);
      let snapshot: Snapshot | null = null;
      let report: Report | null = null;
      const snapResult = snapshotSchema.safeParse(payload);
      if (snapResult.success) {
        snapshot = snapResult.data;
        report = createReport(snapshot);
      } else {
        const repResult = reportSchema.safeParse(payload);
        if (repResult.success) {
          report = repResult.data;
        } else {
          throw new CliError('INVALID_USAGE', `Capture file '${reportOptions.captureFile}' does not match Snapshot 0.1 or Report 0.1 schema.`, 'INPUT_SCHEMA_MISMATCH', {
            details: { file: reportOptions.captureFile },
            hint: "Pass a Snapshot written by 'anwc inspect --format json' or a Report 0.1 JSON file."
          });
        }
      }

      let data: unknown;
      let output: string;
      const inputObj = snapshot ?? report!;
      if (reportOptions.query === 'detail') {
        const detail = queryFindingDetail(inputObj, reportOptions.findingId!);
        if (!detail) {
          throw new CliError('INVALID_USAGE', `Finding '${reportOptions.findingId}' was not found in report.`, 'FINDING_NOT_FOUND', {
            details: { findingId: reportOptions.findingId },
            hint: "List finding ids with 'anwc report CAPTURE_FILE --query summary'."
          });
        }
        data = detail;
        output = reportOptions.format === 'json' ? JSON.stringify(detail, null, 2) : formatAgentDetailText(detail);
      } else if (reportOptions.query === 'summary' || reportOptions.code || reportOptions.severity || reportOptions.file || reportOptions.nodeId || reportOptions.actionableOnly) {
        const summary = queryReportSummary(inputObj, {
          code: reportOptions.code,
          severity: reportOptions.severity,
          file: reportOptions.file,
          nodeId: reportOptions.nodeId,
          findingId: reportOptions.findingId,
          actionableOnly: reportOptions.actionableOnly,
          limit: reportOptions.limit
        });
        data = summary;
        output = reportOptions.format === 'json' ? JSON.stringify(summary, null, 2) : formatAgentSummaryText(summary);
      } else if (reportOptions.format === 'html') {
        output = renderReportHtml(report!, { redact: reportOptions.redact });
      } else if (reportOptions.format === 'markdown') {
        output = renderReportMarkdown(report!, { redact: reportOptions.redact });
      } else if (reportOptions.format === 'text') {
        output = formatReportText(report!);
      } else {
        data = report!;
        output = JSON.stringify(report!, null, 2);
      }

      if (reportOptions.output) await writeOutput(reportOptions.output, output);
      else if (reportOptions.format === 'json') printEnvelope(successEnvelope('report', data), 2);
      else io.stdout(`${output}\n`);
      return 0;
    }

    if (command === 'check') {
      const checkOptions = parseCheckArguments(arguments_);
      const { content, json: parsedJson } = await readJsonInput(checkOptions.manifestFile, 'Manifest file', 'Cannot read manifest file');
      let manifest: StateManifest;
      try {
        manifest = stateManifestSchema.parse(parsedJson);
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Manifest file '${checkOptions.manifestFile}' does not match StateManifest 0.1 schema: ${error instanceof Error ? error.message : String(error)}`, 'INPUT_SCHEMA_MISMATCH', {
          details: { file: checkOptions.manifestFile }
        });
      }

      const runResult = await runCheckSuite({
        manifest,
        manifestRaw: content,
        outputDir: checkOptions.outputDir,
        runtimeScriptProvider: runtimeScript
      });

      printEnvelope(successEnvelope('check', runResult), 2);
      return runResult.passedAll ? 0 : 1;
    }

    if (command === 'diff') {
      const diffOptions = parseDiffArguments(arguments_);
      const before = await readJsonInput(diffOptions.beforeFile, 'Before capture file', 'Cannot read before capture file');
      const after = await readJsonInput(diffOptions.afterFile, 'After capture file', 'Cannot read after capture file');

      const parseSide = (json: unknown, side: 'Before' | 'After', file: string): DiffInput => {
        const payload = unwrapSavedPayload(json, `${side} capture file '${file}'`);
        try {
          return parseDiffInput(payload);
        } catch (error) {
          if (!(error instanceof DiffInputError)) throw error;
          throw new CliError(
            'INVALID_USAGE',
            `${side} capture file '${file}' does not match Snapshot 0.1 or Report 0.1 schema.${error.issues[0] ? ` First issue: ${error.issues[0]}` : ''}`,
            'INPUT_SCHEMA_MISMATCH',
            {
              details: { file, issues: error.issues },
              hint: "Pass a Snapshot written by 'anwc inspect --format json' or a Report 0.1 JSON file."
            }
          );
        }
      };
      const beforeInput = parseSide(before.json, 'Before', diffOptions.beforeFile);
      const afterInput = parseSide(after.json, 'After', diffOptions.afterFile);

      // No behavior evidence is accepted on the CLI: disappeared findings stay inconclusive.
      const diffResult = compareRepairs(beforeInput, afterInput);
      let diffOutput: string;
      if (diffOptions.format === 'html') {
        diffOutput = renderDiffHtml(diffResult);
      } else if (diffOptions.format === 'markdown') {
        diffOutput = renderDiffMarkdown(diffResult);
      } else if (diffOptions.format === 'text') {
        diffOutput = formatDiffText(diffResult);
      } else {
        diffOutput = JSON.stringify(diffResult, null, 2);
      }

      if (diffOptions.output) await writeOutput(diffOptions.output, diffOutput);
      else if (diffOptions.format === 'json') printEnvelope(successEnvelope('diff', diffResult), 2);
      else io.stdout(diffOutput.endsWith('\n') ? diffOutput : `${diffOutput}\n`);

      // A diff that is not a verified repair is data (ok:true), but fails the verdict gate.
      return diffResult.summary.repairIntegrityVerdict === 'verified-repair' ? 0 : 1;
    }

    if (command === 'studio') {
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
      if (process.env.VITEST || process.env.NODE_ENV === 'test') {
        await handle.close();
        return 0;
      }

      await new Promise<void>((resolve) => {
        const onShutdown = async () => {
          process.off('SIGINT', onShutdown);
          process.off('SIGTERM', onShutdown);
          try {
            await handle.close();
          } catch {
            // ignore
          }
          resolve();
        };
        process.on('SIGINT', onShutdown);
        process.on('SIGTERM', onShutdown);
      });
      return 0;
    }

    const inspectOptions = parseArguments(arguments_);
    const snapshot = await inspect(inspectOptions);
    if (inspectOptions.format === 'json') {
      if (inspectOptions.output) await writeOutput(inspectOptions.output, `${JSON.stringify(snapshot)}\n`);
      else printEnvelope(successEnvelope('inspect', snapshot));
    } else {
      const text = `${formatText(snapshot, inspectOptions.limit, inspectOptions.maxChars)}\n`;
      if (inspectOptions.output) await writeOutput(inspectOptions.output, text);
      else io.stdout(text);
    }
    return exitCode(snapshot, inspectOptions.failOn);
  } catch (error) {
    const cliError = toCliError(error);
    const envelope = errorEnvelope(command, cliError);
    if (json) {
      printEnvelope(envelope);
    } else {
      io.stderr(`ANWC ${envelope.error.code}: ${envelope.error.message}\n`);
      const hint = envelope.error.recovery?.hint;
      if (hint) io.stderr(`  Recovery: ${hint}\n`);
    }
    return exitCodeForError(cliError);
  }
}

export * from './manifest.js';
export * from './runner.js';
export * from './doctor.js';
export * from './studio.js';
export { CliError, errorEnvelope, successEnvelope, retryFor, exitCodeForError } from './output.js';
