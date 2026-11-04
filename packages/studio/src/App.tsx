import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Finding, Rect, Snapshot } from '@anwc/protocol';
import { createReport, type Report } from '@anwc/report';
import { STUDIO_PRESETS } from './data/presets.js';
import { VIEWPORT_PRESETS, type HoveredSampleInfo } from './types.js';
import { Header } from './components/Header.js';
import { SplitView } from './components/SplitView.js';
import { GroundTruthPane, isValidTargetUrl } from './components/GroundTruthPane.js';
import { XRayPane } from './components/XRayPane.js';
import { FindingDrawer } from './components/FindingDrawer.js';
import { computeFitZoom } from './components/split-utils.js';
import { computeXRayBoundingBoxes } from './components/xray-utils.js';
import { extractFindings } from './components/drawer-utils.js';

export interface AppProps {
  /** Optional initial snapshot override */
  initialSnapshot?: Snapshot;
  /** Optional initial preset ID */
  initialPresetId?: string | null;
  /** Optional initial selected finding ID */
  initialSelectedFindingId?: string | null;
  /** Optional initial overlay mode */
  initialOverlayMode?: boolean;
  /** Optional initial split view ratio (default 0.5) */
  initialSplitRatio?: number;
  /** Optional initial zoom scale ratio (default 1) */
  initialZoom?: number;
  /** Optional initial zoom mode (e.g. '100%', 'fit') */
  initialZoomMode?: string;
  /** Optional additional CSS class */
  className?: string;
  /** Optional inline style */
  style?: React.CSSProperties;
}

export type ParsedUploadResult =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'report'; report: Report; snapshot?: Snapshot }
  | { type: 'diff'; diff: unknown; message: string };

/**
 * Validates and extracts structured ANWC objects from a raw JSON string.
 */
export function parseUploadedSnapshotJson(rawJson: string): ParsedUploadResult {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e: any) {
    throw new Error(`Invalid JSON syntax: ${e.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Parsed JSON is not an object');
  }

  // 1. Snapshot schema
  if (parsed.schemaVersion === '0.1' && Array.isArray(parsed.nodes) && parsed.page) {
    return { type: 'snapshot', snapshot: parsed as Snapshot };
  }

  // 2. Report schema
  if (parsed.schemaVersion === '0.1' && parsed.reportId && (Array.isArray(parsed.groups) || Array.isArray(parsed.findings))) {
    if (parsed.snapshot && Array.isArray(parsed.snapshot.nodes)) {
      return { type: 'report', report: parsed as Report, snapshot: parsed.snapshot as Snapshot };
    }
    return { type: 'report', report: parsed as Report };
  }

  // 3. Diff Report schema
  if (parsed.schemaVersion === '0.1' && parsed.diffId && parsed.summary) {
    const summary = parsed.summary;
    return {
      type: 'diff',
      diff: parsed,
      message: `Diff report loaded: ${summary.verifiedFixed ?? 0} fixed, ${summary.persistent ?? 0} persistent, ${summary.newFindings ?? 0} new.`
    };
  }

  // 4. Raw capture / snapshot fallback
  if (Array.isArray(parsed.nodes) && parsed.page) {
    return { type: 'snapshot', snapshot: parsed as Snapshot };
  }

  throw new Error('Unsupported JSON file format. Expected an ANWC Snapshot, Report, or Diff schema.');
}

export function App({
  initialSnapshot,
  initialPresetId,
  initialSelectedFindingId,
  initialOverlayMode = false,
  initialSplitRatio = 0.5,
  initialZoom = 1,
  initialZoomMode = '100%',
  className = '',
  style
}: AppProps): React.JSX.Element {
  // Determine default starting snapshot
  const defaultSnapshot = initialSnapshot ?? STUDIO_PRESETS[0]!.snapshot;
  const defaultPresetId = initialPresetId !== undefined ? initialPresetId : initialSnapshot ? null : STUDIO_PRESETS[0]!.id;

  // State: active snapshot and preset
  const [snapshot, setSnapshot] = useState<Snapshot>(defaultSnapshot);
  const [activePresetId, setActivePresetId] = useState<string | null>(defaultPresetId);

  // State: inspection URL
  const [url, setUrl] = useState<string>(snapshot.page.url);
  const [isInspecting, setIsInspecting] = useState<boolean>(false);

  // State: selected finding
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    initialSelectedFindingId ?? snapshot.findings?.[0]?.findingId ?? null
  );

  // State: raycast dot hover tooltip
  const [hoveredSample, setHoveredSample] = useState<HoveredSampleInfo | null>(null);

  // State: viewport and zoom
  const [zoom, setZoom] = useState<number>(initialZoom);
  const [zoomMode, setZoomMode] = useState<string>(initialZoomMode);
  const [splitRatio, setSplitRatio] = useState<number>(initialSplitRatio);
  const [overlayMode, setOverlayMode] = useState<boolean>(initialOverlayMode);

  // State: toast alert banner
  const [toast, setToast] = useState<{ id: string; message: string; type: 'error' | 'info' | 'success' } | null>(null);

  // Ref to measure container dimensions for Fit zoom
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceRef.current) return;
    const updateDimensions = () => {
      if (workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerDimensions({ width: rect.width, height: rect.height });
        }
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Compute active report via @anwc/report
  const report = useMemo<Report | null>(() => {
    try {
      return createReport(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);

  // Compute active selected finding object
  const selectedFinding = useMemo<Finding | null>(() => {
    if (!selectedFindingId || !snapshot.findings) return null;
    return snapshot.findings.find((f) => f.findingId === selectedFindingId) ?? null;
  }, [snapshot, selectedFindingId]);

  // Compute target box for ground truth highlight
  const selectedFindingBox = useMemo<Rect | null>(() => {
    if (!selectedFinding || !snapshot) return null;
    const boxes = computeXRayBoundingBoxes(snapshot, selectedFinding);
    return boxes.target ?? null;
  }, [snapshot, selectedFinding]);

  // Compute effective zoom scale ratio
  const effectiveZoom = useMemo<number>(() => {
    if (zoomMode === 'fit' && containerDimensions) {
      const availableWidth = overlayMode ? containerDimensions.width : containerDimensions.width * splitRatio;
      return computeFitZoom(
        snapshot.page.viewport,
        { width: availableWidth, height: containerDimensions.height },
        32
      );
    }
    return typeof zoom === 'number' ? zoom : 1;
  }, [zoom, zoomMode, containerDimensions, overlayMode, splitRatio, snapshot.page.viewport]);

  // Preset quick picker handler
  const handleSelectPreset = (presetId: string) => {
    const preset = STUDIO_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSnapshot(preset.snapshot);
      setActivePresetId(preset.id);
      setUrl(preset.snapshot.page.url);
      setSelectedFindingId(preset.snapshot.findings[0]?.findingId ?? null);
      setHoveredSample(null);
    }
  };

  // Viewport change handler
  const handleSelectViewport = (newViewport: { width: number; height: number; id?: string }) => {
    setSnapshot((prev) => ({
      ...prev,
      page: {
        ...prev.page,
        viewport: { width: newViewport.width, height: newViewport.height }
      }
    }));
  };

  // Zoom change handler
  const handleZoomChange = (newZoom: number | 'fit', mode?: string) => {
    if (newZoom === 'fit') {
      setZoomMode('fit');
    } else {
      setZoom(newZoom);
      setZoomMode(mode ?? `${Math.round(newZoom * 100)}%`);
    }
  };

  // Overlay mode toggle handler
  const handleToggleOverlay = () => {
    setOverlayMode((prev) => !prev);
  };

  // Node selection from XRay pane
  const handleSelectNode = (nodeId: string) => {
    const matchingFinding = snapshot.findings?.find(
      (f) => f.nodeId === nodeId || f.relatedNodeIds.includes(nodeId)
    );
    if (matchingFinding) {
      setSelectedFindingId(matchingFinding.findingId);
    }
  };

  // Live URL inspection via /api/inspect
  const handleInspect = async (inspectUrl: string) => {
    const trimmed = inspectUrl.trim();
    if (!trimmed || !isValidTargetUrl(trimmed)) {
      setToast({
        id: String(Date.now()),
        message: 'Please provide a valid http: or https: URL to inspect.',
        type: 'error'
      });
      return;
    }

    setIsInspecting(true);
    setToast(null);

    try {
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
          viewport: snapshot.page.viewport
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? `Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (!data.ok || !data.snapshot) {
        throw new Error(data.error ?? 'Inspection response is missing snapshot payload.');
      }

      setSnapshot(data.snapshot);
      setActivePresetId(null);
      setUrl(trimmed);
      setSelectedFindingId(data.snapshot.findings?.[0]?.findingId ?? null);
      setHoveredSample(null);

      setToast({
        id: String(Date.now()),
        message: `Inspection succeeded: ${data.snapshot.findings?.length ?? 0} findings detected.`,
        type: 'success'
      });
    } catch (err: any) {
      setToast({
        id: String(Date.now()),
        message: `Inspection failed: ${err?.message || 'Connection error'}`,
        type: 'error'
      });
    } finally {
      setIsInspecting(false);
    }
  };

  // Local JSON file upload handler
  const handleLoadJsonFile = (file: File) => {
    setToast(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error('Could not read file content as text');
        }

        const result = parseUploadedSnapshotJson(content);

        if (result.type === 'snapshot') {
          setSnapshot(result.snapshot);
          setActivePresetId(null);
          setUrl(result.snapshot.page.url || '');
          setSelectedFindingId(result.snapshot.findings?.[0]?.findingId ?? null);
          setHoveredSample(null);

          setToast({
            id: String(Date.now()),
            message: `Loaded snapshot "${result.snapshot.captureId || file.name}" with ${result.snapshot.findings?.length ?? 0} findings.`,
            type: 'success'
          });
        } else if (result.type === 'report') {
          const reportFindings = extractFindings(result.report);
          if (result.snapshot) {
            setSnapshot(result.snapshot);
            setActivePresetId(null);
            setUrl(result.snapshot.page.url || '');
            setSelectedFindingId(reportFindings[0]?.findingId ?? null);
            setHoveredSample(null);
          }
          setToast({
            id: String(Date.now()),
            message: `Loaded report "${result.report.reportId}" with ${reportFindings.length} findings.`,
            type: 'success'
          });
        } else if (result.type === 'diff') {
          setToast({
            id: String(Date.now()),
            message: result.message,
            type: 'info'
          });
        }
      } catch (err: any) {
        setToast({
          id: String(Date.now()),
          message: `Failed to load file: ${err?.message || 'Unknown error'}`,
          type: 'error'
        });
      }
    };

    reader.onerror = () => {
      setToast({
        id: String(Date.now()),
        message: `FileReader error: ${reader.error?.message || 'Could not read file'}`,
        type: 'error'
      });
    };

    reader.readAsText(file);
  };

  return (
    <div
      className={`anwc-studio-app ${className}`.trim()}
      data-testid="studio-app"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#020617',
        color: '#f8fafc',
        ...style
      }}
    >
      {/* Top Header Bar */}
      <Header
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        url={url}
        onUrlChange={setUrl}
        onInspect={handleInspect}
        isInspecting={isInspecting}
        viewport={snapshot.page.viewport}
        onSelectViewport={handleSelectViewport}
        viewportPresets={VIEWPORT_PRESETS}
        zoom={effectiveZoom}
        zoomMode={zoomMode}
        onZoomChange={handleZoomChange}
        overlayMode={overlayMode}
        onToggleOverlay={handleToggleOverlay}
        onLoadJsonFile={handleLoadJsonFile}
      />

      {/* Main Split Viewport Area */}
      <div
        ref={workspaceRef}
        className="anwc-viewport-workspace"
        data-testid="viewport-workspace"
        style={{
          display: 'flex',
          flex: '1 1 0%',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#090d16'
        }}
      >
        <SplitView
          splitRatio={splitRatio}
          overlayMode={overlayMode}
          zoom={effectiveZoom}
          onSplitRatioChange={setSplitRatio}
          onOverlayModeChange={setOverlayMode}
          left={
            <GroundTruthPane
              url={url}
              targetUrl={url}
              viewport={snapshot.page.viewport}
              activeFinding={selectedFinding}
              activeFindingBox={selectedFindingBox}
              snapshot={snapshot}
              zoom={effectiveZoom}
            />
          }
          right={
            <XRayPane
              snapshot={snapshot}
              activeFinding={selectedFinding}
              selectedFindingId={selectedFindingId}
              selectedNodeId={selectedFinding?.nodeId ?? null}
              onSelectNode={handleSelectNode}
              onHoverSample={setHoveredSample}
              zoom={effectiveZoom}
              overlayMode={overlayMode}
            />
          }
        />
      </div>

      {/* Bottom Diagnostic Findings Drawer */}
      <FindingDrawer
        snapshot={snapshot}
        report={report}
        selectedFindingId={selectedFindingId}
        onSelectFinding={setSelectedFindingId}
      />

      {/* Synchronized Hovered Raycast Sample Tooltip Status Pill */}
      {hoveredSample && (
        <div
          data-testid="hovered-sample-bar"
          style={{
            position: 'absolute',
            bottom: '240px',
            left: '20px',
            zIndex: 50,
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '5px 12px',
            fontSize: '11px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: '#e2e8f0',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
          }}
        >
          Sample ({hoveredSample.x}, {hoveredSample.y}) →{' '}
          <strong
            style={{
              color:
                hoveredSample.result === 'blocked'
                  ? '#ef4444'
                  : hoveredSample.result === 'target-or-descendant'
                    ? '#10b981'
                    : '#94a3b8'
            }}
          >
            {hoveredSample.result}
          </strong>
          {hoveredSample.blockerNodeId && ` [blocker: ${hoveredSample.blockerNodeId}]`}
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="anwc-toast-container" data-testid="toast-container">
          <div
            className={`anwc-toast anwc-toast-${toast.type} anwc-fade-in`}
            data-testid="toast-alert"
          >
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              data-testid="toast-dismiss"
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'currentColor',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                padding: '0 4px',
                opacity: 0.8
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
