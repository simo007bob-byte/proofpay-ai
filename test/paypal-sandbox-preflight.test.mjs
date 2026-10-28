import test from 'node:test';
import assert from 'node:assert/strict';
import {runSandboxPreflight,SANDBOX_TOKEN_ENDPOINT} from '../scripts/paypal-sandbox-preflight.mjs';

test('Sandbox preflight rejects missing credentials without any network request',async()=>{
 const result=await runSandboxPreflight({env:{},fetcher:()=>{throw Error('should not call')}});
 assert.deepEqual(result,{ok:false,reason:'MISSING_SANDBOX_CREDENTIALS'});
});
test('Sandbox preflight uses Sandbox origin and never returns credentials or OAuth token',async()=>{
 const secret='SENSITIVE-LOCAL-SECRET-SHOULD-NOT-BE-LOGGED';
 const result=await runSandboxPreflight({env:{
  PAYPAL_CLIENT_ID:'PUBLIC-ID',PAYPAL_CLIENT_SECRET:secret
 },fetcher:async(url,options)=>{
  assert.equal(url,SANDBOX_TOKEN_ENDPOINT);
  assert.equal(options.method,'POST');
  assert.equal(options.redirect,'error');
  assert.equal(options.body,'grant_type=client_credentials');
  assert.ok(options.headers.Authorization.startsWith('Basic '));
  return {ok:true,status:200,json:async()=>({access_token:'FAKE-OAUTH-TOKEN'})};
 }});
 assert.deepEqual(result,{ok:true,reason:'SANDBOX_OAUTH_OK',environment:'SANDBOX_ONLY'});
 assert.ok(!JSON.stringify(result).includes('FAKE-OAUTH-TOKEN'));
 assert.ok(!JSON.stringify(result).includes(secret));
});
test('Sandbox preflight reports authentication errors without returning sensitive response bodies',async()=>{
 const result=await runSandboxPreflight({env:{
  PAYPAL_CLIENT_ID:'PUBLIC-ID',PAYPAL_CLIENT_SECRET:'LOCAL-SECRET'
 },fetcher:async()=>({ok:false,status:401,json:async()=>({debug_id:'PRIVATE-DO-NOT-LOG'})})});
 assert.equal(result.reason,'SANDBOX_AUTHENTICATION_REJECTED');
 assert.equal(result.httpStatus,401);
 assert.ok(!JSON.stringify(result).includes('PRIVATE-DO-NOT-LOG'));
});
