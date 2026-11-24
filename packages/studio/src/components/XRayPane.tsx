import React, { useMemo, useState, useId } from 'react';
import type { Finding, Measurement, Snapshot } from '@anwc/protocol';
import type { HitSample, HoveredSampleInfo } from '../types.js';
import { buildHoveredSampleInfo, getAllPointerSamples, type SampleWithNode } from './xray-utils.js';
import {
  ROLE_ENCODING,
  checkViewportAlignment,
  classifySample,
  findingRoleBoxes,
  legendSentence,
  numberFindings,
  type BoxRole,
  type RoleBox,
  type ViewportSize
} from './encoding.js';
import { SampleTooltip } from './SampleTooltip.js';
import { SampleGlyph, XRayLegend } from './XRayLegend.js';

/** The slice of the shared finding view the x-ray needs. */
export interface XRayViewProps {
  numbering: Map<string, number>;
  /** Findings the overlay draws (the isolated one, or every visible one). */
  overlayIds: readonly string[];
  /** Findings passing the filter (for the legend sentence). */
  visibleIds: readonly string[];
  isolatedFindingId: string | null;
  hoveredFindingId: string | null;
  setHoveredFindingId?: (findingId: string | null) => void;
  activateFinding?: (findingId: string) => void;
}

export interface XRayPaneProps {
  snapshot: Snapshot;
  activeFinding?: Finding | null;
  selectedFindingId?: string | null;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectSample?: (sample: HitSample, targetNodeId: string) => void;
  onHoverSample?: (sampleInfo: HoveredSampleInfo | null) => void;
  /** Shared numbering, filter, isolation and hover. Without it, only the active finding is drawn. */
  view?: XRayViewProps;
  /** Viewport the page frame currently shows; the overlay is refused when it differs from the capture's. */
  frameViewport?: ViewportSize | null;
  showLegend?: boolean;
  zoom?: number;
  overlayMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface DrawnFinding {
  finding: Finding;
  number: number;
  boxes: RoleBox[];
  focused: boolean;
}

const ROLE_TAG: Record<BoxRole, string> = { target: 'Target', blocker: 'Blocker', clip: 'Clip', context: 'Context' };
const ROLE_CLASS: Record<BoxRole, string> = { target: 'xray-target-box', blocker: 'xray-blocker-box', clip: 'xray-clip-box', context: 'xray-context-box' };

export function XRayPane({
  snapshot,
  activeFinding,
  selectedFindingId,
  selectedNodeId,
  onSelectNode,
  onSelectSample,
  onHoverSample,
  view,
  frameViewport,
  showLegend = true,
  zoom = 1,
  overlayMode = false,
  className = '',
  style
}: XRayPaneProps): React.JSX.Element {
  const [internalHoveredSample, setInternalHoveredSample] = useState<HoveredSampleInfo | null>(null);
  const patternId = useId().replace(/:/g, '');

  const width = snapshot.page.viewport.width;
  const height = snapshot.page.viewport.height;
  const alignment = checkViewportAlignment(snapshot.page.viewport, frameViewport);

  const nodeMap = useMemo(() => new Map<string, Measurement>(snapshot.nodes.map((n) => [n.nodeId, n])), [snapshot]);
  const fallbackNumbering = useMemo(() => numberFindings(snapshot.findings), [snapshot]);
  const numbering = view?.numbering ?? fallbackNumbering;

  // Which findings to draw.
  const legacyFinding = activeFinding !== undefined
    ? activeFinding
    : selectedFindingId
      ? snapshot.findings.find((f) => f.findingId === selectedFindingId) ?? null
      : null;
  const drawIds: readonly string[] = view ? view.overlayIds : legacyFinding ? [legacyFinding.findingId] : [];
  const focusIds = new Set<string>(
    [view?.hoveredFindingId, selectedFindingId ?? legacyFinding?.findingId].filter((id): id is string => Boolean(id))
  );

  const drawn: DrawnFinding[] = [];
  for (const id of drawIds) {
    const finding = snapshot.findings.find((f) => f.findingId === id) ?? (legacyFinding?.findingId === id ? legacyFinding : undefined);
    if (!finding) continue;
    drawn.push({
      finding,
      number: numbering.get(id) ?? drawn.length + 1,
      boxes: findingRoleBoxes(snapshot, finding),
      focused: focusIds.has(id) || drawIds.length === 1
    });
  }
  // Focused findings are drawn last so they sit on top.
  drawn.sort((a, b) => Number(a.focused) - Number(b.focused) || a.number - b.number);

  const roleNodeIds = new Set(drawn.flatMap((d) => d.boxes.map((b) => b.nodeId)));
  const drawnTargets = new Set(drawn.map((d) => d.finding.nodeId));

  const allSamples = getAllPointerSamples(snapshot);
  const samples = snapshot.findings.length === 0 ? allSamples : allSamples.filter((s) => drawnTargets.has(s.targetNodeId));

  const isolated = view?.isolatedFindingId && drawn.length === 1 && drawn[0]!.finding.findingId === view.isolatedFindingId ? drawn[0]! : null;
  const sentence = legendSentence({
    totalFindings: snapshot.findings.length,
    visibleFindings: view ? view.visibleIds.length : drawn.length,
    isolated: isolated
      ? { number: isolated.number, code: isolated.finding.code, roles: new Set(isolated.boxes.map((b) => b.role)) }
      : null
  });

  const handleMouseEnterSample = (e: React.MouseEvent, sample: SampleWithNode) => {
    const info = buildHoveredSampleInfo(sample, snapshot, { screenX: e.clientX, screenY: e.clientY });
    info.sampleClass = classifySample(sample, nodeMap.get(sample.targetNodeId));
    setInternalHoveredSample(info);
    onHoverSample?.(info);
  };
  const handleMouseMoveSample = (e: React.MouseEvent) => {
    setInternalHoveredSample((prev) => (prev ? { ...prev, screenX: e.clientX, screenY: e.clientY } : null));
  };
  const handleMouseLeaveSample = () => {
    setInternalHoveredSample(null);
    onHoverSample?.(null);
  };

  const hoverFinding = (id: string | null) => view?.setHoveredFindingId?.(id);
  const activate = (finding: Finding) => {
    if (view?.activateFinding) view.activateFinding(finding.findingId);
    else onSelectNode?.(finding.nodeId);
  };

  const gridPatternId = `xray-grid-${patternId}`;
  const rootClass = `anwc-xray-pane ${className}`.trim();

  if (!alignment.aligned) {
    return (
      <div className={rootClass} data-testid="xray-pane" data-overlay="refused" style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
        <div className="anwc-xray-refusal" data-testid="xray-viewport-mismatch" role="status">
          <strong>Viewport mismatch</strong>
          <p>{alignment.message}</p>
        </div>
      </div>
    );
  }

  const badgeOffsets = new Map<string, number>();

  return (
    <div
      className={rootClass}
      data-testid="xray-pane"
      data-overlay="drawn"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}
    >
      <div
        className="anwc-xray-scroll"
        style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '44px 0 20px', background: overlayMode ? 'transparent' : 'var(--anwc-xray-bg)' }}
      >
        <div style={{ width, height, transform: `scale(${zoom})`, transformOrigin: 'top center', position: 'relative', margin: '0 auto' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            role="img"
            aria-label={sentence}
            style={{ display: 'block', width: '100%', height: '100%', userSelect: 'none' }}
          >
            <defs>
              <pattern id={gridPatternId} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" style={{ fill: 'none', stroke: 'var(--anwc-xray-grid)', strokeWidth: 1 }} />
              </pattern>
            </defs>

            {!overlayMode && (
              <>
                <rect className="xray-canvas" width={width} height={height} style={{ fill: 'var(--anwc-xray-canvas)' }} />
                <rect width={width} height={height} fill={`url(#${gridPatternId})`} />
              </>
            )}

            {/* Context: other captured elements, for orientation only. */}
            <g className="xray-dom-wireframe" opacity="0.7">
              {snapshot.nodes.map((node) => {
                if (!node.box || roleNodeIds.has(node.nodeId)) return null;
                const selected = node.nodeId === selectedNodeId;
                return (
                  <rect
                    key={`wf-${node.nodeId}`}
                    className="xray-context-box"
                    data-role="context"
                    x={node.box.x}
                    y={node.box.y}
                    width={node.box.width}
                    height={node.box.height}
                    style={{
                      fill: 'none',
                      stroke: `var(${ROLE_ENCODING.context.colorVar})`,
                      strokeWidth: selected ? 1.5 : ROLE_ENCODING.context.strokeWidth,
                      strokeDasharray: ROLE_ENCODING.context.dash,
                      cursor: onSelectNode ? 'pointer' : 'default'
                    }}
                    onClick={() => onSelectNode?.(node.nodeId)}
                  >
                    <title>{`Context <${node.tag}> ${node.label || node.nodeId}`}</title>
                  </rect>
                );
              })}
            </g>

            {/* Finding boxes, numbered to match the finding cards. */}
            {drawn.map(({ finding, number, boxes, focused }) => {
              const target = boxes.find((b) => b.role === 'target');
              const offset = target ? badgeOffsets.get(target.nodeId) ?? 0 : 0;
              if (target) badgeOffsets.set(target.nodeId, offset + 1);
              return (
                <g
                  key={finding.findingId}
                  className="xray-finding"
                  data-finding-id={finding.findingId}
                  data-finding-number={number}
                  data-focused={focused ? 'true' : 'false'}
                  opacity={focused ? 1 : 0.5}
                  onMouseEnter={() => hoverFinding(finding.findingId)}
                  onMouseLeave={() => hoverFinding(null)}
                  onClick={() => activate(finding)}
                  style={{ cursor: 'pointer' }}
                >
                  {boxes.map((b) => {
                    const enc = ROLE_ENCODING[b.role];
                    return (
                      <g key={`${b.role}-${b.nodeId}`} className={ROLE_CLASS[b.role]} data-role={b.role} data-node-id={b.nodeId}>
                        <rect
                          x={b.box.x}
                          y={b.box.y}
                          width={b.box.width}
                          height={b.box.height}
                          rx="2"
                          style={{
                            fill: `var(${enc.colorVar}-fill)`,
                            stroke: `var(${enc.colorVar})`,
                            strokeWidth: focused ? enc.strokeWidth : Math.max(1, enc.strokeWidth - 1),
                            strokeDasharray: enc.dash,
                            strokeLinecap: b.role === 'clip' ? 'round' : 'butt'
                          }}
                        >
                          <title>{`${number}. ${enc.label} <${b.tag}> ${b.label || b.nodeId}`}</title>
                        </rect>
                        {focused && b.role !== 'context' && boxes.find((other) => other.role === b.role) === b && (
                          <text
                            className="xray-role-label"
                            x={Math.max(4, b.box.x + 4)}
                            y={b.role === 'target' ? Math.max(12, b.box.y - 5) : Math.min(height - 4, b.box.y + b.box.height + 14)}
                            style={{ fill: `var(${enc.colorVar})`, fontSize: 11, fontWeight: 700, fontFamily: 'var(--anwc-font-mono)', paintOrder: 'stroke', stroke: 'var(--anwc-label-halo)', strokeWidth: 3 }}
                          >
                            {ROLE_TAG[b.role]}: &lt;{b.tag}&gt;{b.role === 'target' && b.label ? ` "${b.label.slice(0, 16)}"` : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {target && (
                    <g
                      className="xray-number-badge"
                      transform={`translate(${Math.min(width - 10, target.box.x + 10 + offset * 22)}, ${Math.max(10, target.box.y + 10)})`}
                      aria-label={`Finding ${number}`}
                    >
                      <circle r="9" style={{ fill: `var(${ROLE_ENCODING.target.colorVar})`, stroke: 'var(--anwc-label-halo)', strokeWidth: 1.5 }} />
                      <text textAnchor="middle" dy="3.8" style={{ fill: 'var(--anwc-on-accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--anwc-font-mono)' }}>
                        {number}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Hit samples of the drawn targets. */}
            <g className="xray-samples">
              {samples.map((sample, idx) => {
                const cls = classifySample(sample, nodeMap.get(sample.targetNodeId));
                const hovered =
                  internalHoveredSample?.x === sample.x &&
                  internalHoveredSample?.y === sample.y &&
                  internalHoveredSample?.targetNodeId === sample.targetNodeId;
                return (
                  <g
                    key={`sample-${sample.targetNodeId}-${idx}`}
                    className="xray-sample"
                    data-sample-class={cls}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleMouseEnterSample(e, sample)}
                    onMouseMove={handleMouseMoveSample}
                    onMouseLeave={handleMouseLeaveSample}
                    onClick={() => {
                      onSelectSample?.(sample, sample.targetNodeId);
                      if (sample.blockerNodeId) onSelectNode?.(sample.blockerNodeId);
                    }}
                  >
                    {hovered && <circle cx={sample.x} cy={sample.y} r="9" style={{ fill: 'none', stroke: 'var(--anwc-focus)', strokeWidth: 2 }} />}
                    <SampleGlyph cls={cls} x={sample.x} y={sample.y} size={4.5} />
                    <title>{`(${sample.x}, ${sample.y}) ${cls} — hit test: ${sample.result}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {showLegend && <XRayLegend sentence={sentence} defaultCollapsed={overlayMode} />}
      {internalHoveredSample && <SampleTooltip sample={internalHoveredSample} />}
    </div>
  );
}
