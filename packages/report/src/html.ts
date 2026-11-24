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
            `<text x="${b.x + 4}" y="${b.y + Math.min(14, b.height - 2)}" font-size="11" font-family="monospace" fill="var(--blocker-stroke)">blocker &lt;${escapeHtml(blocker.tag)}&gt;</text>`
          );
        }
      }
    }

    // 3. If pointer-blocked, plot tested points inside target box
    if (finding.evidence.kind === 'pointer-blocked' && finding.target.box) {
      const b = finding.target.box;
      const total = finding.evidence.tested;
      const blocked = finding.evidence.blocked;
      const gridSize = Math.round(Math.sqrt(total));
      let ptIndex = 0;
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (ptIndex >= total) break;
          const px = b.x + (b.width * (c + 0.5)) / gridSize;
          const py = b.y + (b.height * (r + 0.5)) / gridSize;
          // In standard pointer test, blocked points come first or all blocked
          const isBlocked = ptIndex < blocked;
          const color = isBlocked ? 'var(--sample-blocked)' : 'var(--sample-hit)';
          diagramElements.push(
            `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="0.5">` +
            `<title>Sample (${px.toFixed(0)}, ${py.toFixed(0)}): ${isBlocked ? 'Blocked' : 'Hit'}</title>` +
            `</circle>`
          );
          ptIndex++;
        }
      }
    }
  }

  // Findings cards HTML
  const findingsHtml = allFindings.map((f, idx) => {
    const targetSource = formatSourceLoc(f.target.source, redact);
    const blockersHtml = f.blockers.length > 0
      ? `<div class="node-rel"><strong>Blocker:</strong> &lt;<code>${escapeHtml(f.blockers[0]!.tag)}</code>&gt;${f.blockers[0]!.role ? ` (role: <code>${escapeHtml(f.blockers[0]!.role)}</code>)` : ''} — <code>${escapeHtml(formatSourceLoc(f.blockers[0]!.source, redact))}</code></div>`
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
      --bg: #0d1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --text-main: #c9d1d9;
      --text-muted: #8b949e;
      --text-heading: #f0f6fc;
      --accent: #58a6ff;
      --error-bg: #ffebe9;
      --error-text: #cf222e;
      --error-border: #ff8182;
      --warning-bg: #fff8c5;
      --warning-text: #9a6700;
      --warning-border: #d29922;
      --info-bg: #ddf4ff;
      --info-text: #0969da;
      --info-border: #54aeff;
      --ack-bg: #f6f8fa;
      --ack-text: #57606a;
      --vp-bg: #090d13;
      --vp-border: #388bfd;
      --target-fill: rgba(56, 139, 253, 0.2);
      --target-stroke: #58a6ff;
      --blocker-fill: rgba(248, 81, 73, 0.25);
      --blocker-stroke: #f85149;
      --sample-hit: #3fb950;
      --sample-blocked: #f85149;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f6f8fa;
        --card-bg: #ffffff;
        --card-border: #d0d7de;
        --text-main: #24292f;
        --text-muted: #57606a;
        --text-heading: #1f2328;
        --accent: #0969da;
        --vp-bg: #f6f8fa;
        --vp-border: #0969da;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 1.5rem;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    header.report-top { margin-bottom: 2rem; border-bottom: 1px solid var(--card-border); padding-bottom: 1rem; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; }
    h1 { font-size: 1.6rem; color: var(--text-heading); }
    .redact-pill { background: #cf222e; color: #ffffff; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; font-size: 0.8rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }
    .meta-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; padding: 0.75rem 1rem; }
    .meta-card .label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .meta-card .val { font-size: 0.95rem; font-family: monospace; word-break: break-all; margin-top: 0.25rem; color: var(--text-heading); }
    .status-alert { background: var(--warning-bg); color: var(--warning-text); border: 1px solid var(--warning-border); padding: 0.75rem 1rem; border-radius: 6px; margin-top: 1.5rem; font-weight: 500; }
    .section-title { font-size: 1.25rem; margin: 2rem 0 1rem; color: var(--text-heading); }
    .diagram-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; padding: 1rem; margin-bottom: 2rem; }
    .diagram-wrapper { display: flex; justify-content: center; align-items: center; overflow: auto; padding: 0.5rem 0; }
    .diagram-wrapper svg { max-width: 100%; height: auto; border-radius: 4px; }
    .diagram-legend { display: flex; gap: 1.5rem; margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-muted); flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .legend-swatch { width: 12px; height: 12px; border-radius: 2px; }
    .swatch-target { background: var(--target-stroke); }
    .swatch-blocker { background: var(--blocker-stroke); }
    .swatch-hit { background: var(--sample-hit); border-radius: 50%; }
    .swatch-blocked { background: var(--sample-blocked); border-radius: 50%; }
    .diagram-note { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic; }
    .filter-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center; }
    .filter-btn { background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-main); padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .filter-btn.active { background: var(--accent); color: #ffffff; border-color: var(--accent); }
    .finding-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; margin-bottom: 1rem; overflow: hidden; }
    .finding-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--card-border); }
    .badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .badge-error { background: #f85149; color: #ffffff; }
    .badge-warning { background: #d29922; color: #ffffff; }
    .badge-info { background: #388bfd; color: #ffffff; }
    .badge-ack { background: var(--card-border); color: var(--text-muted); }
    .finding-code { font-family: monospace; font-weight: 600; color: var(--text-heading); font-size: 0.9rem; }
    .finding-body { padding: 1rem; }
    .finding-message { font-size: 1rem; font-weight: 500; margin-bottom: 0.75rem; color: var(--text-heading); }
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
          <div class="val">${escapeHtml(report.environment.browser)} ${escapeHtml(report.environment.browserVersion)}</div>
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
          <div class="legend-item"><div class="legend-swatch swatch-hit"></div> Tested Hit</div>
          <div class="legend-item"><div class="legend-swatch swatch-blocked"></div> Blocked Sample</div>
        </div>
        <p class="diagram-note">Diagram represents directly measured bounding boxes and hit test sample coordinates. Paint, shape, and transform visibility remain outside ANWC guarantees.</p>
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
