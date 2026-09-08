import './verify-renderer.mjs';
import { build } from 'esbuild';
import { chmodSync } from 'node:fs';
await build({entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js', bundle: true,
  platform: 'node', target: 'node22', format: 'esm', sourcemap: true,
  banner: {js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);'}});
chmodSync('dist/cli.js', 0o755);
