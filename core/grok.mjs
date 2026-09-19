// The legacy local server remains closed. The public app uses the explicit,
// opt-in browser session below. No application-owned API key is ever used.
export const GROK_STATUS={enabled:false,calls:0,budgetUsd:0,reason:'Paid requests are disabled for this experiment.'};
export function prepareHintRequest(state){
  if(!Number.isSafeInteger(state.seed)||![0,1].includes(state.target))throw Error('Invalid trial');
  return {url:'https://api.x.ai/v1/chat/completions',method:'POST',body:{model:'grok-4.20-0309-non-reasoning',messages:[{role:'system',content:'Advise a digital fly in a two-arm foraging simulation. Inspect the world state and choose the arm with food. Give a short reason, at most 25 words. Return the required JSON.'},{role:'user',content:JSON.stringify({trial:state.seed,arms:{left:state.target===0?'food':'empty',right:state.target===1?'food':'empty'}})}],max_tokens:120,response_format:{type:'json_schema',json_schema:{name:'fly_hint',strict:true,schema:{type:'object',properties:{branch:{type:'string',enum:['left','right']},reason:{type:'string'}},required:['branch','reason'],additionalProperties:false}}}}};
}
export async function requestGrokHint(){
  const error=new Error(GROK_STATUS.reason);error.status=403;throw error;
}

export function parseGrokReply(data){
  let answer;
  try{answer=JSON.parse(data?.choices?.[0]?.message?.content);}catch{throw Error('Grok did not return a usable decision. No local answer was substituted.');}
  if(!answer||!['left','right'].includes(answer.branch)||typeof answer.reason!=='string'||answer.reason.length>500)throw Error('Grok returned an invalid decision. No local answer was substituted.');
  return {branch:answer.branch==='left'?0:1,reason:answer.reason.slice(0,250),usage:{input:Number(data.usage?.prompt_tokens)||0,output:Number(data.usage?.completion_tokens)||0},model:typeof data.model==='string'?data.model:'grok-4.20-0309-non-reasoning'};
}

export function applyAdvice(result,answer){
  if(!result.hints||![0,1].includes(answer.branch))throw Error('Cannot apply this advisor decision.');
  const success=answer.branch===result.target;
  return {...result,branch:answer.branch,success,reward:(success?1:-1)-0.35,advisor:'grok',advisorReason:answer.reason,usage:answer.usage,model:answer.model};
}

export class GrokSession{
  #key='';#enabled=false;#count=0;#limit=5;#pending=null;#generation=0;
  constructor(transport=(...args)=>fetch(...args)){this.transport=transport;}
  get status(){return {enabled:this.#enabled,attempts:this.#count,limit:this.#limit,pending:!!this.#pending};}
  connect({key,consent=false,limit=5}={}){
    if(!consent)throw Error('Enable paid requests explicitly before connecting.');
    if(typeof key!=='string'||key.trim().length<20||key.trim().length>512||/\s/.test(key.trim()))throw Error('Enter a valid xAI API key.');
    if(!Number.isInteger(limit)||limit<1||limit>20||limit<=this.#count)throw Error('Choose a request limit above the number already attempted, up to 20.');
    this.disconnect();this.#key=key.trim();this.#enabled=true;this.#limit=limit;
  }
  disconnect(){this.#generation++;this.#enabled=false;this.#key='';this.#pending?.abort();}
  async hint(state){
    if(!this.#enabled||!this.#key)throw Error('Connect your own Grok key first.');
    if(this.#pending)throw Error('A Grok request is already in progress.');
    if(this.#count>=this.#limit)throw Error('Your request limit has been reached. No request was sent.');
    const request=prepareHintRequest(state),generation=this.#generation;
    const controller=new AbortController();this.#pending=controller;this.#count++;
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await this.transport(request.url,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.#key},body:JSON.stringify(request.body),signal:controller.signal});
      if(!response.ok){
        const label=response.status===401||response.status===400?'Check your xAI key and model access.':response.status===402?'Your xAI account needs API credits.':response.status===429?'xAI rate limit reached. Try again later.':'xAI could not complete this request.';
        throw Error(`${label} HTTP ${response.status}.`);
      }
      const answer=parseGrokReply(await response.json());
      if(generation!==this.#generation)throw Error('The Grok session was disconnected.');
      return {...answer,advisor:'grok',attempt:this.#count};
    }catch(error){
      if(error.name==='AbortError')throw Error('Grok request stopped or timed out. It was not retried; xAI may still bill a request it received.');
      if(error instanceof TypeError)throw Error('Could not reach xAI. Check your connection and browser settings. No local answer was substituted.');
      throw error;
    }finally{clearTimeout(timer);if(this.#pending===controller)this.#pending=null;}
  }
}
