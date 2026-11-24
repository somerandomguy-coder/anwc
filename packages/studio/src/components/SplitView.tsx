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
  splitRatio: propSplitRatio,
  overlayMode: propOverlayMode,
  overlayOpacity: propOpacity,
  blendMode: propBlendMode,
  zoom = 1,
  activePane: propActivePane,
  onSplitRatioChange,
  onOverlayModeChange,
  onOverlayOpacityChange,
  onBlendModeChange,
  onActivePaneChange,
  className = '',
  style
}: SplitViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalRatio, setInternalRatio] = useState(propSplitRatio ?? 0.5);
  const [internalOverlay, setInternalOverlay] = useState(propOverlayMode ?? false);
  const [internalOpacity, setInternalOpacity] = useState(propOpacity ?? 0.75);
  const [internalBlend, setInternalBlend] = useState<BlendMode>(propBlendMode ?? ('normal' as BlendMode));
  const [internalActivePane, setInternalActivePane] = useState<SplitPaneMode>(propActivePane ?? 'both');
  const [isDragging, setIsDragging] = useState(false);

  // Synchronize internal state when controlled props change
  useEffect(() => {
    if (propSplitRatio !== undefined) {
      setInternalRatio(propSplitRatio);
    }
  }, [propSplitRatio]);

  useEffect(() => {
    if (propOverlayMode !== undefined) {
      setInternalOverlay(propOverlayMode);
    }
  }, [propOverlayMode]);

  useEffect(() => {
    if (propOpacity !== undefined) {
      setInternalOpacity(propOpacity);
    }
  }, [propOpacity]);

  useEffect(() => {
    if (propBlendMode !== undefined) {
      setInternalBlend(propBlendMode);
    }
  }, [propBlendMode]);

  useEffect(() => {
    if (propActivePane !== undefined) {
      setInternalActivePane(propActivePane);
    }
  }, [propActivePane]);

  const currentRatio = propSplitRatio !== undefined ? propSplitRatio : internalRatio;
  const currentOverlay = propOverlayMode !== undefined ? propOverlayMode : internalOverlay;
  const currentOpacity = propOpacity !== undefined ? propOpacity : internalOpacity;
  const currentBlend = propBlendMode !== undefined ? propBlendMode : internalBlend;
  const currentActivePane = propActivePane !== undefined ? propActivePane : internalActivePane;

  const widths = computePaneWidths(currentRatio, currentActivePane, currentOverlay);

  // Drag listeners managed with proper useEffect cleanup
  useEffect(() => {
    if (!isDragging) return;

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
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, onSplitRatioChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
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

  const handleExitOverlay = () => {
    setInternalOverlay(false);
    onOverlayModeChange?.(false);
  };

  // If in overlay mode and right pane is a React component (not a raw host DOM element like 'div'),
  // pass overlayMode: true so XRayPane can activate transparent background
  const rightChild = React.isValidElement(right) && currentOverlay && typeof right.type !== 'string'
    ? React.cloneElement(right as React.ReactElement<{ overlayMode?: boolean }>, {
        overlayMode: true
      })
    : right;

  // Render Overlay Mode
  if (currentOverlay) {
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
          backgroundColor: 'var(--anwc-bg)',
          ...style
        }}
      >
        {/* Scaled overlay canvas stage */}
        <div
          className="anwc-overlay-stage"
          style={{
            position: 'absolute',
            top: 0,
            left: zoom === 1 ? 0 : `${(100 - 100 / zoom) / 2}%`,
            width: zoom === 1 ? '100%' : `${100 / zoom}%`,
            height: zoom === 1 ? '100%' : `${100 / zoom}%`,
            transform: zoom === 1 ? undefined : `scale(${zoom})`,
            transformOrigin: zoom === 1 ? undefined : 'top center'
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
        >
          <span style={{ fontWeight: 600 }}>Overlay Mode</span>

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
            >
              <option value="normal">Normal</option>
              <option value="difference">Difference</option>
              <option value="overlay">Overlay</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleExitOverlay}
            className="anwc-btn"
          >
            Exit Overlay
          </button>
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
        backgroundColor: 'var(--anwc-bg)',
        userSelect: isDragging ? 'none' : 'auto',
        ...style
      }}
    >
      {/* Left Pane (Ground Truth) */}
      {currentActivePane !== 'right' && (
        <div
          className="anwc-split-pane anwc-split-pane-left"
          data-testid="split-pane-left"
          style={{
            width: widths.left,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            pointerEvents: isDragging ? 'none' : 'auto'
          }}
        >
          <span className="anwc-pane-caption">Live page</span>
          <div
            className="anwc-split-pane-inner"
            style={{
              position: 'absolute',
              top: 0,
              left: zoom === 1 ? 0 : `${(100 - 100 / zoom) / 2}%`,
              width: zoom === 1 ? '100%' : `${100 / zoom}%`,
              height: zoom === 1 ? '100%' : `${100 / zoom}%`,
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
              transformOrigin: zoom === 1 ? undefined : 'top center'
            }}
          >
            {left}
          </div>
        </div>
      )}

      {/* Draggable Divider (visible in both pane mode) */}
      {currentActivePane === 'both' && (
        <div
          className="anwc-split-divider"
          data-testid="split-divider"
          onMouseDown={handleMouseDown}
          data-dragging={isDragging}
          title="Drag to resize panes"
        >
          {/* Preset Buttons Popover / Handle */}
          <div
            className="anwc-divider-handle"
          />

          <div
            className="anwc-divider-presets"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePresetSelect(0.5);
              }}
              title="50 / 50 Split"
              aria-pressed={currentRatio === 0.5}
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
              aria-pressed={currentRatio === 0.7}
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
              aria-pressed={currentRatio === 0.3}
            >
              30/70
            </button>
          </div>
        </div>
      )}

      {/* Right Pane (X-Ray Canvas) */}
      {currentActivePane !== 'left' && (
        <div
          className="anwc-split-pane anwc-split-pane-right"
          data-testid="split-pane-right"
          style={{
            width: widths.right,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            pointerEvents: isDragging ? 'none' : 'auto'
          }}
        >
          <span className="anwc-pane-caption">What ANWC measured</span>
          <div
            className="anwc-split-pane-inner"
            style={{
              position: 'absolute',
              top: 0,
              left: zoom === 1 ? 0 : `${(100 - 100 / zoom) / 2}%`,
              width: zoom === 1 ? '100%' : `${100 / zoom}%`,
              height: zoom === 1 ? '100%' : `${100 / zoom}%`,
              transform: zoom === 1 ? undefined : `scale(${zoom})`,
              transformOrigin: zoom === 1 ? undefined : 'top center'
            }}
          >
            {rightChild}
          </div>
        </div>
      )}
    </div>
  );
}
