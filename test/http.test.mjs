import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { LocalAI } from '../src/ai.mjs';

test('Local model adapter rejects external web endpoints',()=>{
 assert.throws(()=>new LocalAI({model:'test',baseURL:'https://remote.example'}),/loopback/);
});
test('Fake Ollama model outputs advisory only, no payment authority',async()=>{
 let calls=0;
 const ai=new LocalAI({model:'local-test-model',
  fetcher:async(url,options)=>{
   calls++;assert.equal(new URL(url).hostname,'127.0.0.1');
   assert.equal(JSON.parse(options.body).stream,false);
   return {ok:true,json:async()=>({response:JSON.stringify({
    summary:'Documents appear related to the milestone',
    missing:['Evidence of delivery'],risk:'medium'
   })})};
  }});
 const feedback=await ai.evaluate('delivered report','report with citations');
 assert.equal(calls,1);
 assert.equal(feedback.provider,'LOCAL_AI_OLLAMA');
 assert.match(feedback.authority,/human approval mandatory/);
});
test('Complete HTTP lifecycle: analyze, manually approve, create mock order, capture, reset',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'proofpay-test-'));
 process.env.DATA_FILE=join(folder,'state.json');
 process.env.OLLAMA_MODEL=''; process.env.AI_PROVIDER='DISABLED';
 delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;
 const {server}=await import('../src/server.mjs');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,params=null){
  const res=await fetch(base+path,params===null?{}:{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
  return {status:res.status,body:await res.json()};
 }
 try{
  const html=await fetch(base+'/');
  assert.equal(html.status,200);
  assert.match(await html.text(),/PROOF/i);
  let res=await request('/api/create-order',{});
  assert.equal(res.status,403);
  res=await request('/api/analyze',{evidence:
   'I delivered municipal sweeper export tender analysis with technical specifications, cited sources, a supplier comparison and deadline schedule.'});
  assert.equal(res.status,200);
  assert.equal(res.body.state.humanApproved,false);
  res=await request('/api/approve',{approved:true});
  assert.equal(res.status,200);
  assert.equal(res.body.state.humanApproved,true);
  res=await request('/api/create-order',{amount:'0.01',currency:'USD'});
  assert.equal(res.status,200);
  assert.equal(res.body.state.payment.mode,'SIMULATION_ONLY');
  const order=res.body.state.payment.id;
  res=await request('/api/create-order',{});
  assert.equal(res.status,409);
  res=await request('/api/capture',{orderId:'SPOOFED'});
  assert.equal(res.status,409);
  res=await request('/api/capture',{orderId:order});
  assert.equal(res.status,200);
  assert.equal(res.body.state.payment.status,'COMPLETED');
  res=await request('/api/capture',{orderId:order});
  assert.equal(res.status,409);
  res=await request('/api/reset',{confirm:true});
  assert.equal(res.status,200);
  assert.equal(res.body.state.payment,null);
  res=await request('/api/state');
  assert.equal(res.status,200);
  assert.equal(res.body.capabilities.payments,'SIMULATION_ONLY');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  rmSync(folder,{recursive:true,force:true});
 }
});