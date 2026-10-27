import { pipeline } from '@huggingface/transformers';
import { AppError } from './core.mjs';

// Apache-2.0 ONNX weights, public model hosted by Hugging Face.
// Embedder is cached; CPU-only, no paid inference API.
export const EMBEDDING_MODEL='onnx-community/all-MiniLM-L6-v2-ONNX';
let loader=null;

function lazyModel(){
  if(!loader) loader=pipeline('feature-extraction',EMBEDDING_MODEL,{dtype:'q4',device:'cpu'})
    .catch(e=>{loader=null;throw e;});
  return loader;
}
function similarity(a,b){
  if(a.length!==b.length || !a.length) throw new AppError('Embedding vector dimension mismatch',502);
  let dot=0;
  for(let i=0;i<a.length;i++)dot+=a[i]*b[i];
  return Math.max(-1,Math.min(1,dot));
}
function facets(requirement){
  const original=String(requirement||'').trim();
  const clauses=original.split(/[;,]/).map(x=>x.trim())
      .filter(x=>x.length>=14).slice(0,8);
  return clauses.length>=2?clauses:[original];
}
export class EmbeddingAI {
  get enabled(){return true;}
  async evaluate(requirement,evidence){
    if(typeof requirement!=='string'||typeof evidence!=='string'||evidence.length>5000)
      throw new AppError('Bad evidence for local model',400);
    let extractor;
    try{extractor=await lazyModel();}
    catch {throw new AppError('Local open-source AI weights not available yet; check free model download',503);}
    const segments=facets(requirement);
    let vectors;
    try{
      const output=await extractor([requirement,evidence,...segments],{
        pooling:'mean',normalize:true});
      vectors=output.tolist();
    }catch {throw new AppError('Local semantic AI inference failed',503);}
    const score=similarity(vectors[0],vectors[1]);
    const subScores=segments.map((f,i)=>({requirement:f,
      similarity:similarity(vectors[i+2],vectors[1])}));
    const missing=subScores.filter(x=>x.similarity<0.40)
      .map(x=>x.requirement.slice(0,110)).slice(0,5);
    const percent=Math.round(Math.max(0,score)*100);
    const risk=score<0.28?'high':score<0.53?'medium':'low';
    const summary=percent>=60?'Delivery evidence appears related to the contract requirements.':
        percent>=35?'Partial semantic alignment; missing details need human review.':
        'Evidence is semantically distant from the agreed milestone.';
    return {
      provider:'LOCAL_AI_TRANSFORMER',model:EMBEDDING_MODEL,
      similarityPercent:percent,missing,risk,summary,
      authority:'Advisory semantic similarity only; does not prove work or authorize payment',
      noPaidAIAPI:true
    };
  }
}