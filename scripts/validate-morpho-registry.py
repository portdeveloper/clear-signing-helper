"""Run upstream checks on an internal Morpho submission in a disposable clone.

Never opens a PR. Tool installations and checkouts are explicit inputs; see the
production submission report for their pinned revisions and setup commands.
"""
import argparse
import collections
import json
from pathlib import Path
import shutil
import subprocess

p = argparse.ArgumentParser(description=__doc__)
for name in ['registry', 'bundle', 'python-bin', 'sourcify-runner', 'rust-runner', 'out']:
    p.add_argument('--' + name, type=Path, required=True)
a = p.parse_args()
a.python_bin = a.python_bin.resolve()
registry, bundle, out = a.registry.resolve(), a.bundle.resolve(), a.out.resolve()
assert not out.exists(), 'Use a new evidence directory'
pin = subprocess.check_output(['git', '-C', str(registry), 'rev-parse', 'HEAD'], text=True).strip()
assert pin == '0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38'
assert not subprocess.check_output(['git', '-C', str(registry), 'diff', '--stat'], text=True).strip(), 'Use a clean disposable registry clone'
out.mkdir(parents=True)
provenance = json.loads((bundle / 'provenance.json').read_text())
descriptor = Path('registry/morpho/calldata-MorphoBlue.json')
tests = Path('registry/morpho/testsv2/calldata-MorphoBlue.tests.json')
assert not list((registry / 'registry/morpho/sigs').glob('calldata-MorphoBlue.eip155-*.json')), 'Do not replace an attested descriptor'
shutil.copyfile(bundle / provenance['descriptor'], registry / descriptor)
fixture = json.loads((bundle / 'testsv2' / provenance['descriptor'].replace('.json', '.tests.json')).read_text())
fixture['descriptor'] = '../calldata-MorphoBlue.json'
(registry / tests).write_text(json.dumps(fixture, indent=2) + '\n')
expected_cases = len(fixture['tests'])
checks = []


def run(name, command, runner_json=None):
    try:
        result = subprocess.run([str(x) for x in command], cwd=registry, text=True, capture_output=True, timeout=180)
        (out / (name + '.log')).write_text(result.stdout + result.stderr)
        check = {'name': name, 'command': [str(x) for x in command], 'exitCode': result.returncode, 'passed': result.returncode == 0}
        if name == 'recommendations':
            check.update({'advisory': True, 'hasRecommendations': bool(result.stdout.strip())})
        if name == 'rust':
            check['scanWarningCount'] = result.stderr.count('cs-test: warning:')
        if runner_json:
            data = json.loads(runner_json.read_text())
            counts = collections.Counter(case['status'] for case in data['cases'])
            check['cases'] = dict(counts)
            check['expectedCases'] = expected_cases
            # Both runners may successfully write a report while tests fail.
            # A process exit status alone is not a passing validation result.
            check['passed'] &= counts == {'pass': expected_cases}
        checks.append(check)
    except (subprocess.TimeoutExpired, OSError, ValueError, KeyError) as error:
        checks.append({'name': name, 'passed': False, 'error': str(error)})


run('descriptor-schema', [a.python_bin / 'check-jsonschema', '--schemafile', 'specs/erc7730-v2.schema.json', descriptor])
run('tests-schema', [a.python_bin / 'check-jsonschema', '--schemafile', 'specs/erc7730-tests-v2.schema.json', tests])
run('lint', [a.python_bin / 'erc7730', 'lint', descriptor, '--gha'])
run('recommendations', ['node', '.github/scripts/check-recommended-fields.js', descriptor])
run('index', ['node', 'tools/scripts/generate-index.js', '--validate'])
run('sourcify', ['node', a.sourcify_runner.resolve(), registry / tests, '--output', out / 'sourcify-results.json', '--verbose'], out / 'sourcify-results.json')
run('rust', [a.rust_runner.resolve(), 'run', registry / tests, '--registry', registry / 'registry', '--output', out / 'rust-results.json'], out / 'rust-results.json')
changes = subprocess.check_output(['git', '-C', str(registry), 'diff', '--name-only'], text=True).splitlines()
assert sorted(changes) == sorted([str(descriptor), str(tests)]), changes
for relative in [descriptor, tests, Path('specs/erc7730-v2.schema.json'), Path('specs/erc7730-tests-v2.schema.json'), Path('LICENSE.md')]:
    (out / relative).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(registry / relative, out / relative)
shutil.copyfile(bundle / 'provenance.json', out / 'provenance.json')
result = {
    'registryCommit': pin, 'stagedChanges': changes, 'checks': checks,
    'note': 'Internal replacement in a disposable registry clone. Not a proposed downgrade of the curated Morpho submission; nothing published.',
    'walletRendering': 'not exercised', 'maintainerReview': 'not requested',
}
(out / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({c['name']: {'passed': c['passed'], **({'cases': c['cases']} if 'cases' in c else {})} for c in checks}, indent=2))
raise SystemExit(0 if all(c['passed'] for c in checks) else 1)
