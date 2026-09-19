import {experiment} from '../core/experiment.mjs';
self.onmessage=({data})=>{try{self.postMessage(experiment(data));}catch(e){self.postMessage({error:e.message});}};
