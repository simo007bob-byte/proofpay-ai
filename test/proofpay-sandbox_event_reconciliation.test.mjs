import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileEvents, amountToMinor } from '../src/payment-events.mjs';

// FAKE local fixtures only: no PayPal order, capture or network call is made.
const ORDER='5O190127TN364715T';
const CAPTURE='3C679366HH908993F';
const expected={orderId:ORDER,currency:'EUR',amount:'29.00'};
const at=s=>new Date(Date.UTC(2026,0,1,0,0,s)).toISOString();
const money=(value='29.00',currency_code='EUR')=>({currency_code,value});
const ev=(id,event_type,s,resource)=>({id,event_type,create_time:at(s),resource});
const approved=(id='WH-A',s=1)=>ev(id,'CHECKOUT.ORDER.APPROVED',s,{id:ORDER,status:'APPROVED',purchase_units:[{amount:money()}]});
const pending=(id='WH-P',s=2)=>ev(id,'PAYMENT.CAPTURE.PENDING',s,
  {id:CAPTURE,status:'PENDING',amount:money(),supplementary_data:{related_ids:{order_id:ORDER}}});
const captured=(id='WH-C',s=3,amount=money(),type='PAYMENT.CAPTURE.COMPLETED',status='COMPLETED')=>ev(id,type,s,
  {id:CAPTURE,status,amount,supplementary_data:{related_ids:{order_id:ORDER}}});
const dispute=(id,type,s,outcome,disputeId='PP-D-1001')=>ev(id,type,s,{id:disputeId,status:outcome?'RESOLVED':'OPEN',
  dispute_amount:money(),disputed_transactions:[{seller_transaction_id:CAPTURE}],
  ...(outcome?{dispute_outcome:{outcome_code:outcome}}:{})});
const permutations=list=>list.length<=1?[list]:
  list.flatMap((x,i)=>permutations([...list.slice(0,i),...list.slice(i+1)]).map(rest=>[x,...rest]));

test('Completed sandbox capture with matching amount is releasable',()=>{
  const r=reconcileEvents([approved(),pending(),captured()],expected);
  assert.equal(r.state,'COMPLETED');
  assert.equal(r.dispute,'NONE');
  assert.equal(r.decision,'RELEASE');
  assert.deepEqual(r.applied,['WH-A','WH-P','WH-C']);
  assert.deepEqual(r.reasons,[]);
});

test('Duplicate deliveries and retries are applied once',()=>{
  const r=reconcileEvents([approved(),captured(),captured(),approved(),captured('WH-C-RETRY',4)],expected);
  assert.equal(r.decision,'RELEASE');
  assert.deepEqual(r.applied,['WH-A','WH-C']);
  assert.deepEqual([...r.duplicates].sort(),['WH-A','WH-C','WH-C-RETRY']);
  assert.deepEqual(r.conflicts,[]);
});

test('Reused event id with different content is a conflict and holds funds',()=>{
  for(const events of [[captured('WH-X',3),captured('WH-X',3,money('1.00'))],
                       [captured('WH-X',3,money('1.00')),captured('WH-X',3)]]) {
    const r=reconcileEvents(events,expected);
    assert.equal(r.decision,'HOLD');
    assert.ok(r.reasons.length>0);
  }
  const r=reconcileEvents([captured('WH-X',3),captured('WH-X',3,money('1.00'))],expected);
  assert.deepEqual(r.conflicts,[{id:'WH-X',reason:'EVENT_ID_REUSED'}]);
});

test('Out-of-order delivery converges to the same result for every permutation',()=>{
  const events=[approved(),pending(),captured(),
    dispute('WH-D1','CUSTOMER.DISPUTE.CREATED',5),
    dispute('WH-D2','CUSTOMER.DISPUTE.RESOLVED',6,'RESOLVED_SELLER_FAVOUR')];
  for(const order of permutations(events)) {
    const r=reconcileEvents(order,expected);
    assert.equal(r.state,'COMPLETED');
    assert.equal(r.dispute,'CLOSED_SELLER');
    assert.equal(r.decision,'RELEASE');
    assert.deepEqual(r.applied,['WH-A','WH-P','WH-C','WH-D1','WH-D2']);
  }
  const skew=reconcileEvents([captured(),approved('WH-A',10)],expected);
  assert.equal(skew.state,'COMPLETED');
  assert.deepEqual(skew.ignored,[{id:'WH-A',reason:'STALE'}]);
});

test('Currency and amount mismatches never mark the order paid',()=>{
  const usd=reconcileEvents([approved(),captured('WH-C',3,money('29.00','USD'))],expected);
  assert.equal(usd.state,'APPROVED');
  assert.deepEqual(usd.mismatches,[{id:'WH-C',reason:'CURRENCY_MISMATCH'}]);
  assert.deepEqual(usd.reasons,['STATE_APPROVED','MISMATCH']);
  assert.equal(usd.decision,'HOLD');
  for(const amount of [money('2.90'),money(29),money('29.001'),money('-29.00')]) {
    const r=reconcileEvents([approved(),captured('WH-C',3,amount)],expected);
    assert.equal(r.state,'APPROVED');
    assert.deepEqual(r.mismatches,[{id:'WH-C',reason:'AMOUNT_MISMATCH'}]);
    assert.equal(r.decision,'HOLD');
  }
  const split=reconcileEvents([approved(),ev('WH-OC','CHECKOUT.ORDER.COMPLETED',4,{id:ORDER,status:'COMPLETED',
    purchase_units:[{amount:money('14.50')},{amount:money('14.50')}]})],expected);
  assert.equal(split.state,'APPROVED');
  assert.equal(split.mismatches.length,1);
  assert.equal(split.decision,'HOLD');
  assert.equal(reconcileEvents([approved(),captured('WH-C',3,money('29'))],expected).decision,'RELEASE');
});

test('Disputed states hold funds until resolved in seller favour',()=>{
  const open=reconcileEvents([approved(),captured(),dispute('WH-D1','CUSTOMER.DISPUTE.CREATED',5)],expected);
  assert.equal(open.state,'COMPLETED');
  assert.equal(open.dispute,'OPEN');
  assert.deepEqual(open.reasons,['DISPUTE_OPEN']);
  assert.equal(open.decision,'HOLD');

  const lost=reconcileEvents([approved(),captured(),dispute('WH-D1','CUSTOMER.DISPUTE.CREATED',5),
    dispute('WH-D2','CUSTOMER.DISPUTE.RESOLVED',6,'RESOLVED_BUYER_FAVOUR'),
    captured('WH-R',7,money(),'PAYMENT.CAPTURE.REVERSED','REVERSED')],expected);
  assert.equal(lost.state,'REVERSED');
  assert.equal(lost.dispute,'CLOSED_BUYER');
  assert.deepEqual(lost.reasons,['STATE_REVERSED','DISPUTE_CLOSED_BUYER']);
  assert.equal(lost.decision,'HOLD');

  const won=[approved(),captured(),dispute('WH-D1','CUSTOMER.DISPUTE.CREATED',5),
    dispute('WH-D2','CUSTOMER.DISPUTE.RESOLVED',6,'RESOLVED_SELLER_FAVOUR')];
  const stale=reconcileEvents([...won,dispute('WH-D3','CUSTOMER.DISPUTE.UPDATED',9)],expected);
  assert.equal(stale.dispute,'CLOSED_SELLER');
  assert.deepEqual(stale.ignored,[{id:'WH-D3',reason:'STALE'}]);
  assert.equal(stale.decision,'RELEASE');

  const second=reconcileEvents([...won,dispute('WH-D4','CUSTOMER.DISPUTE.CREATED',8,undefined,'PP-D-2002')],expected);
  assert.equal(second.dispute,'OPEN');
  assert.equal(second.decision,'HOLD');

  const foreign=reconcileEvents([approved(),captured(),ev('WH-DF','CUSTOMER.DISPUTE.CREATED',5,
    {id:'PP-D-9',status:'OPEN',disputed_transactions:[{seller_transaction_id:'SOMEONEELSE1'}]})],expected);
  assert.deepEqual(foreign.ignored,[{id:'WH-DF',reason:'FOREIGN_ORDER'}]);
  assert.equal(foreign.decision,'RELEASE');
});

test('Foreign, malformed, conflicting and refunded events are handled safely',()=>{
  const foreignCapture=ev('WH-F','PAYMENT.CAPTURE.COMPLETED',3,{id:'OTHERCAPTURE1',status:'COMPLETED',
    amount:money(),supplementary_data:{related_ids:{order_id:'OTHERORDER1'}}});
  const r=reconcileEvents([approved(),null,
    {id:'WH-M',event_type:'PAYMENT.CAPTURE.COMPLETED',create_time:'not-a-date',resource:{}},
    {id:'WH-U',event_type:'BILLING.PLAN.CREATED',create_time:at(2),resource:{id:'P-1'}},
    {id:'WH-PROTO',event_type:'__proto__',create_time:at(2),resource:{id:'P-2'}},
    foreignCapture],expected);
  assert.deepEqual(r.ignored,[{id:null,reason:'UNSUPPORTED_EVENT'},{id:'WH-M',reason:'MALFORMED'},
    {id:'WH-U',reason:'UNSUPPORTED_EVENT'},{id:'WH-PROTO',reason:'UNSUPPORTED_EVENT'},{id:'WH-F',reason:'FOREIGN_ORDER'}]);
  assert.equal(r.state,'APPROVED');
  assert.equal(r.decision,'HOLD');

  const conflict=reconcileEvents([approved(),captured(),
    captured('WH-DN',4,money(),'PAYMENT.CAPTURE.DENIED','DENIED')],expected);
  assert.equal(conflict.state,'COMPLETED');
  assert.deepEqual(conflict.conflicts,[{id:'WH-DN',reason:'CONFLICTING_STATE'}]);
  assert.deepEqual(conflict.reasons,['CONFLICT']);
  assert.equal(conflict.decision,'HOLD');

  const refunded=reconcileEvents([approved(),captured(),ev('WH-RF','PAYMENT.CAPTURE.REFUNDED',5,
    {id:'REFUND1',status:'COMPLETED',amount:money('10.00'),supplementary_data:{related_ids:{capture_id:CAPTURE}}})],expected);
  assert.equal(refunded.state,'REFUNDED');
  assert.deepEqual(refunded.reasons,['STATE_REFUNDED']);
  assert.equal(refunded.decision,'HOLD');
});

test('Reconciliation is pure, offline and does not mutate inputs',()=>{
  const events=[approved(),captured(),dispute('WH-D1','CUSTOMER.DISPUTE.CREATED',5)];
  const snapshot=structuredClone(events);
  const original=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('network forbidden in reconciliation');};
  try { reconcileEvents(events,expected); } finally { globalThis.fetch=original; }
  assert.deepEqual(events,snapshot);
  const src=readFileSync(new URL('../src/payment-events.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(src,/\bfetch\b|https?:\/\/|\bimport\b|process\.env|child_process|require\(/);
});

test('Rejects invalid expectations and oversized batches',()=>{
  assert.throws(()=>reconcileEvents({},expected),TypeError);
  assert.throws(()=>reconcileEvents([]),TypeError);
  assert.throws(()=>reconcileEvents([],{currency:'EUR',amount:'29.00'}),TypeError);
  assert.throws(()=>reconcileEvents([],{orderId:ORDER,currency:'eur',amount:'29.00'}),TypeError);
  assert.throws(()=>reconcileEvents([],{orderId:ORDER,currency:['EUR'],amount:'29.00'}),TypeError);
  assert.throws(()=>reconcileEvents([],{orderId:ORDER,currency:'EUR',amount:'29.001'}),TypeError);
  assert.throws(()=>reconcileEvents([],{orderId:ORDER,currency:'EUR',amount:'-1'}),TypeError);
  assert.throws(()=>reconcileEvents(new Array(1001).fill(null),expected),RangeError);
  assert.equal(amountToMinor('29.00'),2900);
  assert.equal(amountToMinor('29'),2900);
  assert.equal(amountToMinor('0.5'),50);
  for(const bad of ['1e3','29.001','-1',' 29','',29,null]) assert.equal(amountToMinor(bad),null);
});