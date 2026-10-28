import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, analyze, humanApprove, canCreateOrder } from '../src/core.mjs';

const text='Delivered multilingual municipal sweeper export tender analysis with cited sources and technical specifications.';
test('approved legacy evidence cannot be swapped after buyer approval',()=>{
  const state=initialState();
  analyze(state,text);
  humanApprove(state,true);
  assert.equal(state.approvedDigest,state.analysis.evidenceDigest);
  assert.doesNotThrow(()=>canCreateOrder(state));
  state.evidence+=' TAMPERED';
  assert.throws(()=>canCreateOrder(state),/Evidence changed or approval is stale/);
  analyze(state,text+' additional supplier comparison.');
  assert.equal(state.approvedDigest,null);
  assert.equal(state.humanApproved,false);
  assert.throws(()=>canCreateOrder(state),/Human-approved/);
});
test('buyer acknowledgement binds to the actual file hash, not approval flag alone',()=>{
  const state=initialState();
  state.payment={intent:'AUTHORIZE',status:'AUTHORIZED',id:'MOCK-AUTH'};
  state.analysis={kind:'DOCUMENT_PROOF',status:'POTENTIALLY_MATCHES',
    document:{sha256:'a'.repeat(64)}};
  humanApprove(state,true);
  assert.equal(state.approvedDigest,'a'.repeat(64));
  state.analysis.document.sha256='b'.repeat(64);
  assert.notEqual(state.approvedDigest,state.analysis.document.sha256);
});
test('legacy persisted approval without digest fails closed',()=>{
  const state=initialState();
  analyze(state,text);
  humanApprove(state,true);
  delete state.approvedDigest;
  assert.throws(()=>canCreateOrder(state),/Evidence changed or approval is stale/);
});
