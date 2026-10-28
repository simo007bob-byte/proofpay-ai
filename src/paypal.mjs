import { AppError } from './core.mjs';
import { amountToMinor } from './payment-events.mjs';

const SANDBOX = 'https://api-m.sandbox.paypal.com';

export class PayPalSandbox {
  constructor({clientId,clientSecret,fetcher=fetch}={}) {
    this.clientId=clientId; this.clientSecret=clientSecret; this.fetcher=fetcher;
    this.mode=(clientId&&clientSecret)?'PAYPAL_SANDBOX':'SIMULATION_ONLY';
  }
  async token() {
    if(this.mode!=='PAYPAL_SANDBOX') throw new AppError('Sandbox credentials not configured',503);
    const basic=Buffer.from(this.clientId+':'+this.clientSecret).toString('base64');
    const reply=await this.fetcher(SANDBOX+'/v1/oauth2/token',{
      method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials',
      signal:AbortSignal.timeout(15000)
    });
    if(!reply.ok) throw new AppError('PayPal sandbox authentication failed',502);
    const data=await reply.json();
    if(!data.access_token) throw new AppError('Sandbox token missing',502);
    return data.access_token;
  }
  async createOrder(state) {
    if(this.mode==='SIMULATION_ONLY')
      return {id:'MOCK-'+state.sessionId.slice(0,12),status:'CREATED',mode:this.mode};
    const access=await this.token();
    const unit={
      reference_id:state.milestone.id,
      description:'Approved project deliverable '+state.milestone.id,
      amount:{currency_code:state.milestone.currency,value:state.milestone.amount}
    };
    const response=await this.fetcher(SANDBOX+'/v2/checkout/orders',{
      method:'POST',headers:{
        'Content-Type':'application/json','Authorization':'Bearer '+access,
        'PayPal-Request-Id':state.sessionId.slice(0,36),
        'Prefer':'return=representation'
      },
      body:JSON.stringify({intent:'CAPTURE',purchase_units:[unit]}),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok || !data.id) throw new AppError('PayPal sandbox order rejected',502);
    return {id:data.id,status:data.status,mode:this.mode,
      payeeMerchantId:data.purchase_units?.[0]?.payee?.merchant_id||null};
  }
  // Validate the provider's full receipt, not merely the top-level COMPLETED flag.
  assertReceipt(data, order, expected, captureId=null) {
    if(data?.id!==order.id || data?.status!=='COMPLETED' ||
       !Array.isArray(data.purchase_units) || data.purchase_units.length!==1)
      throw new AppError('PayPal sandbox did not confirm capture',502);
    const unit=data.purchase_units[0];
    const captures=unit?.payments?.captures;
    if(!Array.isArray(captures) || captures.length!==1)
      throw new AppError('PayPal capture receipt missing or ambiguous',502);
    const capture=captures[0];
    if(!/^[A-Z0-9]{8,40}$/.test(capture?.id||'') ||
       (captureId!==null && capture.id!==captureId) ||
       capture.status!=='COMPLETED' ||
       capture.amount?.currency_code!==expected.currency ||
       amountToMinor(capture.amount?.value)!==amountToMinor(expected.amount))
      throw new AppError('PayPal capture receipt does not match the approved amount',502);
    // Payee binding is enforced whenever the creation response identifies the merchant.
    if(order.payeeMerchantId && unit?.payee?.merchant_id!==order.payeeMerchantId)
      throw new AppError('PayPal capture merchant mismatch',502);
    return {captureId:capture.id,payeeMerchantId:unit?.payee?.merchant_id||null};
  }
  async captureOrder(order,expected) {
    if(order.mode==='SIMULATION_ONLY')
      return {id:'MOCK-CAPTURE',status:'COMPLETED',mode:order.mode};
    if(this.mode!=='PAYPAL_SANDBOX') throw new AppError('Sandbox mode changed',409);
    if(!/^[A-Z0-9]{8,30}$/.test(order.id)) throw new AppError('Invalid PayPal order ID',400);
    if(!expected || !/^[A-Z]{3}$/.test(expected.currency||'') ||
       amountToMinor(expected.amount)===null || amountToMinor(expected.amount)<=0)
      throw new AppError('Expected approved amount and currency required',422);
    const access=await this.token();
    const reply=await this.fetcher(SANDBOX+'/v2/checkout/orders/'+order.id+'/capture',{
      method:'POST',headers:{
        'Content-Type':'application/json','Authorization':'Bearer '+access,
        'PayPal-Request-Id':('capture-'+order.id).slice(0,45)
      },body:'{}',signal:AbortSignal.timeout(15000)
    });
    const data=await reply.json().catch(()=>({}));
    if(!reply.ok) throw new AppError('PayPal sandbox did not confirm capture',502);
    const receipt=this.assertReceipt(data,order,expected);
    // An independent GET protects against accepting only the capture response.
    const verified=await this.fetcher(SANDBOX+'/v2/checkout/orders/'+order.id,{
      method:'GET',headers:{Authorization:'Bearer '+access},
      signal:AbortSignal.timeout(15000)
    });
    if(!verified.ok) throw new AppError('PayPal capture readback failed',502);
    const readback=await verified.json().catch(()=>({}));
    const second=this.assertReceipt(readback,order,expected,receipt.captureId);
    if(receipt.payeeMerchantId && second.payeeMerchantId!==receipt.payeeMerchantId)
      throw new AppError('PayPal capture merchant mismatch',502);
    return {id:order.id,status:'COMPLETED',mode:order.mode,
      captureId:receipt.captureId,verifiedBy:'PAYPAL_ORDER_GET'};
  }


  async authorizedRequest(path,{method='GET',body,requestId}={}) {
    const access=await this.token();
    const headers={'Authorization':'Bearer '+access,'Accept':'application/json'};
    if(method!=='GET')headers['Content-Type']='application/json';
    if(requestId)headers['PayPal-Request-Id']=requestId.slice(0,45);
    const reply=await this.fetcher(SANDBOX+path,{
      method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)
    });
    const result=reply.status===204?{}:await reply.json().catch(()=>({}));
    if(!reply.ok) throw new AppError('PayPal Sandbox authorization API failed',502);
    return result;
  }
  async createAuthorizationOrder(state) {
    if(this.mode==='SIMULATION_ONLY')
      return {id:'MOCK-AUTH-ORDER-'+state.sessionId.slice(0,12),status:'CREATED',mode:this.mode,intent:'AUTHORIZE'};
    const result=await this.authorizedRequest('/v2/checkout/orders',{
      method:'POST',body:{intent:'AUTHORIZE',purchase_units:[{
        reference_id:state.milestone.id,
        description:'Approved milestone '+state.milestone.id,
        amount:{currency_code:state.milestone.currency,value:state.milestone.amount}
      }]},requestId:state.sessionId.slice(0,36)+'-a'
    });
    if(!/^[A-Z0-9]{8,30}$/.test(result.id||'')||!['CREATED','PAYER_ACTION_REQUIRED'].includes(result.status))
      throw new AppError('Invalid PayPal authorization order',502);
    const merchant=result.purchase_units?.[0]?.payee?.merchant_id||null;
    return {id:result.id,status:result.status,mode:this.mode,intent:'AUTHORIZE',
      payeeMerchantId:merchant};
  }
  assertAuthorization(order,data,expected) {
    if(data?.id!==order.id||data?.status!=='COMPLETED'||data.purchase_units?.length!==1)
      throw new AppError('PayPal Sandbox order is not authorized',502);
    const unit=data.purchase_units[0],arr=unit?.payments?.authorizations;
    if(!Array.isArray(arr)||arr.length!==1)
      throw new AppError('Expected exactly one authorization',502);
    const a=arr[0];
    if(!/^[A-Z0-9]{8,40}$/.test(a.id||'')||!['CREATED','AUTHORIZED'].includes(a.status)||
        a.amount?.currency_code!==expected.currency||
        amountToMinor(a.amount?.value)!==amountToMinor(expected.amount)||
        (order.payeeMerchantId&&unit.payee?.merchant_id!==order.payeeMerchantId))
      throw new AppError('PayPal authorization amount or merchant mismatch',502);
    return {authorizationId:a.id,merchantId:unit.payee?.merchant_id||null};
  }
  async authorizeOrder(order,expected) {
    if(order.mode==='SIMULATION_ONLY')
      return {status:'AUTHORIZED',authorizationId:'MOCK-AUTHORIZATION-001',mode:order.mode};
    if(this.mode!=='PAYPAL_SANDBOX'||order.intent!=='AUTHORIZE')
      throw new AppError('Not a PayPal Sandbox authorization order',409);
    const result=await this.authorizedRequest('/v2/checkout/orders/'+order.id+'/authorize',{
      method:'POST',body:{},requestId:'auth-'+order.id
    });
    const proof=this.assertAuthorization(order,result,expected);
    const independently=await this.authorizedRequest('/v2/checkout/orders/'+order.id);
    const checked=this.assertAuthorization(order,independently,expected);
    if(proof.authorizationId!==checked.authorizationId||proof.merchantId!==checked.merchantId)
      throw new AppError('PayPal authorization readback mismatch',502);
    return {status:'AUTHORIZED',authorizationId:proof.authorizationId,mode:order.mode,
      verifiedBy:'PAYPAL_ORDER_GET'};
  }
  async captureAuthorization(order,expected) {
    if(order.mode==='SIMULATION_ONLY')
      return {status:'COMPLETED',captureId:'MOCK-AUTH-CAPTURE-001',mode:order.mode};
    if(order.intent!=='AUTHORIZE'||order.status!=='AUTHORIZED'||
       !/^[A-Z0-9]{8,40}$/.test(order.authorizationId||''))
      throw new AppError('Active PayPal authorization required',409);
    const path='/v2/payments/authorizations/'+order.authorizationId;
    const result=await this.authorizedRequest(path+'/capture',{
      method:'POST',body:{amount:{currency_code:expected.currency,value:expected.amount},
        final_capture:true},requestId:'cap-auth-'+order.authorizationId
    });
    const check=data=>{
      if(!/^[A-Z0-9]{8,40}$/.test(data?.id||'')||data.status!=='COMPLETED'||
        data.amount?.currency_code!==expected.currency||
        amountToMinor(data.amount.value)!==amountToMinor(expected.amount))
        throw new AppError('PayPal authorization capture receipt mismatch',502);
      return data.id;
    };
    const id=check(result);
    const readback=await this.authorizedRequest('/v2/payments/captures/'+id);
    if(check(readback)!==id)
      throw new AppError('PayPal captured payment readback mismatch',502);
    return {status:'COMPLETED',captureId:id,verifiedBy:'PAYPAL_CAPTURE_GET',mode:order.mode};
  }
  async voidAuthorization(order) {
    if(order.mode==='SIMULATION_ONLY')
      return {status:'VOIDED',verifiedBy:'MOCK_ONLY',mode:order.mode};
    if(order.intent!=='AUTHORIZE'||order.status!=='AUTHORIZED'||
       !/^[A-Z0-9]{8,40}$/.test(order.authorizationId||''))
      throw new AppError('Active PayPal authorization required',409);
    const path='/v2/payments/authorizations/'+order.authorizationId;
    await this.authorizedRequest(path+'/void',{method:'POST',body:{},requestId:'void-auth-'+order.authorizationId});
    const verified=await this.authorizedRequest(path);
    if(verified?.id!==order.authorizationId||verified.status!=='VOIDED')
      throw new AppError('PayPal void readback not confirmed',502);
    return {status:'VOIDED',verifiedBy:'PAYPAL_AUTHORIZATION_GET',mode:order.mode};
  }

}
export const SANDBOX_ORIGIN=SANDBOX;
