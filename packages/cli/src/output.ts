import { ENVELOPE_VERSION, ENVELOPE_COMMANDS, errorEnvelopeSchema, successEnvelopeSchema } from '@anwc/protocol';
import type { EnvelopeCommand, ErrorCode, ErrorEnvelope, Recovery, RecoveryStrategy, Retry, SuccessEnvelope } from '@anwc/protocol';

/** Default recovery for each code; a CliError may override any field and add a hint. */
const DEFAULT_RECOVERY: Record<ErrorCode, { strategy: RecoveryStrategy; retryable: boolean; requiresFreshCapture: boolean }> = {
  INVALID_USAGE: { strategy: 'fix_input', retryable: false, requiresFreshCapture: false },
  TARGET_UNREACHABLE: { strategy: 'start_target', retryable: true, requiresFreshCapture: false },
  RUNTIME_MISSING: { strategy: 'instrument_target', retryable: false, requiresFreshCapture: false },
  CSP_BLOCKED: { strategy: 'adjust_csp', retryable: false, requiresFreshCapture: false },
  NOT_SETTLED: { strategy: 'wait_and_retry', retryable: true, requiresFreshCapture: true },
  CAPTURE_STALE: { strategy: 'recapture', retryable: true, requiresFreshCapture: true },
  AMBIGUOUS_TARGET: { strategy: 'disambiguate_target', retryable: false, requiresFreshCapture: false },
  SOURCE_UNMAPPED: { strategy: 'instrument_target', retryable: false, requiresFreshCapture: false },
  BUDGET_EXCEEDED: { strategy: 'increase_budget', retryable: true, requiresFreshCapture: true },
  INTERNAL: { strategy: 'report_bug', retryable: false, requiresFreshCapture: false }
};

/** Commands whose work is read-only: re-running only re-reads input and rewrites the same output path. */
const READ_ONLY_COMMANDS: ReadonlySet<EnvelopeCommand> = new Set(['inspect', 'diff', 'report', 'doctor', 'studio', 'unknown']);

export interface CliErrorOptions {
  hint?: string;
  details?: Record<string, unknown>;
  recovery?: Partial<Omit<Recovery, 'hint'>>;
}

export class CliError extends Error {
  readonly code: ErrorCode;
  /** Precise original failure kind, reported as `error.details.kind`. */
  readonly kind: string;
  readonly hint?: string;
  readonly details: Record<string, unknown>;
  readonly recoveryOverride: Partial<Omit<Recovery, 'hint'>>;

  constructor(code: ErrorCode, message: string, kind: string, options: CliErrorOptions = {}) {
    super(message);
    this.code = code;
    this.kind = kind;
    this.hint = options.hint;
    this.details = options.details ?? {};
    this.recoveryOverride = options.recovery ?? {};
  }
}

export function commandName(arguments_: readonly string[]): EnvelopeCommand {
  const first = arguments_[0];
  return (ENVELOPE_COMMANDS as readonly string[]).includes(first ?? '') && first !== 'unknown' ? first as EnvelopeCommand : 'unknown';
}

/**
 * Retry safety. Usage errors happen before any work, so re-running is safe. Read-only commands
 * cannot duplicate an effect. `check` replays declared clicks and fills against a live app, so
 * ANWC cannot know whether a re-run repeats an app-side effect.
 */
export function retryFor(command: EnvelopeCommand, code: ErrorCode): Retry {
  if (code === 'INVALID_USAGE') return 'safe';
  if (READ_ONLY_COMMANDS.has(command)) return 'safe';
  return 'unknown';
}

export function exitCodeForError(error: CliError): 1 | 2 {
  return error.code === 'INVALID_USAGE' ? 2 : 1;
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  return new CliError('INTERNAL', error instanceof Error ? error.message : 'Unexpected CLI failure.', 'UNCAUGHT_EXCEPTION');
}

export function errorEnvelope(command: EnvelopeCommand, error: CliError): ErrorEnvelope {
  const recovery: Recovery = { ...DEFAULT_RECOVERY[error.code], ...error.recoveryOverride, ...(error.hint ? { hint: error.hint } : {}) };
  return errorEnvelopeSchema.parse({
    version: ENVELOPE_VERSION,
    ok: false,
    command,
    error: {
      code: error.code,
      message: error.message || error.code,
      details: { ...error.details, kind: error.kind },
      recovery,
      retry: retryFor(command, error.code)
    }
  });
}

export function successEnvelope<T>(command: EnvelopeCommand, data: T): SuccessEnvelope<T> {
  successEnvelopeSchema.parse({ version: ENVELOPE_VERSION, ok: true, command, data });
  return { version: ENVELOPE_VERSION, ok: true, command, data };
}
