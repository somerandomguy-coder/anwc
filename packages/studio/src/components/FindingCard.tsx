import React, { useState } from 'react';
import type { Rect } from '@anwc/protocol';
import {
  type AnyFinding,
  computeReachabilityMetric,
  formatBox,
  formatSourceReference
} from './drawer-utils.js';
import { agentBrief, sampleCounts } from './agent-brief.js';
import { RULE_CATEGORIES, categorizeFinding, whyReported, type NodeLookup } from './encoding.js';

export interface FindingCardProps {
  finding: AnyFinding;
  selected?: boolean;
  onSelectFinding?: (id: string) => void;
  targetBox?: Rect | null;
  blockerBoxes?: Rect[];
  /** Number shared with the x-ray box badge. */
  number?: number;
  /** True while this finding's boxes are hovered in the x-ray (or the card itself). */
  hovered?: boolean;
  /** True while the overlay shows only this finding. */
  isolated?: boolean;
  onHover?: (id: string | null) => void;
  /** Resolves node ids named by the evidence to tag, label and source. */
  nodeLookup?: NodeLookup;
  className?: string;
  style?: React.CSSProperties;
}

const SEVERITY_LABEL: Record<AnyFinding['severity'], string> = { error: 'Critical', warning: 'Warning', info: 'Info' };

export function FindingCard({
  finding,
  selected = false,
  onSelectFinding,
  targetBox,
  blockerBoxes,
  number,
  hovered = false,
  isolated = false,
  onHover,
  nodeLookup,
  className = '',
  style
}: FindingCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  const sourceRef = ('target' in finding && finding.target && 'source' in finding.target && finding.target.source)
    ? finding.target.source
    : ('source' in finding ? finding.source : null);
  const formattedSource = formatSourceReference(sourceRef);

  const effectiveTargetBox = targetBox ?? ('target' in finding && finding.target && 'box' in finding.target ? finding.target.box : null);
  const effectiveBlockerBox = (blockerBoxes && blockerBoxes.length > 0)
    ? blockerBoxes[0]
    : ('blockers' in finding && Array.isArray(finding.blockers) && finding.blockers[0]?.box ? finding.blockers[0].box : null);

  const reachability = computeReachabilityMetric(finding);
  const category = categorizeFinding(finding);
  const categoryLabel = RULE_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const why = whyReported(finding, nodeLookup);

  const handleCopySource = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!formattedSource) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formattedSource);
      }
    } catch {
      // Clipboard can be unavailable (insecure context); still acknowledge the click.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBrief = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(agentBrief(finding));
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    } catch {
      setBriefCopied(false);
    }
  };

  const samples = sampleCounts(finding);
  const blockerRefs = 'blockers' in finding && Array.isArray(finding.blockers) ? finding.blockers : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectFinding?.(finding.findingId);
    }
  };

  const classes = ['anwc-card', selected ? 'is-selected' : '', hovered ? 'is-hovered' : '', className].filter(Boolean).join(' ');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${number !== undefined ? `Finding ${number}: ` : ''}${finding.code}`}
      data-selected={selected ? 'true' : 'false'}
      data-hovered={hovered ? 'true' : 'false'}
      data-isolated={isolated ? 'true' : 'false'}
      data-finding-id={finding.findingId}
      data-finding-number={number}
      data-category={category}
      onClick={() => onSelectFinding?.(finding.findingId)}
      onMouseEnter={() => onHover?.(finding.findingId)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(finding.findingId)}
      onBlur={() => onHover?.(null)}
      onKeyDown={handleKeyDown}
      className={classes}
      style={style}
    >
      <div className="anwc-card-head">
        <div className="anwc-card-tags">
          {number !== undefined && (
            <span className="anwc-num-badge" data-testid="finding-number" aria-hidden="true">{number}</span>
          )}
          <span className={`anwc-sev anwc-sev-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
          <span className="anwc-code-pill">{finding.code}</span>
          <span className="anwc-cat-pill">{categoryLabel}</span>
          {isolated && <span className="anwc-cat-pill anwc-isolated-pill">isolated</span>}
        </div>

        {formattedSource ? (
          <button type="button" title="Click to copy source path" onClick={handleCopySource} className="anwc-source-btn">
            <span>{formattedSource}</span>
            <span className="anwc-source-copy">{copied ? 'Copied' : 'copy'}</span>
          </button>
        ) : (
          <span className="anwc-muted anwc-italic">uninstrumented</span>
        )}
      </div>

      <p className="anwc-card-message">{finding.message}</p>

      {samples && (
        <div className="anwc-gauge">
          <span className="anwc-gauge-ticks" aria-hidden="true">
            {Array.from({ length: samples.tested }, (_, i) => (
              <i key={i} data-blocked={i < samples.blocked} />
            ))}
          </span>
          <span><strong>{samples.blocked}</strong> of {samples.tested} points blocked</span>
        </div>
      )}

      {blockerRefs.length > 0 && (
        <ul className="anwc-blockers" aria-label="Covered by">
          {blockerRefs.map((b, i) => (
            <li key={i}>
              Covered by <strong>&lt;{b.tag}&gt; {b.label}</strong>
              {formatSourceReference(b.source) && <code>{formatSourceReference(b.source)}</code>}
            </li>
          ))}
        </ul>
      )}

      <p className="anwc-card-why" data-testid="finding-why">
        <span className="anwc-card-why-label">Why this is reported:</span> {why}
      </p>

      <div className="anwc-card-actions">
        <button type="button" className="anwc-btn" data-testid="copy-agent-brief" onClick={handleCopyBrief}>
          {briefCopied ? 'Copied' : 'Copy brief for agent'}
        </button>
      </div>

      <details className="anwc-card-more" onClick={(e) => e.stopPropagation()}>
      <summary>Measurement and limits</summary>
      {'measuredVsExpected' in finding && finding.measuredVsExpected && (
        <div className="anwc-card-measured">
          <div><span className="anwc-measured-key">measured:</span> {finding.measuredVsExpected.measured}</div>
          {finding.measuredVsExpected.expected && (
            <div><span className="anwc-expected-key">expected:</span> {finding.measuredVsExpected.expected}</div>
          )}
        </div>
      )}

      <div className="anwc-card-limits" data-testid="finding-limitations">
        <span className="anwc-card-why-label">Limitations:</span>{' '}
        {finding.limitations.length > 0
          ? finding.limitations.join(' ')
          : 'none recorded by the rule for this measurement.'}
      </div>

      <div className="anwc-card-metrics">
        {reachability && (
          <span className={`anwc-metric ${reachability.percent === 0 ? 'is-bad' : reachability.percent < 50 ? 'is-warn' : 'is-ok'}`}>
            {reachability.label}
          </span>
        )}
        {effectiveTargetBox && <span className="anwc-metric">Target: {formatBox(effectiveTargetBox)}</span>}
        {effectiveBlockerBox && <span className="anwc-metric is-bad">Blocker: {formatBox(effectiveBlockerBox)}</span>}
      </div>
      </details>
    </div>
  );
}
