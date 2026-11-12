import type { DiffReport } from './diff-schema.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function renderDiffHtml(diff: DiffReport): string {
  const verdict = diff.summary.repairIntegrityVerdict;
  const verdictClass =
    verdict === 'verified-repair'
      ? 'status-pass'
      : verdict === 'unresolved-defects'
      ? 'status-warning'
      : verdict === 'regressions-introduced'
      ? 'status-error'
      : 'status-incomplete';

  const verdictText =
    verdict === 'verified-repair'
      ? 'Verified Repair'
      : verdict === 'unresolved-defects'
      ? 'Unresolved Defects'
      : verdict === 'regressions-introduced'
      ? 'Regressions Introduced'
      : verdict === 'inconclusive-evidence'
      ? 'Inconclusive Evidence'
      : 'Incompatible Comparison';

  const findingsRows = diff.findings
    .map((f) => {
      const statusBadge =
        f.status === 'verified-fixed'
          ? '<span class="badge badge-fixed">Fixed</span>'
          : f.status === 'persistent'
          ? '<span class="badge badge-persistent">Persistent</span>'
          : f.status === 'new-finding'
          ? '<span class="badge badge-regression">Regression</span>'
          : '<span class="badge badge-inconclusive">Inconclusive</span>';

      return `<tr>
        <td>${statusBadge}</td>
        <td><code>${escapeHtml(f.ruleCode)}</code></td>
        <td>
          <strong>${escapeHtml(f.target.label || f.target.tag)}</strong><br>
          <small>${escapeHtml(f.targetKey)}</small>
        </td>
        <td>${escapeHtml(f.explanation)}</td>
        <td><small>${f.beforeFinding ? escapeHtml(f.beforeFinding.message) : '<em>None</em>'}</small></td>
        <td><small>${f.afterFinding ? escapeHtml(f.afterFinding.message) : '<em>None</em>'}</small></td>
      </tr>`;
    })
    .join('\n');

  const compatibilityNotice = !diff.compatibility.comparable
    ? `<div class="alert alert-error">
        <strong>Incompatible Comparison:</strong>
        <ul>${diff.compatibility.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ANWC Repair Comparison: ${escapeHtml(diff.diffId)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: #334155;
      --pass: #22c55e;
      --error: #ef4444;
      --warning: #f59e0b;
      --info: #38bdf8;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 2rem;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: var(--card-bg);
      padding: 1.5rem 2rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-pass, .badge-fixed { background: rgba(34, 197, 94, 0.2); color: var(--pass); border: 1px solid var(--pass); }
    .status-error, .badge-regression { background: rgba(239, 68, 68, 0.2); color: var(--error); border: 1px solid var(--error); }
    .status-warning, .badge-persistent { background: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .status-incomplete, .badge-inconclusive { background: rgba(56, 189, 248, 0.2); color: var(--info); border: 1px solid var(--info); }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stat-card {
      background: var(--card-bg);
      padding: 1.25rem;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .stat-card .val { font-size: 2rem; font-weight: 700; }
    .stat-card .lbl { color: var(--muted); font-size: 0.85rem; }
    .alert { padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
    .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--error); color: #fca5a5; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: #182234; color: var(--muted); font-size: 0.85rem; text-transform: uppercase; }
    code { font-family: ui-monospace, monospace; background: #0b1120; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 style="margin: 0 0 0.5rem 0;">ANWC Repair Comparison</h1>
        <small style="color: var(--muted);">Diff ID: ${escapeHtml(diff.diffId)} | Generated: ${escapeHtml(diff.generatedAt)}</small>
      </div>
      <div class="badge ${verdictClass}" style="font-size: 1rem; padding: 0.5rem 1rem;">
        ${verdictText}
      </div>
    </div>

    ${diff.summary.verdictReason ? `<p class="verdict-reason">${escapeHtml(diff.summary.verdictReason)}</p>` : ''}

    ${compatibilityNotice}

    <div class="summary-grid">
      <div class="stat-card">
        <div class="lbl">Verified Fixed</div>
        <div class="val" style="color: var(--pass);">${diff.summary.verifiedFixed}</div>
      </div>
      <div class="stat-card">
        <div class="lbl">Persistent Defects</div>
        <div class="val" style="color: var(--warning);">${diff.summary.persistent}</div>
      </div>
      <div class="stat-card">
        <div class="lbl">New Regressions</div>
        <div class="val" style="color: var(--error);">${diff.summary.newFindings}</div>
      </div>
      <div class="stat-card">
        <div class="lbl">Inconclusive</div>
        <div class="val" style="color: var(--info);">${diff.summary.inconclusive}</div>
      </div>
    </div>

    <h2>Findings Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Rule</th>
          <th>Target</th>
          <th>Verdict</th>
          <th>Before Finding</th>
          <th>After Finding</th>
        </tr>
      </thead>
      <tbody>
        ${findingsRows || '<tr><td colspan="6" style="text-align:center; color: var(--muted);">No findings compared.</td></tr>'}
      </tbody>
    </table>

    <script id="diff-data" type="application/json">
      ${escapeJsonForScript(JSON.stringify(diff))}
    </script>
  </div>
</body>
</html>`;
}
