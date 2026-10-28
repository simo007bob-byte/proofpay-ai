import test from 'node:test';
import assert from 'node:assert/strict';
import {PayPalSandbox} from '../src/paypal.mjs';
import {initialState} from '../src/core.mjs';
const ORDER='5O190127TN364715T',AUTH='7HH123ABC456',CAP='6KJ123ABC789';
const expected={amount:'29.00',currency:'EUR'};
const receipt=(override={})=>({
 id:ORDER,status:'COMPLETED',
 purchase_units:[{payee:{merchant_id:override.merchant??'MERCHANT123'},
 payments:{authorizations:[{
 id:AUTH,status:override.status??'CREATED',
 amount:{currency_code:override.currency??'EUR',value:override.amount??'29.00'}
 }]}}]});
function sandbox({orderReceipt=receipt(),readback=receipt(),captureValue='29.00',voidStatus='VOIDED'}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push([url,opts.method]);
  const path=url.replace('https://api-m.sandbox.paypal.com','');
  const json=(data,status=200)=>({ok:status<300,status,json:async()=>data});
  if(path==='/v1/oauth2/token')return json({access_token:'TEST-TOKEN'});
  if(path==='/v2/checkout/orders'&&opts.method==='POST')return json({id:ORDER,status:'CREATED',purchase_units:[{payee:{merchant_id:'MERCHANT123'}}]});
  if(path==='/v2/checkout/orders/'+ORDER+'/authorize')return json(orderReceipt);
  if(path==='/v2/checkout/orders/'+ORDER)return json(readback);
  if(path==='/v2/payments/authorizations/'+AUTH+'/capture')
   return json({id:CAP,status:'COMPLETED',amount:{currency_code:'EUR',value:captureValue}});
  if(path==='/v2/payments/captures/'+CAP)
   return json({id:CAP,status:'COMPLETED',amount:{currency_code:'EUR',value:captureValue}});
  if(path==='/v2/payments/authorizations/'+AUTH+'/void')
   return {ok:true,status:204,json:async()=>({})};
  if(path==='/v2/payments/authorizations/'+AUTH)
   return json({id:AUTH,status:voidStatus});
  throw Error('Unexpected mock PayPal API path '+path);
 };
 return {api:new PayPalSandbox({clientId:'ID',clientSecret:'SECRET',fetcher}),calls};
}
test('PayPal AUTHORIZE create order -> buyer authorization -> capture -> independent capture GET',async()=>{
 const {api,calls}=sandbox();
 const order=await api.createAuthorizationOrder(initialState());
 assert.equal(order.intent,'AUTHORIZE');
 assert.equal(order.payeeMerchantId,'MERCHANT123');
 const approved=await api.authorizeOrder(order,expected);
 assert.equal(approved.authorizationId,AUTH);
 const capture=await api.captureAuthorization({...order,status:'AUTHORIZED',authorizationId:AUTH},expected);
 assert.equal(capture.status,'COMPLETED');
 assert.equal(capture.verifiedBy,'PAYPAL_CAPTURE_GET');
 assert.ok(calls.some(([url])=>url.endsWith('/authorize')));
 assert.ok(calls.some(([url])=>url.endsWith('/capture')));
 assert.ok(calls.some(([url])=>url.endsWith('/v2/payments/captures/'+CAP)));
 assert.ok(calls.every(([url])=>url.startsWith('https://api-m.sandbox.paypal.com/')));
});
test('PayPal authorization void confirms with independent GET',async()=>{
 const {api,calls}=sandbox();
 const order={mode:'PAYPAL_SANDBOX',intent:'AUTHORIZE',status:'AUTHORIZED',authorizationId:AUTH};
 const result=await api.voidAuthorization(order);
 assert.equal(result.status,'VOIDED');
 assert.ok(calls.some(([url])=>url.endsWith('/void')));
});
for(const [reason,data] of [
 ['foreign merchant',receipt({merchant:'OTHER'})],
 ['wrong amount',receipt({amount:'0.01'})],
 ['wrong currency',receipt({currency:'USD'})],
 ['authorization not active',receipt({status:'VOIDED'})],
 ['no authorizations',{id:ORDER,status:'COMPLETED',purchase_units:[{}]}],
 ['wrong order',{...receipt(),id:'FOREIGN'}],
]) {
 test('Never accept invalid buyer authorization '+reason,async()=>{
  const {api}=sandbox({orderReceipt:data});
  const order={id:ORDER,mode:'PAYPAL_SANDBOX',intent:'AUTHORIZE',payeeMerchantId:'MERCHANT123'};
  await assert.rejects(api.authorizeOrder(order,expected));
 });
}
test('Wrong independent authorization readback fails',async()=>{
 const {api}=sandbox({readback:receipt({currency:'USD'})});
 const order={id:ORDER,mode:'PAYPAL_SANDBOX',intent:'AUTHORIZE',payeeMerchantId:'MERCHANT123'};
 await assert.rejects(api.authorizeOrder(order,expected),/mismatch/);
});
test('Wrong capture amount fails closed',async()=>{
 const {api}=sandbox({captureValue:'0.01'});
 await assert.rejects(api.captureAuthorization({intent:'AUTHORIZE',mode:'PAYPAL_SANDBOX',status:'AUTHORIZED',authorizationId:AUTH},expected),/mismatch/);
});
test('Void confirmation requires VOIDED status',async()=>{
 const {api}=sandbox({voidStatus:'CREATED'});
 await assert.rejects(api.voidAuthorization({intent:'AUTHORIZE',mode:'PAYPAL_SANDBOX',status:'AUTHORIZED',authorizationId:AUTH}),/not confirmed/);
});
test('New AUTHORIZE simulation is clearly mock with no network call',async()=>{
 const api=new PayPalSandbox();
 const order=await api.createAuthorizationOrder(initialState());
 assert.equal(order.mode,'SIMULATION_ONLY');
 const auth=await api.authorizeOrder(order,expected);
 assert.equal(auth.status,'AUTHORIZED');
 const capture=await api.captureAuthorization({...order,status:'AUTHORIZED',authorizationId:auth.authorizationId},expected);
 assert.equal(capture.mode,'SIMULATION_ONLY');
 const voided=await api.voidAuthorization({...order,status:'AUTHORIZED',authorizationId:auth.authorizationId});
 assert.equal(voided.status,'VOIDED');
});
