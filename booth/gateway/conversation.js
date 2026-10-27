import {runGoal} from './closed-loop.js';
// Request epochs are checked on BOTH sides of the transport. No stale result may act.
export class Conversation {
 constructor({control,observe,planner,publish,audit=()=>{},timeoutMs=90000,progressMs=500}) {
  Object.assign(this,{control,observe,planner,publish,audit,timeoutMs,progressMs});
  this.epoch=0;this.controlEpoch=0;this.session=crypto.randomUUID();this.messages=[];this.pending=null;this.lastAction=null;
 }
 context(){return {pending:this.pending,lastAction:this.lastAction,lastRequest:this.lastRequest||null,history:this.messages.slice(-10).map(({role,text})=>({role,text}))};}
 add(role,text,status){this.messages.push({id:crypto.randomUUID(),role,text,status});this.messages=this.messages.slice(-30);}
 show(phase,message){this.publish({phase,message,chat:[...this.messages]});}
 cancel({clearHistory=false}={}){
  this.epoch++; this.abort?.abort(); this.pending=null;
  const last=this.messages.at(-1);
  if(last?.status==='running'){last.status='cancelled';last.text='이전 행동을 중단했어요.';}
  if(clearHistory){this.messages=[];this.lastAction=null;this.lastRequest=null;}
  return this.epoch;
 }
 async stop(clearHistory=false){
  const id=this.cancel({clearHistory});
  this.lastRequest=null;this.lastAction=null;
  const result=await this.control({type:'stop',session:this.session,epoch:++this.controlEpoch});
  return id===this.epoch && result;
 }
 async submit(text){
  const context=this.context();
  const id=this.cancel();this.add('user',text);
  this.audit({stage:'received',id,text,context});
  const abort=this.abort=new AbortController();
  const deadline=setTimeout(()=>{
   if(id!==this.epoch)return;
   void this.stop();
   this.add('assistant','시간이 초과되어 중지를 요청했어요.','error');
   this.show('error','시간이 초과되어 중지를 요청했어요.');
  },this.timeoutMs);
  const current=()=>id===this.epoch && !abort.signal.aborted;
  this.show('thinking','이전 행동을 멈추고 요청을 확인하고 있어요.');
  try {
   const stopped=await this.control({type:'stop',session:this.session,epoch:++this.controlEpoch});
   if(!current())return;
   if(!stopped)throw Error('stop_unconfirmed');
   const observation=await this.observe();
   if(!current())return;
   if(!observation)throw Error('observation_missing');
   const plan=this.planner.interpret
    ? await (context.pending ? this.planner.resolveFollowup(text,context.pending,observation,abort.signal,context) : this.planner.interpret(text,observation,context,abort.signal))
    : await this.planner.plan(text,observation,context,abort.signal);
   if(!current())return;
   this.audit({stage:'decision',id,text,plan});
   this.lastRequest=plan.request||text;
   if(!['execute','goal'].includes(plan.kind)){
    if(plan.kind==='clarify')this.pending={utterance:plan.request||text,question:plan.message,intent:plan.pendingIntent||null,goal:plan.pendingGoal||null,prior:context.pending?.utterance||null};
    this.add('assistant',plan.message,plan.kind);this.show(plan.kind==='reply'?'done':plan.kind,plan.message);return;
   }
   this.lastAction=null;
   this.add('assistant',plan.message,'running');this.show('running',plan.message);
   let polling=false,executionPending=true;
   const progressTimer=setInterval(async()=>{
    if(polling||!executionPending||!current())return;polling=true;
    try{const state=await this.observe(),p=state?.progress;
     if(executionPending&&current()&&p?.session===this.session&&p.epoch===this.controlEpoch){
      const message=this.messages.findLast(m=>m.status==='running');if(message)message.text=p.message;
      this.show('running',p.message);
     }
    }catch{}finally{polling=false;}
   },this.progressMs);
   let result;
   try{
    if(plan.kind==='goal'){
     result=await runGoal(plan,{observe:this.observe,signal:abort.signal,queryObservation:this.planner.queryObservation,audit:record=>this.audit({...record,id}),execute:async stepPlan=>{
      if(!current())throw Error('cancelled');
      const fence=++this.controlEpoch;
      const stopped=await this.control({type:'stop',session:this.session,epoch:fence});
      if(!current())throw Error('cancelled');
      if(!stopped)throw Error('stop_unconfirmed');
      return this.control({type:'execute',session:this.session,epoch:fence,plan:stepPlan});
     }});
    }else result=await this.control({type:'execute',session:this.session,epoch:this.controlEpoch,plan});
   }finally{executionPending=false;clearInterval(progressTimer);}

   if(!current())return;
   if(!result || typeof result.ok!=='boolean')throw Error('execution_unconfirmed');
   const message=result.message;
   this.audit({stage:'result',id,plan,result});
   if(result.ok)this.lastAction=plan.kind==='goal'?{steps:plan.steps,completed:true}:{...plan.action,completed:true};
   if(result.kind==='clarify'&&result.pendingGoal)this.pending={utterance:text,question:result.message,goal:result.pendingGoal};
   const running=this.messages.findLast(m=>m.status==='running');if(running)running.status='completed';
   this.add('assistant',message,result.ok?'done':result.kind==='clarify'?'clarify':'unavailable');
   this.show(result.ok?'done':result.kind==='clarify'?'clarify':'unavailable',message);
  }catch(error){
   if(id!==this.epoch)return;
   // Abort or transport loss is never a successful completion. Stop the game too.
   const failureEpoch=this.epoch+1;
   const stopped=await this.stop();
   if(this.epoch!==failureEpoch)return;
   this.audit({stage:'error',id,error:String(error)});
   const message=stopped?'처리를 완료하지 못해 행동을 멈췄어요. 다시 입력해 주세요.':'처리 결과와 중지 여부를 확인하지 못했어요. 연결을 확인해 주세요.';
   this.add('assistant',message,'error');
   this.show('error',message);
  }finally{clearTimeout(deadline);}
 }
}
