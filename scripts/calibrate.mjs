import fs from 'node:fs';
import {Connectome,ENCODING} from '../core/brain.mjs';
const start=performance.now();
const brain=new Connectome();
const bank={source:'Fly Brain Bench / FlyWire v783',commit:'9031c5ba5d09db1650047050c0295fb12902b227',neurons:brain.meta.n_neurons,edges:brain.meta.n_edges,encoding:ENCODING,featureNames:brain.featureNames,durationMs:150,train:[],test:[]};
for(const split of ['train','test'])for(const symbol of Object.keys(ENCODING))for(let i=0;i<(split==='train'?12:8);i++){
  const seed=(split==='train'?10000:900000)+i+Object.keys(ENCODING).indexOf(symbol)*1000;
  bank[split].push(brain.record(symbol,seed));
  console.log(`${split} ${symbol} ${i+1}: ${bank[split].at(-1).totalSpikes} spikes`);
}
bank.elapsedSeconds=(performance.now()-start)/1000;
fs.writeFileSync('public/neural-bank.json',JSON.stringify(bank));
fs.writeFileSync('reports/calibration.json',JSON.stringify({neurons:bank.neurons,edges:bank.edges,featureCount:bank.featureNames.length,train:bank.train.length,test:bank.test.length,elapsedSeconds:bank.elapsedSeconds},null,2));
console.log('Calibration complete',bank.elapsedSeconds.toFixed(1),'seconds');
