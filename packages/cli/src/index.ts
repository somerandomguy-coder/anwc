import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { diagnose } from '@anwc/diagnostics';
import { errorEnvelopeSchema, inspectOptionsSchema, rawCaptureSchema, snapshotSchema } from '@anwc/protocol';
import type { ErrorEnvelope, InspectOptions, RawCapture, Snapshot } from '@anwc/protocol';
import {
  createReport,
  formatReportText,
  renderReportHtml,
  renderReportMarkdown,
  compareRepairs,
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
import { runCheckSuite } from './runner.js';

type RuntimeApi = { capture(options?: { textLimit?: number; timeoutMs?: number }): Promise<RawCapture> };
export type CliIo = { stdout(message: string): void; stderr(message: string): void };

class CliError extends Error {
  readonly code: ErrorEnvelope['error']['code'];
  readonly details: Record<string, unknown> | null;

  constructor(code: ErrorEnvelope['error']['code'], message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
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
  if (!/^\d+$/.test(value) || Number(value) <= 0) throw new CliError('INVALID_USAGE', `${option} must be a positive integer.`);
  return Number(value);
}

function viewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new CliError('INVALID_USAGE', '--viewport must use WIDTHxHEIGHT.');
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
      { recovery: `Strip Markdown formatting. Run: anwc inspect "${mdMatch[1]}"` }
    );
  }
  if (trimmed.startsWith('[') || (trimmed.endsWith(')') && !trimmed.includes('('))) {
    throw new CliError(
      'INVALID_USAGE',
      `Invalid URL '${raw}'. It appears to contain Markdown formatting characters.`,
      { recovery: "Provide a plain HTTP or HTTPS URL, e.g. 'http://127.0.0.1:5173/'." }
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
      { recovery: "Provide a valid absolute URL, e.g. 'http://127.0.0.1:5173/'." }
    );
  }
  return trimmed;
}

export function parseArguments(arguments_: string[]): InspectOptions {
  if (arguments_[0] !== 'inspect' || !arguments_[1] || arguments_[1].startsWith('-')) {
    throw new CliError(
      'INVALID_USAGE',
      'Usage: anwc inspect URL [options]',
      { recovery: "Run 'anwc inspect http://127.0.0.1:5173/ [options]'. Options: --viewport WIDTHxHEIGHT, --format text|json, --fail-on error|warning|none, --runtime-only." }
    );
  }
  const url = parseUrl(arguments_[1]);
  const input: Record<string, unknown> = { url };
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
      { recovery: "Run 'anwc report capture.json [--query summary|detail] [--finding-id <id>] [--format html|markdown|text|json] [--output path] [--redact]'." }
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
    if (!value || value.startsWith('--')) throw new CliError('INVALID_USAGE', `${option} requires a value.`);
    index += 1;
    if (option === '--format') {
      if (value === 'html' || value === 'markdown' || value === 'text' || value === 'json') {
        format = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --format '${value}'. Supported formats: html, markdown, text, json.`);
      }
    } else if (option === '--output') {
      output = value;
    } else if (option === '--query') {
      if (value === 'summary' || value === 'detail') {
        query = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --query '${value}'. Supported queries: summary, detail.`);
      }
    } else if (option === '--finding-id' || option === '--finding') {
      findingId = value;
    } else if (option === '--code' || option === '--filter-code') {
      code = value;
    } else if (option === '--severity' || option === '--filter-severity') {
      if (value === 'error' || value === 'warning' || value === 'info') {
        severity = value;
      } else {
        throw new CliError('INVALID_USAGE', `Invalid --severity '${value}'. Supported: error, warning, info.`);
      }
    } else if (option === '--file' || option === '--filter-file') {
      file = value;
    } else if (option === '--node-id' || option === '--filter-node') {
      nodeId = value;
    } else if (option === '--limit') {
      limit = positiveInteger(value, option);
    } else {
      throw new CliError('INVALID_USAGE', `Unknown or invalid option: ${option}.`);
    }
  }

  const hasFormatArg = arguments_.includes('--format');
  if (query && !hasFormatArg) {
    format = 'text';
  }

  if (query === 'detail' && !findingId) {
    throw new CliError('INVALID_USAGE', '--query detail requires --finding-id <id>.');
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
      { recovery: "Run 'anwc check anwc.checks.json [--output artifacts/ui]'." }
    );
  }
  const manifestFile = arguments_[1];
  let outputDir: string | undefined;

  for (let index = 2; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new CliError('INVALID_USAGE', `${option} requires a value.`);
    index += 1;
    if (option === '--output') {
      outputDir = value;
    } else {
      throw new CliError('INVALID_USAGE', `Unknown or invalid option: ${option}.`);
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
      { recovery: "Run 'anwc diff before.json after.json [--format html|markdown|text|json] [--output path]'." }
    );
  }
  const beforeFile = arguments_[1];
  const afterFile = arguments_[2];
  let format: 'html' | 'markdown' | 'text' | 'json' = 'html';
  let output: string | undefined;

  for (let index = 3; index < arguments_.length; index += 1) {
    const option = arguments_[index]!;
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new CliError('INVALID_USAGE', `${option} requires a value.`);
    index += 1;
    if (option === '--format') {
      if (value !== 'html' && value !== 'markdown' && value !== 'text' && value !== 'json') {
        throw new CliError('INVALID_USAGE', `Unsupported diff format '${value}'. Use 'html', 'markdown', 'text', or 'json'.`);
      }
      format = value;
    } else if (option === '--output') {
      output = value;
    } else {
      throw new CliError('INVALID_USAGE', `Unknown or invalid option: ${option}.`);
    }
  }

  return { beforeFile, afterFile, format, output };
}

async function capturePage(page: Page, options: InspectOptions): Promise<RawCapture> {
  if (options.runtimeOnly) await page.addScriptTag({ content: await runtimeScript() });
  try {
    await page.waitForFunction(() => Boolean((window as Window & { __ANWC__?: unknown }).__ANWC__), undefined, { timeout: Math.min(options.timeoutMs, 2_000) });
  } catch (error) {
    throw new CliError(
      'RUNTIME_MISSING',
      'ANWC runtime is not present on this page.',
      {
        cause: error instanceof Error ? error.message : String(error),
        recovery: "Ensure '@anwc/vite-plugin' is added to plugins in vite.config.ts before '@vitejs/plugin-react', the dev server is running in development mode (e.g. 'npm run dev'), and the page loaded without errors. For uninstrumented pages, pass '--runtime-only'."
      }
    );
  }
  try {
    return await new Promise<RawCapture>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new CliError(
        'TIMEOUT',
        'Runtime capture exceeded the timeout budget.',
        { recovery: `Capture timed out after ${options.timeoutMs}ms. Check for infinite loops or pending fonts, or increase the timeout using '--timeout-ms ${options.timeoutMs * 2}'.` }
      )), options.timeoutMs);
      async function doCapture(): Promise<RawCapture> {
        try {
          return await page.evaluate(async (captureOptions) => {
            const api = (window as Window & { __ANWC__?: RuntimeApi }).__ANWC__;
            if (!api) throw new Error('ANWC runtime disappeared before capture.');
            return api.capture(captureOptions);
          }, { textLimit: 160, timeoutMs: options.timeoutMs });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Execution context was destroyed') || msg.includes('navigation')) {
            await page.waitForFunction(() => Boolean((window as Window & { __ANWC__?: unknown }).__ANWC__), undefined, { timeout: Math.min(options.timeoutMs, 5_000) });
            return await page.evaluate(async (captureOptions) => {
              const api = (window as Window & { __ANWC__?: RuntimeApi }).__ANWC__;
              if (!api) throw new Error('ANWC runtime disappeared before capture.');
              return api.capture(captureOptions);
            }, { textLimit: 160, timeoutMs: options.timeoutMs });
          }
          throw err;
        }
      }
      doCapture().then(
        (capture) => { clearTimeout(timeout); resolve(capture); },
        (error: unknown) => { clearTimeout(timeout); reject(error); }
      );
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('INTERNAL', error instanceof Error ? error.message : 'The ANWC runtime failed during capture.');
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
        { cause: 'BROWSER_MISSING', recovery: "Run 'npx playwright install chromium' in your project terminal." }
      );
    }
    throw error;
  }
  try {
    const context = await browser.newContext({ viewport: options.viewport });
    try {
      const page = await context.newPage();
      try {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      } catch (error) {
        throw new CliError(
          'NAVIGATION_FAILED',
          error instanceof Error ? error.message : 'Navigation failed.',
          { recovery: `Could not navigate to '${options.url}'. Ensure the development server is running and accessible (e.g. 'npm run dev').` }
        );
      }
      if (options.readySelector) {
        try {
          await page.locator(options.readySelector).waitFor({ state: 'attached', timeout: options.timeoutMs });
        } catch (error) {
          throw new CliError(
            'TIMEOUT',
            error instanceof Error ? error.message : 'Readiness selector timed out.',
            { recovery: `Selector '${options.readySelector}' was not attached within ${options.timeoutMs}ms.` }
          );
        }
      }
      const capture = rawCaptureSchema.parse(await capturePage(page, options));
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
  let inspectOptions: InspectOptions | undefined;
  let reportOptions: ReportCommandOptions | undefined;
  try {
    if (arguments_[0] === 'report') {
      reportOptions = parseReportArguments(arguments_);
      let content: string;
      try {
        content = await readFile(reportOptions.captureFile, 'utf8');
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Cannot read capture file '${reportOptions.captureFile}': ${error instanceof Error ? error.message : String(error)}`);
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Capture file '${reportOptions.captureFile}' is not valid JSON.`);
      }
      let snapshot: Snapshot | null = null;
      let report: Report | null = null;
      const snapResult = snapshotSchema.safeParse(parsedJson);
      if (snapResult.success) {
        snapshot = snapResult.data;
        report = createReport(snapshot);
      } else {
        const repResult = reportSchema.safeParse(parsedJson);
        if (repResult.success) {
          report = repResult.data;
        } else {
          throw new CliError('INVALID_USAGE', `Capture file '${reportOptions.captureFile}' does not match Snapshot 0.1 or Report 0.1 schema.`);
        }
      }

      let output: string;
      const inputObj = snapshot ?? report!;
      if (reportOptions.query === 'detail') {
        const detail = queryFindingDetail(inputObj, reportOptions.findingId!);
        if (!detail) {
          throw new CliError('INVALID_USAGE', `Finding '${reportOptions.findingId}' was not found in report.`);
        }
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
        output = reportOptions.format === 'json' ? JSON.stringify(summary, null, 2) : formatAgentSummaryText(summary);
      } else if (reportOptions.format === 'html') {
        output = renderReportHtml(report!, { redact: reportOptions.redact });
      } else if (reportOptions.format === 'markdown') {
        output = renderReportMarkdown(report!, { redact: reportOptions.redact });
      } else if (reportOptions.format === 'text') {
        output = formatReportText(report!);
      } else {
        output = JSON.stringify(report!, null, 2);
      }

      if (reportOptions.output) {
        await mkdir(dirname(reportOptions.output), { recursive: true });
        await writeFile(reportOptions.output, output, 'utf8');
      } else {
        io.stdout(`${output}\n`);
      }
      return 0;
    }

    if (arguments_[0] === 'check') {
      const checkOptions = parseCheckArguments(arguments_);
      let content: string;
      try {
        content = await readFile(checkOptions.manifestFile, 'utf8');
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Cannot read manifest file '${checkOptions.manifestFile}': ${error instanceof Error ? error.message : String(error)}`);
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Manifest file '${checkOptions.manifestFile}' is not valid JSON.`);
      }
      let manifest: StateManifest;
      try {
        manifest = stateManifestSchema.parse(parsedJson);
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Manifest file '${checkOptions.manifestFile}' does not match StateManifest 0.1 schema: ${error instanceof Error ? error.message : String(error)}`);
      }

      const runResult = await runCheckSuite({
        manifest,
        manifestRaw: content,
        outputDir: checkOptions.outputDir,
        runtimeScriptProvider: runtimeScript
      });

      io.stdout(`${JSON.stringify(runResult, null, 2)}\n`);
      return runResult.passedAll ? 0 : 1;
    }

    if (arguments_[0] === 'diff') {
      const diffOptions = parseDiffArguments(arguments_);
      let beforeContent: string;
      try {
        beforeContent = await readFile(diffOptions.beforeFile, 'utf8');
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Cannot read before capture file '${diffOptions.beforeFile}': ${error instanceof Error ? error.message : String(error)}`);
      }
      let afterContent: string;
      try {
        afterContent = await readFile(diffOptions.afterFile, 'utf8');
      } catch (error) {
        throw new CliError('INVALID_USAGE', `Cannot read after capture file '${diffOptions.afterFile}': ${error instanceof Error ? error.message : String(error)}`);
      }

      let beforeJson: unknown;
      try {
        beforeJson = JSON.parse(beforeContent);
      } catch {
        throw new CliError('INVALID_USAGE', `Before capture file '${diffOptions.beforeFile}' is not valid JSON.`);
      }

      let afterJson: unknown;
      try {
        afterJson = JSON.parse(afterContent);
      } catch {
        throw new CliError('INVALID_USAGE', `After capture file '${diffOptions.afterFile}' is not valid JSON.`);
      }

      const diffResult = compareRepairs(beforeJson as Snapshot, afterJson as Snapshot);
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

      if (diffOptions.output) {
        await mkdir(dirname(diffOptions.output), { recursive: true });
        await writeFile(diffOptions.output, diffOutput, 'utf8');
      } else {
        io.stdout(diffOutput.endsWith('\n') ? diffOutput : `${diffOutput}\n`);
      }

      return diffResult.summary.repairIntegrityVerdict === 'verified-repair' ? 0 : 1;
    }

    inspectOptions = parseArguments(arguments_);
    const snapshot = await inspect(inspectOptions);
    const output = inspectOptions.format === 'json' ? `${JSON.stringify(snapshot)}\n` : `${formatText(snapshot, inspectOptions.limit, inspectOptions.maxChars)}\n`;
    if (inspectOptions.output) {
      await mkdir(dirname(inspectOptions.output), { recursive: true });
      await writeFile(inspectOptions.output, output, 'utf8');
    } else io.stdout(output);
    return exitCode(snapshot, inspectOptions.failOn);
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError('INTERNAL', error instanceof Error ? error.message : 'Unexpected CLI failure.');
    const report = envelope(cliError);
    const wantsJson = inspectOptions?.format === 'json' || reportOptions?.format === 'json' || (arguments_.includes('--format') && arguments_[arguments_.indexOf('--format') + 1] === 'json');
    if (wantsJson) {
      io.stdout(`${JSON.stringify(report)}\n`);
    } else {
      io.stderr(`ANWC ${report.error.code}: ${report.error.message}\n`);
      const recovery = (report.error.details as { recovery?: string } | null)?.recovery;
      if (recovery) {
        io.stderr(`  Recovery: ${recovery}\n`);
      }
    }
    return cliError.code === 'PARTIAL_CAPTURE' ? 3 : 2;
  }
}

export * from './manifest.js';
export * from './runner.js';
