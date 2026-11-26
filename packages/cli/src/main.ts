#!/usr/bin/env node
import { run } from './index.js';

const code = await run(process.argv.slice(2));
// Writes to a pipe can still be queued (macOS, Windows); exiting at once could cut a long JSON result.
// A write's callback runs after everything queued before it has been flushed.
await Promise.all([process.stdout, process.stderr].map((stream) => new Promise<void>((done) => stream.write('', () => done()))));
process.exit(code);
