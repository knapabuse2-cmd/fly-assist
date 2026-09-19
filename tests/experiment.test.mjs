import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Connectome} from '../core/brain.mjs';
import {train,evaluate,scores,trial,runTrial} from '../core/experiment.mjs';
import {requestGrokHint,prepareHintRequest} from '../core/grok.mjs';
const bank=JSON.parse(fs.readFileSync(new URL('../public/neural-bank.json',import.meta.url)));
const {model}=train(bank);
test('training and test windows and trial seeds do not overlap',()=>{
  const used=new Set(bank.train.map(r=>r.seed));
  assert.ok(bank.test.every(r=>!used.has(r.seed)));
  const result=evaluate(bank,model);
  assert.ok(result.selective.rows.every(r=>r.seed>6099));
  assert.deepEqual(result.none.rows.map(r=>r.seed),result.selective.rows.map(r=>r.seed));
});
test('selectivity and dependence on neural features on held-out responses',()=>{
  const r=evaluate(bank,model);
  assert.ok(r.selective.success/r.selective.n>0.9);
  assert.ok(r.selective.hints<r.always.hints*0.7);
  assert.ok(r.selective.reward>r.always.reward);
  assert.ok(r.selective.markedHints/r.selective.marked<0.1);
  assert.ok(r.selective.unmarkedHints/r.selective.unmarked>0.9);
  assert.ok(r.shuffled.success<r.selective.success*0.9);
});
test('policy is repeatable and uses only the feature vector',()=>{
  const m2=train(bank).model;assert.deepEqual(model.weights,m2.weights);
  assert.deepEqual(scores(model,bank.test[0].x),scores(m2,bank.test[0].x));
  assert.deepEqual(runTrial(bank,model,100042),runTrial(bank,model,100042));
});
test('recording re-runs the real LIF graph and exactly reproduces held-out spikes',()=>{
  const brain=new Connectome();
  assert.equal(brain.meta.n_neurons,138639);assert.equal(brain.meta.n_edges,2700513);
  for(const symbol of ['a','b','unknown']){
    const saved=bank.test.find(r=>r.symbol===symbol),fresh=brain.record(symbol,saved.seed);
    assert.deepEqual(fresh.x,saved.x);assert.equal(fresh.totalSpikes,saved.totalSpikes);
    assert.ok(fresh.totalSpikes>0);
  }
});
test('Grok fails closed without touching fetch, even if a key exists',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=()=>{calls++;throw Error('Network must stay off');};
  try{await assert.rejects(requestGrokHint({apiKey:'test-only-not-a-key'}),/disabled/);assert.equal(calls,0);}
  finally{globalThis.fetch=original;}
  const preview=prepareHintRequest(trial(100042));
  assert.equal(preview.url,'https://api.x.ai/v1/chat/completions');
  assert.ok(!('headers' in preview));
  assert.throws(()=>prepareHintRequest({seed:0,target:9}),/Invalid/);
});
