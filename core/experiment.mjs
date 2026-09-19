import {rng} from './rng.mjs';

export const ACTIONS=['left','right','ask'];
export const HINT_COST=0.35;
// A two-arm foraging task. The observation is encoded into an artificial
// stimulus upstream of the fixed connectome. Only spike features enter Q().
export function trial(seed){
  const r=rng(seed),target=r()<0.5?0:1,marked=r()<0.5;
  return {seed,target,marked,symbol:marked?(target===0?'a':'b'):'unknown'};
}
export function transform(model,x){
  return [1,...x.map((v,i)=>Math.max(-4,Math.min(4,(v-model.mean[i])/model.scale[i])))];
}
export function scores(model,x){
  const z=transform(model,x);
  return model.weights.map(w=>w.reduce((s,v,i)=>s+v*z[i],0));
}
const argmax=a=>a.indexOf(Math.max(...a));
export function select(model,x,mode='selective'){
  if(mode==='always')return 2;
  const q=scores(model,x);
  return argmax(mode==='none'?q.slice(0,2):q);
}
export function outcome(t,action){
  const branch=action===2?t.target:action;
  const success=branch===t.target;
  return {branch,success,hints:action===2?1:0,reward:(success?1:-1)-(action===2?HINT_COST:0)};
}
export function recording(bank,split,symbol,seed){
  const rows=bank[split].filter(s=>s.symbol===symbol);
  return rows[Math.floor(rng(seed+771)()*rows.length)];
}
export function train(bank,{seed=42,episodes=6000}={}){
  const rows=bank.train,D=rows[0].x.length;
  const mean=Array.from({length:D},(_,i)=>rows.reduce((s,r)=>s+r.x[i],0)/rows.length);
  const scale=mean.map((m,i)=>Math.max(0.15,Math.sqrt(rows.reduce((s,r)=>s+(r.x[i]-m)**2,0)/rows.length)));
  const model={mean,scale,weights:Array.from({length:3},()=>Array(D+1).fill(0)),seed,episodes,method:'Reward-trained linear action values over 58 neural features',hintCost:HINT_COST};
  const random=rng(seed),curve=[];
  let reward=0,hints=0,success=0;
  for(let i=0;i<episodes;i++){
    const t=trial(100+i),row=recording(bank,'train',t.symbol,i);
    const z=transform(model,row.x),q=scores(model,row.x);
    const epsilon=0.45-(i/episodes)*0.35;
    const action=random()<epsilon?Math.floor(random()*3):argmax(q);
    const result=outcome(t,action);
    const error=result.reward-q[action],norm=z.reduce((s,v)=>s+v*v,0);
    for(let j=0;j<z.length;j++)model.weights[action][j]+=0.22*error*z[j]/norm;
    reward+=result.reward;hints+=result.hints;success+=+result.success;
    if((i+1)%250===0){curve.push({episode:i+1,reward:reward/250,hints:hints/250,success:success/250});reward=0;hints=0;success=0;}
  }
  return {model,curve};
}
export function runTrial(bank,model,seed,mode='selective',control=false){
  const t=trial(seed);
  // The shuffled-feature control breaks the relationship between observation
  // and neural recording while keeping the same feature distribution.
  const symbol=control?['a','b','unknown'][Math.floor(rng(seed+45678)()*3)]:t.symbol;
  const row=recording(bank,'test',symbol,seed);
  const action=select(model,row.x,mode);
  return {...t,mode,action:ACTIONS[action],q:scores(model,row.x),...outcome(t,action),recordingSeed:row.seed,trace:row.trace,spikes:row.totalSpikes,features:row.x};
}
export function evaluate(bank,model,count=256){
  const all={};
  for(const mode of ['none','always','selective','shuffled']){
    const rows=Array.from({length:count},(_,i)=>runTrial(bank,model,100000+i,mode==='shuffled'?'selective':mode,mode==='shuffled'));
    all[mode]={n:count,success:rows.filter(r=>r.success).length,hints:rows.reduce((s,r)=>s+r.hints,0),reward:rows.reduce((s,r)=>s+r.reward,0)/count,marked:rows.filter(r=>r.marked).length,unmarked:rows.filter(r=>!r.marked).length,markedHints:rows.filter(r=>r.marked&&r.hints).length,unmarkedHints:rows.filter(r=>!r.marked&&r.hints).length,rows};
  }
  return all;
}
export function experiment(bank){
  const trained=train(bank);
  const results=evaluate(bank,trained.model);
  return {schema:1,createdAt:new Date().toISOString(),advisor:'local full-state oracle',grokCalls:0,grokVerified:false,provenance:{source:bank.source,commit:bank.commit,neurons:bank.neurons,edges:bank.edges,featureCount:bank.featureNames.length,windowMs:bank.durationMs,trainWindows:bank.train.length,testWindows:bank.test.length,trainTrialSeeds:[100,6099],testTrialSeeds:[100000,100255],encoding:bank.encoding},...trained,results};
}
