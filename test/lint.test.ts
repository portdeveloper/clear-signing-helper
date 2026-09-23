import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintPinFromRegistry, lintCommand, DEFAULT_LINT_PIN } from '../src/lint.js';

// The linter is the registry's own: the package its .github/requirements.txt installs and the flags its
// pull_request workflow passes. These fixtures mirror the registry's files before and after #3038.
function clone(requirement: string, lintLine: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-lint-pin-'));
  fs.mkdirSync(path.join(root, '.github/workflows'), {recursive: true});
  fs.writeFileSync(path.join(root, '.github/requirements.txt'), `${requirement}\n`);
  fs.writeFileSync(path.join(root, '.github/workflows/pull_request.yml'), `jobs:\n  lint:\n    steps:\n      - name: install\n        run: pip install -r .github/requirements.txt\n      - name: lint\n        env:\n          SOURCIFY_TOKEN: \${{ secrets.X }}\n        run: ${lintLine}\n`);
  return root;
}
test('the lint pin follows a registry clone\'s CI definition, and the built-in pin requires Sourcify verification', t => {
  const before = clone('erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@e7bdf8481440c8aad2200d132459b2157d24396b', 'erc7730 lint $AFFECTED_FILES --gha');
  const after = clone('erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@f2fafe1cf93483de2715ef0cad798277ac2ad9ed', 'erc7730 lint --require-verified $AFFECTED_FILES --gha');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-lint-pin-'));
  t.after(() => { for (const d of [before, after, empty]) fs.rmSync(d, {recursive: true, force: true}); });
  const a = lintPinFromRegistry(before), b = lintPinFromRegistry(after), c = lintPinFromRegistry(empty);
  assert.equal(a.requirement, 'erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@e7bdf8481440c8aad2200d132459b2157d24396b');
  assert.deepEqual(a.flags, [], '--gha changes output only');
  assert.deepEqual(b.flags, ['--require-verified']);
  assert.deepEqual([b.requirement, b.flags], [DEFAULT_LINT_PIN.requirement, DEFAULT_LINT_PIN.flags], 'the built-in pin is the post-#3038 CI');
  assert.deepEqual([c.requirement, c.flags], [DEFAULT_LINT_PIN.requirement, DEFAULT_LINT_PIN.flags]);
  assert.match(c.source, /has no \.github\/requirements\.txt/);
  // The printed command is copy-pasteable: the requirement carries spaces.
  assert.equal(lintCommand(['registry/x/calldata-X.json'], b), `uvx --from 'erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@f2fafe1cf93483de2715ef0cad798277ac2ad9ed' erc7730 lint --require-verified registry/x/calldata-X.json`);
});
