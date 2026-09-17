import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { RawCapture, Snapshot } from '@anwc/protocol';

export const CHECK_MANIFEST_VERSION = '0.1' as const;

export const checkpointStepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('navigate'),
    path: z.string().min(1)
  }).strict(),
  z.object({
    action: z.literal('click'),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('fill'),
    selector: z.string().min(1),
    text: z.string(),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('scroll'),
    x: z.number().finite().default(0),
    y: z.number().finite().default(0),
    selector: z.string().min(1).optional()
  }).strict(),
  z.object({
    action: z.literal('wait-for-selector'),
    selector: z.string().min(1),
    state: z.enum(['attached', 'visible', 'detached', 'hidden']).default('visible'),
    timeoutMs: z.number().int().positive().optional()
  }).strict(),
  z.object({
    action: z.literal('capture'),
    name: z.string().min(1),
    readySelector: z.string().min(1).optional(),
    runtimeOnly: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional()
  }).strict()
]);

export type CheckpointStep = z.infer<typeof checkpointStepSchema>;

export const behaviorAssertionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  selector: z.string().min(1),
  expected: z.enum(['visible', 'hidden', 'text-contains', 'attribute-equals']),
  attributeName: z.string().min(1).optional(),
  expectedValue: z.string().optional()
}).strict();

export type BehaviorAssertion = z.infer<typeof behaviorAssertionSchema>;

export const checkpointSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(checkpointStepSchema).min(1),
  assertions: z.array(behaviorAssertionSchema).default([])
}).strict();

export type Checkpoint = z.infer<typeof checkpointSchema>;

export const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }).strict().default({ width: 1440, height: 900 }),
  checkpoints: z.array(checkpointSchema).min(1)
}).strict();

export type Scenario = z.infer<typeof scenarioSchema>;

export const stateManifestSchema = z.object({
  schemaVersion: z.literal(CHECK_MANIFEST_VERSION),
  baseUrl: z.string().url(),
  scenarios: z.array(scenarioSchema).min(1)
}).strict();

export type StateManifest = z.infer<typeof stateManifestSchema>;

export interface StepRecord {
  action: string;
  target?: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'timed-out';
  error?: string;
}

export interface AssertionResult {
  id: string;
  description: string;
  passed: boolean;
  actual?: string | boolean | null;
  expected?: string | boolean;
  error?: string;
}

export interface CheckpointExecutionResult {
  name: string;
  passed: boolean;
  steps: StepRecord[];
  assertions: AssertionResult[];
  finalUrl: string;
  finalScroll: { x: number; y: number };
  capture?: Snapshot;
  captureHash?: string;
  durationMs: number;
  error?: string;
}

export interface ScenarioExecutionResult {
  id: string;
  title: string;
  passed: boolean;
  checkpoints: CheckpointExecutionResult[];
  durationMs: number;
  error?: string;
}

export interface CheckRunResult {
  schemaVersion: typeof CHECK_MANIFEST_VERSION;
  manifestHash: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  scenarios: ScenarioExecutionResult[];
  passedAll: boolean;
}

export function computeManifestHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
