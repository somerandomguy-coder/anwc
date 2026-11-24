import { snapshotSchema } from '@anwc/protocol';
import type { StudioPreset } from '../types.js';
import { RECORDED_EXAMPLES } from './recorded.js';

/** Built-in examples: real captures of the example apps, validated at load. */
export const STUDIO_PRESETS: StudioPreset[] = (RECORDED_EXAMPLES as StudioPreset[]).map((example) => ({
  ...example,
  snapshot: snapshotSchema.parse(example.snapshot)
}));
