import test from 'node:test';
import assert from 'node:assert/strict';
import {GrokSession,applyAdvice,parseGrokReply} from '../core/grok.mjs';
const key='test-only-placeholder-key-not-real';
const state={seed:100046,target:1,hints:1,reward:0.65,success:true,branch:1};
const reply=branch=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({branch,reason:'The dish contains food.'})}}],usage:{prompt_tokens:75,completion_tokens:15}}));
test('opt-in and cap prevent unauthorized requests; key never enters exported status',async()=>{
  let calls=0;const s=new GrokSession(async(url,opt)=>{calls++;assert.equal(url,'https://api.x.ai/v1/chat/completions');assert.equal(opt.credentials,'omit');assert.equal(opt.redirect,'error');assert.equal(JSON.parse(opt.body).max_tokens,120);return reply('right');});
  await assert.rejects(s.hint(state),/Connect/);assert.equal(calls,0);
  assert.throws(()=>s.connect({key}),/explicitly/);
  s.connect({key,consent:true,limit:1});assert.ok(!JSON.stringify(s).includes(key));assert.ok(!JSON.stringify(s.status).includes(key));
  const answer=await s.hint(state);assert.equal(answer.branch,1);assert.equal(calls,1);
  await assert.rejects(s.hint(state),/limit/);assert.equal(calls,1);
  s.disconnect();assert.equal(s.status.enabled,false);assert.equal(s.status.attempts,1);
});
test('an incorrect Grok answer changes the actual trial outcome',()=>{
  const r=applyAdvice(state,{branch:0,reason:'Test wrong reply',usage:{input:1,output:1}});
  assert.equal(r.success,false);assert.equal(r.branch,0);assert.equal(r.reward,-1.35);assert.equal(r.advisor,'grok');
});
test('provider errors stay sanitized, count against cap, and never fall back',async()=>{
  let calls=0;const s=new GrokSession(async()=>{calls++;return new Response('Bad key '+key,{status:401});});
  s.connect({key,consent:true,limit:1});await assert.rejects(s.hint(state),err=>err.message.includes('HTTP 401')&&!err.message.includes(key));
  await assert.rejects(s.hint(state),/limit/);assert.equal(calls,1);
  assert.throws(()=>parseGrokReply({choices:[{message:{content:'not json'}}]}),/No local/);
});
test('overlapping requests are blocked and disconnect aborts pending work',async()=>{
  let signal;const s=new GrokSession(async(url,options)=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))));});
  s.connect({key,consent:true,limit:5});const pending=s.hint(state);
  await assert.rejects(s.hint(state),/in progress/);s.disconnect();
  await assert.rejects(pending,/stopped or timed out/);assert.equal(signal.aborted,true);assert.equal(s.status.attempts,1);
});
