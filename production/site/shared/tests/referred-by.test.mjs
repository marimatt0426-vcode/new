import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, fillPlan, fillDetails, core } from './helpers/make-store.mjs';
function ready(value) { const t=makeStore(); fillPlan(t.store); fillDetails(t.store,'service_request','text'); if(value!==undefined)t.store.set({referredBy:value}); t.store.set({termsAccepted:true}); return t; }
test('optional referral: shown only to new service households; no validation rule',()=>{
 const {store}=ready(); const rule=()=>store.fieldRules().find(x=>x.key==='referredBy');
 assert.equal(rule().shown,true); assert.equal(rule().required,false); assert.equal(rule().maxLength,60);
 assert.equal(rule().label,'Who sent you? (optional)'); assert.equal(rule().hint,"A neighbor's name, or a code from a flyer.");
 assert.equal(store.buildPayload().ok,true); assert.equal('referredBy' in store.buildPayload().payload,false);
 store.set({referredBy:'TEST-FLYER',customerStatus:'returning'}); assert.equal(store.getState().referredBy,''); assert.equal(rule().shown,false);
 store.set({customerStatus:'new',referredBy:'TEST-FLYER'}); store.set({intent:'question'}); assert.equal(store.getState().referredBy,''); assert.equal(rule().shown,false);
});
test('optional referral trims only at send, is capped, and cannot carry line breaks',()=>{
 const {store}=ready('  TEST-FLYER  '); assert.equal(store.buildPayload().payload.referredBy,'TEST-FLYER');
 store.set({referredBy:'x'.repeat(61)}); assert.equal(store.getState().referredBy.length,60);
 store.set({referredBy:'A\r\nB\u2028C\u2029D'}); assert.equal(store.getState().referredBy,'ABCD');
 store.set({referredBy:'   ',termsAccepted:true}); assert.equal('referredBy' in store.buildPayload().payload,false);
});
test('optional referral never changes price, plan storage or save schema; reset removes it',async()=>{
 const {store,storage}=ready('TEST-FLYER'); const price=store.quote();
 assert.equal(JSON.stringify(storage.items).includes('TEST-FLYER'),false);
 assert.equal(core.PERSISTED_PLAN_KEYS.includes('referredBy'),false);
 const saved=await store.createSaveLink(); assert.equal(saved.ok,true); assert.equal(JSON.stringify(saved).includes('TEST-FLYER'),false);
 store.set({referredBy:''}); assert.deepEqual(store.quote(),price); store.set({referredBy:'TEST-FLYER'}); store.reset(); assert.equal(store.getState().referredBy,'');
});
test('referral absent from every event and demo log; success records only a boolean',async()=>{
 const a=ready(), b=ready('TEST-FLYER'); const x=await a.store.submit(), y=await b.store.submit();
 assert.equal(x.ok,true); assert.equal(y.ok,true); assert.equal(y.payload.referredBy,'TEST-FLYER');
 assert.deepEqual(b.store.trackLog,a.store.trackLog);
 assert.equal(JSON.stringify(b.store.submissionLog).includes('referredBy'),false);
 assert.equal(JSON.stringify(b.store.networkLog).includes('TEST-FLYER'),false);
 assert.equal(b.store.getState().receipt.hasReferral,true);
});
test('referral edits follow ordinary request id rules after timeout',async()=>{
 for(const [from,to] of [['TEST-FIRST','TEST-SECOND'],['TEST-FIRST',''],['','TEST-SECOND']]) {
  const {store}=ready(from); store.setDemo({submit:'timeout'}); const first=await store.submit();
  const unchanged=store.buildPayload(); assert.equal(unchanged.reused,true); assert.equal(unchanged.payload.requestId,first.requestId);
  store.set({referredBy:to,termsAccepted:true}); const retry=store.buildPayload();
  assert.equal(retry.reused,false); assert.notEqual(retry.payload.requestId,first.requestId); assert.equal(retry.payload.referredBy,to||undefined);
 }
});
