import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { initialState, analyze, assessEvidence, humanApprove, canCreateOrder, sanitizePublic, newAudit, AppError } from './core.mjs';
import { PayPalSandbox } from './paypal.mjs';
import { LocalAI } from './ai.mjs';
import { EmbeddingAI } from './embedding-ai.mjs';
import { inspectDocument, evaluateDocumentProof } from './document-proof.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(resolve(HERE,'../web/index.html'));
const MISSION_HTML = readFileSync(resolve(HERE,'../web/mission-control.html'),'utf8');
// Mission control is read-only; its single inline script is pinned by hash under a strict CSP.
const MISSION_SCRIPT = (/<script>([\s\S]*?)<\/script>/.exec(MISSION_HTML)||[])[1]||'';
const MISSION_CSP = "default-src 'none'; script-src 'sha256-"+createHash('sha256').update(MISSION_SCRIPT,'utf8').digest('base64')+
  "'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const STATE_FILE = resolve(process.env.DATA_FILE||resolve(HERE,'../data/state.json'));
// Local buyer access token is never returned from /api/state or stored in the repo.
const BUYER_TOKEN_FILE=STATE_FILE+'.buyer-token';
let buyerToken=String(process.env.BUYER_APPROVAL_TOKEN||'');
if(!buyerToken) {
  try {buyerToken=readFileSync(BUYER_TOKEN_FILE,'utf8').trim();} catch(e) {
    if(e.code!=='ENOENT')throw e;
    mkdirSync(dirname(BUYER_TOKEN_FILE),{recursive:true,mode:0o700});
    buyerToken=randomBytes(32).toString('base64url');
    writeFileSync(BUYER_TOKEN_FILE,buyerToken+'\n',{flag:'wx',mode:0o600});
  }
}
if(buyerToken.length<32) throw new Error('Buyer approval token must be at least 32 characters');
function requireBuyer(req) {
  const candidate=String(req.headers['x-buyer-token']||'');
  const a=Buffer.from(candidate),b=Buffer.from(buyerToken);
  if(a.length!==b.length || !timingSafeEqual(a,b))
    throw new AppError('Buyer authorization required (check local approval token)',403);
}
const PORT = Number(process.env.PORT||8777);
const HOST = process.env.HOST||'127.0.0.1'; // Never expose internet by default.
if(!['127.0.0.1','localhost'].includes(HOST)) throw new Error('PUBLIC_BIND_DISABLED');
const paypal=new PayPalSandbox({clientId:process.env.PAYPAL_CLIENT_ID,clientSecret:process.env.PAYPAL_CLIENT_SECRET});
const mode=String(process.env.AI_PROVIDER||'EMBEDDINGS').toUpperCase();
const ai=mode==='DISABLED'?{enabled:false,evaluate:async()=>null}:
  mode==='OLLAMA'?new LocalAI({model:process.env.OLLAMA_MODEL||'',baseURL:process.env.OLLAMA_BASE_URL||'http://127.0.0.1:11434'}):new EmbeddingAI();
let state;
try {state=JSON.parse(readFileSync(STATE_FILE,'utf8'));} catch(e) {
  if(e.code && e.code!=='ENOENT') throw e;
  state=initialState();
}
function persist(){
  mkdirSync(dirname(STATE_FILE),{recursive:true,mode:0o700});
  const tmp=STATE_FILE+'.tmp';
  writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});
  renameSync(tmp,STATE_FILE);chmodSync(STATE_FILE,0o600);
}
persist();
function send(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});
  res.end(JSON.stringify(data));
}
async function body(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))
    throw new AppError('JSON requests only',415);
  let text='';
  for await (const chunk of req) {
    text+=chunk;
    if(text.length>(req.url==='/api/analyze-file'?1500000:12000)) throw new AppError('Request too large',413);
  }
  try{return JSON.parse(text||'{}');} catch {throw new AppError('Invalid JSON body');}
}
function assertOrigin(req) {
  const origin=req.headers.origin;
  if(!origin) return;
  let u;
  try{u=new URL(origin);}catch{throw new AppError('Invalid origin',403);}
  if(!['127.0.0.1','localhost'].includes(u.hostname) || u.port!==String(PORT))
    throw new AppError('Cross-origin access blocked',403);
}
function current() {
  return {state:sanitizePublic(state),
    capabilities:{payments:paypal.mode,ai:ai.enabled?(mode==='OLLAMA'?'LOCAL_AI_OLLAMA':'LOCAL_AI_TRANSFORMER'):'NOT_CONNECTED',
      openaiPaidAPI:false,automaticPayment:false,
      needSandboxCredentials:paypal.mode!=='PAYPAL_SANDBOX',
      clientId:paypal.clientId||null}};
}
let busy=false;
export const server=http.createServer(async (req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    if(req.method==='GET' && path==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Frame-Options':'DENY'});
      return res.end(HTML);
    }
    if(req.method==='GET' && path==='/mission-control'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer','Content-Security-Policy':MISSION_CSP});
      return res.end(MISSION_HTML);
    }
    if(req.method==='GET' && path==='/api/state')return send(res,200,current());
    if(req.method!=='POST')return send(res,404,{error:'Not found'});
    assertOrigin(req);
    if(['/api/approve','/api/create-order','/api/capture','/api/reset','/api/create-authorization-order','/api/authorize-order','/api/capture-authorization','/api/void-authorization'].includes(path))
      requireBuyer(req);
    if(busy)throw new AppError('Another state update is in progress',409);
    busy=true;
    try{
      const data=await body(req);
      if(path==='/api/analyze'){
        const evidence=String(data.evidence||'');
        // Evidence is untrusted and never allowed to mutate our instructions.
        const prescreen=assessEvidence(state.milestone.task,evidence);
        let result=null;
        if(prescreen.status!=='REVIEW_REQUIRED') {
          try { result=await ai.evaluate(state.milestone.task,evidence); }
          catch (e) {
            if(!(e instanceof AppError) || ![502,503].includes(e.status))throw e;
            result={provider:'DETERMINISTIC_FALLBACK',risk:'unknown',
              summary:'Local semantic model unavailable; only deterministic keyword checking completed.',
              authority:'Advisory only. Model failure is not proof of delivery.'};
          }
        }
        analyze(state,evidence,result);persist();
        return send(res,200,current());
      }
      if(path==='/api/analyze-file'){
        if(state.payment && !(state.payment.intent==='AUTHORIZE'&&state.payment.status==='AUTHORIZED'))
          throw new AppError('Cannot review evidence after payment completion or before authorization',409);
        const document=await inspectDocument(data);
        const proof=evaluateDocumentProof(document);
        let advice=null;
        if(proof.status!=='REVIEW_REQUIRED'&&ai.enabled){
          try{
            advice=await ai.evaluate(state.milestone.task,
              document.pages.map(p=>p.text).join('\n').slice(0,5000));
          }catch(e){
            if(!(e instanceof AppError)||![502,503].includes(e.status))throw e;
            advice={provider:'DETERMINISTIC_FALLBACK',summary:'Local AI unavailable',
              missing:[],risk:'unknown',authority:'Human approval mandatory'};
          }
        }
        state.evidence='';
        state.analysis=proof;
        state.agentAnalysis=advice;
        state.humanApproved=false;state.approvedDigest=null;
        newAudit(state,'LOCAL_DOCUMENT_ANALYZED',{format:document.format,fileHash:document.sha256,
          claims:proof.claims.map(c=>({id:c.id,status:c.status,page:c.page})),status:proof.status});
        persist();
        return send(res,200,current());
      }
      if(path==='/api/approve'){
        humanApprove(state,data.approved);persist();
        return send(res,200,current());
      }
      if(path==='/api/create-order'){
        // Retain the original demonstration API only for tests and mock-mode replay.
        // It must never reach PayPal in the V4 authorize-first Sandbox workflow.
        if(paypal.mode!=='SIMULATION_ONLY')
          throw new AppError('Legacy immediate-capture checkout disabled in Sandbox V4',403);
        canCreateOrder(state);
        // Server controls currency and amount; never accept either from client.
        const order=await paypal.createOrder(state);
        state.payment={...order,createdAt:new Date().toISOString()};
        newAudit(state,'ORDER_CREATED',{mode:order.mode,status:order.status});
        persist();return send(res,200,current());
      }
      if(path==='/api/capture'){
        if(paypal.mode!=='SIMULATION_ONLY')
          throw new AppError('Legacy immediate capture disabled in Sandbox V4',403);
        if(!state.humanApproved||!state.payment||state.payment.intent==='AUTHORIZE')
          throw new AppError('Immediate-capture mock order missing',403);
        if(state.payment.status==='COMPLETED')throw new AppError('Already completed',409);
        if(data.orderId!==state.payment.id)throw new AppError('Order mismatch',409);
        // In real sandbox mode, only buyer approval via PayPal JS onApprove
        // should call this endpoint. Server-side validation with PayPal follows.
        const confirmed=await paypal.captureOrder(state.payment,{
          currency:state.milestone.currency,amount:state.milestone.amount
        });
        state.payment.status=confirmed.status;
        newAudit(state,state.payment.mode==='SIMULATION_ONLY'?'SIMULATION_CAPTURE_COMPLETED':'PAYPAL_SANDBOX_CAPTURE_CONFIRMED',{mode:state.payment.mode});
        persist();return send(res,200,current());
      }
      if(path==='/api/create-authorization-order') {
        if(state.payment)throw new AppError('Payment order already exists',409);
        const order=await paypal.createAuthorizationOrder(state);
        state.payment={...order,createdAt:new Date().toISOString()};
        newAudit(state,'AUTHORIZATION_ORDER_CREATED',{mode:order.mode,status:order.status,intent:'AUTHORIZE'});
        persist();return send(res,200,current());
      }
      if(path==='/api/authorize-order') {
        if(!state.payment||state.payment.intent!=='AUTHORIZE')
          throw new AppError('Approved authorization order required',403);
        if(!['CREATED','PAYER_ACTION_REQUIRED'].includes(state.payment.status))throw new AppError('Order already processed',409);
        if(data.orderId!==state.payment.id)throw new AppError('Order mismatch',409);
        const result=await paypal.authorizeOrder(state.payment,{
          amount:state.milestone.amount,currency:state.milestone.currency
        });
        state.payment.status=result.status;state.payment.authorizationId=result.authorizationId;
        // Authorization starts a NEW delivery window; stale pre-authorization files cannot be accepted.
        state.humanApproved=false;state.approvedDigest=null;
        state.analysis=null;state.agentAnalysis=null;state.evidence='';
        newAudit(state,state.payment.mode==='SIMULATION_ONLY'?'SIMULATION_AUTHORIZED':'PAYPAL_SANDBOX_AUTHORIZED',
          {verifiedBy:result.verifiedBy||'MOCK_ONLY'});
        persist();return send(res,200,current());
      }
      if(path==='/api/capture-authorization') {
        if(!state.humanApproved||state.analysis?.kind!=='DOCUMENT_PROOF'||
          state.analysis.status!=='POTENTIALLY_MATCHES'||
          !state.analysis.document?.sha256||
          state.approvedDigest!==state.analysis.document.sha256||!state.payment||
          state.payment.intent!=='AUTHORIZE'||state.payment.status!=='AUTHORIZED')
          throw new AppError('Buyer must approve a supported PDF/TXT delivery after payment authorization',403);
        const result=await paypal.captureAuthorization(state.payment,{
          amount:state.milestone.amount,currency:state.milestone.currency
        });
        state.payment.status=result.status;
        newAudit(state,state.payment.mode==='SIMULATION_ONLY'?'SIMULATION_CAPTURE_COMPLETED':'PAYPAL_AUTHORIZATION_CAPTURE_CONFIRMED',
          {verifiedBy:result.verifiedBy||'MOCK_ONLY'});
        persist();return send(res,200,current());
      }
      if(path==='/api/void-authorization') {
        if(!state.payment||state.payment.intent!=='AUTHORIZE'||state.payment.status!=='AUTHORIZED')
          throw new AppError('Active authorization required before void',403);
        const result=await paypal.voidAuthorization(state.payment);
        state.payment.status=result.status;
        newAudit(state,state.payment.mode==='SIMULATION_ONLY'?'SIMULATION_AUTHORIZATION_VOIDED':'PAYPAL_AUTHORIZATION_VOIDED',
          {verifiedBy:result.verifiedBy||'MOCK_ONLY'});
        persist();return send(res,200,current());
      }
      if(path==='/api/reset'){
        if(data.confirm!==true)throw new AppError('Explicit demo reset required',422);
        const priorAudit=state.audit.slice(-100);
        state=initialState();
        state.audit=[...priorAudit,...state.audit];
        newAudit(state,'DEMO_RESET',{priorEventsPreserved:priorAudit.length});
        persist();return send(res,200,current());
      }
      return send(res,404,{error:'Not found'});
    }finally{busy=false;}
  } catch(error) {
    const status=error instanceof AppError?error.status:500;
    if(status===500)console.error('Internal error',error?.name||'Error');
    send(res,status,{error:status===500?'Internal server error':error.message});
  }
});
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  server.listen(PORT,HOST,()=>{
    console.log('PROOFPAY_LOOPBACK http://'+HOST+':'+PORT);
    console.log('Mission control: http://'+HOST+':'+PORT+'/mission-control');
    console.log('PayPal:',paypal.mode,'AI:',ai.enabled?mode:'NOT_CONNECTED');
    console.log('Buyer approval: local token file',BUYER_TOKEN_FILE,'(contents never logged)');
  });
}
