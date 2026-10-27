import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandbox } from '../src/paypal.mjs';
import { initialState } from '../src/core.mjs';

const json = obj=>({ok:true,json:async()=>obj});
test('No credentials defaults to unmistakably simulated mode',async()=>{
  const pay=new PayPalSandbox();
  const order=await pay.createOrder(initialState());
  assert.equal(order.mode,'SIMULATION_ONLY');
  assert.match(order.id,/^MOCK-/);
  const capture=await pay.captureOrder(order);
  assert.equal(capture.status,'COMPLETED');
});
test('Live sandbox adapter requests OAuth, create and capture without leaking secrets',async()=>{
  const calls=[];
  const responses=[
    json({access_token:'FAKE-TOKEN'}),
    json({id:'5O190127TN364715T',status:'CREATED'}),
    json({access_token:'FAKE-TOKEN'}),
    json({id:'5O190127TN364715T',status:'COMPLETED'})
  ];
  const transport=async (url,options)=>{calls.push({url,options});return responses.shift();};
  const pay=new PayPalSandbox({clientId:'TEST-ID',clientSecret:'TEST-SECRET',fetcher:transport});
  const state=initialState();
  const order=await pay.createOrder(state);
  assert.equal(order.mode,'PAYPAL_SANDBOX');
  assert.equal(order.id,'5O190127TN364715T');
  assert.ok(calls[0].url.endsWith('/v1/oauth2/token'));
  assert.match(calls[1].url,/sandbox\.paypal\.com\/v2\/checkout\/orders$/);
  assert.deepEqual(JSON.parse(calls[1].options.body).purchase_units[0].amount,
    {currency_code:'EUR',value:'29.00'});
  assert.equal(calls[1].options.headers['PayPal-Request-Id'],state.sessionId);
  await pay.captureOrder(order);
  assert.match(calls[3].url,/orders\/5O190127TN364715T\/capture$/);
});
test('Cannot fake PayPal capture as completed',async()=>{
  const queue=[
    json({access_token:'FAKE'}),
    json({id:'ORDER12345',status:'PENDING'})
  ];
  const pay=new PayPalSandbox({clientId:'X',clientSecret:'Y',fetcher:async()=>queue.shift()});
  await assert.rejects(pay.captureOrder({id:'ORDER12345',mode:'PAYPAL_SANDBOX'}),/did not confirm/);
});
test('No host other than official PayPal sandbox in protocol',async()=>{
  const pay=new PayPalSandbox({clientId:'X',clientSecret:'Y',
    fetcher:async url=>{assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));return json({access_token:'T'});}});
  await pay.token();
});