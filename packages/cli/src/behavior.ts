import type { ElementHandle, JSHandle, Page } from 'playwright';
import type { Snapshot } from '@anwc/protocol';
import type { ReplayedCapture } from './baseline.js';
import type { BehaviorAssertion, CheckBehaviorEvidence, Checkpoint, CheckpointStep } from './manifest.js';

type InteractionStep = Extract<CheckpointStep, { action: 'click' | 'fill' }>;
type Outcome = 'pass' | 'fail' | 'error';
/** The part of the runner's scenario deadline used here. */
interface Bounds { bound<T>(label: string, ownMs: number, run: (timeoutMs: number) => Promise<T>): Promise<T> }

/**
 * A proving assertion must be seen failing for this whole window right before the step, and
 * passing within the same length of time from the step's start. Equal windows keep a change that
 * happens by itself from being credited to the step more easily than it is seen without it.
 */
export const BEHAVIOR_WINDOW_MS = 1_000;
const PROBE_INTERVAL_MS = 50;
const PROBE_TIMEOUT_MS = 500;

/** One immediate, non-waiting evaluation. On an absent element only `hidden` holds. */
async function probe(page: Page, assertion: BehaviorAssertion): Promise<Outcome> {
  try {
    const locator = page.locator(assertion.selector);
    const count = await locator.count();
    if (count > 1) return 'error';
    if (assertion.expected === 'visible' || assertion.expected === 'hidden') {
      return (await locator.isVisible()) === (assertion.expected === 'visible') ? 'pass' : 'fail';
    }
    if (count === 0) return 'fail';
    const options = { timeout: PROBE_TIMEOUT_MS };
    const holds = assertion.expected === 'text-contains'
      ? (await locator.innerText(options)).includes(assertion.expectedValue!)
      : (await locator.getAttribute(assertion.attributeName!, options)) === assertion.expectedValue;
    return holds ? 'pass' : 'fail';
  } catch {
    return 'error';
  }
}

interface Pending {
  name: string;
  snapshot: Snapshot;
  /** The live element that carries each proven key at capture time; null unless exactly one does. */
  elements: Map<string, ElementHandle<Element> | null>;
}

/**
 * Performs a checkpoint's clicks and fills and records what they prove. The step that can prove
 * behavior is the first interaction after a capture, so the element is acted on in the captured
 * state. Interactions are never forced.
 */
export class BehaviorObserver {
  private readonly page: Page;
  private readonly bounds: Bounds;
  private readonly assertions: BehaviorAssertion[];
  private readonly evidence: CheckBehaviorEvidence[] = [];
  private pending: Pending[] = [];

  constructor(checkpoint: Checkpoint, page: Page, bounds: Bounds) {
    this.page = page;
    this.bounds = bounds;
    this.assertions = checkpoint.assertions.filter((a) => a.proves !== undefined);
  }

  async captured(name: string, snapshot: Snapshot): Promise<void> {
    if (this.assertions.length === 0) return;
    const elements: Pending['elements'] = new Map();
    for (const key of new Set(this.assertions.map((a) => a.proves!))) {
      const handle: JSHandle<Element | null> = await this.bounds.bound(`locating '${key}'`, 2_000, () => this.page.evaluateHandle((wanted) => {
        const found = [...document.querySelectorAll('[data-anwc-key]')].filter((e) => e.getAttribute('data-anwc-key') === wanted);
        return found.length === 1 ? found[0]! : null;
      }, key));
      elements.set(key, handle.asElement() as ElementHandle<Element> | null);
    }
    this.pending.push({ name, snapshot, elements });
  }

  /** A navigation or scroll leaves the captured state, so later steps prove nothing about it. */
  stateChanged(): void {
    this.settle(null, null, () => ['behavior_not_checked', 'a navigate or scroll step ran between the capture and the interaction.']);
  }

  stepFailed(step: number, action: 'click' | 'fill', error: string): void {
    this.settle(step, action, () => ['behavior_step_failed', `step ${step + 1} (${action}) failed: ${error.split('\n')[0]}`]);
  }

  async perform(index: number, step: InteractionStep, timeoutMs: number): Promise<void> {
    const label = `${step.action} on '${step.selector}'`;
    const locator = this.page.locator(step.selector);
    if (this.pending.length === 0) {
      await this.bounds.bound(label, timeoutMs, (t) => step.action === 'click' ? locator.click({ timeout: t }) : locator.fill(step.text, { timeout: t }));
      return;
    }

    // From here on one fixed element is used: if it is replaced, the step fails instead of retargeting.
    const element = await this.bounds.bound(label, timeoutMs, (t) => locator.elementHandle({ timeout: t })) as ElementHandle<Element>;
    const act = (trial: boolean) => this.bounds.bound(label, timeoutMs, async (t) => {
      if (step.action === 'click') await element.click({ timeout: t, trial });
      else if (!trial) await element.fill(step.text, { timeout: t });
    });
    // Actionability is waited out first, so the control window sits directly before the real step.
    await act(true);
    const outcomes = await this.control();
    const onTarget = new Set<string>();
    for (const pending of this.pending) for (const [key, expected] of pending.elements) {
      if (expected && await this.sameElement(element, expected, key)) onTarget.add(`${pending.name}\n${key}`);
    }
    const started = performance.now();
    await act(false);
    const flipped = await this.observe(started, outcomes);

    this.settle(index, step.action, (pending, assertion) => {
      const key = assertion.proves!;
      if (!onTarget.has(`${pending.name}\n${key}`)) return ['behavior_target_mismatch', `step ${index + 1} (${step.action}) did not act on the one element captured with key '${key}'.`];
      const before = outcomes.get(assertion.id);
      if (before === 'pass') return ['behavior_unchanged', `assertion '${assertion.id}' was already holding before step ${index + 1}.`];
      if (before !== 'fail') return ['behavior_not_checked', `assertion '${assertion.id}' could not be observed before step ${index + 1}.`];
      if (!flipped.has(assertion.id)) return ['behavior_not_checked', `assertion '${assertion.id}' was not seen to become true within ${BEHAVIOR_WINDOW_MS}ms of step ${index + 1}.`];
      return ['finding_absent_target_retained', `step ${index + 1} (${step.action}) on '${key}' turned assertion '${assertion.id}' from failing to passing.`];
    });
  }

  /** Evidence for every capture and proving assertion; a checkpoint that failed proves nothing. */
  finish(captures: readonly ReplayedCapture[], passed: boolean, error: string | undefined): CheckBehaviorEvidence[] {
    this.settle(null, null, () => ['behavior_not_checked', 'no click or fill ran after the capture.']);
    for (const capture of captures) for (const assertion of this.assertions) {
      if (this.evidence.some((e) => e.capture === capture.name && e.assertion === assertion.id)) continue;
      this.add(capture.name, capture.snapshot, assertion, null, null, 'behavior_not_checked', 'the checkpoint ended before a click or fill.');
    }
    return passed ? this.evidence : this.evidence.map((e) => e.reason === 'finding_absent_target_retained'
      ? { ...e, reason: 'behavior_step_failed', explanation: `the checkpoint failed later: ${(error ?? 'unknown error').split('\n')[0]}` }
      : e);
  }

  private add(name: string, snapshot: Snapshot, assertion: BehaviorAssertion, step: number | null, action: 'click' | 'fill' | null, reason: CheckBehaviorEvidence['reason'], explanation: string): void {
    const nodes = snapshot.nodes.filter((n) => n.semanticKey === assertion.proves);
    this.evidence.push({
      capture: name, assertion: assertion.id, sessionId: snapshot.sessionId, captureId: snapshot.captureId,
      nodeId: nodes.length === 1 ? nodes[0]!.nodeId : null, semanticKey: assertion.proves!, step, action, reason, explanation
    });
  }

  private settle(step: number | null, action: 'click' | 'fill' | null, judge: (pending: Pending, assertion: BehaviorAssertion) => [CheckBehaviorEvidence['reason'], string]): void {
    for (const pending of this.pending) for (const assertion of this.assertions) {
      this.add(pending.name, pending.snapshot, assertion, step, action, ...judge(pending, assertion));
    }
    this.pending = [];
  }

  private async sameElement(element: ElementHandle<Element>, expected: ElementHandle<Element>, key: string): Promise<boolean> {
    return this.bounds.bound('confirming the target', 2_000, () => element.evaluate((el, other) => el === other.expected && el.isConnected
      && el.getAttribute('data-anwc-key') === other.key
      && [...document.querySelectorAll('[data-anwc-key]')].filter((e) => e.getAttribute('data-anwc-key') === other.key).length === 1, { expected, key }))
      // A handle from a replaced document cannot be compared: not the same element.
      .catch(() => false);
  }

  private async probeAll(assertions: readonly BehaviorAssertion[]): Promise<Array<[string, Outcome]>> {
    return this.bounds.bound('observing assertions', 5_000, () => Promise.all(assertions.map(async (a): Promise<[string, Outcome]> => [a.id, await probe(this.page, a)])));
  }

  /** `fail` only if an assertion failed at every probe of the window; one pass makes it `pass`. */
  private async control(): Promise<Map<string, Outcome>> {
    const outcomes = new Map<string, Outcome>();
    const started = performance.now();
    do {
      for (const [id, outcome] of await this.probeAll(this.assertions)) {
        const previous = outcomes.get(id);
        outcomes.set(id, previous === 'pass' || outcome === 'pass' ? 'pass' : previous === 'error' ? 'error' : outcome);
      }
      if (![...outcomes.values()].includes('fail')) break;
      await new Promise((done) => setTimeout(done, PROBE_INTERVAL_MS));
    } while (performance.now() - started < BEHAVIOR_WINDOW_MS);
    return outcomes;
  }

  private async observe(started: number, before: ReadonlyMap<string, Outcome>): Promise<Set<string>> {
    const waiting = this.assertions.filter((a) => before.get(a.id) === 'fail');
    const flipped = new Set<string>();
    while (flipped.size < waiting.length) {
      const rows = await this.probeAll(waiting.filter((a) => !flipped.has(a.id)));
      if (performance.now() - started > BEHAVIOR_WINDOW_MS) break;
      for (const [id, outcome] of rows) if (outcome === 'pass') flipped.add(id);
      if (flipped.size < waiting.length) await new Promise((done) => setTimeout(done, PROBE_INTERVAL_MS));
    }
    return flipped;
  }
}
