/**
 * The repository's example apps and the documented ports they run on.
 * Built-in presets point at these origins; the studio uses this catalog to
 * tell the user how to start an app that is not answering.
 * Keep in sync with docs/TESTING.md and packages/cli/src/studio-presets.ts.
 */
export interface ExampleTarget {
  id: 'shop' | 'pricing' | 'dashboard';
  name: string;
  origin: string;
  startCommand: string;
}

export const EXAMPLE_TARGETS: Record<ExampleTarget['id'], ExampleTarget> = {
  shop: {
    id: 'shop',
    name: 'demo shop',
    origin: 'http://127.0.0.1:4175',
    startCommand: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort'
  },
  pricing: {
    id: 'pricing',
    name: 'pricing example',
    origin: 'http://127.0.0.1:4176',
    startCommand: 'npm run dev --workspace=@anwc/landing -- --host 127.0.0.1 --port 4176 --strictPort'
  },
  dashboard: {
    id: 'dashboard',
    name: 'dashboard example',
    origin: 'http://127.0.0.1:4177',
    startCommand: 'npm run dev --workspace=@anwc/dashboard -- --host 127.0.0.1 --port 4177 --strictPort'
  }
};

/** Returns the example app served at this URL's origin, if any. */
export function exampleTargetFor(rawUrl: string): ExampleTarget | null {
  let origin: string;
  try {
    const parsed = new URL(rawUrl);
    origin = `${parsed.protocol}//${parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname}:${parsed.port}`;
  } catch {
    return null;
  }
  return Object.values(EXAMPLE_TARGETS).find((target) => target.origin === origin) ?? null;
}
