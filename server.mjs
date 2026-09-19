import http from 'node:http';
import fs from 'node:fs';
import {Worker} from 'node:worker_threads';
import {createServer as createViteServer} from 'vite';
import {runTrial,trial} from './core/experiment.mjs';
import {GROK_STATUS,prepareHintRequest,requestGrokHint} from './core/grok.mjs';
const host='127.0.0.1',port=8846;
const bank=JSON.parse(fs.readFileSync(new URL('./public/neural-bank.json',import.meta.url)));
let report=fs.existsSync('reports/experiment.json')?JSON.parse(fs.readFileSync('reports/experiment.json')):null;
let training=false;
const vite=await createViteServer({server:{middlewareMode:true,host},appType:'spa'});
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function trainLocal(){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./scripts/train-worker.mjs',import.meta.url));worker.once('message',resolve);worker.once('error',reject);worker.once('exit',c=>{if(c)reject(Error('Training process stopped'));});});}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+host+':'+port);
    if(/^\/data\/[a-z0-9._-]+$/.test(url.pathname)){
      const file=new URL('./public'+url.pathname,import.meta.url);
      if(fs.existsSync(file)){
        const bytes=fs.readFileSync(file);
        res.writeHead(200,{'Content-Type':url.pathname.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'public, max-age=3600'});
        return res.end(bytes);
      }
    }
    if(url.pathname.startsWith('/api/')){
      if(req.headers.origin&&req.headers.origin!==`http://${host}:${port}`)return send(res,403,{error:'Local app requests only'});
      if(url.pathname==='/api/status')return send(res,200,{grok:GROK_STATUS,trained:!!report,training,neurons:bank.neurons,edges:bank.edges});
      if(url.pathname==='/api/results')return send(res,report?200:404,report||{error:'Train the readout first'});
      if(url.pathname==='/api/train'&&req.method==='POST'){
        if(training)return send(res,409,{error:'Training is already running'});
        training=true;
        try{report=await trainLocal();fs.writeFileSync('reports/experiment.json',JSON.stringify(report,null,2));return send(res,200,report);}finally{training=false;}
      }
      if(url.pathname==='/api/trial'){
        const seed=Number(url.searchParams.get('seed')||100042),mode=url.searchParams.get('mode')||'selective';
        if(!Number.isSafeInteger(seed)||seed<0||seed>1e9||!['none','always','selective'].includes(mode))return send(res,400,{error:'Invalid seed or policy'});
        if(!report)return send(res,409,{error:'Train the readout first'});
        return send(res,200,runTrial(bank,report.model,seed,mode));
      }
      if(url.pathname==='/api/grok/request-preview')return send(res,200,prepareHintRequest(trial(100042)));
      if(url.pathname==='/api/grok/hint'){await requestGrokHint();}
      return send(res,404,{error:'Unknown endpoint'});
    }
    vite.middlewares(req,res,()=>{res.writeHead(404);res.end('Not found');});
  }catch(error){send(res,error.status||500,{error:error.message});}
});
server.listen(port,host,()=>console.log(`Fly / Assist: http://${host}:${port}`));
