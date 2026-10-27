import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE=dirname(fileURLToPath(import.meta.url));
const HTML=readFileSync(resolve(HERE,'../web/mission-control.html'),'utf8');
const SCRIPT=(/<script>([\s\S]*?)<\/script>/.exec(HTML)||[])[1]||'';
const MARKUP=HTML.replace(/<script>[\s\S]*?<\/script>/g,'');

const dir=mkdtempSync(join(tmpdir(),'proofpay-mc-'));
process.env.DATA_FILE=join(dir,'state.json');
process.env.AI_PROVIDER='DISABLED';
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.HOST;
const { server } = await import('../src/server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
after(()=>{server.closeAllConnections?.();server.close();rmSync(dir,{recursive:true,force:true});});

test('mission control markup has all five accessible constellation nodes and links', ()=>{
  for(const k of ['milestone','evidence','ai','human','paypal'])
    assert.match(MARKUP,new RegExp('<button type="button" class="node[^"]*" data-node="'+k+'"[^>]*aria-label="[^"]+"'));
  for(const label of ['Milestone','Evidence','AI / Uncertainty','Human Approval','PayPal']) assert.ok(MARKUP.includes(label));
  assert.equal((MARKUP.match(/<path class="link"/g)||[]).length,4);
  assert.ok(MARKUP.includes('href="/"'),'links to the real approval workflow');
  assert.ok(MARKUP.includes('SIMULATION ONLY'));
  assert.ok(SCRIPT.includes('Genuine PayPal Sandbox'));
  assert.ok(MARKUP.includes('What-if'));
  assert.ok(MARKUP.includes('aria-live="polite"'));
  assert.match(HTML,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(HTML,/@keyframes/);
  assert.ok(SCRIPT.includes('keydown') && SCRIPT.includes('click'));
});

test('mission control script is read-only and renders untrusted text safely', ()=>{
  assert.equal((HTML.match(/<script/g)||[]).length,1,'single inline script');
  assert.doesNotMatch(HTML,/<script[^>]*\ssrc=/);
  assert.doesNotMatch(HTML,/https?:\/\//,'no external resources');
  assert.doesNotMatch(MARKUP,/<[^>]+\son[a-z]+\s*=/i,'no inline event handlers');
  assert.doesNotMatch(SCRIPT,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
  assert.ok(SCRIPT.includes('textContent'));
  assert.doesNotMatch(HTML,/\bPOST\b|\bPUT\b|\bDELETE\b/);
  for(const p of ['/api/analyze','/api/approve','/api/create-order','/api/capture','/api/reset'])
    assert.ok(!HTML.includes(p),'must not reference '+p);
  const fetches=[...SCRIPT.matchAll(/fetch\(\s*'([^']*)'/g)].map(m=>m[1]);
  assert.deepEqual(fetches,['/api/state']);
  assert.equal((SCRIPT.match(/fetch\(/g)||[]).length,1);
  assert.doesNotMatch(SCRIPT,/XMLHttpRequest|sendBeacon|WebSocket|<form/);
  assert.doesNotMatch(MARKUP,/<form/);
});

test('GET /mission-control serves the page with strict headers and pinned script hash', async ()=>{
  const res=await fetch(base+'/mission-control');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/^text\/html/);
  assert.equal(res.headers.get('x-frame-options'),'DENY');
  assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.equal(res.headers.get('cache-control'),'no-store');
  const csp=res.headers.get('content-security-policy');
  const hash=createHash('sha256').update(SCRIPT,'utf8').digest('base64');
  assert.ok(csp.includes("script-src 'sha256-"+hash+"'"));
  assert.ok(csp.includes("default-src 'none'") && csp.includes("connect-src 'self'") && csp.includes("form-action 'none'"));
  assert.equal(await res.text(),HTML);
});

test('legacy / application is preserved', async ()=>{
  const res=await fetch(base+'/');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/^text\/html/);
  const text=await res.text();
  assert.ok(text.includes('ProofPay'));
  assert.notEqual(text,HTML);
});

test('state boundaries: page load never mutates state or fabricates payment/approval', async ()=>{
  const before=await (await fetch(base+'/api/state')).json();
  await (await fetch(base+'/mission-control')).text();
  const post=await fetch(base+'/mission-control',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(post.status,404);
  await post.text();
  const afterState=await (await fetch(base+'/api/state')).json();
  assert.deepEqual(afterState,before);
  assert.equal(afterState.capabilities.automaticPayment,false);
  assert.notEqual(afterState.capabilities.payments,'PAYPAL_SANDBOX');
  assert.equal(afterState.capabilities.ai,'NOT_CONNECTED');
  assert.notEqual(afterState.state.humanApproved,true);
  assert.ok(!afterState.state.payment || afterState.state.payment.status!=='COMPLETED');
});
