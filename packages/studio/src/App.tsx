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
import { XRayLegend } from './components/XRayLegend.js';
import { checkViewportAlignment, findingRoleBoxes, legendSentence } from './components/encoding.js';
import { useFindingView } from './components/useFindingView.js';

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

  // CLI stdout is an envelope; unwrap it so a redirected file loads too.
  if (parsed.ok === true && parsed.command && parsed.data) parsed = parsed.data;

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

/** The finding listed first (report order: most severe first), not the first one captured. */
function firstFindingId(snapshot: Snapshot): string | null {
  try {
    return extractFindings(createReport(snapshot))[0]?.findingId ?? null;
  } catch {
    return snapshot.findings?.[0]?.findingId ?? null;
  }
}

const countFindings = (count: number) => `${count} ${count === 1 ? 'finding' : 'findings'}`;

export function App({
  initialSnapshot,
  initialPresetId,
  initialSelectedFindingId,
  initialOverlayMode = false,
  initialSplitRatio = 0.5,
  initialZoom = 1,
  initialZoomMode = 'fit',
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

  // Viewport the page frame shows. It starts at the capture's viewport and is
  // changed by the viewport picker; the capture itself is never rewritten, so
  // the x-ray can refuse to draw when the two differ (P11).
  // A picker choice belongs to the snapshot it was made on; a new snapshot starts aligned.
  const [frameOverride, setFrameOverride] = useState<{ snapshot: Snapshot; viewport: { width: number; height: number } } | null>(null);
  const frameViewport = frameOverride && frameOverride.snapshot === snapshot ? frameOverride.viewport : snapshot.page.viewport;
  const [isInspecting, setIsInspecting] = useState<boolean>(false);

  // State: selected finding
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    initialSelectedFindingId ?? firstFindingId(snapshot)
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

  // Success and info notices clear themselves; errors stay until dismissed.
  useEffect(() => {
    if (!toast || toast.type === 'error') return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
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

  // Ordered findings shared by the x-ray and the drawer (report order when available).
  const orderedFindings = useMemo(
    () => (report ? extractFindings(report) : snapshot.findings ?? []),
    [report, snapshot]
  );
  const findingView = useFindingView({
    findings: orderedFindings,
    selectedFindingId,
    onSelectFinding: setSelectedFindingId,
    keyboard: true
  });
  const viewportAligned = checkViewportAlignment(snapshot.page.viewport, frameViewport).aligned;

  const legendText = useMemo(() => {
    const isolated = snapshot.findings.find((f) => f.findingId === findingView.isolatedFindingId);
    return legendSentence({
      totalFindings: snapshot.findings.length,
      visibleFindings: findingView.visibleIds.length,
      isolated: isolated
        ? {
            number: findingView.numbering.get(isolated.findingId) ?? 1,
            code: isolated.code,
            roles: new Set(findingRoleBoxes(snapshot, isolated).map((b) => b.role))
          }
        : null
    });
  }, [snapshot, findingView.isolatedFindingId, findingView.visibleIds, findingView.numbering]);

  // Compute target box for ground truth highlight (none when the frame and capture viewports differ)
  const selectedFindingBox = useMemo<Rect | null>(() => {
    if (!selectedFinding || !snapshot || !viewportAligned) return null;
    const boxes = computeXRayBoundingBoxes(snapshot, selectedFinding);
    return boxes.target ?? null;
  }, [snapshot, selectedFinding, viewportAligned]);

  // Compute effective zoom scale ratio
  const effectiveZoom = useMemo<number>(() => {
    if (zoomMode === 'fit' && containerDimensions) {
      const availableWidth = overlayMode ? containerDimensions.width : containerDimensions.width * Math.min(splitRatio, 1 - splitRatio);
      return computeFitZoom(
        frameViewport,
        { width: availableWidth, height: containerDimensions.height - 24 },
        24
      );
    }
    return typeof zoom === 'number' ? zoom : 1;
  }, [zoom, zoomMode, containerDimensions, overlayMode, splitRatio, frameViewport]);

  // Preset quick picker handler
  const handleSelectPreset = (presetId: string) => {
    const preset = STUDIO_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSnapshot(preset.snapshot);
      setActivePresetId(preset.id);
      setUrl(preset.snapshot.page.url);
      setSelectedFindingId(firstFindingId(preset.snapshot));
      setHoveredSample(null);
    }
  };

  // Viewport change handler: resizes the page frame only. The capture keeps its
  // own viewport; inspecting again captures at the new size.
  const handleSelectViewport = (newViewport: { width: number; height: number; id?: string }) => {
    setFrameOverride({ snapshot, viewport: { width: newViewport.width, height: newViewport.height } });
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
          viewport: frameViewport
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
      setSelectedFindingId(firstFindingId(data.snapshot));
      setHoveredSample(null);

      setToast({
        id: String(Date.now()),
        message: `Inspection complete: ${countFindings(data.snapshot.findings?.length ?? 0)}.`,
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
          setSelectedFindingId(firstFindingId(result.snapshot));
          setHoveredSample(null);

          setToast({
            id: String(Date.now()),
            message: `Loaded snapshot "${result.snapshot.captureId || file.name}" with ${countFindings(result.snapshot.findings?.length ?? 0)}.`,
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
      style={style}
    >
      {/* Top Header Bar */}
      <Header
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        url={url}
        onUrlChange={setUrl}
        onInspect={handleInspect}
        isInspecting={isInspecting}
        viewport={frameViewport}
        onSelectViewport={handleSelectViewport}
        viewportPresets={VIEWPORT_PRESETS}
        zoom={effectiveZoom}
        zoomMode={zoomMode}
        onZoomChange={handleZoomChange}
        overlayMode={overlayMode}
        onToggleOverlay={handleToggleOverlay}
        onLoadJsonFile={handleLoadJsonFile}
      />

      <main className="anwc-bench">
      <div
        ref={workspaceRef}
        className="anwc-viewport-workspace"
        data-testid="viewport-workspace"
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
              viewport={frameViewport}
              activeFinding={viewportAligned ? selectedFinding : null}
              activeFindingBox={selectedFindingBox}
              snapshot={snapshot}
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
              view={findingView}
              frameViewport={frameViewport}
              showLegend={false}
              overlayMode={overlayMode}
            />
          }
        />
      </div>

      {/* Findings, beside the page they describe */}
      <div className="anwc-side">
      <FindingDrawer
        snapshot={snapshot}
        report={report}
        selectedFindingId={selectedFindingId}
        onSelectFinding={setSelectedFindingId}
        view={findingView}
      />
      <XRayLegend sentence={legendText} />
      </div>
      </main>

      {/* Synchronized Hovered Raycast Sample Tooltip Status Pill */}
      {hoveredSample && (
        <div
          data-testid="hovered-sample-bar"
          className="anwc-sample-bar"
        >
          Sample ({hoveredSample.x}, {hoveredSample.y}) →{' '}
          <strong data-result={hoveredSample.result}>
            {hoveredSample.result}
          </strong>
          {hoveredSample.blockerNodeId && ` [blocker: ${hoveredSample.blockerNodeId}]`}
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="anwc-toast-container" data-testid="toast-container" role="status" aria-live="polite">
          <div
            className={`anwc-toast anwc-toast-${toast.type} anwc-fade-in`}
            data-testid="toast-alert"
          >
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              type="button"
              data-testid="toast-dismiss"
              onClick={() => setToast(null)}
              className="anwc-toast-close"
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
