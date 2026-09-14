import { run } from './index.js';

process.exitCode = await run(process.argv.slice(2));
