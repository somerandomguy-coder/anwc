import type { Finding, Measurement, Rect, Snapshot } from '@anwc/protocol';

export type NodeSnapshot = Measurement;

export interface HitSample {
  x: number;
  y: number;
  result: 'target-or-descendant' | 'blocked' | 'no-target';
  blockerNodeId?: string | null;
}

export interface StudioPreset {
  id: string;
  title: string;
  description: string;
  snapshot: Snapshot;
}

export interface ActiveFindingSelection {
  findingId: string;
  finding?: Finding;
  targetNodeId?: string;
  targetNode?: NodeSnapshot | null;
  blockerNodeIds?: string[];
  blockerNodes?: NodeSnapshot[];
  targetBox?: Rect | null;
  blockerBoxes?: Rect[];
}

export interface ViewportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'mobile', label: 'Mobile (390 × 844)', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet (768 × 1024)', width: 768, height: 1024 },
  { id: 'desktop', label: 'Desktop (1440 × 900)', width: 1440, height: 900 }
];

export interface HoveredSampleInfo {
  x: number;
  y: number;
  result: 'target-or-descendant' | 'blocked' | 'no-target' | string;
  blockerNodeId?: string | null;
  blockerTag?: string | null;
  blockerLabel?: string | null;
  targetNodeId?: string | null;
  screenX?: number;
  screenY?: number;
}

export type BlendMode = 'split' | 'overlay' | 'side-by-side' | 'difference';
