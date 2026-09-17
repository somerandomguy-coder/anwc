import type { DiffReport } from './diff-schema.js';

export function renderDiffMarkdown(diff: DiffReport): string {
  const lines: string[] = [];

  const verdictBadge =
    diff.summary.repairIntegrityVerdict === 'verified-repair'
      ? '**Verified Repair**'
      : diff.summary.repairIntegrityVerdict === 'unresolved-defects'
      ? '**Unresolved Defects**'
      : diff.summary.repairIntegrityVerdict === 'regressions-introduced'
      ? '**Regressions Introduced**'
      : diff.summary.repairIntegrityVerdict === 'inconclusive-evidence'
      ? '**Inconclusive Evidence**'
      : '**Incompatible Comparison**';

  lines.push(`# ANWC Repair Diff: ${verdictBadge}\n`);
  lines.push(`- **Diff ID**: \`${diff.diffId}\``);
  lines.push(`- **Generated**: ${diff.generatedAt}`);
  lines.push(`- **Before**: \`${diff.before.captureId}\` (${diff.before.actionableFindings} actionable findings)`);
  lines.push(`- **After**: \`${diff.after.captureId}\` (${diff.after.actionableFindings} actionable findings)\n`);

  if (!diff.compatibility.comparable) {
    lines.push('### Incompatible Comparison');
    lines.push('This comparison cannot certify repair integrity because inputs differ in execution environment:');
    for (const r of diff.compatibility.reasons) {
      lines.push(`- ${r}`);
    }
    return lines.join('\n');
  }

  lines.push('### Summary\n');
  lines.push('| Status | Count |');
  lines.push('| --- | --- |');
  lines.push(`| Verified Fixed | ${diff.summary.verifiedFixed} |`);
  lines.push(`| Persistent | ${diff.summary.persistent} |`);
  lines.push(`| New Findings (Regressions) | ${diff.summary.newFindings} |`);
  lines.push(`| Inconclusive | ${diff.summary.inconclusive} |\n`);

  lines.push('### Finding Details\n');
  for (const f of diff.findings) {
    const badge =
      f.status === 'verified-fixed'
        ? 'Fixed'
        : f.status === 'persistent'
        ? 'Persistent'
        : f.status === 'new-finding'
        ? 'Regression'
        : 'Inconclusive';

    lines.push(`#### [${badge}] ${f.ruleCode} — \`${f.targetKey}\``);
    lines.push(`- **Target**: \`<${f.target.tag}>\` "${f.target.label}"`);
    if (f.target.source) {
      lines.push(`- **Source**: \`${f.target.source.file}:${f.target.source.line}\``);
    }
    lines.push(`- **Verdict**: ${f.explanation}`);
    if (f.beforeFinding) {
      lines.push(`- **Before**: ${f.beforeFinding.message}`);
    }
    if (f.afterFinding) {
      lines.push(`- **After**: ${f.afterFinding.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
