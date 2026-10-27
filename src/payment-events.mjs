// Offline reconciliation of observed PayPal Sandbox order/capture webhook events.
// Pure function: no I/O and no PayPal calls. Callers pass event payloads that were
// already received and signature-verified elsewhere; test fixtures are fake.

const MAX_EVENTS=1000;
const AMOUNT=/^\d{1,12}(\.\d{1,2})?$/;
const CURRENCY=/^[A-Z]{3}$/;
const ORDER_RANK={CREATED:0,APPROVED:1,CAPTURE_PENDING:2,COMPLETED:3,DENIED:3,REFUNDED:4,REVERSED:4};
const DISPUTE_STEP={OPEN:1,CLOSED_SELLER:2,CLOSED_BUYER:2};
const SELLER_OUTCOMES=new Set(['RESOLVED_SELLER_FAVOUR','CANCELED_BY_BUYER']);
const HANDLERS={
  'CHECKOUT.ORDER.APPROVED':{kind:'order',state:'APPROVED'},
  'CHECKOUT.ORDER.COMPLETED':{kind:'order',state:'COMPLETED',checkAmount:true},
  'PAYMENT.CAPTURE.PENDING':{kind:'capture',state:'CAPTURE_PENDING',checkAmount:true},
  'PAYMENT.CAPTURE.COMPLETED':{kind:'capture',state:'COMPLETED',checkAmount:true},
  'PAYMENT.CAPTURE.DENIED':{kind:'capture',state:'DENIED'},
  'PAYMENT.CAPTURE.REVERSED':{kind:'capture',state:'REVERSED'},
  'PAYMENT.CAPTURE.REFUNDED':{kind:'refund',state:'REFUNDED'},
  'CUSTOMER.DISPUTE.CREATED':{kind:'dispute',step:1},
  'CUSTOMER.DISPUTE.UPDATED':{kind:'dispute',step:1},
  'CUSTOMER.DISPUTE.RESOLVED':{kind:'dispute',step:2}
};

export function amountToMinor(value) {
  if(typeof value!=='string' || !AMOUNT.test(value)) return null;
  const [whole,fraction='']=value.split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}

const relatedIds=resource=>{
  const ids=resource.supplementary_data?.related_ids;
  return ids && typeof ids==='object' ? ids : {};
};
const moneyOf=resource=>resource.amount ??
  (Array.isArray(resource.purchase_units) && resource.purchase_units.length===1 ? resource.purchase_units[0]?.amount : undefined);

function normalize(raw,index) {
  const id=typeof raw?.id==='string' && raw.id ? raw.id : null;
  const handler=raw && typeof raw==='object' && Object.hasOwn(HANDLERS,raw.event_type) ? HANDLERS[raw.event_type] : null;
  if(!handler) return {index,id,error:'UNSUPPORTED_EVENT'};
  const time=Date.parse(raw.create_time);
  const resource=raw.resource;
  if(!id || !Number.isFinite(time) || !resource || typeof resource!=='object' ||
     typeof resource.id!=='string' || !resource.id)
    return {index,id,error:'MALFORMED'};
  const money=moneyOf(resource);
  return {index,id,time,handler,resource,
    rank:handler.state ? ORDER_RANK[handler.state] : handler.step,
    fingerprint:[raw.event_type,resource.id,String(resource.status ?? ''),
      String(money?.currency_code)+':'+String(money?.value)].join('|')};
}

function compare(a,b) {
  return a.time-b.time || a.rank-b.rank || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0) || a.index-b.index;
}

export function reconcileEvents(events,expected) {
  if(!Array.isArray(events)) throw new TypeError('events must be an array');
  if(events.length>MAX_EVENTS) throw new RangeError('Too many events to reconcile');
  if(!expected || typeof expected.orderId!=='string' || !expected.orderId ||
     typeof expected.currency!=='string' || !CURRENCY.test(expected.currency) ||
     amountToMinor(expected.amount)===null)
    throw new TypeError('Expected orderId, currency and amount are required');
  const {orderId}=expected;
  const result={orderId,state:'CREATED',dispute:'NONE',decision:'HOLD',reasons:[],
    applied:[],duplicates:[],ignored:[],mismatches:[],conflicts:[]};
  const valid=[];
  events.forEach((raw,index)=>{
    const ev=normalize(raw,index);
    if(ev.error) result.ignored.push({id:ev.id,reason:ev.error}); else valid.push(ev);
  });
  valid.sort(compare);

  const captures=new Set();
  for(const ev of valid)
    if(ev.handler.kind==='capture' && relatedIds(ev.resource).order_id===orderId) captures.add(ev.resource.id);
  const belongs=ev=>{
    const related=relatedIds(ev.resource);
    switch(ev.handler.kind) {
      case 'order': return ev.resource.id===orderId;
      case 'capture': return related.order_id===orderId;
      case 'refund': return related.order_id===orderId || captures.has(related.capture_id);
      default: return Array.isArray(ev.resource.disputed_transactions) &&
        ev.resource.disputed_transactions.some(t=>captures.has(t?.seller_transaction_id));
    }
  };

  const seenIds=new Map(), seenPrints=new Set(), disputes=new Map();
  for(const ev of valid) {
    if(seenIds.has(ev.id)) {
      result.duplicates.push(ev.id);
      if(seenIds.get(ev.id)!==ev.fingerprint) result.conflicts.push({id:ev.id,reason:'EVENT_ID_REUSED'});
      continue;
    }
    seenIds.set(ev.id,ev.fingerprint);
    if(seenPrints.has(ev.fingerprint)) { result.duplicates.push(ev.id); continue; }
    seenPrints.add(ev.fingerprint);
    if(!belongs(ev)) { result.ignored.push({id:ev.id,reason:'FOREIGN_ORDER'}); continue; }
    const handler=ev.handler, money=moneyOf(ev.resource);
    if(handler.checkAmount || handler.kind==='refund') {
      if(money?.currency_code!==expected.currency) {
        result.mismatches.push({id:ev.id,reason:'CURRENCY_MISMATCH'}); continue;
      }
      if(handler.checkAmount && amountToMinor(money.value)!==amountToMinor(expected.amount)) {
        result.mismatches.push({id:ev.id,reason:'AMOUNT_MISMATCH'}); continue;
      }
    }
    if(handler.kind==='dispute') {
      const next=handler.step===1 ? 'OPEN' :
        SELLER_OUTCOMES.has(ev.resource.dispute_outcome?.outcome_code) ? 'CLOSED_SELLER' : 'CLOSED_BUYER';
      const prev=disputes.get(ev.resource.id);
      const prevStep=prev ? DISPUTE_STEP[prev] : 0;
      if(DISPUTE_STEP[next]>prevStep) { disputes.set(ev.resource.id,next); result.applied.push(ev.id); }
      else if(DISPUTE_STEP[next]===prevStep && next!==prev) {
        disputes.set(ev.resource.id,'CLOSED_BUYER');
        result.conflicts.push({id:ev.id,reason:'CONFLICTING_DISPUTE_OUTCOME'});
      } else result.ignored.push({id:ev.id,reason:'STALE'});
      continue;
    }
    const nextRank=ORDER_RANK[handler.state], currentRank=ORDER_RANK[result.state];
    if(nextRank>currentRank) { result.state=handler.state; result.applied.push(ev.id); }
    else if(nextRank===currentRank && handler.state!==result.state)
      result.conflicts.push({id:ev.id,reason:'CONFLICTING_STATE'});
    else result.ignored.push({id:ev.id,reason:'STALE'});
  }

  const outcomes=[...disputes.values()];
  result.dispute=outcomes.includes('OPEN') ? 'OPEN' : outcomes.includes('CLOSED_BUYER') ? 'CLOSED_BUYER' :
    outcomes.includes('CLOSED_SELLER') ? 'CLOSED_SELLER' : 'NONE';
  if(result.state!=='COMPLETED') result.reasons.push('STATE_'+result.state);
  if(result.dispute==='OPEN' || result.dispute==='CLOSED_BUYER') result.reasons.push('DISPUTE_'+result.dispute);
  if(result.mismatches.length) result.reasons.push('MISMATCH');
  if(result.conflicts.length) result.reasons.push('CONFLICT');
  result.decision=result.reasons.length ? 'HOLD' : 'RELEASE';
  return result;
}
