import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { diagnose } from '@anwc/diagnostics';
import { errorEnvelopeSchema, inspectOptionsSchema, rawCaptureSchema, snapshotSchema } from '@anwc/protocol';
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
      void page.evaluate(async (captureOptions) => {
        const api = (window as Window & { __ANWC__?: RuntimeApi }).__ANWC__;
        if (!api) throw new Error('ANWC runtime disappeared before capture.');
        return api.capture(captureOptions);
      }, { textLimit: 160, timeoutMs: options.timeoutMs }).then(
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
  const nodeMap = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const lines: string[] = [
    `ANWC ${snapshot.schemaVersion} | ${snapshot.page.viewport.width}x${snapshot.page.viewport.height} | capture ${snapshot.captureId} | ${snapshot.coverage.complete ? 'complete' : 'partial'}${snapshot.readiness.settled ? ', settled' : ', unsettled'}`
  ];

  if (snapshot.findings.length === 0) {
    lines.push('0 actionable findings for inspected rules (note: paint visibility unknown, no screenshots captured)');
  } else {
    let shown = 0;
    for (const finding of snapshot.findings) {
      if (shown >= limit) break;
      const node = nodeMap.get(finding.nodeId);
      const tag = node ? `<${node.tag}>` : '<element>';
      const targetLabel = node?.label ? ` "${printable(node.label)}"` : (node?.semanticKey ? ` [${node.semanticKey}]` : '');
      const source = finding.source
        ? `${finding.source.file}:${finding.source.line}:${finding.source.column}`
        : 'source unavailable (uninstrumented node)';

      lines.push(`${finding.severity.toUpperCase()} ${finding.code} ${tag}${targetLabel} (node ${finding.nodeId})`);
      lines.push(`  source: ${source}`);
      lines.push(`  message: ${printable(finding.message)}`);

      const ev = finding.evidence;
      if (ev.kind === 'pointer-blocked') {
        lines.push(`  evidence: tested ${ev.tested} sample points, ${ev.blocked} blocked`);
        if (ev.blockerNodeIds.length > 0) {
          const blockerDesc = ev.blockerNodeIds.map((bid) => {
            const bNode = nodeMap.get(bid);
            const bTag = bNode ? `<${bNode.tag}>` : '<element>';
            const bLabel = bNode?.label ? ` "${printable(bNode.label)}"` : '';
            const bSource = bNode?.source ? ` at ${bNode.source.file}:${bNode.source.line}:${bNode.source.column}` : '';
            return `${bTag}${bLabel} (node ${bid})${bSource}`;
          }).join(', ');
          lines.push(`  blocker: ${blockerDesc}`);
        }
      } else if (ev.kind === 'horizontal-overflow') {
        const overflow = ev.scrollWidth - ev.clientWidth;
        lines.push(`  evidence: measured scrollWidth ${ev.scrollWidth}px vs clientWidth ${ev.clientWidth}px (${overflow}px horizontal overflow)`);
      } else if (ev.kind === 'clipped-by-ancestor') {
        const pct = Math.round((1 - ev.boxFraction) * 100);
        const ancestors = ev.ancestorNodeIds.map((aid) => {
          const aNode = nodeMap.get(aid);
          return `<${aNode?.tag || 'element'}> (${aid})`;
        }).join(', ');
        lines.push(`  evidence: box is ${pct}% clipped by ancestor(s) ${ancestors}`);
      } else if (ev.kind === 'text-clipped') {
        lines.push(`  evidence: ${ev.clippedFragmentCount} text fragment(s) clipped across ${ev.lineCount} line(s)`);
      } else if (ev.kind === 'text-line-budget-exceeded') {
        lines.push(`  evidence: observed ${ev.observedLines} lines exceeds maximum allowed ${ev.maxLines} lines`);
      } else if (ev.kind === 'expected-visible-but-hidden') {
        lines.push(`  evidence: expected ${ev.expectedCurrent} but element is hidden (${ev.hiddenReasons.join(', ')})`);
      }

      if (finding.limitations.length > 0) {
        lines.push(`  limitations: ${finding.limitations.join('; ')}`);
      }
      if (finding.suggestion) {
        lines.push(`  suggestion: ${finding.suggestion}`);
      }
      shown += 1;
    }

    const omitted = snapshot.findings.length - shown;
    lines.push(`${shown} findings | ${omitted} omitted | ${snapshot.coverage.complete ? 'complete capture' : 'partial capture'} | paint visibility unknown | no screenshots captured`);
    if (omitted > 0) {
      lines.push(`Note: ${omitted} finding(s) omitted. Increase limit with --limit <N> or view full report with --format json.`);
    }
  }

  lines.push('Drilldown: re-run with --format json or --output report.json for full raw layout, hit samples, and DOM tree.');
  let output = lines.join('\n');
  if (output.length > maxChars) {
    output = `${output.slice(0, Math.max(0, maxChars - 55))}\n... text output truncated by --max-chars (increase with --max-chars <N>) ...`;
  }
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
    const wantsJson = options?.format === 'json' || (arguments_.includes('--format') && arguments_[arguments_.indexOf('--format') + 1] === 'json');
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

