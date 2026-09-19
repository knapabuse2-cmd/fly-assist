import {runTrial,trial} from '../core/experiment.mjs';
import {prepareHintRequest} from '../core/grok.mjs';
const base=import.meta.env.BASE_URL;
let bankPromise,reportPromise;
async function json(name){const r=await fetch(base+name);if(!r.ok)throw Error('Could not load '+name);return r.json();}
export function getBank(){return bankPromise??=json('neural-bank.json');}
function initialReport(){return reportPromise??=json('baseline.json');}
export async function localApi(path){
  const url=new URL(path,'https://local.invalid/');
  if(url.pathname==='/status')return {trained:true};
  if(url.pathname==='/results')return initialReport();
  if(url.pathname==='/train'){
    const bank=await getBank();
    const result=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./training.worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data);};
      worker.onerror=()=>{worker.terminate();reject(Error('Training failed. Please reload and try again.'));};
      worker.postMessage(bank);
    });
    reportPromise=Promise.resolve(result);return result;
  }
  if(url.pathname==='/trial'){
    const seed=Number(url.searchParams.get('seed')),mode=url.searchParams.get('mode');
    if(!Number.isSafeInteger(seed)||seed<0||seed>1e9||!['none','always','selective'].includes(mode))throw Error('Choose a valid trial seed and policy.');
    const [bank,report]=await Promise.all([getBank(),initialReport()]);
    return {...runTrial(bank,report.model,seed,mode),advisor:'local'};
  }
  if(url.pathname==='/grok/request-preview')return prepareHintRequest(trial(100046));
  throw Error('Unknown local operation');
}
