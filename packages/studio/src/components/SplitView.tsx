import React, { useState, useRef, useEffect } from 'react';
import type { BlendMode } from '../types.js';
import {
  clampSplitRatio,
  computeFitZoom,
  computePaneWidths,
  computeScaledDimensions,
  type ContainerDimensions,
  type SplitPaneMode,
  type ViewportDimensions
} from './split-utils.js';

export {
  clampSplitRatio,
  computeFitZoom,
  computePaneWidths,
  computeScaledDimensions,
  type ContainerDimensions,
  type SplitPaneMode,
  type ViewportDimensions
};

export type SplitPreset = '50/50' | '70/30' | '30/70';

export interface SplitViewProps {
  left: React.ReactNode;
  right: React.ReactNode;
  splitRatio?: number;
  overlayMode?: boolean;
  overlayOpacity?: number;
  blendMode?: BlendMode;
  zoom?: number;
  activePane?: SplitPaneMode;
  onSplitRatioChange?: (ratio: number) => void;
  onOverlayModeChange?: (overlay: boolean) => void;
  onOverlayOpacityChange?: (opacity: number) => void;
  onBlendModeChange?: (mode: BlendMode) => void;
  onActivePaneChange?: (pane: SplitPaneMode) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SplitView({
  left,
  right,
  splitRatio = 0.5,
  overlayMode = false,
  overlayOpacity = 0.75,
  blendMode = 'normal' as BlendMode,
  zoom = 1,
  activePane = 'both',
  onSplitRatioChange,
  onOverlayModeChange,
  onOverlayOpacityChange,
  onBlendModeChange,
  onActivePaneChange,
  className = '',
  style
}: SplitViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalRatio, setInternalRatio] = useState(splitRatio);
  const [internalOpacity, setInternalOpacity] = useState(overlayOpacity);
  const [internalBlend, setInternalBlend] = useState<BlendMode>(blendMode);
  const [isDragging, setIsDragging] = useState(false);

  // Sync state if props change
  useEffect(() => {
    setInternalRatio(splitRatio);
  }, [splitRatio]);

  useEffect(() => {
    setInternalOpacity(overlayOpacity);
  }, [overlayOpacity]);

  useEffect(() => {
    setInternalBlend(blendMode);
  }, [blendMode]);

  const currentRatio = splitRatio !== undefined ? splitRatio : internalRatio;
  const currentOpacity = overlayOpacity !== undefined ? overlayOpacity : internalOpacity;
  const currentBlend = blendMode !== undefined ? blendMode : internalBlend;

  const widths = computePaneWidths(currentRatio, activePane, overlayMode);

  // Divider drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const newRatio = clampSplitRatio((moveEvent.clientX - rect.left) / rect.width);
      setInternalRatio(newRatio);
      onSplitRatioChange?.(newRatio);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handlePresetSelect = (ratio: number) => {
    setInternalRatio(ratio);
    onSplitRatioChange?.(ratio);
  };

  const handleOpacitySlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setInternalOpacity(val);
    onOverlayOpacityChange?.(val);
  };

  const handleBlendChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as BlendMode;
    setInternalBlend(val);
    onBlendModeChange?.(val);
  };

  // If in overlay mode and right pane is a React component (not a raw host DOM element like 'div'),
  // pass overlayMode: true so XRayPane can activate transparent background
  const rightChild = React.isValidElement(right) && overlayMode && typeof right.type !== 'string'
    ? React.cloneElement(right as React.ReactElement<{ overlayMode?: boolean }>, {
        overlayMode: true
      })
    : right;

  // Render Overlay Mode
  if (overlayMode) {
    return (
      <div
        ref={containerRef}
        className={`anwc-split-overlay-container ${className}`.trim()}
        data-testid="split-overlay-container"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          backgroundColor: '#090d16',
          ...style
        }}
      >
        {/* Scaled overlay canvas stage */}
        <div
          className="anwc-overlay-stage"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center'
          }}
        >
          {/* Base Layer: Ground Truth */}
          <div
            className="anwc-overlay-base"
            style={{
              position: 'relative',
              width: '100%',
              height: '100%'
            }}
          >
            {left}
          </div>

          {/* Superimposed Layer: X-Ray Canvas */}
          <div
            className="anwc-overlay-layer"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: currentOpacity,
              mixBlendMode: currentBlend === 'difference' ? 'difference' : currentBlend === 'overlay' ? 'overlay' : 'normal',
              pointerEvents: 'auto'
            }}
          >
            {rightChild}
          </div>
        </div>

        {/* Floating Overlay Mode Controls Toolbar */}
        <div
          className="anwc-overlay-toolbar"
          data-testid="overlay-toolbar"
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 100,
            fontSize: '12px',
            color: '#f8fafc',
            fontFamily: 'system-ui, sans-serif'
          }}
        >
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>Overlay Mode</span>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Opacity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentOpacity}
              onChange={handleOpacitySlider}
              style={{ width: '90px', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: 'monospace', width: '32px' }}>{Math.round(currentOpacity * 100)}%</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Blend:</span>
            <select
              value={currentBlend}
              onChange={handleBlendChange}
              style={{
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <option value="normal">Normal</option>
              <option value="difference">Difference</option>
              <option value="overlay">Overlay</option>
            </select>
          </label>

          {onOverlayModeChange && (
            <button
              type="button"
              onClick={() => onOverlayModeChange(false)}
              style={{
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Exit Overlay
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render Side-by-Side / Single-Pane Split View
  return (
    <div
      ref={containerRef}
      className={`anwc-split-view ${className}`.trim()}
      data-testid="split-view"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#090d16',
        userSelect: isDragging ? 'none' : 'auto',
        ...style
      }}
    >
      {/* Left Pane (Ground Truth) */}
      {activePane !== 'right' && (
        <div
          className="anwc-split-pane anwc-split-pane-left"
          data-testid="split-pane-left"
          style={{
            width: widths.left,
            height: '100%',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div
            className="anwc-split-pane-inner"
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center'
            }}
          >
            {left}
          </div>
        </div>
      )}

      {/* Draggable Divider (visible in both pane mode) */}
      {activePane === 'both' && (
        <div
          className="anwc-split-divider"
          data-testid="split-divider"
          onMouseDown={handleMouseDown}
          style={{
            width: '8px',
            backgroundColor: isDragging ? '#38bdf8' : '#1e293b',
            borderLeft: '1px solid #334155',
            borderRight: '1px solid #334155',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            flexShrink: 0,
            zIndex: 10,
            transition: 'background-color 0.15s ease'
          }}
          title="Drag to resize panes"
        >
          {/* Preset Buttons Popover / Handle */}
          <div
            className="anwc-divider-handle"
            style={{
              width: '4px',
              height: '32px',
              backgroundColor: '#475569',
              borderRadius: '2px'
            }}
          />

          <div
            className="anwc-divider-presets"
            style={{
              position: 'absolute',
              top: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              zIndex: 20
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetSelect(0.5);
              }}
              title="50 / 50 Split"
              style={{
                background: currentRatio === 0.5 ? '#3b82f6' : '#1e293b',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '3px',
                fontSize: '9px',
                padding: '2px 4px',
                cursor: 'pointer'
              }}
            >
              50/50
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetSelect(0.7);
              }}
              title="70 / 30 Split"
              style={{
                background: currentRatio === 0.7 ? '#3b82f6' : '#1e293b',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '3px',
                fontSize: '9px',
                padding: '2px 4px',
                cursor: 'pointer'
              }}
            >
              70/30
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetSelect(0.3);
              }}
              title="30 / 70 Split"
              style={{
                background: currentRatio === 0.3 ? '#3b82f6' : '#1e293b',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '3px',
                fontSize: '9px',
                padding: '2px 4px',
                cursor: 'pointer'
              }}
            >
              30/70
            </button>
          </div>
        </div>
      )}

      {/* Right Pane (X-Ray Canvas) */}
      {activePane !== 'left' && (
        <div
          className="anwc-split-pane anwc-split-pane-right"
          data-testid="split-pane-right"
          style={{
            width: widths.right,
            height: '100%',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div
            className="anwc-split-pane-inner"
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center'
            }}
          >
            {rightChild}
          </div>
        </div>
      )}
    </div>
  );
}
