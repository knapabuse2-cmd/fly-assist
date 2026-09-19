import {fetchGz,decodePositions,decodeLabels,decodeConnectome} from '../public/vendor/data.js';
import {FlyView} from '../public/vendor/fly.js';
import {BrainView} from '../public/vendor/gl.js';
import {Decoder} from '../public/vendor/decoder.js';
import {PRESETS,resolvePreset} from '../public/vendor/presets.js';

const ENCODING={a:'sugar',b:'touch',unknown:'loom'};
const BASE=import.meta.env.BASE_URL;
const colorMap={acetylcholine:[0.72,0.56,0.29],glutamate:[0.21,0.64,0.62],gaba:[0.53,0.47,0.74],dopamine:[0.96,0.39,0.24],serotonin:[0.91,0.67,0.34],octopamine:[0.32,0.61,0.91]};
export class LabEngine{
  constructor(flyCanvas,brainCanvas,onState){this.flyCanvas=flyCanvas;this.brainCanvas=brainCanvas;this.onState=onState;this.running=false;this.mode='live';this.disposed=false;this.ready=false;this.drive={};this.trace=[];this.lastSample=0;this.t=0;this.request=0;}
  async init(){
    const [metaRaw,posRaw,labelsRaw,sign,connRaw,channels]=await Promise.all(['meta.json.gz','pos.u16.bin.gz','labels.bin.gz','sign.bin.gz','conn.bin.gz'].map(f=>fetchGz(BASE+'data/'+f).catch(e=>{throw Error(f+': '+e.message);})).concat(fetch(BASE+'data/channels.json').then(r=>r.json())));
    if(this.disposed)return;
    this.meta=JSON.parse(new TextDecoder().decode(metaRaw));
    const N=this.meta.n_neurons;
    this.labels=decodeLabels(labelsRaw,N);
    const {pos,radius}=decodePositions(posRaw,N,this.meta.bbox_lo,this.meta.span);
    this.brain=new BrainView(this.brainCanvas,pos,this.labels.nt,radius);
    this.brain.setNTColors(this.meta.dicts.top_nt.map(n=>colorMap[n.toLowerCase()]||[0.52,0.67,0.68]));
    this.brain.baseAlpha=0.18;
    this.fly=new FlyView(this.flyCanvas);this.fly.yaw=0.95;this.fly.userMoved=true;
    this.decoder=new Decoder(channels.channels,channels.features);
    this.hz=new Float32Array(N);this.win=new Float32Array(N);
    this.worker=new Worker(BASE+'neural.worker.js');
    this.worker.onerror=e=>this.onState({error:e.message||'Neural simulation failed'});
    this.worker.onmessage=({data:m})=>{
      if(this.disposed)return;
      if(m.type==='ready'){this.ready=true;this.stimulate('sugar');this.onState({ready:true,neurons:N,edges:this.meta.n_edges});}
      if(m.type==='frame'&&this.mode==='live'){this.frame(m);}
      if(m.type==='recorded'&&this.mode==='trial'){
        this.replay=m.frames;this.replayIndex=0;this.replayTime=0;this.elapsed=0;this.trialReady=true;this.running=true;
        this.onState({phase:'Reading the neural response',status:'running'});
      }
    };
    const conn=decodeConnectome(connRaw,N,this.meta.n_edges,sign);
    this.worker.postMessage({cmd:'init',N,...conn},[conn.indptr.buffer,conn.indices.buffer,conn.weights.buffer]);
    this.last=performance.now();this.raf=requestAnimationFrame(t=>this.loop(t));
  }
  indices(id){return resolvePreset(PRESETS.find(p=>p.id===id),this.labels,this.meta.dicts);}
  markStim(idx){this.brain.sel.fill(0);idx.forEach(i=>this.brain.sel[i]=1);this.brain.uploadSel();this.brain.act.fill(0);this.win.fill(0);this.trace=[];this.lastSample=0;this.t=0;this.spikes=0;this.active=0;}
  resetBody(){
    Object.assign(this.fly.s,{pos:[0,0,0],heading:0,pitch:0,roll:0,speed:0,turn:0,gait:0,wing:0,proboscis:0,groom:0,jump:0,lift:0,airborne:0});
    this.fly._steps(false,1);this.drive={};
  }
  stimulate(id){
    if(!this.ready)return;
    this.mode='live';this.trialReady=false;this.replay=null;this.running=true;this.resetBody();
    this.fly.arena=null;this.fly.dist=2.8;this.fly.pitch=-0.3;this.fly.yaw=0.95;
    const idx=this.indices(id);this.markStim(idx);
    this.worker.postMessage({cmd:'run',on:false});this.worker.postMessage({cmd:'stim',idx});this.worker.postMessage({cmd:'speed',value:40});this.worker.postMessage({cmd:'run',on:true});
    this.onState({mode:'live',stimulus:id,status:'running',phase:'Live neural simulation',trace:[],t:0,spikes:0,action:'Responding to stimulus'});
  }
  frame(m){
    for(const i of m.spikes){this.brain.act[i]=1;this.win[i]++;}
    this.t=m.t;this.spikes=m.totalSpikes;this.active=m.nActive;
    if(m.t-this.lastSample>=10){
      const sec=(m.t-this.lastSample)/1000;
      for(let i=0;i<this.win.length;i++){this.hz[i]=this.win[i]/sec;this.win[i]=0;}
      this.drive=this.decoder.rules(this.hz);
      const values=['proboscis','escape','turn'].map(k=>this.decoder.chanRate(this.hz,k));
      this.trace.push({t:m.t,values});if(this.trace.length>70)this.trace.shift();
      this.lastSample=m.t;
    }
  }
  playTrial(result){
    if(!this.ready)throw Error('Brain is still loading');
    this.mode='trial';this.trialReady=false;this.running=false;this.result=result;this.resetBody();
    this.fly.s.pos=[0,0,-1.9];this.fly._steps(false,1);
    this.fly.arena={branch:null,target:result.target,reveal:false};this.fly.dist=7.7;this.fly.pitch=-0.73;this.fly.yaw=0.2;
    this.waypoint=0;this.elapsed=0;this.completed=false;this.phase='Reading the neural response';
    const idx=this.indices(ENCODING[result.symbol]);this.markStim(idx);
    this.worker.postMessage({cmd:'run',on:false});this.worker.postMessage({cmd:'record',idx,seed:result.recordingSeed});
    this.onState({mode:'trial',status:'recording',phase:'Simulating 150 ms of brain activity',trace:[],t:0,spikes:0,action:'Waiting for neural response'});
  }
  trialDrive(dt){
    this.elapsed+=dt;
    if(this.elapsed<1.7)return {};
    const result=this.result;
    if(result.hints&&this.elapsed<3.2){this.phase=result.advisor==='grok'?'Using Grok’s reply':'Using the local advisor’s reply';return {stop:1};}
    const goals=[[0,0.45],[result.branch===0?-1.95:1.95,1.68]];
    if(this.waypoint>=goals.length){
      this.fly.arena.reveal=true;this.phase=result.success?'Food reached':'The dish is empty';
      if(!this.completed){this.completed=true;this.onState({status:'complete',phase:this.phase,action:result.success?'Feeding':'No food',done:true});}
      return result.success?{proboscis:0.95}:{stop:1};
    }
    this.fly.arena.branch=result.branch;
    this.phase='Walking to the '+(result.branch===0?'left':'right')+' dish';
    const [x,z]=goals[this.waypoint],s=this.fly.s,dx=x-s.pos[0],dz=z-s.pos[2];
    const distance=Math.hypot(dx,dz);
    if(distance<0.15){this.waypoint++;return {stop:0.8};}
    let delta=Math.atan2(dx,dz)-s.heading;delta=Math.atan2(Math.sin(delta),Math.cos(delta));
    return {walk:Math.max(0.1,0.85*(1-Math.min(1,Math.abs(delta)/2))),turn:Math.max(-1,Math.min(1,delta*1.8))};
  }
  pause(){this.running=!this.running;if(this.mode==='live')this.worker.postMessage({cmd:'run',on:this.running});this.onState({status:this.running?'running':'paused'});}
  loop(now){
    if(this.disposed)return;
    const dt=Math.min(0.05,(now-this.last)/1000);this.last=now;
    if(this.running){
      if(this.mode==='trial'&&this.trialReady){
        this.replayTime+=dt;
        while(this.replayIndex<this.replay.length&&this.replayTime>=0.10){this.replayTime-=0.10;this.frame(this.replay[this.replayIndex++]);}
        this.drive=this.trialDrive(dt);
      }
      this.fly.update(this.drive,dt);
    }
    for(let i=0;i<this.brain.act.length;i++)this.brain.act[i]*=Math.pow(0.04,dt);
    this.brain.uploadAct();this.brain.draw(dt);this.fly.draw();
    this.onRender?.();
    if(now-(this.lastUI||0)>160){
      this.lastUI=now;
      this.onState({t:this.t,spikes:this.spikes||0,active:this.active||0,trace:[...this.trace],drive:{...this.drive},...(this.mode==='trial'&&this.phase?{phase:this.phase}:{})});
    }
    this.raf=requestAnimationFrame(t=>this.loop(t));
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.worker?.terminate();for(const view of [this.brain,this.fly])view?.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
