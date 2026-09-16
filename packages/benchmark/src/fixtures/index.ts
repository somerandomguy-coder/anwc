import { z } from 'zod';
import type { Page } from 'playwright';

const id = z.string().regex(/^[a-z0-9-]+$/);
const nonEmpty = z.string().trim().min(1);
const viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const boundedTimeout = z.number().int().positive().max(10_000).optional();
const defaultTimeoutMs = 2_000;

export const setupStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), role: nonEmpty, name: nonEmpty, timeoutMs: boundedTimeout }).strict(),
  z.object({ kind: z.literal('fill'), role: nonEmpty, name: nonEmpty, value: z.string().max(500), timeoutMs: boundedTimeout }).strict(),
  z.object({ kind: z.literal('scroll'), selector: nonEmpty, timeoutMs: boundedTimeout }).strict()
]);

export const fixtureCaseSchema = z.object({
  schemaVersion: z.literal('0.2'), id, appId: id, route: z.string().startsWith('/'),
  requirements: z.array(nonEmpty).min(1), viewports: z.array(viewport).min(1), setup: z.array(setupStepSchema),
  requiredContent: z.array(nonEmpty).min(1), requiredActions: z.array(z.object({ role: nonEmpty, name: nonEmpty }).strict()).min(1)
}).strict();

const checkBase = { id, required: z.boolean(), timeoutMs: boundedTimeout };
export const checkSchema = z.discriminatedUnion('kind', [
  z.object({ ...checkBase, kind: z.literal('content'), selector: nonEmpty, text: nonEmpty }).strict(),
  z.object({ ...checkBase, kind: z.literal('width-within'), target: nonEmpty, container: nonEmpty, tolerancePx: z.number().nonnegative().default(1) }).strict(),
  z.object({ ...checkBase, kind: z.literal('line-count'), selector: nonEmpty, maxLines: z.number().int().positive() }).strict(),
  z.object({ ...checkBase, kind: z.literal('text-within'), selector: nonEmpty, container: nonEmpty, tolerancePx: z.number().nonnegative().default(1) }).strict(),
  z.object({ ...checkBase, kind: z.literal('action-rendered'), role: nonEmpty, name: nonEmpty, scope: nonEmpty.optional() }).strict(),
  z.object({ ...checkBase, kind: z.literal('action-in-viewport'), role: nonEmpty, name: nonEmpty, scope: nonEmpty.optional() }).strict(),
  z.object({ ...checkBase, kind: z.literal('input-accepts'), role: nonEmpty, name: nonEmpty, scope: nonEmpty.optional(), value: z.string().max(500), point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().optional() }).strict(),
  z.object({ ...checkBase, kind: z.literal('action-changes-ui'), role: nonEmpty, name: nonEmpty, scope: nonEmpty.optional(), statusSelector: nonEmpty, expectedText: nonEmpty, point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().optional() }).strict()
]);

export const evaluatorSidecarSchema = z.object({
  fixtureId: id, revision: z.string().min(7), defect: nonEmpty,
  baselineChecks: z.array(checkSchema).min(1), repairChecks: z.array(checkSchema).min(1)
}).strict();

export type FixtureCase = z.infer<typeof fixtureCaseSchema>;
export type FixtureCheck = z.infer<typeof checkSchema>;
export type CheckResult = { id: string; required: boolean; status: 'pass' | 'fail' | 'unsupported'; evidence: Record<string, unknown> };
type ActionCheck = Extract<FixtureCheck, { kind: 'action-rendered' | 'action-in-viewport' | 'input-accepts' | 'action-changes-ui' }>;
type Box = { x: number; y: number; width: number; height: number };

function timeoutFor(value: number | undefined): number { return value ?? defaultTimeoutMs; }
function fail(check: FixtureCheck, evidence: Record<string, unknown>): CheckResult { return { id: check.id, required: check.required, status: 'fail', evidence }; }
function unsupported(check: FixtureCheck, evidence: Record<string, unknown>): CheckResult { return { id: check.id, required: check.required, status: 'unsupported', evidence }; }
function pointFor(box: Box, point?: { x: number; y: number }): { x: number; y: number } { return { x: box.x + box.width * (point?.x ?? 0.5), y: box.y + box.height * (point?.y ?? 0.5) }; }

/** A required set is meaningful only when it contains at least one declared check. */
export function repairVerified(results: CheckResult[]): boolean { return results.length > 0 && results.every((result) => !result.required || result.status === 'pass'); }
export function isMutatingCheck(check: FixtureCheck): boolean { return check.kind === 'input-accepts' || check.kind === 'action-changes-ui'; }

async function exactAction(page: Page, check: ActionCheck): Promise<{ locator: ReturnType<Page['getByRole']>; error?: string }> {
  const scope = check.scope ? await exactlyOne(page, check.scope) : undefined;
  if (scope?.error) return { locator: page.getByRole(check.role as never, { name: check.name, exact: true }), error: `action scope ${scope.error}` };
  const locator = (scope?.locator ?? page).getByRole(check.role as never, { name: check.name, exact: true });
  const count = await locator.count();
  return count === 1 ? { locator } : { locator, error: `expected exactly one ${check.role} named ${JSON.stringify(check.name)}, found ${count}` };
}
async function exactlyOne(page: Page, selector: string): Promise<{ locator: ReturnType<Page['locator']>; error?: string }> {
  const locator = page.locator(selector); const count = await locator.count();
  return count === 1 ? { locator } : { locator, error: `expected exactly one ${JSON.stringify(selector)}, found ${count}` };
}

async function renderedEvidence(locator: ReturnType<Page['locator']>): Promise<Record<string, unknown>> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect(); const ancestry: Array<Record<string, unknown>> = [];
    let node: Element | null = element; let clipped = false;
    let visibleRect = { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    while (node) {
      const style = getComputedStyle(node); const ancestorBox = node.getBoundingClientRect();
      ancestry.push({ tag: node.tagName, display: style.display, visibility: style.visibility, opacity: style.opacity, overflowX: style.overflowX, overflowY: style.overflowY });
      if (['clip', 'hidden', 'scroll', 'auto'].includes(style.overflowX) || ['clip', 'hidden', 'scroll', 'auto'].includes(style.overflowY)) {
        visibleRect = { left: Math.max(visibleRect.left, ancestorBox.left), right: Math.min(visibleRect.right, ancestorBox.right), top: Math.max(visibleRect.top, ancestorBox.top), bottom: Math.min(visibleRect.bottom, ancestorBox.bottom) }; clipped = true;
      }
      node = node.parentElement;
    }
    const rendered = box.width > 0 && box.height > 0 && ancestry.every((item) => item.display !== 'none' && item.visibility !== 'hidden' && Number(item.opacity) > 0) && (!clipped || visibleRect.right > visibleRect.left && visibleRect.bottom > visibleRect.top);
    return { rendered, box: { x: box.x, y: box.y, width: box.width, height: box.height }, clipped, clipSupported: true, visibleRect, ancestry };
  });
}
async function pointHitsTarget(locator: ReturnType<Page['locator']>, point: { x: number; y: number }): Promise<boolean> {
  return locator.evaluate((element, input) => { const hit = document.elementFromPoint(input.x, input.y); return Boolean(hit && (hit === element || element.contains(hit))); }, point);
}

export async function applySetup(page: Page, steps: z.infer<typeof setupStepSchema>[]): Promise<void> {
  for (const step of steps) {
    const timeout = timeoutFor(step.timeoutMs);
    if (step.kind === 'click') { const action = page.getByRole(step.role as never, { name: step.name, exact: true }); if (await action.count() !== 1) throw new Error(`setup click requires one ${step.role} named ${JSON.stringify(step.name)}`); await action.click({ timeout }); }
    else if (step.kind === 'fill') { const action = page.getByRole(step.role as never, { name: step.name, exact: true }); if (await action.count() !== 1) throw new Error(`setup fill requires one ${step.role} named ${JSON.stringify(step.name)}`); await action.fill(step.value, { timeout }); }
    else { const target = await exactlyOne(page, step.selector); if (target.error) throw new Error(`setup scroll ${target.error}`); await target.locator.scrollIntoViewIfNeeded({ timeout }); }
  }
}

/** Executes checks in declaration order. The caller owns page lifecycle for mutations. */
export async function runChecks(page: Page, checks: FixtureCheck[]): Promise<CheckResult[]> {
  const duplicateIds = checks.filter((check, index) => checks.findIndex((candidate) => candidate.id === check.id) !== index).map((check) => check.id);
  if (duplicateIds.length > 0) return checks.map((check) => fail(check, { error: `duplicate check id${duplicateIds.length === 1 ? '' : 's'}: ${[...new Set(duplicateIds)].join(', ')}` }));
  const results: CheckResult[] = [];
  for (const check of checks) {
    const timeout = timeoutFor(check.timeoutMs);
    try {
      if (check.kind === 'content') {
        const target = await exactlyOne(page, check.selector); if (target.error) { results.push(fail(check, { error: target.error })); continue; }
        const text = await target.locator.textContent({ timeout }); const matches = typeof text === 'string' && text.trim().length > 0 && text.includes(check.text); results.push({ id: check.id, required: check.required, status: matches ? 'pass' : 'fail', evidence: { text } }); continue;
      }
      if (check.kind === 'width-within') {
        const target = await exactlyOne(page, check.target); const container = await exactlyOne(page, check.container);
        if (target.error || container.error) { results.push(fail(check, { target: target.error, container: container.error })); continue; }
        const [targetBox, containerBox] = await Promise.all([target.locator.boundingBox(), container.locator.boundingBox()]);
        if (!targetBox || !containerBox || targetBox.width <= 0 || containerBox.width <= 0) { results.push(fail(check, { target: targetBox, container: containerBox })); continue; }
        results.push({ id: check.id, required: check.required, status: targetBox.width <= containerBox.width + check.tolerancePx ? 'pass' : 'fail', evidence: { targetWidth: targetBox.width, containerWidth: containerBox.width } }); continue;
      }
      if (check.kind === 'line-count') {
        const target = await exactlyOne(page, check.selector); if (target.error) { results.push(fail(check, { error: target.error })); continue; }
        const result = await target.locator.evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); const rectangles = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0); const tops = rectangles.reduce<number[]>((all, rect) => all.some((top) => Math.abs(top - rect.top) <= 1) ? all : [...all, rect.top], []); return { lines: tops.length, fragments: rectangles.length, text: element.textContent?.trim() ?? '' }; });
        results.push({ id: check.id, required: check.required, status: result.text.length > 0 && result.fragments > 0 && result.lines > 0 && result.lines <= check.maxLines ? 'pass' : 'fail', evidence: { ...result, maxLines: check.maxLines } }); continue;
      }
      if (check.kind === 'text-within') {
        const target = await exactlyOne(page, check.selector); const container = await exactlyOne(page, check.container);
        if (target.error || container.error) { results.push(fail(check, { target: target.error, container: container.error })); continue; }
        const result = await target.locator.evaluate((element, input) => { const containerElement = document.querySelector(input.container); if (!containerElement) return { supported: false, reason: 'container-missing' }; const bounds = containerElement.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(element); const rectangles = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0); return { supported: true, text: element.textContent?.trim() ?? '', fragments: rectangles.length, contained: rectangles.every((rect) => rect.left >= bounds.left - input.tolerance && rect.right <= bounds.right + input.tolerance && rect.top >= bounds.top - input.tolerance && rect.bottom <= bounds.bottom + input.tolerance), bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } }; }, { container: check.container, tolerance: check.tolerancePx });
        if (!result.supported) { results.push(unsupported(check, result)); continue; }
        const text = result.text ?? ''; const fragments = result.fragments ?? 0; results.push({ id: check.id, required: check.required, status: text.length > 0 && fragments > 0 && result.contained === true ? 'pass' : 'fail', evidence: result }); continue;
      }
      const action = await exactAction(page, check); if (action.error) { results.push(fail(check, { error: action.error })); continue; }
      if (check.kind === 'action-rendered') { const evidence = await renderedEvidence(action.locator); results.push({ id: check.id, required: check.required, status: evidence.rendered === true ? 'pass' : 'fail', evidence }); continue; }
      const box = await action.locator.boundingBox(); if (!box || box.width <= 0 || box.height <= 0) { results.push(fail(check, { error: 'action has no non-empty bounding box', box })); continue; }
      const point = pointFor(box, 'point' in check ? check.point : undefined);
      if (check.kind === 'action-in-viewport') { const pageViewport = page.viewportSize(); const inViewport = Boolean(pageViewport && box.x >= 0 && box.y >= 0 && box.x + box.width <= pageViewport.width && box.y + box.height <= pageViewport.height); results.push({ id: check.id, required: check.required, status: inViewport ? 'pass' : 'fail', evidence: { box, viewport: pageViewport, reachable: inViewport } }); continue; }
      const hitsTarget = await pointHitsTarget(action.locator, point); if (!hitsTarget) { results.push(fail(check, { error: 'pointer target is obstructed', point, box })); continue; }
      if (check.kind === 'input-accepts') { await page.mouse.click(point.x, point.y); const focused = await action.locator.evaluate((element) => document.activeElement === element); if (!focused) { results.push(fail(check, { error: 'physical click did not focus input', point })); continue; } await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(check.value); const value = await action.locator.inputValue({ timeout }); results.push({ id: check.id, required: check.required, status: value === check.value ? 'pass' : 'fail', evidence: { value, point, focused } }); continue; }
      const status = await exactlyOne(page, check.statusSelector); if (status.error) { results.push(fail(check, { error: status.error })); continue; }
      const beforeText = (await status.locator.textContent({ timeout }))?.trim() ?? ''; if (beforeText.includes(check.expectedText)) { results.push(fail(check, { error: 'status already satisfied before interaction', beforeText, point })); continue; }
      await page.mouse.click(point.x, point.y);
      try { await page.waitForFunction(({ selector, expected }) => document.querySelector(selector)?.textContent?.includes(expected) === true, { selector: check.statusSelector, expected: check.expectedText }, { timeout }); } catch { /* text below is the bounded post-action observation */ }
      const text = (await status.locator.textContent({ timeout }))?.trim() ?? ''; results.push({ id: check.id, required: check.required, status: text.includes(check.expectedText) ? 'pass' : 'fail', evidence: { beforeText, text, point, physicalInteraction: true } });
    } catch (error) { results.push(fail(check, { error: error instanceof Error ? error.message : String(error) })); }
  }
  return results;
}
