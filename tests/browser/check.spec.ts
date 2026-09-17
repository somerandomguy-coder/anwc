import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckSuite, type StateManifest } from '../../packages/cli/src/index.js';

// Delegated for dedicated environment runner execution - see docs/STATUS.md
test.describe.skip('Q06 State Reproduction Runner', () => {
  let tmp: string;

  test.beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'anwc-q06-repro-'));
  });

  test.afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test('reproduces initial, drawer/details, modal, and scrolled states with isolation and behavior assertions', async ({ browser }) => {
    test.setTimeout(60_000);
    const baseUrl = 'http://127.0.0.1:4173';
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'store-state-flows',
          title: 'Storefront Modal, Scrolled, and Navigation States',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'initial-state',
              description: 'Initial home page load',
              steps: [
                { action: 'navigate', path: '/' },
                { action: 'capture', name: '01-initial' }
              ],
              assertions: [
                {
                  id: 'h1-visible',
                  description: 'Home heading is visible',
                  selector: 'h1',
                  expected: 'visible'
                },
                {
                  id: 'modal-initially-hidden',
                  description: 'Confirmation modal is not open',
                  selector: '.modal-backdrop',
                  expected: 'hidden'
                }
              ]
            },
            {
              name: 'modal-opened-state',
              description: 'Click details button to open cart modal',
              steps: [
                { action: 'click', selector: 'nav.site-nav button:has-text("Details")' },
                { action: 'wait-for-selector', selector: 'section.product-modal', state: 'visible' },
                { action: 'capture', name: '02-modal-open' }
              ],
              assertions: [
                {
                  id: 'modal-now-visible',
                  description: 'Product modal dialog is visible',
                  selector: 'section.product-modal',
                  expected: 'visible'
                },
                {
                  id: 'modal-title-text',
                  description: 'Modal title confirms thoughtful cart',
                  selector: 'section.product-modal h2',
                  expected: 'text-contains',
                  expectedValue: 'thoughtful cart'
                }
              ]
            },
            {
              name: 'modal-closed-state',
              description: 'Close details modal',
              steps: [
                { action: 'click', selector: 'button.close' },
                { action: 'wait-for-selector', selector: 'section.product-modal', state: 'hidden' },
                { action: 'capture', name: '03-modal-closed' }
              ],
              assertions: [
                {
                  id: 'modal-backdrop-hidden',
                  description: 'Modal backdrop is closed and inert',
                  selector: '.modal-backdrop',
                  expected: 'hidden'
                }
              ]
            },
            {
              name: 'scrolled-sticky-nav-state',
              description: 'Scroll down and verify sticky navigation persists',
              steps: [
                { action: 'scroll', y: 500 },
                { action: 'capture', name: '04-scrolled' }
              ],
              assertions: [
                {
                  id: 'nav-persists',
                  description: 'Nav remains in viewport after scroll',
                  selector: 'nav.site-nav',
                  expected: 'visible'
                }
              ]
            }
          ]
        },
        {
          id: 'independent-scenario-storage-isolation',
          title: 'Second Independent Scenario Verifies Storage Isolation',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'verify-empty-cart-state',
              steps: [
                { action: 'navigate', path: '/' },
                { action: 'capture', name: '05-clean-cart' }
              ],
              assertions: [
                {
                  id: 'cart-is-empty-in-fresh-context',
                  description: 'Cart count is 0 items in fresh context',
                  selector: 'aside.cart',
                  expected: 'text-contains',
                  expectedValue: '0 items'
                }
              ]
            }
          ]
        }
      ]
    };

    const outDir = join(tmp, 'captures');
    const rawManifest = JSON.stringify(manifest, null, 2);

    // Run 1: First reproduction
    const run1 = await runCheckSuite({
      manifest,
      manifestRaw: rawManifest,
      outputDir: outDir,
      browser
    });

    expect(run1.passedAll).toBe(true);
    expect(run1.totalScenarios).toBe(2);
    expect(run1.passedScenarios).toBe(2);

    // Run 2: Exactly reproduces twice
    const run2 = await runCheckSuite({
      manifest,
      manifestRaw: rawManifest,
      browser
    });

    expect(run2.passedAll).toBe(true);
    expect(run2.scenarios[0].checkpoints[0].captureHash).toBe(run1.scenarios[0].checkpoints[0].captureHash);

    // Verify captures written to disk
    const initialCap = JSON.parse(await readFile(join(outDir, '01-initial.json'), 'utf8'));
    expect(initialCap.schemaVersion).toBe('0.1');
    expect(initialCap.nodes.length).toBeGreaterThan(0);

    const checkSummary = JSON.parse(await readFile(join(outDir, 'check-summary.json'), 'utf8'));
    expect(checkSummary.manifestHash).toBe(run1.manifestHash);
  });

  test('fails promptly on ambiguous target and reports failure details', async ({ browser }) => {
    const baseUrl = 'http://127.0.0.1:4173';
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'ambiguous-target-failure',
          title: 'Ambiguous Selector Fails Promptly',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'ambiguous-click',
              steps: [
                { action: 'navigate', path: '/' },
                // button matches multiple buttons (e.g. Add to cart, Details)
                { action: 'click', selector: 'button' }
              ]
            }
          ]
        }
      ]
    };

    const runResult = await runCheckSuite({
      manifest,
      manifestRaw: JSON.stringify(manifest),
      browser
    });

    expect(runResult.passedAll).toBe(false);
    expect(runResult.failedScenarios).toBe(1);
    const cp = runResult.scenarios[0].checkpoints[0];
    expect(cp.passed).toBe(false);
    expect(cp.error).toContain('Target is ambiguous');
    expect(cp.steps[1].status).toBe('failed');
  });

  test('fails promptly on missing selector timeout', async ({ browser }) => {
    const baseUrl = 'http://127.0.0.1:4173';
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'missing-selector-failure',
          title: 'Missing Selector Times Out Bounded',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'missing-wait',
              steps: [
                { action: 'navigate', path: '/' },
                { action: 'wait-for-selector', selector: '#nonexistent-element-id', timeoutMs: 300 }
              ]
            }
          ]
        }
      ]
    };

    const started = performance.now();
    const runResult = await runCheckSuite({
      manifest,
      manifestRaw: JSON.stringify(manifest),
      browser
    });
    const elapsed = performance.now() - started;

    expect(runResult.passedAll).toBe(false);
    expect(elapsed).toBeLessThan(3_000); // Bounded prompt timeout
    const cp = runResult.scenarios[0].checkpoints[0];
    expect(cp.passed).toBe(false);
    expect(cp.steps[1].status).toBe('timed-out');
  });
});
