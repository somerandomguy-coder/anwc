import type { Measurement } from '@anwc/protocol';
import type { ReportFinding } from './schema.js';
import type { VerdictReason } from './verdict-schema.js';

type Blocked = { reason: VerdictReason; explanation: string };

const unsupported = (what: string): Blocked => ({ reason: 'measurement_unsupported', explanation: `Finding is no longer observed, but ${what}. Its absence is not a measurement.` });
const intentChanged = (what: string): Blocked => ({ reason: 'intent_changed', explanation: `Finding is no longer observed, but ${what}. Changing the expectation is not a repair.` });

/** Declared expectations the finding's rule needs in order to fire at all. */
function intentProblem(before: ReportFinding, after: Measurement): Blocked | null {
  const { evidence } = before;
  if (evidence.kind === 'text-line-budget-exceeded') {
    if (after.intent.maxLines === null) return intentChanged('the line budget (data-anwc-max-lines) was removed');
    if (after.intent.maxLines > evidence.maxLines) return intentChanged(`the line budget was raised from ${evidence.maxLines} to ${after.intent.maxLines}`);
  }
  const needsExpectation = evidence.kind === 'expected-visible-but-hidden' || before.code === 'OUTSIDE_VIEWPORT' || before.code === 'UNSUPPORTED_VISIBILITY';
  if (needsExpectation && after.intent.expectedCurrent === null) return intentChanged('the visibility expectation (data-anwc-expect) was removed');
  return null;
}

/** Same definition of hidden as the EXPECTED_VISIBLE_BUT_HIDDEN rule. */
function hiddenReasons(node: Measurement): string[] {
  const opacity = node.render.effectiveOpacityZero;
  return [...node.render.cssHiddenReasons, ...(opacity.status !== 'unknown' && opacity.value ? ['effective-opacity:0'] : [])];
}

/** Why the absence of `before` on the retained target is not evidence, or null when the rule could have fired. */
export function absenceProblem(before: ReportFinding, beforeNode: Measurement | null, after: Measurement | null): Blocked | null {
  if (!after) return unsupported('the after input is a Report without node measurements; diff the after Snapshot');
  const intent = intentProblem(before, after);
  if (intent) return intent;

  const { evidence } = before;
  const opacity = after.render.effectiveOpacityZero;
  const hidden = hiddenReasons(after);
  if (hidden.length > 0) {
    if (beforeNode && hiddenReasons(beforeNode).length > 0) return unsupported('the target is hidden in both captures');
    return { reason: 'target_hidden', explanation: `Target is still in the DOM but is now hidden (${hidden.join(', ')}). Hiding the target cannot masquerade as a verified repair.` };
  }
  if (!after.render.hasBox || after.box === null) return unsupported('the target has no layout box in the after capture');

  switch (evidence.kind) {
    case 'pointer-blocked':
      if (after.interaction.disabled || after.interaction.inert) return unsupported('the target is now disabled or inert, so pointer blocking no longer applies to it');
      if (after.pointer.status !== 'known' || after.pointer.value.tested === 0) return unsupported('pointer access was not sampled on the target in the after capture');
      if (after.pointer.value.noTarget > 0) return unsupported(`${after.pointer.value.noTarget} pointer sample(s) hit no element`);
      return null;
    case 'horizontal-overflow':
      return after.overflow === null ? unsupported('overflow was not measured on the target') : null;
    case 'clipped-by-ancestor':
      return after.clip.status !== 'known' ? unsupported('ancestor clipping is outside the supported model in the after capture') : null;
    case 'text-clipped':
    case 'text-line-budget-exceeded':
      if (after.text.status !== 'known') return unsupported('text fragments were not measurable in the after capture');
      return after.text.value.lineCount === 0 ? unsupported('the target no longer renders direct text') : null;
    case 'expected-visible-but-hidden':
      return opacity.status === 'unknown' ? unsupported('effective opacity is unknown in the after capture') : null;
    case 'generic':
      if (before.code === 'OUTSIDE_VIEWPORT') return after.viewport.status !== 'known' ? unsupported('viewport intersection is unknown in the after capture') : null;
      if (before.code === 'UNSUPPORTED_VISIBILITY') return after.clip.status === 'unknown' ? unsupported('ancestor clipping is still unknown') : null;
      return unsupported(`rule '${before.code}' has no known measurement to re-check`);
  }
}
