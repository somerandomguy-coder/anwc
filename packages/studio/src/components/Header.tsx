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
    <header className={`anwc-header ${className}`.trim()} data-testid="header" style={style}>
      <div className="anwc-brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="anwc-mark">
          <path d="M1 8V1h7M18 1h7v7M25 18v7h-7M8 25H1v-7" />
          <rect x="8" y="10" width="10" height="6" />
        </svg>
        <h1 translate="no">ANWC Studio</h1>
        <span
          className="anwc-source-badge"
          data-testid="data-source-badge"
          data-kind={activePresetId ? 'recorded' : 'live'}
          title={
            activePresetId
              ? 'Findings come from a recorded capture of the example app. Click Inspect to measure the page as it is now.'
              : 'Findings come from a capture of the target URL.'
          }
        >
          {activePresetId ? 'Recorded capture' : 'Live capture'}
        </span>
      </div>

      <div className="anwc-field anwc-field-example">
        <label htmlFor="preset-select">Example</label>
        <select id="preset-select" name="example" data-testid="preset-picker" value={activePresetId ?? 'custom'} onChange={handlePresetChange}>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.title}
            </option>
          ))}
          {!activePresetId && <option value="custom">Custom / Live</option>}
        </select>
      </div>

      <div className="anwc-target">
        <input
          type="url"
          name="target-url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          data-testid="url-input"
          aria-label="Inspect target URL"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          placeholder="http://127.0.0.1:4175/…"
          disabled={isInspecting}
        />
        <button
          type="button"
          className="anwc-primary"
          data-testid="inspect-button"
          disabled={isInspecting || !url.trim()}
          onClick={() => onInspect(url.trim())}
        >
          {isInspecting ? (
            <>
              <svg className="anwc-spin" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>Inspecting…</span>
            </>
          ) : (
            <span>Inspect</span>
          )}
        </button>
      </div>

      <div className="anwc-tools">
        <select data-testid="viewport-picker" name="viewport" value={selectedViewportValue} onChange={handleViewportChange} aria-label="Viewport size preset">
          {viewportPresets.map((vp) => (
            <option key={vp.id} value={vp.id}>
              {vp.label}
            </option>
          ))}
          {selectedViewportValue === 'custom' && (
            <option value="custom">Custom ({viewport.width} × {viewport.height})</option>
          )}
        </select>

        <select data-testid="zoom-picker" name="zoom" value={selectedZoomValue} onChange={handleZoomChange} aria-label="Zoom scale">
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="fit">Fit</option>
        </select>

        <button
          type="button"
          className="anwc-btn"
          data-testid="overlay-toggle"
          aria-pressed={overlayMode}
          onClick={onToggleOverlay}
          title={overlayMode ? 'Switch to Side-by-Side view' : 'Switch to X-Ray Overlay view'}
        >
          {overlayMode ? 'X-Ray Overlay' : 'Side-by-Side'}
        </button>

        <input
          type="file"
          ref={fileInputRef}
          data-testid="load-json-input"
          aria-label="Capture file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="anwc-btn"
          data-testid="load-json-button"
          onClick={() => fileInputRef.current?.click()}
          title="Load local capture.json or diff.json"
        >
          Load JSON
        </button>
      </div>
    </header>
  );
}
