import { z } from 'zod';

/**
 * Envelope 0.1: the one result shape every `--format json` CLI output uses.
 * Success: `{ version, ok: true, command, data }`. Failure: `{ version, ok: false, command, error }`.
 * Payloads (Snapshot 0.1, Report 0.1, DiffReport 0.1, check and doctor results) are unchanged inside `data`.
 */
export const ENVELOPE_VERSION = '0.1' as const;

/** `unknown` is used only when the first argument is not a known command. */
export const ENVELOPE_COMMANDS = ['inspect', 'check', 'diff', 'report', 'doctor', 'studio', 'unknown'] as const;
export const envelopeCommandSchema = z.enum(ENVELOPE_COMMANDS);

/** Closed error code list. Add a code only through a protocol change. */
export const ERROR_CODES = [
  'INVALID_USAGE',
  'TARGET_UNREACHABLE',
  'RUNTIME_MISSING',
  'CSP_BLOCKED',
  'NOT_SETTLED',
  'CAPTURE_STALE',
  'AMBIGUOUS_TARGET',
  'SOURCE_UNMAPPED',
  'BUDGET_EXCEEDED',
  'INTERNAL'
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);

/** Closed recovery strategy list: what the caller should change before trying again. */
export const RECOVERY_STRATEGIES = [
  'fix_input',
  'start_target',
  'instrument_target',
  'adjust_csp',
  'wait_and_retry',
  'increase_budget',
  'recapture',
  'disambiguate_target',
  'fix_environment',
  'report_bug'
] as const;
export const recoveryStrategySchema = z.enum(RECOVERY_STRATEGIES);

/**
 * `safe`: re-running the same command cannot duplicate an effect (read-only work, or nothing ran).
 * `unsafe`: re-running may repeat an effect. `unknown`: ANWC cannot tell.
 */
export const retrySchema = z.enum(['safe', 'unsafe', 'unknown']);

export const recoverySchema = z.object({
  strategy: recoveryStrategySchema,
  /** Re-running the identical command, unchanged, may succeed. */
  retryable: z.boolean(),
  /** Evidence from the failed attempt (or the document it read) must not be reused; capture again. */
  requiresFreshCapture: z.boolean(),
  /** Human-readable next step. */
  hint: z.string().min(1).optional()
}).strict();

export const errorDetailsSchema = z.object({
  /** The precise original failure kind, e.g. `NAVIGATION_FAILED`, `CAPTURE_TIMEOUT`. */
  kind: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'kind is UPPER_SNAKE_CASE')
}).catchall(z.unknown());

export const envelopeErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: errorDetailsSchema.optional(),
  recovery: recoverySchema.optional(),
  retry: retrySchema
}).strict();

export const successEnvelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  ok: z.literal(true),
  command: envelopeCommandSchema,
  data: z.unknown()
}).strict().refine((envelope) => envelope.data !== undefined && envelope.data !== null, { message: 'data is required when ok is true', path: ['data'] });

export const errorEnvelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  ok: z.literal(false),
  command: envelopeCommandSchema,
  error: envelopeErrorSchema
}).strict();

export const envelopeSchema = z.union([successEnvelopeSchema, errorEnvelopeSchema]);

/** Envelope schema whose `data` is validated by a payload schema (for consumers that know the command). */
export function envelopeOf<T extends z.ZodTypeAny>(data: T) {
  return z.union([
    z.object({ version: z.literal(ENVELOPE_VERSION), ok: z.literal(true), command: envelopeCommandSchema, data }).strict(),
    errorEnvelopeSchema
  ]);
}

export type EnvelopeCommand = z.infer<typeof envelopeCommandSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type RecoveryStrategy = z.infer<typeof recoveryStrategySchema>;
export type Retry = z.infer<typeof retrySchema>;
export type Recovery = z.infer<typeof recoverySchema>;
export type EnvelopeError = z.infer<typeof envelopeErrorSchema>;
export type SuccessEnvelope<T = unknown> = { version: typeof ENVELOPE_VERSION; ok: true; command: EnvelopeCommand; data: T };
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type Envelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

/** True when `input` has the Envelope shape markers (`version`, boolean `ok`, `command`). Does not validate the payload. */
export function looksLikeEnvelope(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return typeof record.version === 'string' && typeof record.ok === 'boolean' && typeof record.command === 'string' && !('schemaVersion' in record);
}

export type UnwrappedInput =
  | { wrapped: false; value: unknown }
  | { wrapped: true; command: EnvelopeCommand; value: unknown }
  | { wrapped: true; command: EnvelopeCommand; error: EnvelopeError };

/**
 * Accepts either a bare payload or an envelope and returns the payload.
 * A value that only looks like an envelope but fails the schema is returned as a bare value,
 * so the caller's own payload validation reports the problem.
 */
export function unwrapEnvelope(input: unknown): UnwrappedInput {
  if (!looksLikeEnvelope(input)) return { wrapped: false, value: input };
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return { wrapped: false, value: input };
  const envelope = parsed.data;
  if (envelope.ok === true) return { wrapped: true, command: envelope.command, value: envelope.data };
  return { wrapped: true, command: envelope.command, error: envelope.error };
}
