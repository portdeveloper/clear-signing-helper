import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { loadState, init, review, runTests, preview } from '../src/app.js';
import { writeJson } from '../src/io.js';

await test('a mined Anvil vault deposit renders the actual transaction and agrees with on-chain balances', {timeout:60_000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clear-signing-anvil-'));
  fs.cpSync(path.resolve('examples/standard'),root,{recursive:true,filter:src=>!['out','cache','clear-signing','.clear-signing-cache','clear-signing.toml'].includes(path.basename(src))});
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const anvil=spawn('anvil',['--host','127.0.0.1','--port',String(port),'--silent'],{stdio:'ignore'});
  t.after(()=>anvil.kill('SIGTERM'));
  let launchError:Error|undefined;anvil.on('error',error=>{launchError=error;});
  const rpc=new JsonRpcProvider(`http://127.0.0.1:${port}`,31337,{staticNetwork:true});rpc.pollingInterval=50;t.after(()=>rpc.destroy());
  let ready=false;
  for(let i=0;i<60;i++){if(launchError)throw launchError;try{await rpc.getBlockNumber();ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
  assert.ok(ready,'Anvil must start');
  init({root,contract:['src/AssetVault.sol:AssetVault'],owner:'Anvil reference protocol'});
  const signer=await rpc.getSigner(0),receiver=await (await rpc.getSigner(1)).getAddress();
  const tokenArtifact=JSON.parse(fs.readFileSync(path.join(root,'out/ClearToken.sol/ClearToken.json'),'utf8'));
  const vaultArtifact=JSON.parse(fs.readFileSync(path.join(root,'out/AssetVault.sol/AssetVault.json'),'utf8'));
  // These are local unlocked Anvil accounts. No private keys enter the tool.
  const token:any=await new ContractFactory(tokenArtifact.abi,tokenArtifact.bytecode.object,signer).deploy("USD Coin", "USDC", 6, 0, await signer.getAddress());await token.waitForDeployment();
  const vault:any=await new ContractFactory(vaultArtifact.abi,vaultArtifact.bytecode.object,signer).deploy(await token.getAddress());await vault.waitForDeployment();
  await (await token.mint(await signer.getAddress(),2_000_000n)).wait();
  await (await token.approve(await vault.getAddress(),1_000_000n)).wait();
  const receipt=await (await vault.deposit(1_000_000n,receiver)).wait();
  const tx=await rpc.getTransaction(receipt.hash);assert.ok(tx);
  assert.equal(await vault.sharesOf(receiver),1_000_000n);assert.equal(await token.balanceOf(await vault.getAddress()),1_000_000n);
  const state=loadState({root}),selection=state.config.contracts[0],d=state.descriptors.get(selection.id)!;
  d.context.contract.deployments=[{chainId:31337,address:await vault.getAddress()}];
  const deposit=d.display.formats['deposit(uint256 assets,address receiver)'];
  deposit.fields=[{path:'assets',label:'Amount',format:'tokenAmount',params:{token:await token.getAddress()}},{path:'receiver',label:'Receiver',format:'addressName',params:{sources:['local']}}];
  writeJson(path.join(root,selection.descriptor),d);
  writeJson(path.join(root,'clear-signing/fixtures/mined-deposit.json'),{contract:selection.id,chainId:31337,to:tx.to,data:tx.data,value:tx.value.toString(),from:tx.from,tokens:{[await token.getAddress()]:{name:await token.name(),symbol:await token.symbol(),decimals:Number(await token.decimals())}},addressNames:{[receiver]:'Alice'}});
  const loaded=loadState({root}),rendered=await preview(loaded,'clear-signing/fixtures/mined-deposit.json');
  assert.equal(rendered.fields[0].value,`1 ${await token.symbol()}`);assert.equal(rendered.fields[1].value,'Alice');assert.equal(rendered.localBinding,false);assert.deepEqual(rendered.warnings,[]);
  review(loaded,undefined,true);await runTests(loaded,true);assert.equal((await runTests(loaded)).passed,1);
  // Independently encode with cast and compare the mined calldata, not a mocked ABI.
  const cast=spawnSync('cast',['calldata','deposit(uint256,address)','1000000',receiver],{encoding:'utf8'});
  assert.equal(cast.status,0);assert.equal(cast.stdout.trim().toLowerCase(),tx.data.toLowerCase());
});
