import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scaffold} from '../src/descriptors.js';
import {portabilityFindings} from '../src/portability.js';
import {corpus,registryContract} from './registry-helpers.js';

test('observed registry failures are surfaced without treating scalar tuples as arrays',()=>{
  const findings=(file:string)=>{
    const entry=corpus.descriptors.find(e=>e.file===file)!;
    const c=registryContract(entry);
    return portabilityFindings(c.id,scaffold(c,entry.owner));
  };
  assert.equal(findings('registry/morpho/calldata-MorphoBlue.json').length,0);
  assert.ok(findings('registry/morpho/calldata-MorphoBundlerV3.json').some(f=>f.code==='ARRAY_ORDER_PORTABILITY' && f.path==='bundle'));
  const feral=findings('registry/feral-file/calldata-feralfile-vault-0.json');
  assert.ok(feral.some(f=>f.code==='NESTED_ARRAY_PORTABILITY'));
  assert.ok(feral.some(f=>f.code==='ARRAY_ORDER_PORTABILITY'));
  assert.ok(findings('registry/ekubo/calldata-MEVCaptureRouter.json').some(f=>f.code==='SIGNED_INTEGER_PORTABILITY' && f.path==='amount'));
  assert.equal(findings('registry/weth/calldata-weth.json').length,0);
});
