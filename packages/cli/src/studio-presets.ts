import { snapshotSchema, type Snapshot } from '@anwc/protocol';
import { RECORDED_EXAMPLES } from './studio-recorded.js';

export interface StudioPreset {
  id: string;
  title: string;
  description: string;
  snapshot: Snapshot;
}

/** Built-in examples: real captures of the example apps, validated at load. */
export const STUDIO_PRESETS: StudioPreset[] = (RECORDED_EXAMPLES as StudioPreset[]).map((example) => ({
  ...example,
  snapshot: snapshotSchema.parse(example.snapshot)
}));
