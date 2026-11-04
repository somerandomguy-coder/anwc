import type { Finding, Measurement, Rect, Snapshot } from '@anwc/protocol';
import type { HitSample, HoveredSampleInfo, NodeSnapshot } from '../types.js';

export interface XRayBoundingBoxes {
  target?: Rect;
  blockers: Rect[];
  targetNode?: NodeSnapshot;
  blockerNodes: NodeSnapshot[];
  allNodes: NodeSnapshot[];
}

export interface SampleWithNode extends HitSample {
  targetNodeId: string;
}

/**
 * Maps raycast sample results to color hex values.
 * - 'target-or-descendant' -> '#22c55e' (green)
 * - 'blocked' -> '#ef4444' (red)
 * - 'no-target' -> '#f59e0b' (amber)
 */
export function mapSampleColor(result: 'target-or-descendant' | 'blocked' | 'no-target' | string): string {
  switch (result) {
    case 'target-or-descendant':
      return '#22c55e';
    case 'blocked':
      return '#ef4444';
    case 'no-target':
      return '#f59e0b';
    default:
      return '#94a3b8';
  }
}

/**
 * Extracts target and blocker bounding boxes and nodes for the active finding.
 */
export function computeXRayBoundingBoxes(
  snapshot: Snapshot,
  finding?: Finding | null
): XRayBoundingBoxes {
  const allNodes = snapshot.nodes;
  const nodeMap = new Map<string, Measurement>();
  for (const node of allNodes) {
    nodeMap.set(node.nodeId, node);
  }

  if (!finding) {
    return {
      target: undefined,
      blockers: [],
      targetNode: undefined,
      blockerNodes: [],
      allNodes
    };
  }

  const targetNode = nodeMap.get(finding.nodeId);
  const target = targetNode?.box ?? undefined;

  const blockerNodeIdSet = new Set<string>();

  if (finding.evidence.kind === 'pointer-blocked') {
    for (const id of finding.evidence.blockerNodeIds) {
      if (id && id !== finding.nodeId) {
        blockerNodeIdSet.add(id);
      }
    }
  } else if (finding.evidence.kind === 'clipped-by-ancestor') {
    for (const id of finding.evidence.ancestorNodeIds) {
      if (id && id !== finding.nodeId) {
        blockerNodeIdSet.add(id);
      }
    }
  }

  for (const id of finding.relatedNodeIds) {
    if (id && id !== finding.nodeId) {
      blockerNodeIdSet.add(id);
    }
  }

  const blockerNodes: NodeSnapshot[] = [];
  const blockers: Rect[] = [];

  for (const id of blockerNodeIdSet) {
    const node = nodeMap.get(id);
    if (node) {
      blockerNodes.push(node);
      if (node.box) {
        blockers.push(node.box);
      }
    }
  }

  return {
    target,
    blockers,
    targetNode,
    blockerNodes,
    allNodes
  };
}

/**
 * Aggregates all pointer samples available in the snapshot.
 */
export function getAllPointerSamples(snapshot: Snapshot): SampleWithNode[] {
  const samples: SampleWithNode[] = [];
  for (const node of snapshot.nodes) {
    if (node.pointer && node.pointer.status !== 'unknown' && node.pointer.value?.samples) {
      for (const s of node.pointer.value.samples) {
        samples.push({
          x: s.x,
          y: s.y,
          result: s.result,
          blockerNodeId: s.blockerNodeId,
          targetNodeId: node.nodeId
        });
      }
    }
  }
  return samples;
}

/**
 * Constructs HoveredSampleInfo enriched with blocker details from the snapshot.
 */
export function buildHoveredSampleInfo(
  sample: HitSample & { targetNodeId?: string | null },
  snapshot: Snapshot,
  screenPos?: { screenX: number; screenY: number }
): HoveredSampleInfo {
  const blockerNode = sample.blockerNodeId
    ? snapshot.nodes.find((n) => n.nodeId === sample.blockerNodeId)
    : null;

  return {
    x: sample.x,
    y: sample.y,
    result: sample.result,
    blockerNodeId: sample.blockerNodeId ?? null,
    blockerTag: blockerNode?.tag ?? null,
    blockerLabel: blockerNode?.label || blockerNode?.tag || null,
    targetNodeId: sample.targetNodeId ?? null,
    screenX: screenPos?.screenX,
    screenY: screenPos?.screenY
  };
}
