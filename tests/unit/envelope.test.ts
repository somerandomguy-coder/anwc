import { describe, expect, test } from 'vitest';
import {
  ERROR_CODES,
  envelopeOf,
  envelopeSchema,
  errorEnvelopeSchema,
  snapshotSchema,
  successEnvelopeSchema,
  unwrapEnvelope,
  type ErrorCode
} from '@anwc/protocol';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { CliError, errorEnvelope, exitCodeForError, retryFor, successEnvelope } from '../../packages/cli/src/index.js';

const error = { code: 'RUNTIME_MISSING', message: 'ANWC runtime is not present on this page.', details: { kind: 'RUNTIME_MISSING' }, recovery: { strategy: 'instrument_target', retryable: false, requiresFreshCapture: false }, retry: 'safe' } as const;

describe('Envelope 0.1 schema', () => {
  test('accepts a success envelope and validates data with a payload schema', () => {
    const envelope = { version: '0.1', ok: true, command: 'inspect', data: validSnapshotFixture };
    expect(envelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelopeOf(snapshotSchema).parse(envelope)).toMatchObject({ ok: true });
    expect(() => envelopeOf(snapshotSchema).parse({ ...envelope, data: { schemaVersion: '0.1' } })).toThrow();
  });

  test('accepts a minimal error envelope and omits empty fields', () => {
    expect(errorEnvelopeSchema.parse({ version: '0.1', ok: false, command: 'diff', error: { code: 'INTERNAL', message: 'x', retry: 'unknown' } })).toEqual({
      version: '0.1', ok: false, command: 'diff', error: { code: 'INTERNAL', message: 'x', retry: 'unknown' }
    });
    expect(envelopeSchema.parse({ version: '0.1', ok: false, command: 'inspect', error })).toMatchObject({ ok: false });
  });

  test('rejects malformed envelopes', () => {
    const base = { version: '0.1', ok: false, command: 'inspect', error };
    expect(() => envelopeSchema.parse({ ...base, version: '0.2' })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, command: 'click' })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, error: { ...error, code: 'NAVIGATION_FAILED' } })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, error: { ...error, retry: 'maybe' } })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, error: { ...error, details: { cause: 'no kind' } } })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, error: { ...error, recovery: { strategy: 'pray', retryable: true, requiresFreshCapture: false } } })).toThrow();
    expect(() => envelopeSchema.parse({ ...base, data: {} })).toThrow();
    expect(() => successEnvelopeSchema.parse({ version: '0.1', ok: true, command: 'inspect' })).toThrow();
    expect(() => envelopeSchema.parse({ version: '0.1', ok: true, command: 'inspect', data: {}, error })).toThrow();
  });

  test('the error code list is closed and matches the P01 card', () => {
    expect([...ERROR_CODES]).toEqual(['INVALID_USAGE', 'TARGET_UNREACHABLE', 'RUNTIME_MISSING', 'CSP_BLOCKED', 'NOT_SETTLED', 'CAPTURE_STALE', 'AMBIGUOUS_TARGET', 'SOURCE_UNMAPPED', 'BUDGET_EXCEEDED', 'INTERNAL']);
  });

  test('unwraps envelopes and leaves bare payloads alone', () => {
    expect(unwrapEnvelope(validSnapshotFixture)).toEqual({ wrapped: false, value: validSnapshotFixture });
    expect(unwrapEnvelope({ version: '0.1', ok: true, command: 'inspect', data: validSnapshotFixture })).toEqual({ wrapped: true, command: 'inspect', value: validSnapshotFixture });
    expect(unwrapEnvelope({ version: '0.1', ok: false, command: 'inspect', error })).toMatchObject({ wrapped: true, error: { code: 'RUNTIME_MISSING' } });
    // Doctor results carry `ok` and `schemaVersion`; they are payloads, not envelopes.
    const doctorLike = { schemaVersion: '0.1', ok: true, command: 'doctor', version: 'x', checks: [] };
    expect(unwrapEnvelope(doctorLike)).toEqual({ wrapped: false, value: doctorLike });
    expect(unwrapEnvelope(null)).toEqual({ wrapped: false, value: null });
  });
});

describe('CLI envelope builders', () => {
  test('every code builds a schema-valid error envelope with recovery and the documented exit code', () => {
    for (const code of ERROR_CODES as readonly ErrorCode[]) {
      const cliError = new CliError(code, `${code} happened`, 'TEST_KIND', { hint: 'do something' });
      const envelope = errorEnvelopeSchema.parse(errorEnvelope('inspect', cliError));
      expect(envelope.error.details).toEqual({ kind: 'TEST_KIND' });
      expect(envelope.error.recovery?.hint).toBe('do something');
      expect(exitCodeForError(cliError)).toBe(code === 'INVALID_USAGE' ? 2 : 1);
    }
  });

  test('retry is safe only where re-running cannot duplicate an effect', () => {
    for (const command of ['inspect', 'report', 'diff', 'doctor'] as const) {
      expect(retryFor(command, 'INTERNAL')).toBe('safe');
    }
    // check replays declared clicks and fills against a live app.
    expect(retryFor('check', 'INTERNAL')).toBe('unknown');
    expect(retryFor('check', 'TARGET_UNREACHABLE')).toBe('unknown');
    // Usage errors happen before any work runs.
    expect(retryFor('check', 'INVALID_USAGE')).toBe('safe');
    expect(errorEnvelope('check', new CliError('INTERNAL', 'boom', 'UNCAUGHT_EXCEPTION')).error.retry).toBe('unknown');
  });

  test('success envelopes carry the payload unchanged', () => {
    expect(successEnvelope('inspect', validSnapshotFixture)).toEqual({ version: '0.1', ok: true, command: 'inspect', data: validSnapshotFixture });
  });
});
