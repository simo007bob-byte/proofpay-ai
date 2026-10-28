import { createHash } from 'node:crypto';
import { AppError, DEFAULT_EVIDENCE_CONTRACT, detectInjection } from './core.mjs';

const MAX_BYTES=1024*1024;
const MAX_PAGES=12;
const MAX_CHARS=45000;
const MAX_EXCERPT=260;
const NEGATION=/\b(?:not|never|no|missing|incomplete|undelivered|failed|absent|without)\b/i;

function validateInput({filename,mimeType,base64}={}) {
  if(typeof filename!=='string'||filename.length>120||!(/^[a-zA-Z0-9_. -]+$/.test(filename)))
    throw new AppError('Invalid safe evidence filename',422);
  const ext=filename.toLowerCase().split('.').pop();
  if(ext==='pdf' && mimeType!=='application/pdf')throw new AppError('PDF content type mismatch',422);
  if(ext==='txt'&&!['text/plain','application/octet-stream'].includes(mimeType))
    throw new AppError('TXT content type mismatch',422);
  if(!['txt','pdf'].includes(ext))throw new AppError('Only PDF and TXT evidence accepted',415);
  if(typeof base64!=='string'||base64.length===0||base64.length>Math.ceil(MAX_BYTES*4/3)+8||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
     throw new AppError('Invalid or too large base64 document',413);
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<12||bytes.length>MAX_BYTES)
    throw new AppError('Document must contain 12 bytes to 1 MiB',413);
  if(ext==='pdf'&&!bytes.subarray(0,8).toString('latin1').startsWith('%PDF-'))
    throw new AppError('PDF magic header missing',422);
  return {bytes,ext,filename};
}

async function pagesFromPdf(bytes) {
  let task;
  try{
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,
      useSystemFonts:false,stopAtErrors:true});
    const doc=await task.promise;
    if(doc.numPages<1||doc.numPages>MAX_PAGES)throw new AppError('PDF has too many pages (maximum 12)',422);
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i);
      const text=await page.getTextContent({disableNormalization:false});
      const lines=[];let current='',lastY=null;
      for(const token of text.items){
        if(typeof token.str!=='string')continue;
        const y=token.transform?.[5];
        if(lastY!==null && typeof y==='number' && Math.abs(y-lastY)>4 && current.trim()) {
          lines.push(current.trim());current='';
        }
        current+=token.str+(token.hasEOL?'\n':' ');
        if(token.hasEOL){lines.push(current.trim());current='';}
        lastY=typeof y==='number'?y:lastY;
      }
      if(current.trim())lines.push(current.trim());
      const plain=lines.join('\n').slice(0,MAX_CHARS);
      pages.push({page:i,text:plain});
      page.cleanup();
    }
    await task.destroy();
    return pages;
  }catch(e){
    if(task)await task.destroy().catch(()=>{});
    if(e instanceof AppError)throw e;
    throw new AppError('Unable to extract PDF text: scan-only documents are not supported',422);
  }
}

export async function inspectDocument(input) {
  const {bytes,ext,filename}=validateInput(input);
  let pages;
  if(ext==='pdf')pages=await pagesFromPdf(bytes);
  else {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(text.includes('\u0000'))throw new AppError('Binary content is not a TXT document',422);
    pages=[{page:1,text:text.slice(0,MAX_CHARS)}];
  }
  if(pages.reduce((n,p)=>n+p.text.trim().length,0)<24)
    throw new AppError('No extractable textual evidence found',422);
  return {
    filename,format:ext.toUpperCase(),sha256:createHash('sha256').update(bytes).digest('hex'),
    bytes:bytes.length,pages
  };
}

const words=x=>String(x).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)||[];
function claimMatch(lines,terms) {
  const exact=terms.map(x=>x.toLowerCase());
  let firstPositive=null;
  for(const l of lines){
    const lower=l.text.toLowerCase().normalize('NFKC');
    const tokens=new Set(words(lower));
    if(exact.every(t=>tokens.has(t))) {
      const found={page:l.page,quote:l.text.trim().slice(0,MAX_EXCERPT),contradicted:NEGATION.test(lower)};
      // A seller cannot bury an explicit contradiction below a positive statement.
      if(found.contradicted)return found;
      firstPositive??=found;
    }
  }
  return firstPositive;
}
export function evaluateDocumentProof(document,contract=DEFAULT_EVIDENCE_CONTRACT) {
  if(!document||!Array.isArray(document.pages)||!document.pages.length)
    throw new AppError('Extracted pages required',422);
  const lines=[];
  for(const p of document.pages){
    for(const line of p.text.split(/[\r\n]+/)){
      const normalized=line.trim();
      if(normalized)lines.push({page:p.page,text:normalized});
    }
  }
  const allText=lines.map(x=>x.text).join(' ');
  const instructions=detectInjection(allText);
  const claims=contract.requiredClaims.map(c=>{
    const match=claimMatch(lines,c.terms);
    return {id:c.id,description:c.description,
      status:!match?'MISSING':match.contradicted?'CONTRADICTED':'TEXT_MENTIONED',
      page:match?.page??null,quote:match?.quote??null};
  });
  const mentioned=claims.filter(c=>c.status==='TEXT_MENTIONED').length;
  // A verbatim or near-verbatim checklist pasted on a single line is not supporting evidence.
  const sourceCounts=new Map();
  for(const c of claims) if(c.status==='TEXT_MENTIONED') {
    const k=String(c.page)+':'+c.quote;
    sourceCounts.set(k,(sourceCounts.get(k)||0)+1);
  }
  const copiedChecklist=[...sourceCounts.values()].some(n=>n>=3);
  // Text mentioning a requirement cannot prove it actually happened; always require human confirmation.
  const status=instructions.length||copiedChecklist||claims.some(c=>c.status==='CONTRADICTED')
    ?'REVIEW_REQUIRED':mentioned===claims.length?'POTENTIALLY_MATCHES':'INSUFFICIENT_PROOF';
  const reasonCodes=[
    ...(instructions.length?['DOCUMENT_INSTRUCTION_INJECTION']:[]),
    ...(claims.some(c=>c.status==='CONTRADICTED')?['DOCUMENT_CONTRADICTED']:[]),
    ...(claims.some(c=>c.status==='MISSING')?['DOCUMENT_CLAIM_MISSING']:[]),
    ...(copiedChecklist?['DOCUMENT_CHECKLIST_RESTATEMENT']:[])
  ];
  return {kind:'DOCUMENT_PROOF',status,matchPercent:Math.round(100*mentioned/claims.length),
    document:{filename:document.filename,format:document.format,sha256:document.sha256,bytes:document.bytes,pageCount:document.pages.length},
    claims,reasonCodes,concerns:reasonCodes,
    authority:'Textual references are not authenticated delivery. Buyer must independently inspect and approve.'};
}
