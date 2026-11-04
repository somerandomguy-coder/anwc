import React, { useState } from 'react';
import type { Rect } from '@anwc/protocol';
import {
  type AnyFinding,
  computeReachabilityMetric,
  formatBox,
  formatSourceReference
} from './drawer-utils.js';

export interface FindingCardProps {
  finding: AnyFinding;
  selected?: boolean;
  onSelectFinding?: (id: string) => void;
  targetBox?: Rect | null;
  blockerBoxes?: Rect[];
  className?: string;
  style?: React.CSSProperties;
}

export function FindingCard({
  finding,
  selected = false,
  onSelectFinding,
  targetBox,
  blockerBoxes,
  className = '',
  style
}: FindingCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  // Resolve source reference (finding.source or finding.target.source)
  const sourceRef = ('target' in finding && finding.target && 'source' in finding.target && finding.target.source)
    ? finding.target.source
    : ('source' in finding ? finding.source : null);

  const formattedSource = formatSourceReference(sourceRef);

  // Resolve target & blocker bounding boxes
  const effectiveTargetBox = targetBox ?? (
    'target' in finding && finding.target && 'box' in finding.target
      ? finding.target.box
      : null
  );

  const effectiveBlockerBox = (blockerBoxes && blockerBoxes.length > 0)
    ? blockerBoxes[0]
    : ('blockers' in finding && Array.isArray(finding.blockers) && finding.blockers[0]?.box
      ? finding.blockers[0].box
      : null);

  const reachability = computeReachabilityMetric(finding);

  // Severity styling
  const severity = finding.severity;
  let severityLabel = 'INFO';
  let severityBadgeStyle: React.CSSProperties = {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#60a5fa',
    borderColor: 'rgba(59, 130, 246, 0.3)'
  };

  if (severity === 'error') {
    severityLabel = 'CRITICAL';
    severityBadgeStyle = {
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
      color: '#f87171',
      borderColor: 'rgba(239, 68, 68, 0.3)'
    };
  } else if (severity === 'warning') {
    severityLabel = 'WARNING';
    severityBadgeStyle = {
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      color: '#fbbf24',
      borderColor: 'rgba(245, 158, 11, 0.3)'
    };
  }

  const handleCopySource = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!formattedSource) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formattedSource);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectFinding?.(finding.findingId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-selected={selected ? 'true' : 'false'}
      data-finding-id={finding.findingId}
      onClick={() => onSelectFinding?.(finding.findingId)}
      onKeyDown={handleKeyDown}
      className={`group relative text-left transition-all duration-150 rounded-lg p-3 cursor-pointer select-none border ${
        selected
          ? 'bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/10'
          : 'bg-gray-900/90 border-gray-800 hover:border-gray-700 hover:bg-gray-850'
      } ${className}`}
      style={{
        outline: 'none',
        ...style
      }}
    >
      {/* Header row: Severity badge, Code pill, findingId */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity Badge */}
          <span
            className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded border uppercase"
            style={severityBadgeStyle}
          >
            {severityLabel}
          </span>

          {/* Code pill */}
          <span className="font-mono text-xs font-semibold text-gray-200 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
            {finding.code}
          </span>
        </div>

        {/* Source link badge with copy-to-clipboard */}
        {formattedSource ? (
          <button
            type="button"
            title="Click to copy source path"
            onClick={handleCopySource}
            className="flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 px-2 py-0.5 rounded transition-colors"
          >
            <span className="text-gray-500">📍</span>
            <span>{formattedSource}</span>
            <span className="text-[10px] text-blue-400 ml-1">
              {copied ? '✓ Copied' : 'copy'}
            </span>
          </button>
        ) : (
          <span className="text-[11px] text-gray-500 italic">
            uninstrumented
          </span>
        )}
      </div>

      {/* Human explanation sentence */}
      <p className="text-sm text-gray-300 leading-snug mb-2 font-normal">
        {finding.message}
      </p>

      {/* Measured vs Expected if present */}
      {'measuredVsExpected' in finding && finding.measuredVsExpected && (
        <div className="text-xs text-gray-400 font-mono mb-2 bg-black/30 p-1.5 rounded border border-gray-800/80">
          <div><span className="text-amber-400/90 font-medium">measured:</span> {finding.measuredVsExpected.measured}</div>
          {finding.measuredVsExpected.expected && (
            <div className="text-gray-500"><span className="text-emerald-400/80 font-medium">expected:</span> {finding.measuredVsExpected.expected}</div>
          )}
        </div>
      )}

      {/* Metric pills row */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono mt-1 text-gray-400">
        {/* Reachability Ratio Pill */}
        {reachability && (
          <span
            className={`px-2 py-0.5 rounded border font-medium ${
              reachability.percent === 0
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : reachability.percent < 50
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            🎯 {reachability.label}
          </span>
        )}

        {/* Target Box Pill */}
        {effectiveTargetBox && (
          <span className="px-2 py-0.5 rounded bg-gray-800/90 border border-gray-700 text-gray-300">
            Target: {formatBox(effectiveTargetBox)}
          </span>
        )}

        {/* Blocker Box Pill */}
        {effectiveBlockerBox && (
          <span className="px-2 py-0.5 rounded bg-red-950/40 border border-red-900/50 text-red-300">
            Blocker: {formatBox(effectiveBlockerBox)}
          </span>
        )}
      </div>
    </div>
  );
}
