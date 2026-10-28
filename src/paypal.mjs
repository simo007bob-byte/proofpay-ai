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

}
export const SANDBOX_ORIGIN=SANDBOX;
