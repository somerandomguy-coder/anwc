import React, { useId } from 'react';
import type { Finding, Rect, Snapshot } from '@anwc/protocol';
import { computeXRayBoundingBoxes } from './xray-utils.js';

export interface GroundTruthPaneProps {
  url?: string | null;
  targetUrl?: string | null;
  viewport: { width: number; height: number };
  activeFindingBox?: Rect | null;
  activeFinding?: Finding | null;
  snapshot?: Snapshot | null;
  zoom?: number;
  transformOrigin?: string;
  className?: string;
  style?: React.CSSProperties;
}

const PULSE_KEYFRAMES = `
@keyframes anwc-pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7), 0 0 16px rgba(59, 130, 246, 0.5);
  }
  50% {
    opacity: 0.85;
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0), 0 0 24px rgba(59, 130, 246, 0.8);
  }
}
`;

/**
 * Validates that a target URL is a safe, well-formed http: or https: URL.
 * Rejects file://, javascript:, data:, ftp:, and markdown syntax (e.g. [app](http://...)).
 */
export function isValidTargetUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  // Reject markdown link syntax e.g. [app](http://...)
  if (trimmed.startsWith('[') || trimmed.includes('](')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function GroundTruthPane({
  url,
  targetUrl,
  viewport,
  activeFindingBox,
  activeFinding,
  snapshot,
  zoom = 1,
  transformOrigin = 'top center',
  className = '',
  style
}: GroundTruthPaneProps): React.JSX.Element {
  const patternId = useId().replace(/:/g, '');
  const gridPatternId = `blueprint-grid-${patternId}`;

  const rawUrl = (url ?? targetUrl ?? '').trim();
  const hasLiveUrl = isValidTargetUrl(rawUrl);
  const effectiveUrl = hasLiveUrl ? rawUrl : '';

  // Determine target bounding box for highlight overlay
  let targetBox: Rect | null = activeFindingBox ?? null;
  if (!targetBox && activeFinding && snapshot) {
    const boxes = computeXRayBoundingBoxes(snapshot, activeFinding);
    if (boxes.target) {
      targetBox = boxes.target;
    }
  }

  const nodes = snapshot?.nodes ?? [];
  const hasNodes = nodes.length > 0;

  return (
    <div
      className={`anwc-ground-truth-pane ${className}`.trim()}
      data-testid="ground-truth-pane"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#090d16',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        ...style
      }}
    >
      <style>{PULSE_KEYFRAMES}</style>

      {/* Scaled viewport canvas container */}
      <div
        className="anwc-ground-truth-canvas"
        data-testid="ground-truth-canvas"
        style={{
          width: `${viewport.width}px`,
          height: `${viewport.height}px`,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
          transformOrigin: zoom === 1 ? undefined : transformOrigin,
          position: 'relative',
          backgroundColor: '#0f172a',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {hasLiveUrl ? (
          <iframe
            src={effectiveUrl}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Ground Truth Preview"
            style={{
              width: `${viewport.width}px`,
              height: `${viewport.height}px`,
              border: 'none',
              display: 'block',
              backgroundColor: '#ffffff'
            }}
          />
        ) : (
          <svg
            className="anwc-blueprint-svg"
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            width={viewport.width}
            height={viewport.height}
            style={{ display: 'block', width: '100%', height: '100%' }}
          >
            <defs>
              <pattern id={gridPatternId} width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1" />
              </pattern>
            </defs>

            {/* Base background and grid */}
            <rect width={viewport.width} height={viewport.height} fill="#090d16" />
            <rect width={viewport.width} height={viewport.height} fill={`url(#${gridPatternId})`} />

            {hasNodes ? (
              <g className="anwc-blueprint-nodes">
                {nodes.map((node) => {
                  if (!node.box || node.box.width <= 0 || node.box.height <= 0) {
                    return null;
                  }
                  return (
                    <g key={node.nodeId} className="anwc-blueprint-node">
                      <rect
                        x={node.box.x}
                        y={node.box.y}
                        width={node.box.width}
                        height={node.box.height}
                        fill="rgba(56, 189, 248, 0.03)"
                        stroke="rgba(56, 189, 248, 0.25)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      {node.box.width > 36 && node.box.height > 18 && (
                        <text
                          x={node.box.x + 4}
                          y={node.box.y + 12}
                          fill="rgba(148, 163, 184, 0.6)"
                          fontSize="9"
                          fontFamily="ui-monospace, monospace"
                          style={{ pointerEvents: 'none' }}
                        >
                          &lt;{node.tag}&gt;
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            ) : (
              <g className="anwc-blueprint-empty-placeholder">
                <rect
                  x={Math.max(20, viewport.width / 2 - 160)}
                  y={Math.max(20, viewport.height / 2 - 50)}
                  width={Math.min(320, viewport.width - 40)}
                  height={100}
                  rx={8}
                  fill="#1e293b"
                  stroke="rgba(56, 189, 248, 0.3)"
                  strokeWidth="1.5"
                />
                <text
                  x={viewport.width / 2}
                  y={viewport.height / 2 - 15}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="13"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  No Live Ground Truth URL
                </text>
                <text
                  x={viewport.width / 2}
                  y={viewport.height / 2 + 10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="system-ui, sans-serif"
                >
                  Offline Blueprint View
                </text>
                <text
                  x={viewport.width / 2}
                  y={viewport.height / 2 + 28}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="system-ui, sans-serif"
                >
                  Enter a target URL above to load the live app
                </text>
              </g>
            )}
          </svg>
        )}

        {/* Synchronized target element highlight box */}
        {targetBox && (
          <div
            className="anwc-ground-truth-highlight"
            data-testid="ground-truth-highlight"
            style={{
              position: 'absolute',
              left: `${targetBox.x}px`,
              top: `${targetBox.y}px`,
              width: `${targetBox.width}px`,
              height: `${targetBox.height}px`,
              border: '2px solid #3b82f6',
              borderRadius: '4px',
              boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3), 0 0 16px rgba(59, 130, 246, 0.6)',
              animation: 'anwc-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              pointerEvents: 'none',
              zIndex: 30
            }}
          >
            <div
              className="anwc-ground-truth-highlight-badge"
              style={{
                position: 'absolute',
                top: '-20px',
                left: '0px',
                background: '#3b82f6',
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '3px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                fontFamily: 'system-ui, sans-serif'
              }}
            >
              Target Element
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
