import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  'dist/index.js': 'd3b8d3fa91c1d915fe73571a8e6a9c6dfc7772448f0835dd50ebfdcb4dffdeb7',
  'dist/index.cjs': '2d39e0c44639b9aaa9a4abc7cd826e4000ad24cde174a33cf9518ffc512d87b3',
};
const marker = 'Clear Signing Helper signed-int-fix.1';
for (const [relative, expected] of Object.entries(files)) {
  const file = path.join(root, 'vendor', 'clear-signing', relative);
  const contents = fs.readFileSync(file);
  const digest = createHash('sha256').update(contents).digest('hex');
  if (digest !== expected) throw new Error(`Vendored renderer hash mismatch: ${relative} (${digest})`);
  if (!contents.toString('utf8').includes(marker)) throw new Error(`Vendored renderer fix marker missing: ${relative}`);
}
console.log('Vendored clear-signing renderer verified (0.2.2, signed-int-fix.1).');
