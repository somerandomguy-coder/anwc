export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export type SplitPaneMode = 'both' | 'left' | 'right';

/**
 * Clamps a split ratio between min and max bounds (default 0.1 to 0.9)
 * and rounds to 2 decimal places.
 */
export function clampSplitRatio(ratio: number, min = 0.1, max = 0.9): number {
  if (typeof ratio !== 'number' || Number.isNaN(ratio)) {
    return 0.5;
  }
  const clamped = Math.max(min, Math.min(max, ratio));
  return Math.round(clamped * 100) / 100;
}

/**
 * Computes CSS percentage widths for left and right panes given
 * splitRatio, activePane selection, and overlayMode.
 */
export function computePaneWidths(
  splitRatio: number,
  activePane: SplitPaneMode = 'both',
  overlayMode = false
): { left: string; right: string } {
  if (overlayMode) {
    return { left: '100%', right: '100%' };
  }
  if (activePane === 'left') {
    return { left: '100%', right: '0%' };
  }
  if (activePane === 'right') {
    return { left: '0%', right: '100%' };
  }
  const clamped = clampSplitRatio(splitRatio);
  const leftPercent = Math.round(clamped * 100);
  return {
    left: `${leftPercent}%`,
    right: `${100 - leftPercent}%`
  };
}

/**
 * Computes integer pixel dimensions for a viewport scaled by zoom factor.
 */
export function computeScaledDimensions(
  viewport: ViewportDimensions,
  zoom: number
): ViewportDimensions {
  return {
    width: Math.round(viewport.width * zoom),
    height: Math.round(viewport.height * zoom)
  };
}

/**
 * Calculates optimal zoom factor (fit zoom) so that a target viewport fits within
 * container bounds with specified padding.
 */
export function computeFitZoom(
  viewport: ViewportDimensions,
  container: ContainerDimensions,
  padding = 32
): number {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    container.width <= 0 ||
    container.height <= 0
  ) {
    return 1;
  }
  const availableWidth = Math.max(container.width - padding * 2, 40);
  const availableHeight = Math.max(container.height - padding * 2, 40);
  const scaleX = availableWidth / viewport.width;
  const scaleY = availableHeight / viewport.height;
  const rawFit = Math.min(scaleX, scaleY);
  // Cap at 1.0 (do not upscale past 100% on huge displays unless requested) and min 0.1
  const clamped = Math.max(0.1, Math.min(1.0, rawFit));
  return Math.round(clamped * 100) / 100;
}
