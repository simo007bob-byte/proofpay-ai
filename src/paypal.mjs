import { AppError } from './core.mjs';

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
    return {id:data.id,status:data.status,mode:this.mode};
  }
  async captureOrder(order) {
    if(order.mode==='SIMULATION_ONLY')
      return {id:'MOCK-CAPTURE',status:'COMPLETED',mode:order.mode};
    if(this.mode!=='PAYPAL_SANDBOX') throw new AppError('Sandbox mode changed',409);
    if(!/^[A-Z0-9]{8,30}$/.test(order.id)) throw new AppError('Invalid PayPal order ID',400);
    const token=await this.token();
    const reply=await this.fetcher(SANDBOX+'/v2/checkout/orders/'+order.id+'/capture',{
      method:'POST',headers:{
        'Content-Type':'application/json','Authorization':'Bearer '+token,
        'PayPal-Request-Id':('capture-'+order.id).slice(0,45)
      },body:'{}',signal:AbortSignal.timeout(15000)
    });
    const data=await reply.json().catch(()=>({}));
    if(!reply.ok || data.id!==order.id || data.status!=='COMPLETED')
      throw new AppError('PayPal sandbox did not confirm capture',502);
    return {id:order.id,status:'COMPLETED',mode:order.mode};
  }
}
export const SANDBOX_ORIGIN=SANDBOX;