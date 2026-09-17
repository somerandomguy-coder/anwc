import type { Report, ReportFinding } from './schema.js';

export const MIN_TEXT_BUDGET = 80;

function printable(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`);
}

function truncateLabel(label: string, maxLen = 120): string {
  const clean = printable(label);
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3)}...`;
}

function formatFindingBlock(finding: ReportFinding): string {
  const target = finding.target;
  const tag = target.tag ? `<${target.tag}>` : '<element>';
  const targetLabel = target.label
    ? ` "${truncateLabel(target.label)}"`
    : (target.semanticKey ? ` [${target.semanticKey}]` : '');
  const source = target.source
    ? `${target.source.file}:${target.source.line}:${target.source.column}`
    : 'source unavailable (uninstrumented node)';

  const lines: string[] = [
    `${finding.severity.toUpperCase()} ${finding.code} ${tag}${targetLabel} (node ${target.nodeId})`,
    `  source: ${source}`,
    `  message: ${printable(finding.message)}`,
    `  evidence: ${printable(finding.measuredVsExpected.measured)}`
  ];

  if (finding.measuredVsExpected.expected) {
    lines.push(`  expected: ${printable(finding.measuredVsExpected.expected)}`);
  }

  if (finding.blockers.length > 0) {
    const blockerDesc = finding.blockers.map((b) => {
      const bTag = b.tag ? `<${b.tag}>` : '<element>';
      const bLabel = b.label ? ` "${truncateLabel(b.label)}"` : '';
      const bSource = b.source ? ` at ${b.source.file}:${b.source.line}:${b.source.column}` : '';
      return `${bTag}${bLabel} (node ${b.nodeId})${bSource}`;
    }).join(', ');
    lines.push(`  blocker: ${blockerDesc}`);
  }

  if (finding.clipAncestors.length > 0) {
    const clipDesc = finding.clipAncestors.map((c) => {
      const cTag = c.tag ? `<${c.tag}>` : '<element>';
      const cLabel = c.label ? ` "${truncateLabel(c.label)}"` : '';
      const cSource = c.source ? ` at ${c.source.file}:${c.source.line}:${c.source.column}` : '';
      return `${cTag}${cLabel} (node ${c.nodeId})${cSource}`;
    }).join(', ');
    lines.push(`  clip ancestor: ${clipDesc}`);
  }

  if (finding.limitations.length > 0) {
    lines.push(`  limitations: ${printable(finding.limitations.join('; '))}`);
  }

  if (finding.suggestion) {
    lines.push(`  suggestion: ${printable(finding.suggestion)}`);
  }

  return lines.join('\n');
}

function buildFooter(shown: number, omitted: number, report: Report): string {
  const completeText = report.coverage.complete ? 'complete capture' : 'partial capture';
  const settledText = report.readiness.settled ? ', settled' : ', unsettled';
  const lines: string[] = [
    `${shown} findings | ${omitted} omitted | ${completeText}${settledText} | paint visibility unknown | no screenshots captured`
  ];

  if (omitted > 0) {
    lines.push(`Note: ${omitted} finding(s) omitted. Increase limit with --limit <N> or view full report with --format json.`);
  }

  lines.push('Drilldown: re-run with --format json (or --format json --output report.json) for full raw layout, hit samples, and DOM tree.');
  return lines.join('\n');
}

export function formatReportText(report: Report, options?: { limit?: number; maxChars?: number }): string {
  const limit = options?.limit ?? 40;
  const maxChars = options?.maxChars ?? 12_000;

  const coverageStatus = report.coverage.complete ? 'complete' : 'partial';
  const readinessStatus = report.readiness.settled ? ', settled' : ', unsettled';
  const header = `ANWC ${report.schemaVersion} | ${report.page.viewport.width}x${report.page.viewport.height} | capture ${report.input.captureId} | ${coverageStatus}${readinessStatus}`;

  if (report.summary.totalFindings === 0) {
    let zeroFindingsMsg = '0 actionable findings for inspected rules (note: paint visibility unknown, no screenshots captured)';
    if (report.summary.status === 'incomplete') {
      const reasons = [...report.coverage.reasons, ...report.readiness.reasons];
      const reasonsNote = reasons.length > 0 ? ` [${reasons.join('; ')}]` : '';
      zeroFindingsMsg = `0 actionable findings for inspected rules (INCOMPLETE CAPTURE: capture is ${coverageStatus}${readinessStatus}${reasonsNote}; paint visibility unknown, no screenshots captured)`;
    }
    const drilldown = 'Drilldown: re-run with --format json (or --format json --output report.json) for full raw layout, hit samples, and DOM tree.';
    const result = `${header}\n${zeroFindingsMsg}\n${drilldown}`;
    if (result.length > maxChars) {
      return result.slice(0, maxChars);
    }
    return result;
  }

  // Pre-calculate worst-case footer to know minimum budget for structural output
  const sampleFooter = buildFooter(report.summary.totalFindings, report.summary.totalFindings, report);
  const minStructuralBudget = header.length + sampleFooter.length + 2;

  if (maxChars < minStructuralBudget) {
    const notice = '\n... text output truncated by --max-chars (increase with --max-chars <N>) ...';
    if (maxChars <= notice.length) {
      return header.slice(0, maxChars);
    }
    const head = header.slice(0, maxChars - notice.length);
    return `${head}${notice}`;
  }

  const renderedSections: string[] = [header];
  let currentLen = header.length + 1;
  let shownCount = 0;
  const totalFindings = report.summary.totalFindings;

  for (const group of report.groups) {
    if (shownCount >= limit) break;

    const groupHeader = group.relation.kind !== 'independent'
      ? `RELATION ${group.relation.label} [${group.findings.length} affected instances]\n  note: ${group.relation.note}`
      : null;

    let groupHeaderAdded = false;

    for (const finding of group.findings) {
      if (shownCount >= limit) break;

      const block = formatFindingBlock(finding);
      const neededLen = (groupHeader && !groupHeaderAdded ? groupHeader.length + 1 : 0) + block.length + 1;

      // Ensure that adding this block still leaves room for the reserved footer
      const projectedFooter = buildFooter(shownCount + 1, totalFindings - (shownCount + 1), report);
      if (currentLen + neededLen + projectedFooter.length > maxChars) {
        // Exceeds budget: cannot fit this whole finding and the reserved footer
        break;
      }

      if (groupHeader && !groupHeaderAdded) {
        renderedSections.push(groupHeader);
        currentLen += groupHeader.length + 1;
        groupHeaderAdded = true;
      }

      renderedSections.push(block);
      currentLen += block.length + 1;
      shownCount += 1;
    }
  }

  const omittedCount = totalFindings - shownCount;
  const footer = buildFooter(shownCount, omittedCount, report);
  renderedSections.push(footer);

  const result = renderedSections.join('\n');
  return result;
}
