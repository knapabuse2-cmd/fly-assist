// Extends the unchanged LIF engine with seeded, finite response recordings.
importScripts('./vendor/sim.worker.js');
const baseHandler=self.onmessage;
const schedule=self.setTimeout.bind(self);
let scheduledTick;
self.setTimeout=(callback,delay)=>{scheduledTick=schedule(callback,delay);return scheduledTick;};
function seeded(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
self.onmessage=ev=>{
  if(ev.data.cmd==='run'&&!ev.data.on)clearTimeout(scheduledTick);
  if(ev.data.cmd!=='record')return baseHandler(ev);
  const m=ev.data;
  running=false;
  clearTimeout(scheduledTick);
  Math.random=seeded(m.seed);
  baseHandler({data:{cmd:'stim',idx:m.idx}});
  const frames=[];let spikes=[];
  for(let s=0;s<1500;s++){
    advance();
    for(let k=0;k<outCount;k++)spikes.push(outIdx[k]);
    if((s+1)%100===0){frames.push({t:(s+1)*DT,spikes,nActive,totalSpikes});spikes=[];}
  }
  self.postMessage({type:'recorded',frames,seed:m.seed});
};
