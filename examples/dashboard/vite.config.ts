import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { anwc } from '@anwc/vite-plugin';
export default defineConfig({ plugins: [anwc({ sourceRoot: fileURLToPath(new URL('../..', import.meta.url)) }), react()] });
