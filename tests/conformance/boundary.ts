import type { Measurement, RawCapture } from '../../packages/protocol/src/index.js';
import type { BoundarySignal } from './types.js';

/**
 * Case-specific boundary checks (LAUNCH L3).
 *
 * A boundary case passes only when the capture carries the signal its case
 * declares: a coverage cap reason, an unsettled-readiness reason, an `unknown`
 * assessment with a matching limitation on the keyed node, a boxless keyed
 * node, or a collapsed pointer sample grid. The old all-node paint-unknown
 * fallback is deliberately NOT accepted: v0 marks every node's paint
 * visibility unknown, so it is true for every capture and proves nothing.
 *
 * `known-gap` cases have no runtime signal today. They never pass; the runner
 * reports them separately so they cannot be counted as conformance passes.
 */

export interface BoundaryEvaluation {
  present: boolean;
  evidence: string;
}

function nodeByKey(capture: RawCapture, key: string): Measurement | undefined {
  return capture.nodes.find((node) => node.semanticKey === key);
}

export function evaluateBoundarySignal(signal: BoundarySignal, capture: RawCapture): BoundaryEvaluation {
  switch (signal.kind) {
    case 'coverage-cap': {
      const present = !capture.coverage.complete && capture.coverage.skippedNodes > 0 && capture.coverage.reasons.includes(signal.reason);
      return {
        present,
        evidence: `coverage.complete=${capture.coverage.complete}, skippedNodes=${capture.coverage.skippedNodes}, reasons=[${capture.coverage.reasons.join('; ')}]`
      };
    }
    case 'readiness-unsettled': {
      const present = !capture.readiness.settled && capture.readiness.reasons.includes(signal.reason);
      return { present, evidence: `readiness.settled=${capture.readiness.settled}, reasons=[${capture.readiness.reasons.join('; ')}]` };
    }
    case 'assessment-unknown': {
      const node = nodeByKey(capture, signal.key);
      if (!node) return { present: false, evidence: `no captured node with key "${signal.key}"` };
      const assessment = node[signal.field];
      const present = assessment.status === 'unknown' && assessment.limitations.some((limitation) => limitation.includes(signal.limitation));
      return { present, evidence: `${signal.key}.${signal.field}.status=${assessment.status}, limitations=[${assessment.limitations.join('; ')}]` };
    }
    case 'boxless-node': {
      const node = nodeByKey(capture, signal.key);
      if (!node) return { present: false, evidence: `no captured node with key "${signal.key}"` };
      const present = node.box === null && !node.render.hasBox;
      return { present, evidence: `${signal.key}.box=${JSON.stringify(node.box)}, render.hasBox=${node.render.hasBox}` };
    }
    case 'pointer-sample-collapse': {
      const node = nodeByKey(capture, signal.key);
      if (!node) return { present: false, evidence: `no captured node with key "${signal.key}"` };
      if (node.pointer.status === 'unknown') return { present: false, evidence: `${signal.key}.pointer.status=unknown` };
      const tested = node.pointer.value.tested;
      const present = tested > 0 && tested < signal.sampleBudget;
      return { present, evidence: `${signal.key}.pointer.tested=${tested} of budget ${signal.sampleBudget}` };
    }
    case 'truncated-node': {
      const node = nodeByKey(capture, signal.key);
      const present = !capture.coverage.complete && capture.coverage.reasons.includes(signal.reason) && node?.truncated === true;
      return { present, evidence: `${signal.key}.truncated=${node?.truncated}, coverage.complete=${capture.coverage.complete}, reasons=[${capture.coverage.reasons.join('; ')}]` };
    }
    case 'known-gap':
      return { present: false, evidence: `known gap: ${signal.reason}` };
  }
}

/**
 * Negative control: return a copy of `capture` with exactly the declared signal
 * removed. Everything else, including all-node paint-unknown and the static
 * `unsupportedFeatures` list, is kept, so the old fallback would still pass on
 * the result while `evaluateBoundarySignal` must fail.
 */
export function withoutBoundarySignal(signal: BoundarySignal, capture: RawCapture): RawCapture {
  const copy = structuredClone(capture);
  switch (signal.kind) {
    case 'coverage-cap':
      copy.coverage.complete = true;
      copy.coverage.inspectedNodes += copy.coverage.skippedNodes;
      copy.coverage.skippedNodes = 0;
      copy.coverage.reasons = copy.coverage.reasons.filter((reason) => reason !== signal.reason);
      return copy;
    case 'readiness-unsettled':
      copy.readiness.settled = true;
      copy.readiness.reasons = copy.readiness.reasons.filter((reason) => reason !== signal.reason);
      return copy;
    case 'assessment-unknown': {
      const node = copy.nodes.find((candidate) => candidate.semanticKey === signal.key);
      if (node) {
        const assessment = node[signal.field] as { limitations: string[] };
        assessment.limitations = assessment.limitations.filter((limitation) => !limitation.includes(signal.limitation));
      }
      return copy;
    }
    case 'boxless-node': {
      const node = copy.nodes.find((candidate) => candidate.semanticKey === signal.key);
      if (node) {
        node.box = { x: 0, y: 0, width: 10, height: 10 };
        node.render.hasBox = true;
      }
      return copy;
    }
    case 'pointer-sample-collapse': {
      const node = copy.nodes.find((candidate) => candidate.semanticKey === signal.key);
      if (node && node.pointer.status !== 'unknown') node.pointer.value.tested = signal.sampleBudget;
      return copy;
    }
    case 'truncated-node': {
      const node = copy.nodes.find((candidate) => candidate.semanticKey === signal.key);
      if (node) delete node.truncated;
      return copy;
    }
    case 'known-gap':
      return copy;
  }
}

/** The pre-L3 fallback, kept only so tests can show it is not specific. */
export function legacyBoundaryFallback(capture: RawCapture): boolean {
  const paintUnknown = capture.nodes.every((node) => node.paintVisibility.status === 'unknown');
  return !capture.coverage.complete || paintUnknown || capture.coverage.unsupportedFeatures.length > 0;
}
