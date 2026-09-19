import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {decodeConnectome,decodeLabels} from '../public/vendor/data.js';
import {PRESETS,resolvePreset} from '../public/vendor/presets.js';
import {rng} from './rng.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const unpack=name=>new Uint8Array(gunzipSync(fs.readFileSync(root+'public/data/'+name)));
// Maze symbols are artificial stimuli. These names never imply a natural fly
// recognizes a sign or understands a language model.
export const ENCODING={a:'sugar',b:'touch',unknown:'loom'};
export class Connectome {
  constructor(){
    this.meta=JSON.parse(new TextDecoder().decode(unpack('meta.json.gz')));
    const N=this.meta.n_neurons;
    const labels=decodeLabels(unpack('labels.bin.gz'),N);
    this.channels=JSON.parse(fs.readFileSync(root+'public/data/channels.json'));
    this.featureNames=Object.keys(this.channels.features);
    this.featureIds=Object.values(this.channels.features);
    this.stimuli=Object.fromEntries(Object.entries(ENCODING).map(([k,id])=>[k,resolvePreset(PRESETS.find(p=>p.id===id),labels,this.meta.dicts)]));
    const conn=decodeConnectome(unpack('conn.bin.gz'),N,this.meta.n_edges,unpack('sign.bin.gz'));
    const math=Object.create(Math);math.random=rng(1);
    this.context=vm.createContext({Math:math,self:{postMessage(){}},setTimeout(){throw Error('Continuous loop not used in recording mode');}});
    vm.runInContext(fs.readFileSync(root+'public/vendor/sim.worker.js','utf8'),this.context);
    this.context.initMessage={cmd:'init',N,...conn};
    vm.runInContext('self.onmessage({data:initMessage})',this.context);
    this.context.featureIds=this.featureIds;
    this.context.groupIds=['proboscis','escape','turn'].map(k=>this.channels.channels[k]?.all||[]);
    this.context.durationSteps=1500;
  }
  record(symbol,seed){
    if(!this.stimuli[symbol])throw Error('Unknown stimulus');
    this.context.Math.random=rng(seed);
    this.context.stimMessage={cmd:'stim',idx:this.stimuli[symbol]};
    const output=vm.runInContext(`(()=>{
      self.onmessage({data:stimMessage});
      const trace=[], last=groupIds.map(()=>0);
      for(let s=0;s<durationSteps;s++){
        advance();
        if((s+1)%100===0){
          const values=groupIds.map((ids,k)=>{let n=0;for(const id of ids)n+=spikeCount[id];const hz=(n-last[k])/Math.max(1,ids.length)/0.01;last[k]=n;return hz;});
          trace.push({t:(s+1)*DT,values});
        }
      }
      const x=featureIds.map(ids=>{let n=0;for(const id of ids)n+=spikeCount[id];return Math.log1p(n/Math.max(1,ids.length)/(durationSteps*DT/1000));});
      return {x,trace,totalSpikes,nActive};
    })()`,this.context,{timeout:30000});
    return {...JSON.parse(JSON.stringify(output)),symbol,seed,durationMs:150,stimulatedNeurons:this.stimuli[symbol].length};
  }
}
