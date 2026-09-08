import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const paths = execFileSync(npm, ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' })
  .trim().split('\n').slice(1).filter(Boolean).sort();
const packages = paths.map(directory => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const licenseFile = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'COPYING'].map(name => path.join(directory, name)).find(file => fs.existsSync(file));
  if (!licenseFile) throw Error(`Missing license text for ${manifest.name}; resolve provenance before packing.`);
  const copyrightFile = path.join(directory, 'CopyrightNotice.txt');
  const texts = [fs.readFileSync(licenseFile, 'utf8').trim(), ...(fs.existsSync(copyrightFile) ? [fs.readFileSync(copyrightFile, 'utf8').trim()] : [])];
  return {name: manifest.name, version: manifest.version, license: manifest.license ?? 'SEE LICENSE FILE', text: texts.join('\n\n').replace(/\r\n/g, '\n')};
});
const body = ['# Third-party notices', '', 'The published CLI bundles the runtime packages listed below. Their license texts are reproduced from the installed package contents used by the lockfile.', ''];
for (const pkg of packages) {
  body.push(`## ${pkg.name}@${pkg.version}`, '', `License: ${pkg.license}`, '');
  body.push(pkg.text, '');
}
fs.writeFileSync(path.join(root, 'docs', 'THIRD-PARTY-NOTICES.md'), `${body.join('\n').trimEnd()}\n`);
console.log(`Wrote notices for ${packages.length} runtime packages.`);
