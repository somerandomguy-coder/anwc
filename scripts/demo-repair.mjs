// Repair demo: find a seeded defect, fix a disposable copy of the shop, prove
// what changed. Nothing in examples/ is edited.
//   npm run demo            runs straight through
//   npm run demo -- --step  waits for Enter between steps (for presenting)
import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'artifacts', 'demo');
const app = join(out, 'shop');
const step = process.argv.includes('--step');
const before = join(out, 'before.json');
const after = join(out, 'after.json');

// Asynchronous on purpose: the dev server runs in this process and must keep answering.
function anwc(...args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'packages/cli/src/main.ts'), ...args], { cwd: root });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.stderr.on('data', (chunk) => { text += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, text: text.trim() }));
  });
}

async function heading(text) {
  if (step) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('\nPress Enter to continue ');
    rl.close();
  }
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

async function capture(url, file) {
  const human = await anwc('inspect', url, '--viewport', '390x844', '--format', 'text');
  const saved = await anwc('inspect', url, '--viewport', '390x844', '--format', 'json', '--output', file);
  if (saved.code !== 0) throw new Error(`inspect failed (exit ${saved.code})\n${saved.text}`);
  return human.text;
}

/** Independent check: a real click, not ANWC's own measurement. */
async function clickCheckout(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url);
    const button = page.getByRole('button', { name: 'Checkout now' });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return await page.getByText(/checkout confirmed/i).waitFor({ timeout: 2000 }).then(() => true, () => false);
  } finally {
    await browser.close();
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'examples/shop'), app, { recursive: true, filter: (source) => !/[\\/](node_modules|dist|tsconfig.json)$/.test(source) });

const server = await createServer({ root: app, configFile: join(app, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let failed = false;
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/lab?case=blocked-checkout`;

  await heading('1. Measure the seeded defect');
  console.log(await capture(url, before));
  const clickedBefore = await clickCheckout(url);
  console.log(`\nA real click on Checkout: ${clickedBefore ? 'works' : 'does nothing'}`);

  await heading('2. Repair the disposable copy');
  const fix = `
.blocked.obstacle-fixture { height: auto; }
.blocked.obstacle-fixture > button { min-height: 4.5rem; }
.blocked .cookie-obstacle { position: static; margin-top: .5rem; min-height: 2.5rem; }
`;
  appendFileSync(join(app, 'src/styles.css'), fix);
  console.log(`artifacts/demo/shop/src/styles.css${fix}`);

  await heading('3. Measure the same URL and viewport again');
  console.log(await capture(url, after));
  const clickedAfter = await clickCheckout(url);
  console.log(`\nA real click on Checkout: ${clickedAfter ? 'works' : 'does nothing'}`);

  await heading('4. Compare before and after');
  const diff = await anwc('diff', before, after, '--format', 'text');
  console.log(diff.text);
  console.log('\nThe click above is a separate check; anwc diff judges only the two captures.');

  for (const [from, name] of [[before, 'before'], [after, 'after']]) {
    const report = await anwc('report', from, '--format', 'html', '--output', join(out, `${name}.html`));
    if (report.code !== 0) throw new Error(report.text);
  }
  console.log('Reports: artifacts/demo/before.html and artifacts/demo/after.html');
  failed = clickedBefore || !clickedAfter;
  if (failed) console.error('\nDemo check failed: expected the click to fail before and work after.');
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
