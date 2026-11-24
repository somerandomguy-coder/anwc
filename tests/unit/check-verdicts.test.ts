import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envelopeSchema, type Snapshot } from '@anwc/protocol';
import { VERDICT_BY_REASON, type VerdictReason } from '@anwc/report';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { checkpointVerdict, findingVerdicts, run, type CheckpointEvidence } from '../../packages/cli/src/index.js';

const clean = (): Snapshot => ({ ...structuredClone(validSnapshotFixture), findings: [] });
const evidence = (patch: Partial<CheckpointEvidence>): CheckpointEvidence => ({
  name: 'c', stepsPassed: true, assertions: [{ id: 'a', description: 'd', passed: true }], captures: [{ name: 'shot', snapshot: clean() }], findings: [], ...patch
});

describe('P03 check verdicts (pure)', () => {
  test('findings are contradicted when measured, unverified when acknowledged or unsettled', () => {
    const acknowledged = structuredClone(validSnapshotFixture);
    acknowledged.findings[0]!.acknowledged = true;
    const unsettled = structuredClone(validSnapshotFixture);
    unsettled.readiness.settled = false;
    const rows = findingVerdicts([{ name: 'one', snapshot: validSnapshotFixture }, { name: 'two', snapshot: acknowledged }, { name: 'three', snapshot: unsettled }]);
    expect(rows.map((r) => [r.capture, r.verdict, r.reason, r.targetKey])).toEqual([
      ['one', 'contradicted', 'finding_present', 'key:first'],
      ['two', 'unverified', 'finding_acknowledged', 'key:first'],
      ['three', 'unverified', 'capture_not_settled', 'key:first']
    ]);
  });

  const withCoverage = clean(); withCoverage.coverage.complete = false;
  const moving = clean(); moving.readiness.settled = false;
  const cases: Array<[VerdictReason, string, Partial<CheckpointEvidence>]> = [
    ['no_baseline', 'clean state with passing assertions', {}],
    ['behavior_not_checked', 'clean state without assertions', { assertions: [] }],
    ['behavior_not_checked', 'assertion could not run', { assertions: [{ id: 'a', description: 'd', passed: false, error: 'Timeout 2000ms exceeded' }] }],
    ['behavior_assertion_failed', 'assertion ran and failed', { assertions: [{ id: 'a', description: 'd', passed: false, actual: false, expected: true }] }],
    ['target_ambiguous', 'assertion matched several elements', { assertions: [{ id: 'a', description: 'd', passed: false, error: 'strict mode violation: resolved to 2 elements' }] }],
    ['target_ambiguous', 'step matched several elements', { stepsPassed: false, stepError: "Selector 'button' matches 2 elements. Target is ambiguous.", captures: [], assertions: [] }],
    ['state_not_reproduced', 'step failed', { stepsPassed: false, stepError: 'click timed out', captures: [], assertions: [] }],
    ['coverage_reduced', 'clean capture with reduced coverage', { captures: [{ name: 'shot', snapshot: withCoverage }], stepsPassed: false, assertions: [] }],
    ['coverage_reduced', 'no capture at all', { captures: [] }],
    ['capture_not_settled', 'moving layout', { captures: [{ name: 'shot', snapshot: moving }], stepsPassed: false, assertions: [] }],
    ['finding_present', 'measured finding', { findings: findingVerdicts([{ name: 'shot', snapshot: validSnapshotFixture }]) }]
  ];
  test.each(cases)('%s: %s', (reason, _label, patch) => {
    const result = checkpointVerdict(evidence(patch));
    expect(result.reason).toBe(reason);
    expect(result.verdict).toBe(VERDICT_BY_REASON[reason]);
    expect(result.verdict).not.toBe('verified');
  });
});

describe('P03 check verdicts (CLI, real browser)', () => {
  let server: Server;
  let baseUrl: string;
  beforeAll(async () => {
    server = createServer((request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(request.url === '/broken'
        ? '<h1>Broken</h1><button data-anwc-key="pay" data-anwc-expect="interactive" style="display:none">Pay</button>'
        : '<h1>Clean</h1>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  test('every finding and checkpoint carries a verdict; passedAll is not a verdict', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-check-verdict-'));
    const heading = (expectedValue: string) => [{ id: 'h', description: 'heading', selector: 'h1', expected: 'text-contains', expectedValue }];
    const checkpoint = (path: string, name: string, assertions: unknown[] = []) => ({ name, steps: [{ action: 'navigate', path }, { action: 'capture', name, runtimeOnly: true }], assertions });
    try {
      const file = join(tmp, 'checks.json');
      await writeFile(file, JSON.stringify({
        schemaVersion: '0.1', baseUrl,
        scenarios: [
          { id: 's1', title: 't', checkpoints: [checkpoint('/', 'clean', heading('Clean')), checkpoint('/broken', 'broken', heading('Broken')), checkpoint('/', 'unasserted')] },
          { id: 's2', title: 't', checkpoints: [checkpoint('/', 'wrong', heading('Nope')), checkpoint('/', 'never-run')] }
        ]
      }), 'utf8');
      const stdout: string[] = [];
      const exit = await run(['check', file], { stdout: (m) => stdout.push(m), stderr: () => {} });
      expect(exit).toBe(1); // s2's assertion failed
      const envelope = envelopeSchema.parse(JSON.parse(stdout.join('')));
      const data = (envelope as { data: Record<string, any> }).data;
      const rows = data.scenarios.flatMap((s: any) => s.checkpoints).map((c: any) => [c.name, c.passed, c.verdict, c.reason]);
      expect(rows).toEqual([
        ['clean', true, 'unverified', 'no_baseline'],
        // Replay passed, but the defect is measured: passed:true must not read as verified.
        ['broken', true, 'contradicted', 'finding_present'],
        ['unasserted', true, 'unverified', 'behavior_not_checked'],
        ['wrong', false, 'contradicted', 'behavior_assertion_failed']
      ]);
      expect(data.scenarios[0].checkpoints[1].findingVerdicts).toMatchObject([
        { capture: 'broken', code: 'EXPECTED_VISIBLE_BUT_HIDDEN', targetKey: 'key:pay', verdict: 'contradicted', reason: 'finding_present' }
      ]);
      expect(data.verdictSummary).toEqual({
        findings: { verified: 0, unverified: 0, contradicted: 1 },
        checkpoints: { verified: 0, unverified: 3, contradicted: 2 },
        checkpointsNotRun: 1
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
