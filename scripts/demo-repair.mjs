// Repair demo: find a seeded defect, fix a disposable copy of the shop, prove
// what changed. Nothing in examples/ is edited.
//   npm run demo            runs straight through
//   npm run demo -- --step  waits for Enter between steps (for presenting)
//   npm run demo:cheat      applies a fake repair that hides the button; ANWC must reject it
import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'artifacts', 'demo');
const app = join(out, 'shop');
const step = process.argv.includes('--step');
const cheat = process.argv.includes('--cheat');
const before = join(out, 'before');
const after = join(out, 'after');
const states = join(out, 'checkout.states.json');

// Asynchronous on purpose: the dev server runs in this process and must keep answering.
function anwc(...args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'packages/cli/src/main.ts'), ...args], { cwd: root });
    // Keep the streams apart: a warning on stderr must never land inside the JSON on stdout.
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, stdout: stdout.trim(), stderr: stderr.trim(), text: `${stdout}${stderr}`.trim() }));
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

/** Replays the committed states; check is JSON-only, so this returns its data. A failed gate is data. */
async function check(directory, ...args) {
  const { stdout, stderr } = await anwc('check', states, '--output', directory, ...args);
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error(`anwc check did not print a JSON result.\n--- stdout (start) ---\n${stdout.slice(0, 600)}\n--- stderr ---\n${stderr}`);
  }
  if (stderr) console.error(`(anwc warnings)\n${stderr}`);
  if (!envelope.ok) throw new Error(`check failed: ${envelope.error.message}`);
  return envelope.data;
}

function summarize(run) {
  const { capture, steps, error } = run.scenarios[0].checkpoints[0];
  if (!capture) throw new Error(`No capture: ${error}`);
  const { width, height } = capture.page.viewport;
  console.log(`${width}x${height} | ${capture.findings.length} finding(s)`);
  for (const finding of capture.findings) {
    console.log(`  ${finding.severity.toUpperCase()} ${finding.code}`);
    console.log(`  ${finding.message}`);
    if (finding.source) console.log(`  source:  ${finding.source.file}:${finding.source.line}`);
    for (const id of finding.relatedNodeIds) console.log(`  blocker: ${capture.nodes.find((n) => n.nodeId === id)?.label}`);
  }
  console.log(`Declared click:    ${steps.at(-1).action === 'click' ? steps.at(-1).status : 'not run'}`);
}

/** Waits until the dev server serves the edit, so the next load cannot see the old file. */
async function served(url, text) {
  for (let tries = 0; tries < 100; tries += 1) {
    if ((await (await fetch(url)).text()).includes(text)) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`${url} was not updated.`);
}

/** Independent check: a real click, not ANWC's own measurement. */
async function clickCheckout(url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url);
    const button = page.getByRole('button', { name: 'Checkout now' });
    if (!(await button.isVisible())) return false;
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
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const url = `${origin}/lab?case=blocked-checkout`;
  const template = JSON.parse(readFileSync(join(root, 'examples/shop/anwc/checkout.states.json'), 'utf8'));
  writeFileSync(states, JSON.stringify({ ...template, baseUrl: origin }, null, 2));

  await heading('1. Measure the seeded defect');
  summarize(await check(before));
  const clickedBefore = await clickCheckout(url);
  console.log(`Independent click: ${clickedBefore ? 'works' : 'does nothing'}`);

  await heading(cheat ? '2. Apply a fake repair: hide the button' : '2. Repair the disposable copy');
  const fix = cheat ? `
.blocked.obstacle-fixture > button { display: none; }
` : `
.blocked.obstacle-fixture { height: auto; }
.blocked.obstacle-fixture > button { min-height: 4.5rem; }
.blocked .cookie-obstacle { position: static; margin-top: .5rem; min-height: 2.5rem; }
`;
  appendFileSync(join(app, 'src/styles.css'), fix);
  await served(`${origin}/src/styles.css?direct`, '.blocked.obstacle-fixture > button');
  console.log(`artifacts/demo/shop/src/styles.css${fix.trimEnd()}`);

  await heading('3. Measure the same state again');
  const run = await check(after, '--baseline', before);
  summarize(run);
  const clickedAfter = await clickCheckout(url);
  console.log(`Independent click: ${clickedAfter ? 'works' : 'does nothing'}`);

  await heading('4. Verdict against the baseline');
  const { baseline } = run;
  for (const { findings, ...capture } of baseline.captures) {
    if (findings.length === 0) console.log(`${capture.verdict.toUpperCase()} (${capture.reason})\n  ${capture.explanation}`);
    for (const finding of findings) {
      console.log(`${finding.verdict.toUpperCase()} (${finding.reason})`);
      console.log(`  ${finding.code} on ${finding.targetKey}`);
      if (finding.proof) {
        console.log('  Same URL, viewport and target key: the finding is gone.');
        console.log(`  Declared click: ${finding.proof.baselineStep} before, passed now.`);
        console.log(`  It turned '${finding.proof.assertions.join("', '")}' from failing to passing.`);
      } else console.log(`  ${finding.explanation}`);
    }
  }
  console.log('Scope: this finding in this state, not the whole UI.');

  for (const [directory, name] of [[before, 'before'], [after, 'after']]) {
    const report = await anwc('report', join(directory, 'checkout.json'), '--format', 'html', '--output', join(out, `${name}.html`));
    if (report.code !== 0) throw new Error(report.text);
  }
  console.log('Reports: artifacts/demo/before.html, artifacts/demo/after.html');
  if (cheat) {
    const rejected = baseline.captures.some((capture) => capture.findings.some((finding) => finding.verdict === 'contradicted'));
    failed = baseline.repairVerified || !rejected;
    console.log(failed ? '\nDemo check failed: the fake repair was not rejected.' : '\nThe fake repair was rejected.');
  } else {
    failed = !baseline.repairVerified || clickedBefore || !clickedAfter;
    if (failed) console.error('\nDemo check failed: expected a verified repair and a click that fails before and works after.');
  }
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
