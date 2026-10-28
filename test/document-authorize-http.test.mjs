import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('file-based authorized capture or void requires buyer token and cannot double-pay',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'proofpay-document-v4-'));
 process.env.DATA_FILE=join(folder,'state.json');
 process.env.AI_PROVIDER='DISABLED';
 delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_CLIENT_SECRET;
 const {server}=await import('../src/server.mjs');
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port;
 const buyerToken=readFileSync(process.env.DATA_FILE+'.buyer-token','utf8').trim();
 const post=async(path,data,token=buyerToken)=>{
  const res=await fetch(url+path,{method:'POST',headers:{
   'Content-Type':'application/json',...(token?{'X-Buyer-Token':token}:{})
  },body:JSON.stringify(data)});
  return {status:res.status,data:await res.json()};
 };
 const proof=[
 'Tender analysis: tender review for municipality.',
 'Supplier comparison: we compared three independent suppliers.',
 'Technical specifications: 3000-litre hopper.',
 'Deadline schedule: export contract ends on November 15.',
 'Cited sources: official procurement annex A.'
 ].join('\n');
 const analyze=()=>post('/api/analyze-file',{
  filename:'sample-delivery.txt',mimeType:'text/plain',base64:Buffer.from(proof).toString('base64')
 });
 try{
  // Buyer reserves a fixed amount before any supplier work is accepted.
  assert.equal((await post('/api/create-authorization-order',{},'')).status,403);
  let r=await post('/api/create-authorization-order',{amount:'0.01',currency:'USD'});
  assert.equal(r.status,200);
  assert.equal(r.data.state.payment.intent,'AUTHORIZE');
  const orderId=r.data.state.payment.id;
  assert.equal((await post('/api/authorize-order',{orderId:'FOREIGN'})).status,409);
  r=await post('/api/authorize-order',{orderId});
  assert.equal(r.status,200);
  assert.equal(r.data.state.payment.status,'AUTHORIZED');
  assert.equal(r.data.state.humanApproved,false);
  assert.equal((await post('/api/capture-authorization',{})).status,403);
  assert.equal((await post('/api/authorize-order',{orderId})).status,409);
  // Seller uploads an actual file after authorization; buyer examines cited passages.
  r=await analyze();
  assert.equal(r.status,200);
  assert.equal(r.data.state.analysis.kind,'DOCUMENT_PROOF');
  assert.equal(r.data.state.analysis.status,'POTENTIALLY_MATCHES');
  assert.ok(r.data.state.analysis.claims.every(c=>c.quote));
  assert.equal((await post('/api/capture-authorization',{})).status,403);
  assert.equal((await post('/api/approve',{approved:true},'')).status,403);
  assert.equal((await post('/api/approve',{approved:true})).status,200);
  r=await post('/api/capture-authorization',{});
  assert.equal(r.status,200);
  assert.equal(r.data.state.payment.status,'COMPLETED');
  assert.equal(r.data.state.audit.at(-1).action,'SIMULATION_CAPTURE_COMPLETED');
  assert.equal((await post('/api/capture-authorization',{})).status,403);
  assert.equal((await post('/api/void-authorization',{})).status,403);
  assert.equal((await post('/api/reset',{confirm:true})).status,200);
  // Independent second hold can be voided before file delivery.
  r=await post('/api/create-authorization-order',{});
  assert.equal(r.status,200);
  await post('/api/authorize-order',{orderId:r.data.state.payment.id});
  r=await post('/api/void-authorization',{});
  assert.equal(r.status,200);
  assert.equal(r.data.state.payment.status,'VOIDED');
  assert.equal(r.data.state.audit.at(-1).action,'SIMULATION_AUTHORIZATION_VOIDED');
  assert.equal((await post('/api/capture-authorization',{})).status,403);
  assert.ok(readFileSync(process.env.DATA_FILE,'utf8').includes('LOCAL_DOCUMENT_ANALYZED'));
  assert.ok(!readFileSync(process.env.DATA_FILE,'utf8').includes(proof));
 }finally{
  await new Promise(ok=>server.close(ok));
  rmSync(folder,{recursive:true,force:true});
 }
});
