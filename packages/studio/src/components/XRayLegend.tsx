import React, { useState } from 'react';
import { ROLE_ENCODING, SAMPLE_ENCODING, type BoxRole, type SampleClass } from './encoding.js';

export interface XRayLegendProps {
  /** One sentence describing what the boxes mean in the current view. */
  sentence: string;
  defaultCollapsed?: boolean;
}

const ROLE_ORDER: BoxRole[] = ['target', 'blocker', 'clip', 'context'];
const SAMPLE_ORDER: SampleClass[] = ['reachable', 'blocked', 'clipped', 'no-hit'];

/** A small SVG that draws a hit-sample glyph; shapes differ so colour is not required. */
export function SampleGlyph({ cls, x, y, size = 4 }: { cls: SampleClass; x: number; y: number; size?: number }): React.JSX.Element {
  const enc = SAMPLE_ENCODING[cls];
  const color = `var(${enc.colorVar})`;
  const halo = { stroke: 'var(--anwc-sample-halo)', strokeWidth: 1.5, paintOrder: 'stroke' as const };
  switch (enc.shape) {
    case 'dot':
      return <circle cx={x} cy={y} r={size} style={{ fill: color, ...halo }} />;
    case 'ring':
      return <circle cx={x} cy={y} r={size} style={{ fill: 'none', stroke: color, strokeWidth: 2 }} />;
    case 'square':
      return <rect x={x - size + 0.5} y={y - size + 0.5} width={(size - 0.5) * 2} height={(size - 0.5) * 2} style={{ fill: color, ...halo }} />;
    case 'cross':
      return (
        <path
          d={`M ${x - size} ${y - size} L ${x + size} ${y + size} M ${x + size} ${y - size} L ${x - size} ${y + size}`}
          style={{ fill: 'none', stroke: color, strokeWidth: 2.5, strokeLinecap: 'round' }}
        />
      );
  }
}

/**
 * Fixed legend for the x-ray: box roles (colour + line style), hit-sample
 * classes (colour + shape) and a one-sentence explanation of the view.
 */
export function XRayLegend({ sentence, defaultCollapsed = false }: XRayLegendProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className="anwc-legend" data-testid="xray-legend" aria-label="X-ray legend" data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="anwc-legend-head">
        <p className="anwc-legend-sentence" data-testid="xray-legend-sentence">{sentence}</p>
        <button
          type="button"
          className="anwc-btn anwc-btn-ghost"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? 'Legend' : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <div className="anwc-legend-body">
          <ul className="anwc-legend-list" aria-label="Box roles">
            {ROLE_ORDER.map((role) => {
              const enc = ROLE_ENCODING[role];
              return (
                <li key={role} data-legend-role={role} title={enc.meaning}>
                  <svg width="30" height="12" aria-hidden="true">
                    <line
                      x1="1" y1="6" x2="29" y2="6"
                      style={{ stroke: `var(${enc.colorVar})`, strokeWidth: Math.max(2, enc.strokeWidth), strokeDasharray: enc.dash }}
                    />
                  </svg>
                  <span>{enc.label}</span>
                  <span className="anwc-legend-style">({enc.lineStyle})</span>
                </li>
              );
            })}
          </ul>
          <ul className="anwc-legend-list" aria-label="Hit samples">
            {SAMPLE_ORDER.map((cls) => (
              <li key={cls} data-legend-sample={cls} title={SAMPLE_ENCODING[cls].meaning}>
                <svg width="14" height="14" aria-hidden="true"><SampleGlyph cls={cls} x={7} y={7} /></svg>
                <span>{SAMPLE_ENCODING[cls].label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
