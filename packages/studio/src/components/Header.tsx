import React, { useRef } from 'react';
import type { StudioPreset, ViewportPreset } from '../types.js';
import { VIEWPORT_PRESETS } from '../types.js';
import { STUDIO_PRESETS } from '../data/presets.js';

export interface HeaderProps {
  /** Currently selected preset ID, or null if custom/live */
  activePresetId?: string | null;
  /** Callback when preset dropdown changes */
  onSelectPreset?: (presetId: string) => void;
  /** Available presets catalog */
  presets?: StudioPreset[];

  /** Current URL in the inspection input */
  url: string;
  /** Callback when URL input text changes */
  onUrlChange: (url: string) => void;
  /** Callback when Inspect button is clicked or Enter is pressed */
  onInspect: (url: string) => void;
  /** Whether an inspection network request is currently inflight */
  isInspecting?: boolean;

  /** Active viewport dimensions */
  viewport: { width: number; height: number };
  /** Callback when viewport dropdown selection changes */
  onSelectViewport?: (viewport: { width: number; height: number; id?: string }) => void;
  /** Available viewport presets */
  viewportPresets?: ViewportPreset[];

  /** Active zoom scale ratio (e.g. 0.5, 0.75, 1.0) or 'fit' */
  zoom?: number | 'fit';
  /** Active zoom display mode */
  zoomMode?: '50%' | '75%' | '100%' | 'fit' | string;
  /** Callback when zoom dropdown selection changes */
  onZoomChange?: (zoom: number | 'fit', mode?: string) => void;

  /** Whether side-by-side or stacked overlay mode is active */
  overlayMode: boolean;
  /** Callback to toggle between split and overlay views */
  onToggleOverlay?: () => void;

  /** Callback when user selects a local JSON file */
  onLoadJsonFile?: (file: File) => void;

  /** Additional styling */
  className?: string;
  style?: React.CSSProperties;
}

export function Header({
  activePresetId,
  onSelectPreset,
  presets = STUDIO_PRESETS,
  url,
  onUrlChange,
  onInspect,
  isInspecting = false,
  viewport,
  onSelectViewport,
  viewportPresets = VIEWPORT_PRESETS,
  zoom = 1,
  zoomMode,
  onZoomChange,
  overlayMode,
  onToggleOverlay,
  onLoadJsonFile,
  className = '',
  style
}: HeaderProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine which viewport preset matches current dimensions, if any
  const matchedViewportPreset = viewportPresets.find(
    (p) => p.width === viewport.width && p.height === viewport.height
  );
  const selectedViewportValue = matchedViewportPreset ? matchedViewportPreset.id : 'custom';

  // Determine current zoom dropdown value
  const selectedZoomValue =
    zoomMode === 'fit' || zoom === 'fit'
      ? 'fit'
      : zoom === 0.5
        ? '0.5'
        : zoom === 0.75
          ? '0.75'
          : zoom === 1
            ? '1'
            : typeof zoom === 'number'
              ? String(zoom)
              : '1';

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value && value !== 'custom') {
      onSelectPreset?.(value);
    }
  };

  const handleViewportChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const found = viewportPresets.find((p) => p.id === value);
    if (found) {
      onSelectViewport?.({ width: found.width, height: found.height, id: found.id });
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'fit') {
      onZoomChange?.('fit', 'fit');
    } else {
      const num = parseFloat(value);
      if (!Number.isNaN(num)) {
        const mode = num === 0.5 ? '50%' : num === 0.75 ? '75%' : num === 1 ? '100%' : `${Math.round(num * 100)}%`;
        onZoomChange?.(num, mode);
      }
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isInspecting && url.trim()) {
      e.preventDefault();
      onInspect(url.trim());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file) {
        onLoadJsonFile?.(file);
      }
      // Reset input value so re-selecting the same file triggers onChange
      e.target.value = '';
    }
  };

  return (
    <header
      className={`anwc-header ${className}`.trim()}
      data-testid="header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px',
        padding: '0 14px',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #1e293b',
        color: '#f8fafc',
        gap: '12px',
        userSelect: 'none',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        ...style
      }}
    >
      {/* Left: Brand Logo & Title + Preset Quick Picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(37, 99, 235, 0.4)'
            }}
          >
            {/* Crosshair / Geometry Icon */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="22" y1="12" x2="18" y2="12" />
              <line x1="6" y1="12" x2="2" y2="12" />
              <line x1="12" y1="6" x2="12" y2="2" />
              <line x1="12" y1="22" x2="12" y2="18" />
            </svg>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#f8fafc'
              }}
            >
              ANWC Studio
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '2px 5px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                letterSpacing: '0.04em'
              }}
            >
              Offline
            </span>
          </div>
        </div>

        {/* Preset Quick Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label
            htmlFor="preset-select"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#94a3b8'
            }}
          >
            Preset:
          </label>
          <select
            id="preset-select"
            data-testid="preset-picker"
            value={activePresetId ?? 'custom'}
            onChange={handlePresetChange}
            style={{
              height: '32px',
              padding: '0 10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f1f5f9',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title}
              </option>
            ))}
            {!activePresetId && (
              <option value="custom">Custom / Live</option>
            )}
          </select>
        </div>
      </div>

      {/* Middle: URL Input + Inspect Button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: '1 1 360px',
          maxWidth: '560px',
          minWidth: '220px'
        }}
      >
        <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            data-testid="url-input"
            aria-label="Inspect target URL"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="http://127.0.0.1:4173..."
            disabled={isInspecting}
            style={{
              width: '100%',
              height: '32px',
              padding: '0 10px',
              backgroundColor: '#0b0f19',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          type="button"
          data-testid="inspect-button"
          disabled={isInspecting || !url.trim()}
          onClick={() => onInspect(url.trim())}
          style={{
            height: '32px',
            padding: '0 14px',
            backgroundColor: isInspecting || !url.trim() ? '#1e293b' : '#2563eb',
            color: isInspecting || !url.trim() ? '#64748b' : '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isInspecting || !url.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            boxShadow: isInspecting || !url.trim() ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.4)'
          }}
        >
          {isInspecting ? (
            <>
              {/* Spinner */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{
                  animation: 'spin 1s linear infinite'
                }}
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>Inspecting...</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Inspect</span>
            </>
          )}
        </button>
      </div>

      {/* Right: Viewport selector, Zoom, Overlay toggle, Load JSON */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Viewport Presets dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <select
            data-testid="viewport-picker"
            value={selectedViewportValue}
            onChange={handleViewportChange}
            aria-label="Viewport size preset"
            style={{
              height: '32px',
              padding: '0 8px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {viewportPresets.map((vp) => (
              <option key={vp.id} value={vp.id}>
                {vp.label}
              </option>
            ))}
            {selectedViewportValue === 'custom' && (
              <option value="custom">Custom ({viewport.width} × {viewport.height})</option>
            )}
          </select>
        </div>

        {/* Zoom scale dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <select
            data-testid="zoom-picker"
            value={selectedZoomValue}
            onChange={handleZoomChange}
            aria-label="Zoom scale"
            style={{
              height: '32px',
              padding: '0 8px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              fontSize: '12px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="fit">Fit</option>
          </select>
        </div>

        {/* Overlay Mode toggle button */}
        <button
          type="button"
          data-testid="overlay-toggle"
          onClick={onToggleOverlay}
          title={overlayMode ? 'Switch to Side-by-Side view' : 'Switch to X-Ray Overlay view'}
          style={{
            height: '32px',
            padding: '0 10px',
            backgroundColor: overlayMode ? 'rgba(37, 99, 235, 0.2)' : '#1e293b',
            color: overlayMode ? '#60a5fa' : '#cbd5e1',
            border: overlayMode ? '1px solid #3b82f6' : '1px solid #334155',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
          <span>{overlayMode ? 'X-Ray Overlay' : 'Side-by-Side'}</span>
        </button>

        {/* Load JSON Button with hidden input */}
        <div>
          <input
            type="file"
            ref={fileInputRef}
            data-testid="load-json-input"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            data-testid="load-json-button"
            onClick={() => fileInputRef.current?.click()}
            title="Load local capture.json or diff.json"
            style={{
              height: '32px',
              padding: '0 10px',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Load JSON</span>
          </button>
        </div>
      </div>
    </header>
  );
}
