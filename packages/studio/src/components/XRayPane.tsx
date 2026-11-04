import React, { useState, useId } from 'react';
import type { Finding, Snapshot } from '@anwc/protocol';
import type { HitSample, HoveredSampleInfo } from '../types.js';
import {
  computeXRayBoundingBoxes,
  getAllPointerSamples,
  mapSampleColor,
  type SampleWithNode
} from './xray-utils.js';
import { SampleTooltip } from './SampleTooltip.js';

export interface XRayPaneProps {
  snapshot: Snapshot;
  activeFinding?: Finding | null;
  selectedFindingId?: string | null;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectSample?: (sample: HitSample, targetNodeId: string) => void;
  onHoverSample?: (sampleInfo: HoveredSampleInfo | null) => void;
  zoom?: number;
  overlayMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function XRayPane({
  snapshot,
  activeFinding,
  selectedFindingId,
  selectedNodeId,
  onSelectNode,
  onSelectSample,
  onHoverSample,
  zoom = 1,
  overlayMode = false,
  className = '',
  style
}: XRayPaneProps): React.JSX.Element {
  const [internalHoveredSample, setInternalHoveredSample] = useState<HoveredSampleInfo | null>(null);
  const patternId = useId().replace(/:/g, '');

  const finding = activeFinding !== undefined
    ? activeFinding
    : selectedFindingId
      ? snapshot.findings.find((f) => f.findingId === selectedFindingId) ?? null
      : null;

  const boxes = computeXRayBoundingBoxes(snapshot, finding);
  const width = snapshot.page.viewport.width;
  const height = snapshot.page.viewport.height;

  const allSamples = getAllPointerSamples(snapshot);

  const handleMouseEnterSample = (e: React.MouseEvent, sample: SampleWithNode) => {
    const blockerNode = sample.blockerNodeId
      ? snapshot.nodes.find((n) => n.nodeId === sample.blockerNodeId)
      : null;

    const sampleInfo: HoveredSampleInfo = {
      x: sample.x,
      y: sample.y,
      result: sample.result,
      blockerNodeId: sample.blockerNodeId ?? null,
      blockerTag: blockerNode?.tag ?? null,
      blockerLabel: blockerNode?.label || blockerNode?.tag || null,
      targetNodeId: sample.targetNodeId,
      screenX: e.clientX,
      screenY: e.clientY
    };

    setInternalHoveredSample(sampleInfo);
    onHoverSample?.(sampleInfo);
  };

  const handleMouseMoveSample = (e: React.MouseEvent, _sample: SampleWithNode) => {
    if (internalHoveredSample) {
      setInternalHoveredSample((prev) => (prev ? { ...prev, screenX: e.clientX, screenY: e.clientY } : null));
    }
  };

  const handleMouseLeaveSample = () => {
    setInternalHoveredSample(null);
    onHoverSample?.(null);
  };

  const gridPatternId = `xray-grid-${patternId}`;
  const stripesPatternId = `xray-stripes-${patternId}`;

  return (
    <div
      className={`anwc-xray-pane ${className}`.trim()}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: overlayMode ? 'transparent' : '#090d16',
        ...style
      }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          position: 'relative'
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            userSelect: 'none'
          }}
        >
          <defs>
            {/* Grid background pattern */}
            <pattern
              id={gridPatternId}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(255, 255, 255, 0.04)"
                strokeWidth="1"
              />
            </pattern>

            {/* Blocker diagonal stripes pattern */}
            <pattern
              id={stripesPatternId}
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="10"
                stroke="rgba(239, 68, 68, 0.4)"
                strokeWidth="3"
              />
            </pattern>
          </defs>

          {/* Background Grid */}
          {!overlayMode && (
            <>
              <rect width={width} height={height} fill="#0b1120" />
              <rect width={width} height={height} fill={`url(#${gridPatternId})`} />
            </>
          )}

          {/* Discovered DOM Nodes Wireframe */}
          <g className="xray-dom-wireframe" opacity="0.6">
            {snapshot.nodes.map((node) => {
              if (!node.box) return null;
              const isTarget = node.nodeId === boxes.targetNode?.nodeId;
              const isBlocker = boxes.blockerNodes.some((b) => b.nodeId === node.nodeId);
              if (isTarget || isBlocker) return null;

              const isExplicitlySelected = node.nodeId === selectedNodeId;

              return (
                <rect
                  key={`wf-${node.nodeId}`}
                  x={node.box.x}
                  y={node.box.y}
                  width={node.box.width}
                  height={node.box.height}
                  fill={isExplicitlySelected ? 'rgba(56, 189, 248, 0.1)' : 'none'}
                  stroke={isExplicitlySelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.15)'}
                  strokeWidth={isExplicitlySelected ? 1.5 : 1}
                  strokeDasharray={isExplicitlySelected ? undefined : '2 2'}
                  onClick={() => onSelectNode?.(node.nodeId)}
                  style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                >
                  <title>{`<${node.tag}> ${node.label || node.nodeId}`}</title>
                </rect>
              );
            })}
          </g>

          {/* Active Target Bounding Box */}
          {boxes.target && (
            <g className="xray-target-box">
              <rect
                x={boxes.target.x}
                y={boxes.target.y}
                width={boxes.target.width}
                height={boxes.target.height}
                fill="rgba(59, 130, 246, 0.16)"
                stroke="#3b82f6"
                strokeWidth="2"
                rx="2"
                onClick={() => boxes.targetNode && onSelectNode?.(boxes.targetNode.nodeId)}
                style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
              />
              {/* Target Label */}
              <g transform={`translate(${boxes.target.x}, ${Math.max(16, boxes.target.y - 6)})`}>
                <rect
                  x="0"
                  y="-14"
                  width={Math.min(260, Math.max(90, (boxes.targetNode?.label?.length ?? 0) * 7 + 70))}
                  height="18"
                  rx="3"
                  fill="#1e3a8a"
                  stroke="#3b82f6"
                  strokeWidth="1"
                />
                <text
                  x="6"
                  y="-2"
                  fill="#bfdbfe"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  TARGET: &lt;{boxes.targetNode?.tag}&gt; {boxes.targetNode?.label ? `"${boxes.targetNode.label.slice(0, 16)}"` : boxes.targetNode?.nodeId}
                </text>
              </g>
            </g>
          )}

          {/* Blocker Bounding Boxes */}
          {boxes.blockerNodes.map((blockerNode, idx) => {
            const b = blockerNode.box;
            if (!b) return null;
            const badgeWidth = Math.min(220, Math.max(90, blockerNode.tag.length * 8 + 80));
            const badgeX = Math.max(b.x, b.x + b.width - badgeWidth);

            return (
              <g key={`blocker-${blockerNode.nodeId}-${idx}`} className="xray-blocker-box">
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  fill={`url(#${stripesPatternId})`}
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  rx="2"
                  onClick={() => onSelectNode?.(blockerNode.nodeId)}
                  style={{ cursor: onSelectNode ? 'pointer' : 'default' }}
                />
                {/* Blocker Tag Label */}
                <g transform={`translate(${badgeX}, ${Math.max(16, b.y - 6)})`}>
                  <rect
                    x="0"
                    y="-14"
                    width={badgeWidth}
                    height="18"
                    rx="3"
                    fill="#7f1d1d"
                    stroke="#ef4444"
                    strokeWidth="1"
                  />
                  <text
                    x="6"
                    y="-2"
                    fill="#fecaca"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    BLOCKER: &lt;{blockerNode.tag}&gt;
                  </text>
                </g>
              </g>
            );
          })}

          {/* Raycast Hit Samples */}
          <g className="xray-samples">
            {allSamples.map((sample, idx) => {
              const color = mapSampleColor(sample.result);
              const isTargetSample = boxes.targetNode && sample.targetNodeId === boxes.targetNode.nodeId;
              const isHovered =
                internalHoveredSample?.x === sample.x &&
                internalHoveredSample?.y === sample.y &&
                internalHoveredSample?.targetNodeId === sample.targetNodeId;

              return (
                <g key={`sample-${sample.targetNodeId}-${idx}`}>
                  {isHovered && (
                    <circle
                      cx={sample.x}
                      cy={sample.y}
                      r="9"
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      opacity="0.8"
                    />
                  )}
                  <circle
                    cx={sample.x}
                    cy={sample.y}
                    r={isTargetSample ? 5 : 4}
                    fill={color}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleMouseEnterSample(e, sample)}
                    onMouseMove={(e) => handleMouseMoveSample(e, sample)}
                    onMouseLeave={handleMouseLeaveSample}
                    onClick={() => {
                      onSelectSample?.(sample, sample.targetNodeId);
                      if (sample.blockerNodeId) {
                        onSelectNode?.(sample.blockerNodeId);
                      }
                    }}
                  >
                    <title>{`(${sample.x}, ${sample.y}) ${sample.result}`}</title>
                  </circle>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Embedded Hover Tooltip */}
        {internalHoveredSample && <SampleTooltip sample={internalHoveredSample} />}
      </div>
    </div>
  );
}
