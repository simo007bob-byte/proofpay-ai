import { randomUUID, createHash } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
const TERMS = new Set(['the','and','or','an','a','with','für','und','der','die','das','von','for','of','to','in','at','by','has','was']);
function tokenize(x) {
  return [...new Set(String(x).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(w=>!TERMS.has(w));
}
const ZERO_WIDTH=/[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
const INJECTION_PATTERNS=[
  ['OVERRIDE_INSTRUCTIONS',/\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|rules|prompts?)/i],
  ['SECRET_EXFILTRATION',/\breveal\s+(?:the\s+|your\s+)?(?:password|secret|token|api\s*key|credentials?)/i],
  ['SYSTEM_TAG',/<\s*\/?\s*system\s*>/i],
  ['ROLE_OVERRIDE',/\byou\s+are\s+now\s+(?:an?\s+|the\s+)?(?:admin|administrator|system|developer|approver)\b/i],
  ['APPROVAL_COMMAND',/\b(?:auto[-\s]?approve|approve\s+(?:this\s+|the\s+)?(?:payment|milestone|order)|release\s+(?:the\s+)?funds)\b/i],
  ['STATE_TAMPERING',/\bhumanApproved\s*[:=]/i],
  ['PAYMENT_OVERRIDE',/\b(?:treat\s+(?:this|it)\s+as\s+verified|authorize\s+(?:the\s+)?payout|bypass\s+(?:the\s+)?approval\s+gate)\b/i],
];
// Untrusted text is only scanned, never interpreted. Returns stable pattern names.
export function detectInjection(text) {
  const t=String(text).normalize('NFKC').replace(ZERO_WIDTH,'');
  return INJECTION_PATTERNS.filter(([,re])=>re.test(t)).map(([name])=>name);
}
export function sha256Hex(text) {
  return createHash('sha256').update(String(text),'utf8').digest('hex');
}
export function assessEvidence(requirement, evidence) {
  if (typeof evidence!=='string' || evidence.length<12 || evidence.length>5000)
    throw new AppError('Evidence must contain 12–5000 characters');
  const req=tokenize(requirement), proof=tokenize(evidence);
  const hits=req.filter(w=>proof.includes(w));
  const coverage=req.length?Math.round(100*hits.length/req.length):0;
  const suspicious=detectInjection(evidence).length>0;
  const normalized=String(evidence).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const copied=normalized===String(requirement).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  // Token overlap alone cannot override explicit non-delivery or a pasted specification.
  const negated= /\b(?:did|have|has|was|were|is|are|do|does)\s+(?:not|never)\s+(?:actually\s+)?(?:deliver|provide|complete|finish|submit)\b/i.test(evidence)
    || /\b(?:not|never|without)\s+(?:(?:yet|been)\s+)?(?:delivered|completed|provided|submitted|finished)\b/i.test(evidence)
    || /\b(?:still|currently)\s+(?:missing|incomplete|undelivered)\b/i.test(evidence);
  const unverified=suspicious||negated||copied;
  return {
    matchPercent:coverage, matchedTerms:hits.slice(0,12),
    status:unverified?'REVIEW_REQUIRED':coverage>=45?'POTENTIALLY_MATCHES':'INSUFFICIENT_PROOF',
    concerns:[...(suspicious?['Potential instruction injection in untrusted evidence']:[]),...(negated?['Evidence explicitly states non-delivery']:[]),...(copied?['Evidence repeats the task rather than providing delivery details']:[]),...(coverage<45?['Missing required deliverable terms']:[])],
    authority:'Decision support only. Human approval mandatory.'
  };
}

export const REASON_CODES=Object.freeze({
  ARTIFACT_INVALID:Object.freeze({severity:'BLOCKING',message:'Artifact is malformed: id, content (12–5000 chars) or source is invalid'}),
  ARTIFACT_ID_DUPLICATE:Object.freeze({severity:'BLOCKING',message:'Artifact id is repeated; all artifacts with this id are excluded'}),
  ARTIFACT_DIGEST_MISSING:Object.freeze({severity:'BLOCKING',message:'Artifact has no SHA-256 digest and cannot be verified'}),
  ARTIFACT_DIGEST_MISMATCH:Object.freeze({severity:'BLOCKING',message:'Artifact content does not match its declared SHA-256 digest'}),
  INSTRUCTION_INJECTION:Object.freeze({severity:'BLOCKING',message:'Potential instruction injection in untrusted evidence'}),
  CLAIM_MISSING:Object.freeze({severity:'MISSING',message:'Required claim is not supported by any verified trusted artifact'}),
  AI_TEXT_UNTRUSTED:Object.freeze({severity:'WARNING',message:'AI-generated text is advisory only and cannot satisfy claims'}),
  ARTIFACT_VERIFIED:Object.freeze({severity:'INFO',message:'Artifact digest verified from trusted source'}),
  CLAIM_SATISFIED:Object.freeze({severity:'INFO',message:'Required claim supported by a verified trusted artifact'}),
  HUMAN_APPROVAL_REQUIRED:Object.freeze({severity:'INFO',message:'Decision support only. Human approval mandatory.'}),
});
const SEVERITY_RANK={BLOCKING:0,MISSING:1,WARNING:2,INFO:3};
const TRUSTED_SOURCES=new Set(['seller','buyer','human']);
const AI_SOURCES=new Set(['ai','agent','llm','model']);
const ID_RE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const MAX_ARTIFACTS=20, MAX_CLAIMS=20;
const cmp=(a,b)=>a<b?-1:a>b?1:0;

export const DEFAULT_EVIDENCE_CONTRACT=Object.freeze({
  id:'M-2026-001-evidence-v1',
  requiredClaims:Object.freeze([
    Object.freeze({id:'tender_analysis',description:'Tender analysis delivered',terms:Object.freeze(['tender','analysis'])}),
    Object.freeze({id:'supplier_comparison',description:'Supplier comparison delivered',terms:Object.freeze(['supplier','comparison'])}),
    Object.freeze({id:'technical_specifications',description:'Technical specifications delivered',terms:Object.freeze(['technical','specifications'])}),
    Object.freeze({id:'deadline_schedule',description:'Deadline schedule delivered',terms:Object.freeze(['deadline','schedule'])}),
    Object.freeze({id:'cited_sources',description:'Cited sources delivered',terms:Object.freeze(['cited','sources'])}),
  ])
});

function normalizeContract(contract) {
  if(!contract||typeof contract.id!=='string'||!ID_RE.test(contract.id)||!Array.isArray(contract.requiredClaims)||
    contract.requiredClaims.length<1||contract.requiredClaims.length>MAX_CLAIMS)
    throw new AppError(`Evidence contract requires a valid id and 1–${MAX_CLAIMS} required claims`,422);
  const seen=new Set();
  const claims=contract.requiredClaims.map(c=>{
    if(!c||typeof c.id!=='string'||!ID_RE.test(c.id)) throw new AppError('Evidence contract claim id is invalid',422);
    if(seen.has(c.id)) throw new AppError('Evidence contract claim ids must be unique',422);
    seen.add(c.id);
    const terms=Array.isArray(c.terms)?tokenize(c.terms.join(' ')):[];
    if(!terms.length) throw new AppError('Evidence contract claim needs at least one significant term',422);
    return {id:c.id,description:typeof c.description==='string'?c.description.slice(0,200):'',terms};
  });
  return {id:contract.id,claims};
}
const validId=a=>a&&typeof a==='object'&&typeof a.id==='string'&&ID_RE.test(a.id);

// Deterministic, order-independent evaluation. Never approves; output never echoes artifact content.
export function evaluateEvidenceBundle(contract, artifacts) {
  const c=normalizeContract(contract);
  if(!Array.isArray(artifacts)||artifacts.length<1||artifacts.length>MAX_ARTIFACTS)
    throw new AppError(`Evidence bundle must contain 1–${MAX_ARTIFACTS} artifacts`,422);
  const reasons=[];
  const add=(code,ref={})=>reasons.push({code,severity:REASON_CODES[code].severity,
    artifactId:ref.artifactId??null,claimId:ref.claimId??null,detail:ref.detail??null,message:REASON_CODES[code].message});
  const idCount=new Map();
  for(const a of artifacts) if(validId(a)) idCount.set(a.id,(idCount.get(a.id)||0)+1);
  for(const [id,n] of idCount) if(n>1) add('ARTIFACT_ID_DUPLICATE',{artifactId:id,detail:`count=${n}`});
  const usable=[], digests=[];
  for(const a of artifacts) {
    if(!validId(a)||typeof a.content!=='string'||a.content.length<12||a.content.length>5000||
      !(TRUSTED_SOURCES.has(a.source)||AI_SOURCES.has(a.source))) {
      add('ARTIFACT_INVALID',{artifactId:validId(a)?a.id:null});
      continue;
    }
    const injections=detectInjection(a.content);
    if(injections.length) add('INSTRUCTION_INJECTION',{artifactId:a.id,detail:injections.join(',')});
    const actual=sha256Hex(a.content);
    let verified=false;
    if(typeof a.sha256!=='string'||!a.sha256) add('ARTIFACT_DIGEST_MISSING',{artifactId:a.id});
    else if(a.sha256.toLowerCase()!==actual) add('ARTIFACT_DIGEST_MISMATCH',{artifactId:a.id});
    else verified=true;
    const ai=AI_SOURCES.has(a.source);
    if(ai) add('AI_TEXT_UNTRUSTED',{artifactId:a.id});
    digests.push({id:a.id,source:a.source,sha256:actual,verified});
    if(verified&&!ai&&!injections.length&&idCount.get(a.id)===1) {
      add('ARTIFACT_VERIFIED',{artifactId:a.id});
      usable.push({id:a.id,tokens:new Set(tokenize(a.content))});
    }
  }
  const claims=c.claims.map(cl=>{
    const supportedBy=usable.filter(u=>cl.terms.every(t=>u.tokens.has(t))).map(u=>u.id).sort(cmp);
    add(supportedBy.length?'CLAIM_SATISFIED':'CLAIM_MISSING',{claimId:cl.id});
    return {id:cl.id,description:cl.description,terms:cl.terms,satisfied:supportedBy.length>0,supportedBy};
  });
  add('HUMAN_APPROVAL_REQUIRED');
  reasons.sort((x,y)=>SEVERITY_RANK[x.severity]-SEVERITY_RANK[y.severity]||cmp(x.code,y.code)||
    cmp(x.artifactId??'',y.artifactId??'')||cmp(x.claimId??'',y.claimId??'')||cmp(x.detail??'',y.detail??''));
  digests.sort((x,y)=>cmp(x.id,y.id)||cmp(x.sha256,y.sha256)||cmp(x.source,y.source));
  const blocking=reasons.some(r=>r.severity==='BLOCKING');
  const satisfied=claims.filter(cl=>cl.satisfied);
  const status=blocking?'REVIEW_REQUIRED':satisfied.length<claims.length?'INSUFFICIENT_PROOF':'POTENTIALLY_MATCHES';
  const bundleDigest=sha256Hex(JSON.stringify({contract:c.id,artifacts:digests.map(d=>[d.id,d.source,d.sha256,d.verified])}));
  return {
    kind:'EVIDENCE_BUNDLE', contractId:c.id, status,
    matchPercent:Math.round(100*satisfied.length/claims.length),
    matchedTerms:[...new Set(satisfied.flatMap(cl=>cl.terms))].slice(0,12),
    claims, artifacts:digests, reasons,
    reasonCodes:[...new Set(reasons.map(r=>r.code))].sort(cmp),
    concerns:[...new Set(reasons.filter(r=>r.severity!=='INFO').map(r=>r.message))],
    bundleDigest,
    authority:'Decision support only. Human approval mandatory.'
  };
}

export function initialState() {
  return {
    version:1, sessionId:randomUUID(),
    milestone:{
      id:'M-2026-001',
      task:'Deliver multilingual municipal sweeper export tender analysis and supplier comparison with technical specifications, deadline schedule and cited sources.',
      seller:'Independent export service provider',
      buyer:'Example distribution company (fictional)',
      currency:'EUR', amount:'29.00',
    },
    evidence:'', analysis:null, agentAnalysis:null, humanApproved:false,
    payment:null, audit:[{at:new Date().toISOString(),action:'DEMO_MILESTONE_CREATED'}]
  };
}
export function newAudit(state,action,details={}) {
  state.audit.push({at:new Date().toISOString(),action,details});
  if(state.audit.length>120) state.audit=state.audit.slice(-120);
}
export function analyze(state,evidence,agentAnalysis=null) {
  if(state.payment) throw new AppError('Milestone is locked after payment order creation',409);
  const metrics=assessEvidence(state.milestone.task,evidence);
  state.evidence=evidence;state.analysis=metrics;
  state.agentAnalysis=agentAnalysis;
  state.humanApproved=false;
  newAudit(state,'EVIDENCE_ANALYZED',{status:metrics.status,match:metrics.matchPercent,aiProvider:agentAnalysis?.provider||'NOT_CONNECTED'});
  return metrics;
}
export function analyzeBundle(state,artifacts,contract=DEFAULT_EVIDENCE_CONTRACT) {
  if(state.payment) throw new AppError('Milestone is locked after payment order creation',409);
  const result=evaluateEvidenceBundle(contract,artifacts);
  state.evidence='';state.analysis=result;
  state.agentAnalysis=null;
  state.humanApproved=false;
  newAudit(state,'EVIDENCE_BUNDLE_ANALYZED',{status:result.status,match:result.matchPercent,contractId:result.contractId,
    reasonCodes:result.reasonCodes,bundleDigest:result.bundleDigest});
  return result;
}
const bundleUnsatisfied=a=>a?.kind==='EVIDENCE_BUNDLE'&&a.status!=='POTENTIALLY_MATCHES';
export function humanApprove(state,approved) {
  if(state.payment && !(state.payment.intent==='AUTHORIZE'&&state.payment.status==='AUTHORIZED'))
    throw new AppError('Payment has already been finalized or is not authorized',409);
  if(!state.analysis) throw new AppError('Analyze evidence before approval',422);
  if(state.analysis.status==='REVIEW_REQUIRED') throw new AppError('Suspicious or unverified evidence needs manual investigation outside this demo',422);
  if(bundleUnsatisfied(state.analysis)) throw new AppError('Evidence contract not satisfied; missing claims must be delivered first',422);
  if(state.analysis.status==='INSUFFICIENT_PROOF') throw new AppError('Insufficient evidence; improve the delivery proof before approval',422);
  if(approved!==true) throw new AppError('Explicit human confirmation required',422);
  state.humanApproved=true;
  newAudit(state,'HUMAN_APPROVED',{method:'manual_button',automatic:false,bundleDigest:state.analysis.bundleDigest||null});
}
export function canCreateOrder(state) {
  if(!state.humanApproved||!state.analysis) throw new AppError('Human-approved evidence required before payment',403);
  if(bundleUnsatisfied(state.analysis)) throw new AppError('Evidence contract not satisfied',403);
  if(state.payment) throw new AppError('Payment order already exists',409);
}
export function sanitizePublic(state) {
  const {milestone,evidence,analysis,agentAnalysis,humanApproved,payment,audit,sessionId}=state;
  return {milestone,evidence,analysis,agentAnalysis,humanApproved,
    payment:payment?{id:payment.id,mode:payment.mode,status:payment.status,intent:payment.intent||'CAPTURE'}:null,
    audit:audit.slice(-35),sessionId};
}
