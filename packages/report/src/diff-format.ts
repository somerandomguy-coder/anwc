import type { DiffReport } from './diff-schema.js';
import { VERDICT_REASON_TEXT } from './verdict-schema.js';

export function formatDiffText(diff: DiffReport): string {
  const lines: string[] = [];

  lines.push(`ANWC Repair Comparison: ${diff.diffId}`);
  lines.push(`Generated: ${diff.generatedAt}`);
  lines.push(`Verdict: ${diff.summary.repairIntegrityVerdict.toUpperCase()}`);
  if (diff.summary.verdictReason) lines.push(`Reason: ${diff.summary.verdictReason}`);
  lines.push('----------------------------------------');
  lines.push(`Before Capture: ${diff.before.captureId} (${diff.before.viewport.width}x${diff.before.viewport.height}) - ${diff.before.actionableFindings} finding(s)`);
  lines.push(`After Capture:  ${diff.after.captureId} (${diff.after.viewport.width}x${diff.after.viewport.height}) - ${diff.after.actionableFindings} finding(s)`);

  const v = diff.summary.verdicts;
  lines.push(`Finding verdicts: ${v.verified} verified, ${v.unverified} unverified, ${v.contradicted} contradicted`);

  if (!diff.compatibility.comparable) {
    lines.push('\n[!] COMPARISON INCOMPATIBLE');
    for (const reason of diff.compatibility.reasons) {
      lines.push(`  - ${reason}`);
    }
    return lines.join('\n');
  }

  lines.push('\nSummary:');
  lines.push(`  Verified Fixed: ${diff.summary.verifiedFixed}`);
  lines.push(`  Persistent:     ${diff.summary.persistent}`);
  lines.push(`  New Findings:   ${diff.summary.newFindings}`);
  lines.push(`  Inconclusive:   ${diff.summary.inconclusive}`);

  lines.push('\nFindings Comparison:');
  for (const f of diff.findings) {
    const icon =
      f.status === 'verified-fixed'
        ? '[FIXED]'
        : f.status === 'persistent'
        ? '[PERSIST]'
        : f.status === 'new-finding'
        ? '[NEW REGRESSION]'
        : f.status === 'inconclusive'
        ? '[INCONCLUSIVE]'
        : '[NON-COMP]';

    lines.push(`  ${icon} ${f.ruleCode} on ${f.target.label || f.target.tag} (${f.targetKey})`);
    lines.push(`    Verdict: ${f.verdict}(${f.reason}) - ${VERDICT_REASON_TEXT[f.reason]}`);
    lines.push(`    Explanation: ${f.explanation}`);
    if (f.beforeFinding) {
      lines.push(`    Before: ${f.beforeFinding.message}`);
    }
    if (f.afterFinding) {
      lines.push(`    After:  ${f.afterFinding.message}`);
    }
  }

  return lines.join('\n');
}
