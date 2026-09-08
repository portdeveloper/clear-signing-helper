// Capture a reviewable source/evidence archive without node_modules, build caches,
// unrelated workspace files, keys or environment files. Does not publish.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = ['package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', '.gitattributes', 'README.md', 'LICENSE', 'PRD.md',
  '.github', '.claude', 'src', 'scripts', 'test', 'schemas', 'vendor', 'examples', 'docs',
  'release/RELEASE-NOTES.md', 'release/release-verification.json', 'release/node24-verification.json'];
const ignored = new Set(['node_modules', '.git', 'out', 'cache', 'artifacts', 'forge-cache', 'broadcast', '.clear-signing-cache', '__pycache__']);
const files = [];
const visit = relative => {
  const file = path.join(root, relative), stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw Error(`Unexpected source symlink: ${relative}`);
  if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) {
    if (!ignored.has(name)) visit(path.join(relative, name));
  } else if (stat.isFile()) files.push(relative);
};
entries.forEach(visit);
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = Object.fromEntries(files.sort().map(file => [file, digest(path.join(root, file))]));
const output = path.join(root, 'release');
fs.writeFileSync(path.join(output, 'source-manifest.json'), JSON.stringify({algorithm: 'sha256', files: manifest}, null, 2) + '\n');
const list = path.join(output, '.source-archive-files');
try {
  fs.writeFileSync(list, [...files, 'release/source-manifest.json'].join('\n') + '\n');
  const archive = path.join(output, 'clear-signing-helper-source.tar.gz');
  execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '-czf', archive, '-T', list], {cwd: root, stdio: 'pipe'});
  fs.writeFileSync(archive + '.sha256', `${digest(archive)}  ${path.basename(archive)}\n`);
  console.log(JSON.stringify({archive, files: files.length, sha256: digest(archive)}));
} finally { fs.rmSync(list, {force: true}); }
