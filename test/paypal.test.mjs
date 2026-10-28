import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandbox } from '../src/paypal.mjs';
import { initialState } from '../src/core.mjs';

const ORDER='5O190127TN364715T';
const CAPTURE='7HH123ABC456';
const json = obj=>({ok:true,json:async()=>obj});
const receipt=(props={})=>({
  id:props.orderId??ORDER,status:props.orderStatus??'COMPLETED',
  purchase_units:[{payee:{merchant_id:props.merchant??'MERCHANT123'},
    payments:{captures:[{id:props.captureId??CAPTURE,
      status:props.captureStatus??'COMPLETED',
      amount:{currency_code:props.currency??'EUR',value:props.amount??'29.00'}}]}}]
});
const expected={currency:'EUR',amount:'29.00'};
const sandbox=(captureData=receipt(),getData=receipt())=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/v1/oauth2/token'))return json({access_token:'FAKE-TOKEN'});
    if(url.endsWith('/capture'))return json(captureData);
    if(url.endsWith('/v2/checkout/orders/'+ORDER))return json(getData);
    if(url.endsWith('/v2/checkout/orders'))return json({
      id:ORDER,status:'CREATED',purchase_units:[{payee:{merchant_id:'MERCHANT123'}}]});
    throw Error('Unexpected PayPal mock path: '+url);
  };
  return {pay:new PayPalSandbox({clientId:'TEST-ID',clientSecret:'TEST-SECRET',fetcher}),calls};
};
test('No credentials defaults to unmistakably simulated mode',async()=>{
  const pay=new PayPalSandbox();
  const order=await pay.createOrder(initialState());
  assert.equal(order.mode,'SIMULATION_ONLY');
  assert.match(order.id,/^MOCK-/);
  const capture=await pay.captureOrder(order);
  assert.equal(capture.status,'COMPLETED');
});
test('Sandbox create, capture and independent readback verify amount, currency, capture id and merchant',async()=>{
  const {pay,calls}=sandbox();
  const state=initialState();
  const order=await pay.createOrder(state);
  assert.equal(order.mode,'PAYPAL_SANDBOX');
  assert.equal(order.id,ORDER);
  assert.equal(order.payeeMerchantId,'MERCHANT123');
  assert.ok(calls[0].url.endsWith('/v1/oauth2/token'));
  assert.match(calls[1].url,/sandbox\.paypal\.com\/v2\/checkout\/orders$/);
  assert.deepEqual(JSON.parse(calls[1].options.body).purchase_units[0].amount,
    {currency_code:'EUR',value:'29.00'});
  assert.equal(calls[1].options.headers['PayPal-Request-Id'],state.sessionId);
  const captured=await pay.captureOrder(order,expected);
  assert.equal(captured.verifiedBy,'PAYPAL_ORDER_GET');
  assert.equal(captured.captureId,CAPTURE);
  assert.ok(calls.some(c=>c.url.endsWith('/capture')));
  assert.ok(calls.some(c=>c.options.method==='GET' && c.url.endsWith('/'+ORDER)));
  assert.ok(calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')));
});
test('Sandbox capture rejects incomplete top-level statuses',async()=>{
  const {pay}=sandbox({id:ORDER,status:'PENDING'});
  await assert.rejects(pay.captureOrder({id:ORDER,mode:'PAYPAL_SANDBOX'},expected),/did not confirm/);
});
for(const [name,bad] of [
  ['wrong capture amount',receipt({amount:'0.01'})],
  ['wrong currency',receipt({currency:'USD'})],
  ['incomplete capture',receipt({captureStatus:'PENDING'})],
  ['foreign order',receipt({orderId:'FOREIGN123'})],
  ['foreign merchant',receipt({merchant:'OTHER_MERCHANT'})],
  ['missing purchase unit',{id:ORDER,status:'COMPLETED'}],
  ['missing capture id',receipt({captureId:''})]
]) {
  test('Capture response rejects '+name,async()=>{
    const {pay}=sandbox(bad);
    await assert.rejects(pay.captureOrder({id:ORDER,mode:'PAYPAL_SANDBOX',payeeMerchantId:'MERCHANT123'},expected));
  });
}
for(const [name,bad] of [
  ['wrong readback amount',receipt({amount:'0.01'})],
  ['wrong readback currency',receipt({currency:'USD'})],
  ['different capture id',receipt({captureId:'DIFFERENT123'})],
  ['foreign readback order',receipt({orderId:'FOREIGN123'})],
  ['foreign readback merchant',receipt({merchant:'OTHER_MERCHANT'})]
]) {
  test('Independent PayPal order GET rejects '+name,async()=>{
    const {pay}=sandbox(receipt(),bad);
    await assert.rejects(pay.captureOrder({id:ORDER,mode:'PAYPAL_SANDBOX',payeeMerchantId:'MERCHANT123'},expected));
  });
}
test('Sandbox capture refuses to proceed without approved expected amount',async()=>{
  const {pay}=sandbox();
  await assert.rejects(pay.captureOrder({id:ORDER,mode:'PAYPAL_SANDBOX'}),/Expected approved amount/);
});
test('No host other than official PayPal sandbox in protocol',async()=>{
  const pay=new PayPalSandbox({clientId:'X',clientSecret:'Y',
    fetcher:async url=>{assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));return json({access_token:'T'});}});
  await pay.token();
});
