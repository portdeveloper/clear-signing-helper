import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scaffold} from '../src/descriptors.js';
import {portabilityFindings, runnerDivergence} from '../src/portability.js';
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

test('runner divergence is the displayed signed-int and nested-array subset; device-only ordering is not',()=>{
  const entry=corpus.descriptors.find(e=>e.file==='registry/feral-file/calldata-feralfile-vault-0.json')!;
  const c=registryContract(entry),d=scaffold(c,entry.owner);
  const all=runnerDivergence(c.id,d);
  assert.ok(all.length && all.every(f=>['NESTED_ARRAY_PORTABILITY','SIGNED_INTEGER_PORTABILITY'].includes(f.code)));
  assert.ok(all.some(f=>f.code==='NESTED_ARRAY_PORTABILITY'));
  // Hiding every field of the affected formats removes them from the gate, while the portability report keeps them.
  for(const sig of new Set(all.map(f=>f.signature))) for(const [key,spec] of Object.entries(d.display.formats)) if(portabilityFindings(c.id,{...d,display:{formats:{[key]:spec}}}).some(f=>f.signature===sig)) spec.fields=[];
  assert.equal(runnerDivergence(c.id,d).length,0);
  assert.ok(portabilityFindings(c.id,d).some(f=>f.code==='NESTED_ARRAY_PORTABILITY'));
});
