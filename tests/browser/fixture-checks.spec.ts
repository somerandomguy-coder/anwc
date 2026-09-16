import { expect, test } from '@playwright/test';
import { repairVerified, runChecks } from '../../packages/benchmark/src/fixtures/index.ts';

test('independent fixture checks reject broken and deleted pages but accept a repair', async ({ page }) => {
  const healthyChecks = [
    { id: 'copy', required: true, kind: 'content' as const, selector: '#copy', text: 'Keep this copy' },
    { id: 'save', required: true, kind: 'action-changes-ui' as const, role: 'button', name: 'Save', statusSelector: '#status', expectedText: 'Saved' }
  ];
  await page.setContent('<p id="copy">Keep this copy</p><button style="display:none">Save</button><p id="status"></p>');
  expect(repairVerified(await runChecks(page, [{ id: 'visible', required: true, kind: 'action-rendered', role: 'button', name: 'Save' }]))).toBe(false);
  await page.setContent('<p id="copy">Keep this copy</p><button onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button><p id="status"></p>');
  expect(repairVerified(await runChecks(page, healthyChecks))).toBe(true);
  await page.setContent('<p id="status"></p>');
  expect(repairVerified(await runChecks(page, healthyChecks))).toBe(false);
});
