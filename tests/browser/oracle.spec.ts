import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { gateMarkup, orderedCases, ruleGates, ruleOracles } from '../conformance/gates.js';
import { mountIsolated } from '../conformance/runner.js';

/**
 * P15 rule gates: for every detector rule, a planted defect (canary), a healthy
 * control and threshold boundaries, each judged by an oracle that imports no
 * ANWC code. ANWC must report the rule on the keyed element exactly when the
 * oracle says the fact is true. Results go to ignored artifacts/oracle/.
 */

const artifactDir = new URL('../../artifacts/oracle/', import.meta.url);

interface GateResult {
  id: string;
  role: string;
  key: string;
  oracle: boolean;
  oracleDetails: Record<string, unknown>;
  anwc: boolean;
  anwcCodesOnTarget: string[];
  agrees: boolean;
  knownDisagreement: string | null;
}

for (const gate of ruleGates) {
  test(`rule gate ${gate.rule}: canary detected, ANWC matches the independent oracle (recorded disagreements listed)`, async ({ page }) => {
    test.setTimeout(60_000);
    const oracle = ruleOracles[gate.rule];
    const results: GateResult[] = [];

    for (const c of orderedCases(gate)) {
      await mountIsolated(page, gateMarkup(c));
      const truth = await oracle(page, c.key);
      const capture = await page.evaluate(() => window.__ANWC_TEST__!.capture({}));
      const node = capture.nodes.find((candidate) => candidate.semanticKey === c.key);
      expect(node, `${gate.rule}/${c.id}: ANWC captured no node with key ${c.key}`).toBeDefined();
      const codesOnTarget = diagnose(capture).filter((finding) => finding.nodeId === node!.nodeId).map((finding) => finding.code);
      const anwc = codesOnTarget.includes(gate.rule);
      const result: GateResult = {
        id: c.id, role: c.role, key: c.key, oracle: truth.violates, oracleDetails: truth.details,
        anwc, anwcCodesOnTarget: codesOnTarget, agrees: anwc === truth.violates, knownDisagreement: c.knownDisagreement ?? null
      };
      results.push(result);
      if (c.knownDisagreement) test.info().annotations.push({ type: 'known-disagreement', description: `${c.id}: oracle=${truth.violates} anwc=${anwc}. ${c.knownDisagreement}` });

      // The oracle premise is pinned per case, so a broken oracle cannot pass silently.
      expect(truth.violates, `${gate.rule}/${c.id}: oracle premise changed: ${JSON.stringify(truth.details)}`).toBe(c.oracleExpects);

      // Canary: the planted violation must be detected before anything else is judged.
      if (c.role === 'defect') {
        expect(anwc, `CANARY ${gate.rule}/${c.id}: planted violation not detected; the rule is dead or disabled. ANWC codes on target: [${codesOnTarget.join(', ')}]`).toBe(true);
      }
    }

    await mkdir(fileURLToPath(artifactDir), { recursive: true });
    await writeFile(fileURLToPath(new URL(`${gate.rule}.json`, artifactDir)), JSON.stringify({ rule: gate.rule, generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');

    const unexpected = results.filter((r) => !r.agrees && !r.knownDisagreement).map((r) => `${r.id}: oracle=${r.oracle} anwc=${r.anwc} ${JSON.stringify(r.oracleDetails)}`);
    expect(unexpected, `${gate.rule}: ANWC disagrees with the independent oracle`).toEqual([]);
    const healed = results.filter((r) => r.knownDisagreement && r.agrees).map((r) => r.id);
    expect(healed, `${gate.rule}: recorded disagreement no longer reproduces; update gates.ts`).toEqual([]);
  });
}
