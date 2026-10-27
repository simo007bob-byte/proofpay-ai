import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbeddingAI, EMBEDDING_MODEL } from '../src/embedding-ai.mjs';

test('Actual pretrained Hugging Face ONNX model semantically distinguishes evidence (no paid API)',async()=>{
 const ai=new EmbeddingAI();
 const task='Deliver a municipal sweeper export tender analysis with technical specifications and deadline schedule.';
 const relevant='Our report contains municipal sweeper tender analysis with technical specifications, suppliers and bid deadline calendar.';
 const unrelated='A coffee machine was repaired in the meeting room and someone organized a birthday party.';
 const good=await ai.evaluate(task,relevant);
 const bad=await ai.evaluate(task,unrelated);
 assert.equal(good.provider,'LOCAL_AI_TRANSFORMER');
 assert.equal(good.model,EMBEDDING_MODEL);
 assert.equal(good.noPaidAIAPI,true);
 assert.ok(good.similarityPercent>bad.similarityPercent+15,
  'meaningfully related evidence must score above unrelated text');
 assert.match(good.authority,/does not prove work or authorize payment/);
});