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

test('checker rejects ambiguous, obstructed, empty, and pre-satisfied required checks', async ({ page }) => {
  await page.setContent('<button>Save</button><button>Save</button>');
  expect((await runChecks(page, [{ id: 'duplicate', required: true, kind: 'action-rendered', role: 'button', name: 'Save' }]))[0]?.status).toBe('fail');

  await page.setContent('<p id="copy"></p><button style="opacity:0">Save</button>');
  const emptyAndTransparent = await runChecks(page, [
    { id: 'empty', required: true, kind: 'content', selector: '#copy', text: 'Required' },
    { id: 'transparent', required: true, kind: 'action-rendered', role: 'button', name: 'Save' }
  ]);
  expect(repairVerified(emptyAndTransparent)).toBe(false);

  await page.setContent('<button onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button><p id="status">Saved</p>');
  expect(repairVerified(await runChecks(page, [{ id: 'pre-satisfied', required: true, kind: 'action-changes-ui', role: 'button', name: 'Save', statusSelector: '#status', expectedText: 'Saved' }]))).toBe(false);

  await page.setContent('<div style="position:relative"><input aria-label="Owner"><div style="position:absolute;inset:0;background:#fff">overlay</div></div>');
  expect(repairVerified(await runChecks(page, [{ id: 'blocked-input', required: true, kind: 'input-accepts', role: 'textbox', name: 'Owner', value: 'Avery' }]))).toBe(false);
});

test('checker accepts a bounded delayed transition through a real pointer path', async ({ page }) => {
  await page.setContent('<button onclick="setTimeout(() => document.querySelector(\'#status\').textContent=\'Saved\', 40)">Save</button><p id="status">Unsaved</p>');
  const result = await runChecks(page, [{ id: 'delayed', required: true, kind: 'action-changes-ui', role: 'button', name: 'Save', statusSelector: '#status', expectedText: 'Saved', timeoutMs: 500 }]);
  expect(repairVerified(result)).toBe(true);
});
