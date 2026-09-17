import type { Report, ReportFinding, ReportNodeRef } from './schema.js';

export interface ReportMarkdownOptions {
  redact?: boolean;
  title?: string;
}

function escapeMarkdown(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function sanitizeUrl(rawUrl: string, redact = false): string {
  try {
    const parsed = new URL(rawUrl);
    if (redact) {
      parsed.search = '';
      parsed.hash = '';
    }
    const href = parsed.toString();
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:') {
      return href;
    }
    return 'about:blank';
  } catch {
    return 'about:blank';
  }
}

function sanitizeSource(file: string | null | undefined, redact = false): string {
  if (!file) return 'unknown source';
  let normalized = file.replace(/\\/g, '/');
  if (redact) {
    const userMatch = /^(?:\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\/Users\/[^/]+)\/(.*)$/.exec(normalized);
    if (userMatch && userMatch[1]) normalized = userMatch[1];
  }
  return normalized;
}

function formatSourceLoc(source: ReportNodeRef['source'], redact = false): string {
  if (!source) return 'unknown';
  const file = sanitizeSource(source.file, redact);
  return `${file}:${source.line}:${source.column}`;
}

export function renderReportMarkdown(report: Report, options: ReportMarkdownOptions = {}): string {
  const redact = options.redact ?? false;
  const pageUrl = sanitizeUrl(report.page.url, redact);
  const title = options.title ?? (report.page.title ? `ANWC UI Repair Report — ${report.page.title}` : 'ANWC UI Repair Report');
  const isComplete = report.coverage.complete && report.readiness.settled;

  const lines: string[] = [];

  lines.push(`# ${escapeMarkdown(title)}`);
  lines.push('');

  if (redact) {
    lines.push('> [!IMPORTANT]');
    lines.push('> **[REDACTED EXPORT]** Query parameters and sensitive system paths have been redacted from this report.');
    lines.push('');
  }

  if (!isComplete) {
    lines.push('> [!WARNING]');
    lines.push('> **Incomplete or Unsettled Capture:**');
    if (!report.coverage.complete) {
      lines.push(`> - Coverage incomplete: ${escapeMarkdown(report.coverage.reasons.join('; ') || 'Unknown')}`);
    }
    if (!report.readiness.settled) {
      lines.push(`> - Readiness unsettled: ${escapeMarkdown(report.readiness.reasons.join('; ') || 'Did not reach network/dom idle')}`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Target URL:** \`${pageUrl}\``);
  lines.push(`- **Viewport:** ${report.page.viewport.width}x${report.page.viewport.height} @ ${report.page.devicePixelRatio}x`);
  lines.push(`- **Status:** **${report.summary.status.toUpperCase()}**`);
  lines.push(`- **Capture SHA-256:** \`${report.input.captureHash.slice(0, 16)}...\``);
  lines.push(`- **Environment:** ${report.environment.browser} ${report.environment.browserVersion}`);
  lines.push('');

  lines.push('| Severity | Count |');
  lines.push('| :--- | :--- |');
  lines.push(`| Unacknowledged Errors | ${report.summary.unacknowledgedErrors} |`);
  lines.push(`| Unacknowledged Warnings | ${report.summary.unacknowledgedWarnings} |`);
  lines.push(`| Informational | ${report.summary.informational} |`);
  lines.push(`| Acknowledged | ${report.summary.acknowledged} |`);
  lines.push(`| **Total Findings** | **${report.summary.totalFindings}** |`);
  lines.push('');

  const allFindings: ReportFinding[] = report.groups.flatMap((g) => g.findings);

  lines.push(`## Findings (${allFindings.length})`);
  lines.push('');

  if (allFindings.length === 0) {
    lines.push('No findings recorded.');
    lines.push('');
  } else {
    for (const [idx, f] of allFindings.entries()) {
      const targetSource = formatSourceLoc(f.target.source, redact);
      const ackTag = f.acknowledged ? ' *(acknowledged)*' : '';
      lines.push(`### ${idx + 1}. [${f.severity.toUpperCase()}] ${escapeMarkdown(f.code)}${ackTag}`);
      lines.push(`- **Message:** ${escapeMarkdown(f.message)}`);
      lines.push(`- **Target:** \`<${f.target.tag}>\`${f.target.role ? ` (role: \`${f.target.role}\`)` : ''}${f.target.label ? ` "${escapeMarkdown(f.target.label)}"` : ''}`);
      lines.push(`- **Source:** \`${targetSource}\`${f.target.semanticKey ? ` [key: \`${f.target.semanticKey}\`]` : ''}`);

      if (f.blockers.length > 0) {
        const b = f.blockers[0]!;
        lines.push(`- **Blocker:** \`<${b.tag}>\`${b.role ? ` (role: \`${b.role}\`)` : ''} at \`${formatSourceLoc(b.source, redact)}\``);
      }
      if (f.clipAncestors.length > 0) {
        const c = f.clipAncestors[0]!;
        lines.push(`- **Clip Ancestor:** \`<${c.tag}>\` at \`${formatSourceLoc(c.source, redact)}\``);
      }

      lines.push(`- **Measured vs Expected:** Measured: \`${escapeMarkdown(f.measuredVsExpected.measured)}\`${f.measuredVsExpected.expected ? ` | Expected: \`${escapeMarkdown(f.measuredVsExpected.expected)}\`` : ''}`);

      if (f.suggestion) {
        lines.push(`- **Suggestion:** ${escapeMarkdown(f.suggestion)}`);
      }
      if (f.limitations.length > 0) {
        lines.push(`- **Limitations:** ${escapeMarkdown(f.limitations.join('; '))}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*Report generated by ANWC (Automated Non-Visual Web Checker).*');
  lines.push('');

  return lines.join('\n');
}
