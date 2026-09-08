"""Exercise generated ABI-shape cases on a local public Ledger emulator.

No transactions are broadcast. Requires the pinned, already-built Device SDK,
public app ELF and a local image tag pointing to the recorded Speculos digest.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
from ledger_screen_check import compare_fields

p = argparse.ArgumentParser(description=__doc__)
for name in ['sdk', 'cases', 'app', 'out']:
    p.add_argument('--' + name, type=Path, required=True)
p.add_argument('--device', default='flex')
p.add_argument('--image-tag', default='csh-device-20260908')
p.add_argument('--case', action='append', default=[])
a = p.parse_args()
sdk, cases, out = a.sdk.resolve(), a.cases.resolve(), a.out.resolve()
assert not out.exists(), 'Choose a new evidence directory'
out.mkdir(parents=True)
(out / 'coin-apps').mkdir()
env = dict(os.environ, COIN_APPS_PATH=str(out / 'coin-apps'))
manifest = json.loads((cases / 'manifest.json').read_text())
results = []
compact = lambda s: re.sub(r'\s+', '', s)
for entry in manifest:
    if a.case and entry['name'] not in a.case:
        continue
    source = cases / entry['name']
    dest = out / entry['name']
    dest.mkdir()
    (dest / 'screenshots').mkdir()
    command = ['pnpm', 'cs-tester', 'cli', 'raw-file', str(source / 'raw.json'),
               '--device', a.device, '--custom-app', str(a.app.resolve()),
               '--docker-image-tag', a.image_tag, '--speculos-port', '19191', '--speculos-vnc-port', '29191',
               '--erc7730-files', str(source / entry['descriptor']),
               '--screenshot-folder-path', str(dest / 'screenshots'),
               '--log-file', str(dest / 'tester.log'), '--file-log-level', 'debug', '--log-level', 'info']
    print('Running ' + entry['name'], flush=True)
    try:
        with (dest / 'console.log').open('w') as console:
            completed = subprocess.run(command, cwd=sdk, env=env, stdout=console, stderr=subprocess.STDOUT, timeout=240)
        exit_code = completed.returncode
    except subprocess.TimeoutExpired:
        # Do not keep driving an uncertain emulator session after a timeout.
        print('Tester timed out; inspect and stop this case emulator before resuming.', flush=True)
        raise
    log = (dest / 'tester.log').read_text() if (dest / 'tester.log').exists() else ''
    status, state, texts = None, {}, []
    for line in log.splitlines():
        try:
            data = json.loads(line[line.index('{'):])
        except (ValueError, json.JSONDecodeError):
            continue
        if 'Transaction 1 Results:' in line:
            status = data.get('data', {}).get('status')
        if 'Accumulated screen texts from device:' in line:
            texts = data['data']['accumulatedTexts']
        if 'internalState' in data:
            state = data['internalState']
    expected = json.loads((source / 'expected.json').read_text())
    pairs, ordered = compare_fields(expected['fields'], texts)
    result = {'case': entry['name'], 'device': a.device, 'exitCode': exit_code, 'testerStatus': status,
              'clearSigningType': state.get('clearSigningType'), 'usedFallback': state.get('usedFallback'),
              'blindSigning': state.get('isBlindSign'), 'signatureProduced': bool(state.get('signature')),
              'contextErrorCount': state.get('contextErrorCount'), 'fields': pairs, 'capturedTexts': texts, 'fieldOrderMatches': ordered,
              'command': command, 'broadcast': False}
    result['passed'] = exit_code == 0 and status == 'clear_signed' and state.get('clearSigningType') == 'eip7730' and state.get('usedFallback') is False and state.get('isBlindSign') is False and ordered and all(f['foundTogether'] for f in pairs)
    (dest / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    results.append(result)
    (out / 'summary.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['case', 'testerStatus', 'passed', 'contextErrorCount']}), flush=True)
raise SystemExit(0 if results and all(r['passed'] for r in results) else 1)
