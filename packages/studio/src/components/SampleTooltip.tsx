import React from 'react';
import type { HoveredSampleInfo } from '../types.js';

export interface SampleTooltipProps {
  sample: HoveredSampleInfo | null;
  className?: string;
  style?: React.CSSProperties;
}

export function SampleTooltip({ sample, className = '', style }: SampleTooltipProps): React.JSX.Element | null {
  if (!sample) return null;

  const isBlocked = sample.result === 'blocked';
  const isTargetHit = sample.result === 'target-or-descendant';

  const badgeColor = isTargetHit ? '#22c55e' : isBlocked ? '#ef4444' : '#f59e0b';
  const badgeBg = isTargetHit ? 'rgba(34, 197, 94, 0.15)' : isBlocked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
  const badgeBorder = isTargetHit ? 'rgba(34, 197, 94, 0.4)' : isBlocked ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)';
  const badgeText = isTargetHit ? 'Target Hit' : isBlocked ? 'Blocked' : 'No Target';

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
      style={{
        ...positionStyle,
        minWidth: 220,
        maxWidth: 320,
        background: 'rgba(15, 23, 42, 0.94)',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '10px 12px',
        color: '#f8fafc',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        transition: 'opacity 0.1s ease',
        ...style
      }}
      role="tooltip"
      aria-label="Raycast Sample Details"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Raycast Sample
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            background: badgeBg,
            color: badgeColor,
            border: `1px solid ${badgeBorder}`
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: badgeColor
            }}
          />
          {badgeText}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>Coordinates:</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            ({sample.x}, {sample.y})
          </span>
        </div>

        {sample.targetNodeId && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748b' }}>Target Node:</span>
            <span
              style={{ color: '#38bdf8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={sample.targetNodeId}
            >
              {sample.targetNodeId}
            </span>
          </div>
        )}

        {isBlocked && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e293b' }}>
            <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 2 }}>
              Blocked by:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 6, borderLeft: '2px solid #ef4444' }}>
              {sample.blockerTag && (
                <div style={{ color: '#fca5a5' }}>
                  Tag: &lt;{sample.blockerTag}&gt;
                </div>
              )}
              {sample.blockerLabel && (
                <div style={{ color: '#cbd5e1', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  "{sample.blockerLabel}"
                </div>
              )}
              {sample.blockerNodeId && (
                <div style={{ color: '#94a3b8', fontSize: 10 }}>
                  ID: {sample.blockerNodeId}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
