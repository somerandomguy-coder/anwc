import { z } from 'zod';
import type { Page } from 'playwright';

const id = z.string().regex(/^[a-z0-9-]+$/);
const nonEmpty = z.string().trim().min(1);
const viewport = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const timeoutMs = z.number().int().positive().max(10_000).default(2_000);

export const setupStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), role: nonEmpty, name: nonEmpty, timeoutMs }).strict(),
  z.object({ kind: z.literal('fill'), role: nonEmpty, name: nonEmpty, value: z.string().max(500), timeoutMs }).strict(),
  z.object({ kind: z.literal('scroll'), selector: nonEmpty, timeoutMs }).strict()
]);

export const fixtureCaseSchema = z.object({
  schemaVersion: z.literal('0.2'), id, appId: id, route: z.string().startsWith('/'),
  requirements: z.array(nonEmpty).min(1), viewports: z.array(viewport).min(1), setup: z.array(setupStepSchema),
  requiredContent: z.array(nonEmpty), requiredActions: z.array(z.object({ role: nonEmpty, name: nonEmpty }).strict())
}).strict();

export const checkSchema = z.discriminatedUnion('kind', [
  z.object({ id, required: z.boolean(), kind: z.literal('content'), selector: nonEmpty, text: nonEmpty }).strict(),
  z.object({ id, required: z.boolean(), kind: z.literal('width-within'), target: nonEmpty, container: nonEmpty, tolerancePx: z.number().nonnegative().default(1) }).strict(),
  z.object({ id, required: z.boolean(), kind: z.literal('line-count'), selector: nonEmpty, maxLines: z.number().int().positive() }).strict(),
  z.object({ id, required: z.boolean(), kind: z.literal('action-rendered'), role: nonEmpty, name: nonEmpty }).strict(),
  z.object({ id, required: z.boolean(), kind: z.literal('action-changes-ui'), role: nonEmpty, name: nonEmpty, statusSelector: nonEmpty, expectedText: nonEmpty }).strict()
]);

export const evaluatorSidecarSchema = z.object({
  fixtureId: id, revision: z.string().min(7), defect: nonEmpty,
  baselineChecks: z.array(checkSchema).min(1), repairChecks: z.array(checkSchema).min(1)
}).strict();

export type FixtureCase = z.infer<typeof fixtureCaseSchema>;
export type FixtureCheck = z.infer<typeof checkSchema>;
export type CheckResult = { id: string; required: boolean; status: 'pass' | 'fail' | 'unsupported'; evidence: Record<string, unknown> };

export function repairVerified(results: CheckResult[]): boolean {
  return results.every((result) => !result.required || result.status === 'pass');
}

export async function applySetup(page: Page, steps: z.infer<typeof setupStepSchema>[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'click') await page.getByRole(step.role as never, { name: step.name }).click({ timeout: step.timeoutMs });
    else if (step.kind === 'fill') await page.getByRole(step.role as never, { name: step.name }).fill(step.value, { timeout: step.timeoutMs });
    else await page.locator(step.selector).scrollIntoViewIfNeeded({ timeout: step.timeoutMs });
  }
}

export async function runChecks(page: Page, checks: FixtureCheck[]): Promise<CheckResult[]> {
  return Promise.all(checks.map(async (check): Promise<CheckResult> => {
    try {
      if (check.kind === 'content') {
        const text = await page.locator(check.selector).textContent();
        return { id: check.id, required: check.required, status: text?.includes(check.text) ? 'pass' : 'fail', evidence: { text } };
      }
      if (check.kind === 'width-within') {
        const [target, container] = await Promise.all([page.locator(check.target).boundingBox(), page.locator(check.container).boundingBox()]);
        if (!target || !container) return { id: check.id, required: check.required, status: 'fail', evidence: { target, container } };
        return { id: check.id, required: check.required, status: target.width <= container.width + check.tolerancePx ? 'pass' : 'fail', evidence: { targetWidth: target.width, containerWidth: container.width } };
      }
      if (check.kind === 'line-count') {
        const lines = await page.locator(check.selector).evaluate((element) => {
          const range = document.createRange(); range.selectNodeContents(element);
          return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).reduce<number[]>((tops, rect) => tops.some((top) => Math.abs(top - rect.top) <= 1) ? tops : [...tops, rect.top], []).length;
        });
        return { id: check.id, required: check.required, status: lines <= check.maxLines ? 'pass' : 'fail', evidence: { lines, maxLines: check.maxLines } };
      }
      const action = page.getByRole(check.role as never, { name: check.name });
      if (check.kind === 'action-rendered') return { id: check.id, required: check.required, status: await action.isVisible() ? 'pass' : 'fail', evidence: { visible: await action.isVisible() } };
      await action.click();
      const text = await page.locator(check.statusSelector).textContent();
      return { id: check.id, required: check.required, status: text?.includes(check.expectedText) ? 'pass' : 'fail', evidence: { text } };
    } catch (error) { return { id: check.id, required: check.required, status: 'fail', evidence: { error: error instanceof Error ? error.message : String(error) } }; }
  }));
}
