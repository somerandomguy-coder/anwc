import { noFindingsStatement, partialCaptureFacts } from './model.js';
import type { Report, ReportFinding, ReportNodeRef } from './schema.js';

export interface ReportHtmlOptions {
  redact?: boolean;
  title?: string;
}

function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/** "Chrome 134.0.6998.35" from a full user-agent string; other values pass through. */
function shortBrowser(name: string, version: string): string {
  const match = /(?:Headless)?Chrome\/([\d.]+)/.exec(version) ?? /(?:Headless)?Chrome\/([\d.]+)/.exec(name);
  return match ? `Chrome ${match[1]}` : `${name} ${version}`;
}

export function renderReportHtml(report: Report, options: ReportHtmlOptions = {}): string {
  const redact = options.redact ?? false;
  const pageUrl = sanitizeUrl(report.page.url, redact);
  const title = options.title ?? `ANWC Report — ${report.page.title || report.page.url}`;
  const isComplete = report.coverage.complete && report.readiness.settled;

  // Collect all findings flattened
  const allFindings: ReportFinding[] = report.groups.flatMap((g) => g.findings);

  // SVG Viewport Diagram Generation
  const vw = report.page.viewport.width;
  const vh = report.page.viewport.height;

  // Scale diagram to fit max width/height while preserving aspect ratio
  const diagramElements: string[] = [];

  // Viewport background
  diagramElements.push(
    `<rect x="0" y="0" width="${vw}" height="${vh}" fill="var(--vp-bg)" stroke="var(--vp-border)" stroke-width="2" />`
  );

  // Plot targets and blockers from findings
  const plottedNodes = new Set<string>();

  for (const finding of allFindings) {
    // 1. Plot target box
    if (finding.target.box && !plottedNodes.has(finding.target.nodeId)) {
      plottedNodes.add(finding.target.nodeId);
      const b = finding.target.box;
      diagramElements.push(
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="var(--target-fill)" stroke="var(--target-stroke)" stroke-width="2" rx="3">` +
        `<title>Target: &lt;${escapeHtml(finding.target.tag)}&gt; ${escapeHtml(finding.target.label)} (${b.width}x${b.height})</title>` +
        `</rect>`
      );
      if (b.width > 20 && b.height > 14) {
        diagramElements.push(
          `<text x="${b.x + 4}" y="${b.y + Math.min(14, b.height - 2)}" font-size="11" font-family="monospace" fill="var(--target-stroke)">${escapeHtml(finding.target.tag)}</text>`
        );
      }
    }

    // 2. Plot blocker boxes
    for (const blocker of finding.blockers) {
      if (blocker.box && !plottedNodes.has(blocker.nodeId)) {
        plottedNodes.add(blocker.nodeId);
        const b = blocker.box;
        diagramElements.push(
          `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="var(--blocker-fill)" stroke="var(--blocker-stroke)" stroke-width="2" stroke-dasharray="4 2" rx="3">` +
          `<title>Blocker: &lt;${escapeHtml(blocker.tag)}&gt; ${escapeHtml(blocker.label)} (${b.width}x${b.height})</title>` +
          `</rect>`
        );
        if (b.width > 20 && b.height > 14) {
          diagramElements.push(
            `<text x="${b.x + 4}" y="${Math.min(vh - 4, b.y + b.height + 13)}" font-size="11" font-family="monospace" fill="var(--blocker-stroke)">blocker &lt;${escapeHtml(blocker.tag)}&gt;</text>`
          );
        }
      }
    }

  }

  // Findings cards HTML
  const findingsHtml = allFindings.map((f, idx) => {
    const targetSource = formatSourceLoc(f.target.source, redact);
    const blockersHtml = f.blockers.length > 0
      ? `<div class="node-rel"><strong>Blocker:</strong> &lt;<code>${escapeHtml(f.blockers[0]!.tag)}</code>&gt;${f.blockers[0]!.label ? ` <span class="target-label">"${escapeHtml(f.blockers[0]!.label)}"</span>` : ''}${f.blockers[0]!.role ? ` (role: <code>${escapeHtml(f.blockers[0]!.role)}</code>)` : ''} — <code>${escapeHtml(formatSourceLoc(f.blockers[0]!.source, redact))}</code></div>`
      : '';
    const clipHtml = f.clipAncestors.length > 0
      ? `<div class="node-rel"><strong>Clip Ancestor:</strong> &lt;<code>${escapeHtml(f.clipAncestors[0]!.tag)}</code>&gt; — <code>${escapeHtml(formatSourceLoc(f.clipAncestors[0]!.source, redact))}</code></div>`
      : '';
    const limitationHtml = f.limitations.length > 0
      ? `<div class="finding-limitations"><strong>Limitations:</strong> ${escapeHtml(f.limitations.join('; '))}</div>`
      : '';
    const suggestionHtml = f.suggestion
      ? `<div class="finding-suggestion"><strong>Suggested Repair:</strong> ${escapeHtml(f.suggestion)}</div>`
      : '';

    return `
    <article class="finding-card severity-${escapeHtml(f.severity)}" data-severity="${escapeHtml(f.severity)}" data-code="${escapeHtml(f.code)}" id="finding-${idx + 1}">
      <header class="finding-header">
        <span class="badge badge-${escapeHtml(f.severity)}">${escapeHtml(f.severity.toUpperCase())}</span>
        <span class="finding-code">${escapeHtml(f.code)}</span>
        ${f.acknowledged ? '<span class="badge badge-ack">ACKNOWLEDGED</span>' : ''}
      </header>
      <div class="finding-body">
        <p class="finding-message">${escapeHtml(f.message)}</p>
        <div class="finding-target">
          <strong>Target:</strong> &lt;<code>${escapeHtml(f.target.tag)}</code>&gt; ${f.target.role ? `(role: <code>${escapeHtml(f.target.role)}</code>)` : ''}
          ${f.target.label ? `<span class="target-label">"${escapeHtml(f.target.label)}"</span>` : ''}
          <div class="source-loc">Source: <code>${escapeHtml(targetSource)}</code>${f.target.semanticKey ? ` [key: <code>${escapeHtml(f.target.semanticKey)}</code>]` : ''}</div>
        </div>
        ${blockersHtml}
        ${clipHtml}
        <div class="finding-measurement">
          <strong>Measured:</strong> <code>${escapeHtml(f.measuredVsExpected.measured)}</code>
          ${f.measuredVsExpected.expected ? ` | <strong>Expected:</strong> <code>${escapeHtml(f.measuredVsExpected.expected)}</code>` : ''}
        </div>
        ${suggestionHtml}
        ${limitationHtml}
        <details class="evidence-details">
          <summary>Raw Diagnostic Evidence</summary>
          <pre><code>${escapeHtml(JSON.stringify(f.evidence, null, 2))}</code></pre>
        </details>
      </div>
    </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #fbfcfc; --card-bg: #fbfcfc; --plate: #dfe5e6; --card-border: #bcc8cb;
      --text-main: #14242b; --text-muted: #445760; --text-heading: #14242b; --accent: #0b57a4; --on-accent: #ffffff;
      --error: #b3261e; --warning: #855a00; --info: #0b57a4;
      --warning-bg: #fdf3d8; --warning-text: #5f4100; --warning-border: #855a00;
      --vp-bg: #fbfcfc; --vp-border: #bcc8cb;
      --target-fill: rgba(11, 87, 164, 0.14); --target-stroke: #0b57a4;
      --blocker-fill: rgba(179, 38, 30, 0.10); --blocker-stroke: #b3261e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #212d37; --card-bg: #212d37; --plate: #17212a; --card-border: #455562;
        --text-main: #eaf0f2; --text-muted: #adbbc4; --text-heading: #eaf0f2; --accent: #7ab8f5; --on-accent: #0c1c29;
        --error: #ff958b; --warning: #f0be57; --info: #7ab8f5;
        --warning-bg: #3b3420; --warning-text: #f5d58f; --warning-border: #f0be57;
        --vp-bg: #1d2832; --vp-border: #455562;
        --target-fill: rgba(122, 184, 245, 0.16); --target-stroke: #7ab8f5;
        --blocker-fill: rgba(255, 149, 139, 0.12); --blocker-stroke: #ff958b;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI Variable Text", "Segoe UI", "SF Pro Text", "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
    }
    .container { max-width: 1240px; margin: 0 auto; padding: 1.5rem; }
    header.report-top { margin-bottom: 1.5rem; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; }
    h1 { font-size: 1.6rem; color: var(--text-heading); }
    .redact-pill { background: #cf222e; color: #ffffff; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.8rem; }
    .meta-grid { display: flex; flex-wrap: wrap; gap: 0.5rem 2rem; margin-top: 0.75rem; }
    .meta-card { min-width: 0; }
    .meta-card .label { font-size: 0.8rem; color: var(--text-muted); }
    .meta-card .val { font-size: 0.95rem; overflow-wrap: anywhere; }
    .report-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 2rem; align-items: start; }
    .diagram-section { grid-column: 2; grid-row: 1; position: sticky; top: 1rem; }
    .findings-section { grid-column: 1; grid-row: 1; min-width: 0; }
    .diagram-wrapper svg { max-height: 64vh; }
    @media (max-width: 860px) { .report-body { display: block; } .diagram-section { position: static; } }
    .status-alert { background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); padding: 0.75rem 1rem; border-radius: 6px; margin-top: 1.5rem; font-weight: 500; }
    .section-title { font-size: 1.1rem; margin: 0 0 0.75rem; color: var(--text-heading); }
    .diagram-card { background: var(--plate); padding: 1rem; margin-bottom: 2rem; }
    .diagram-wrapper { display: flex; justify-content: center; align-items: center; overflow: auto; padding: 0.5rem 0; }
    .diagram-wrapper svg { max-width: 100%; height: auto; border-radius: 4px; }
    .diagram-legend { display: flex; gap: 0.4rem 1.5rem; margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-muted); flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .legend-swatch { width: 12px; height: 12px; border-radius: 2px; }
    .swatch-target { background: var(--target-stroke); }
    .swatch-blocker { background: var(--blocker-stroke); }
    .diagram-note { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic; }
    .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center; }
    .filter-btn { font: inherit; background: none; border: 1px solid var(--card-border); color: var(--text-main); padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
    .filter-btn:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .filter-btn.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .finding-card { border-top: 1px solid var(--card-border); border-left: 4px solid var(--info); padding: 1rem 0 1rem 1.25rem; }
    .severity-error { border-left-color: var(--error); }
    .severity-warning { border-left-color: var(--warning); }
    .finding-header { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
    .badge { font-size: 0.9rem; font-weight: 700; }
    .badge-error { color: var(--error); }
    .badge-warning { color: var(--warning); }
    .badge-info { color: var(--info); }
    .badge-ack { color: var(--text-muted); }
    .finding-code { font-family: monospace; font-weight: 600; color: var(--text-heading); font-size: 0.9rem; }
    .finding-body { padding: 0.25rem 0 0; overflow-wrap: anywhere; }
    .finding-message { font-size: 1.2rem; line-height: 1.35; font-weight: 600; text-wrap: pretty; margin-bottom: 0.75rem; color: var(--text-heading); }
    .finding-target, .node-rel, .finding-measurement, .finding-suggestion, .finding-limitations { margin-bottom: 0.5rem; font-size: 0.9rem; }
    .source-loc { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem; }
    .target-label { font-style: italic; color: var(--accent); }
    code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85em; background: rgba(127,127,127,0.15); padding: 0.15em 0.3em; border-radius: 3px; }
    details.evidence-details { margin-top: 0.75rem; border: 1px solid var(--card-border); border-radius: 4px; padding: 0.5rem 0.75rem; }
    details.evidence-details summary { cursor: pointer; font-size: 0.85rem; color: var(--text-muted); }
    details.evidence-details pre { margin-top: 0.5rem; overflow-x: auto; font-size: 0.8rem; background: var(--vp-bg); padding: 0.5rem; border-radius: 4px; }
    .hidden { display: none !important; }
    @media print {
      body { background: #ffffff; color: #000000; padding: 0; }
      .filter-bar { display: none; }
      .finding-card { border-color: #ccc; break-inside: avoid; }
      details.evidence-details { display: block; }
      details.evidence-details pre { display: block; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="report-top">
      <div class="header-row">
        <h1>ANWC UI Repair Report</h1>
        ${redact ? '<span class="redact-pill">[REDACTED EXPORT]</span>' : ''}
      </div>
      <div class="meta-grid">
        <div class="meta-card">
          <div class="label">Target Page</div>
          <div class="val">${escapeHtml(pageUrl)}</div>
        </div>
        <div class="meta-card">
          <div class="label">Viewport &amp; DPR</div>
          <div class="val">${report.page.viewport.width}x${report.page.viewport.height} @ ${report.page.devicePixelRatio}x</div>
        </div>
        <div class="meta-card">
          <div class="label">Capture Hash</div>
          <div class="val" title="${escapeHtml(report.input.captureHash)}">${escapeHtml(report.input.captureHash.slice(0, 16))}...</div>
        </div>
        <div class="meta-card">
          <div class="label">Browser &amp; Toolchain</div>
          <div class="val">${escapeHtml(shortBrowser(report.environment.browser, report.environment.browserVersion))}</div>
        </div>
      </div>
      ${!isComplete ? `
      <div class="status-alert" role="alert">
        <strong>Warning: Incomplete or Unsettled Capture!</strong>
        ${!report.coverage.complete ? `Coverage incomplete: ${escapeHtml(report.coverage.reasons.join('; ')) || 'Unknown reasons'}. ` : ''}
        ${!report.readiness.settled ? `Readiness unsettled: ${escapeHtml(report.readiness.reasons.join('; ')) || 'Did not reach network/dom idle'}. ` : ''}
        ${partialCaptureFacts(report).map((fact) => `<div class="partial-fact">${escapeHtml(fact[0]!.toUpperCase() + fact.slice(1))}</div>`).join('')}
      </div>` : ''}
    </header>

    <div class="report-body">
    <section class="diagram-section">
      <h2 class="section-title">Measured Viewport Geometry</h2>
      <div class="diagram-card">
        <div class="diagram-wrapper">
          <svg viewBox="0 0 ${vw} ${vh}" width="${Math.min(vw, 720)}" height="${Math.round(Math.min(vw, 720) * (vh / vw))}" xmlns="http://www.w3.org/2000/svg">
            ${diagramElements.join('\n            ')}
          </svg>
        </div>
        <div class="diagram-legend">
          <div class="legend-item"><div class="legend-swatch swatch-target"></div> Target Element</div>
          <div class="legend-item"><div class="legend-swatch swatch-blocker"></div> Blocker Element</div>
        </div>
        <p class="diagram-note">Boxes are measured. Individual sample positions are not stored in a report, so none are drawn. Paint, shape, and transform visibility remain outside ANWC guarantees.</p>
      </div>
    </section>

    <section class="findings-section">
      <div class="header-row">
        <h2 class="section-title">Findings (${allFindings.length})</h2>
      </div>
      <div class="filter-bar" role="toolbar" aria-label="Finding severity filter">
        <button type="button" class="filter-btn active" data-filter="all">All (${allFindings.length})</button>
        <button type="button" class="filter-btn" data-filter="error">Errors (${report.summary.unacknowledgedErrors})</button>
        <button type="button" class="filter-btn" data-filter="warning">Warnings (${report.summary.unacknowledgedWarnings})</button>
        <button type="button" class="filter-btn" data-filter="info">Info (${report.summary.informational})</button>
      </div>

      <div class="findings-list">
        ${findingsHtml || `<p>${escapeHtml(noFindingsStatement(report))}</p>`}
      </div>
    </section>
    </div>
  </div>

  <script>
    (function() {
      const buttons = document.querySelectorAll('.filter-btn');
      const cards = document.querySelectorAll('.finding-card');

      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const filter = btn.getAttribute('data-filter');

          cards.forEach(card => {
            if (filter === 'all' || card.getAttribute('data-severity') === filter) {
              card.classList.remove('hidden');
            } else {
              card.classList.add('hidden');
            }
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}
