import React from 'react';
import type { HoveredSampleInfo } from '../types.js';
import { SAMPLE_ENCODING, type SampleClass } from './encoding.js';
import { SampleGlyph } from './XRayLegend.js';

export interface SampleTooltipProps {
  sample: HoveredSampleInfo | null;
  className?: string;
  style?: React.CSSProperties;
}

function classOf(sample: HoveredSampleInfo): SampleClass {
  if (sample.sampleClass) return sample.sampleClass;
  if (sample.result === 'target-or-descendant') return 'reachable';
  if (sample.result === 'blocked') return 'blocked';
  return 'no-hit';
}

export function SampleTooltip({ sample, className = '', style }: SampleTooltipProps): React.JSX.Element | null {
  if (!sample) return null;

  const cls = classOf(sample);
  const enc = SAMPLE_ENCODING[cls];
  const isBlocked = sample.result === 'blocked';

  const positionStyle: React.CSSProperties =
    sample.screenX !== undefined && sample.screenY !== undefined
      ? {
          position: 'fixed',
          left: Math.max(10, sample.screenX + 16),
          top: Math.max(10, sample.screenY + 16),
          pointerEvents: 'none',
          zIndex: 9999
        }
      : {};

  return (
    <div
      className={`anwc-sample-tooltip ${className}`.trim()}
      data-sample-class={cls}
      style={{ ...positionStyle, ...style }}
      role="tooltip"
      aria-label="Raycast Sample Details"
    >
      <div className="anwc-tooltip-head">
        <span className="anwc-eyebrow">Raycast Sample</span>
        <span className="anwc-sample-badge" style={{ color: `var(${enc.colorVar})` }}>
          <svg width="12" height="12" aria-hidden="true"><SampleGlyph cls={cls} x={6} y={6} size={3.5} /></svg>
          {enc.label}
        </span>
      </div>

      <dl className="anwc-tooltip-rows">
        <div><dt>Coordinates:</dt><dd>({sample.x}, {sample.y})</dd></div>
        <div><dt>Hit test:</dt><dd>{sample.result}</dd></div>
        {sample.targetNodeId && (
          <div><dt>Target Node:</dt><dd title={sample.targetNodeId}>{sample.targetNodeId}</dd></div>
        )}
      </dl>
      <p className="anwc-tooltip-meaning">{enc.meaning}.</p>

      {isBlocked && (
        <div className="anwc-tooltip-blocker">
          <div className="anwc-tooltip-blocker-title">Blocked by:</div>
          {sample.blockerTag && <div>Tag: &lt;{sample.blockerTag}&gt;</div>}
          {sample.blockerLabel && <div className="anwc-tooltip-blocker-label">"{sample.blockerLabel}"</div>}
          {sample.blockerNodeId ? <div className="anwc-muted">ID: {sample.blockerNodeId}</div> : <div className="anwc-muted">The hit element is outside the captured set.</div>}
        </div>
      )}
    </div>
  );
}
