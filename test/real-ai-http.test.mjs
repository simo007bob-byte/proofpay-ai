import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';

test('Actual CPU transformer AI analysis flows into payment only after HUMAN approval',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'proofpay-real-ai-'));
 process.env.DATA_FILE=join(folder,'state.json');
 process.env.AI_PROVIDER='EMBEDDINGS';
 delete process.env.PAYPAL_CLIENT_ID;
 delete process.env.PAYPAL_CLIENT_SECRET;
 const {server}=await import('../src/server.mjs');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 async function post(path,obj={}){
  const response=await fetch(url+path,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(obj)});
  return {code:response.status,body:await response.json()};
 }
 try{
  const first=await post('/api/analyze',{
   evidence:'The municipal sweeper export tender analysis includes technical specifications, a supplier comparison, a full deadline schedule and cited official public sources.'
  });
  assert.equal(first.code,200);
  assert.equal(first.body.capabilities.ai,'LOCAL_AI_TRANSFORMER');
  assert.equal(first.body.state.agentAnalysis.provider,'LOCAL_AI_TRANSFORMER');
  assert.ok(first.body.state.agentAnalysis.similarityPercent>=35);
  assert.equal(first.body.state.humanApproved,false);
  const prevented=await post('/api/create-order');
  assert.equal(prevented.code,403);
  const approved=await post('/api/approve',{approved:true});
  assert.equal(approved.code,200);
  const paid=await post('/api/create-order');
  assert.equal(paid.code,200);
  assert.equal(paid.body.state.payment.mode,'SIMULATION_ONLY');
  const captured=await post('/api/capture',{orderId:paid.body.state.payment.id});
  assert.equal(captured.body.state.payment.status,'COMPLETED');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  rmSync(folder,{recursive:true,force:true});
 }
});
