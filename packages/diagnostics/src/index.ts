import type { DiagnosticEvidence, Finding, Measurement, RawCapture } from '@anwc/protocol';

function severity(node: Measurement): Finding['severity'] {
  return node.intent.expectedCurrent ? 'error' : 'warning';
}

function finding(
  node: Measurement,
  code: string,
  message: string,
  evidence: DiagnosticEvidence,
  relatedNodeIds: string[] = [],
  limitations: string[] = [],
  acknowledged = false,
  suggestion: string | null = null
): Finding {
  return {
    findingId: `f_${node.nodeId}_${code.toLowerCase()}`,
    code,
    severity: acknowledged ? 'info' : severity(node),
    nodeId: node.nodeId,
    source: node.source,
    message,
    evidence,
    relatedNodeIds: [...new Set(relatedNodeIds)],
    limitations,
    acknowledged,
    suggestion
  };
}

function hiddenReasons(node: Measurement): string[] {
  const reasons = [...node.render.cssHiddenReasons];
  if (node.render.effectiveOpacityZero.status !== 'unknown' && node.render.effectiveOpacityZero.value) reasons.push('effective-opacity:0');
  return [...new Set(reasons)];
}

export function diagnose(capture: RawCapture): Finding[] {
  const findings: Finding[] = [];
  for (const node of capture.nodes) {
    const horizontalOverflow = node.overflow !== null && node.overflow.scrollWidth > node.overflow.clientWidth;
    if (horizontalOverflow) {
      const acknowledged = node.intent.allow.includes('horizontal-scroll');
      findings.push(finding(
        node,
        'HORIZONTAL_OVERFLOW',
        `${node.label || node.tag} scrolls horizontally beyond its client width.`,
        { kind: 'horizontal-overflow', clientWidth: node.overflow!.clientWidth, scrollWidth: node.overflow!.scrollWidth },
        [],
        [],
        acknowledged,
        acknowledged ? null : 'Inspect width constraints or declare horizontal scrolling as intentional.'
      ));
    }

    // A zero-area box has no visible fraction to lose, so it is never reported as clipped.
    if (node.box !== null && node.box.width > 0 && node.box.height > 0 && node.clip.status === 'known' && node.clip.value.boxFraction < 1) {
      findings.push(finding(
        node,
        'CLIPPED_BY_ANCESTOR',
        `${node.label || node.tag} is clipped by a supported ancestor rectangle.`,
        { kind: 'clipped-by-ancestor', boxFraction: node.clip.value.boxFraction, ancestorNodeIds: node.clip.value.ancestors.map((ancestor) => ancestor.nodeId) },
        node.clip.value.ancestors.map((ancestor) => ancestor.nodeId),
        node.clip.limitations,
        false,
        'Inspect the ancestor overflow and the child dimensions in this viewport.'
      ));
    }

    if (node.text.status === 'known' && node.text.value.clippedFragmentCount > 0) {
      const acknowledged = node.intent.allow.includes('text-truncation');
      findings.push(finding(
        node,
        'TEXT_CLIPPED',
        `${node.label || node.tag} has clipped direct-text fragments.`,
        { kind: 'text-clipped', clippedFragmentCount: node.text.value.clippedFragmentCount, lineCount: node.text.value.lineCount },
        [],
        node.text.limitations,
        acknowledged,
        acknowledged ? null : 'Inspect the text container width, overflow, and truncation intent.'
      ));
    }

    if (node.text.status === 'known' && node.intent.maxLines !== null && node.text.value.lineCount > node.intent.maxLines) {
      findings.push(finding(
        node,
        'TEXT_LINE_BUDGET_EXCEEDED',
        `${node.label || node.tag} uses ${node.text.value.lineCount} lines but allows ${node.intent.maxLines}.`,
        { kind: 'text-line-budget-exceeded', observedLines: node.text.value.lineCount, maxLines: node.intent.maxLines },
        [],
        node.text.limitations,
        false,
        'Adjust the layout, copy, or declared line budget.'
      ));
    }

    const reasons = hiddenReasons(node);
    if (node.intent.expectedCurrent && reasons.length > 0) {
      findings.push(finding(
        node,
        'EXPECTED_VISIBLE_BUT_HIDDEN',
        `${node.label || node.tag} is expected to be ${node.intent.expectedCurrent} but is hidden.`,
        { kind: 'expected-visible-but-hidden', hiddenReasons: reasons, expectedCurrent: node.intent.expectedCurrent },
        [],
        node.render.effectiveOpacityZero.limitations,
        false,
        'Inspect display, visibility, content-visibility, opacity, and the current component state.'
      ));
    }

    if (node.intent.expectedCurrent && node.viewport.status === 'known' && node.viewport.value.boxFraction === 0 && node.box !== null) {
      findings.push(finding(
        node,
        'OUTSIDE_VIEWPORT',
        `${node.label || node.tag} is expected to be ${node.intent.expectedCurrent} but is outside the viewport.`,
        { kind: 'generic', details: { boxFraction: node.viewport.value.boxFraction, method: node.viewport.method } },
        [],
        node.viewport.limitations,
        false,
        'Inspect positioning, scroll state, and responsive layout.'
      ));
    }

    if (node.intent.expectedCurrent && node.clip.status === 'unknown') {
      findings.push(finding(
        node,
        'UNSUPPORTED_VISIBILITY',
        `${node.label || node.tag} has a visibility expectation outside the supported clip model.`,
        { kind: 'generic', details: { expectedCurrent: node.intent.expectedCurrent, method: node.clip.method } },
        [],
        node.clip.limitations,
        false,
        null
      ));
    }

    if (node.pointer.status === 'known' && !node.interaction.disabled && !node.interaction.inert && node.pointer.value.tested > 0 && node.pointer.value.blocked > 0) {
      const allBlocked = node.pointer.value.blocked === node.pointer.value.tested;
      const blockers = node.pointer.value.samples.flatMap((sample) => sample.blockerNodeId ? [sample.blockerNodeId] : []);
      findings.push(finding(
        node,
        allBlocked ? 'POINTER_BLOCKED_AT_SAMPLES' : 'POINTER_PARTIALLY_BLOCKED',
        `${node.label || node.tag} has ${node.pointer.value.blocked}/${node.pointer.value.tested} pointer samples blocked.`,
        { kind: 'pointer-blocked', tested: node.pointer.value.tested, blocked: node.pointer.value.blocked, blockerNodeIds: [...new Set(blockers)] },
        blockers,
        node.pointer.limitations,
        false,
        'Inspect the blocking element and stacking context at the sampled points.'
      ));
    }
  }
  return findings;
}
