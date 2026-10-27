import test from 'node:test';import assert from 'node:assert/strict';
import {Conversation} from '../gateway/conversation.js';
import {validatePlan} from '../booth_contract.js';
const plan={kind:'execute',message:'이동할게요.',action:{type:'move',direction:'left',amount:3}};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(planner,control){const calls=[],states=[];const c=new Conversation({planner,control:control|| (async x=>{calls.push(x);return x.type==='stop'?true:{ok:true,message:'완료'};}),observe:async()=>({targets:[]}),publish:x=>states.push(x)});return{c,calls,states};}
test('schema rejects invalid direction, out of range, and invented target',()=>{
 for(const action of [{type:'move',direction:'left_forward',amount:3},{type:'move',direction:'left',amount:100},{type:'attack',target:'entity:9'}]) assert.throws(()=>validatePlan({...plan,action},{targets:[]}));
});
test('clarification never executes; next answer receives pending context',async()=>{
 const contexts=[];const {c,calls}=setup({plan:async(t,o,context)=>{contexts.push(context);return t==='저거'?{kind:'clarify',message:'어느 동물인가요?',action:null}:plan;}});
 await c.submit('저거');assert.equal(calls.filter(x=>x.type==='execute').length,0);await c.submit('왼쪽으로 세 칸');assert.equal(contexts[1].pending.question,'어느 동물인가요?');assert.equal(calls.filter(x=>x.type==='execute').length,1);
});
test('old model response cannot execute after a newer request',async()=>{
 const d=deferred();const {c,calls}=setup({plan:async t=>t==='old'?d.promise:plan});
 const old=c.submit('old');await tick();await c.submit('new');d.resolve(plan);await old;
 assert.equal(calls.filter(x=>x.type==='execute').length,1);assert.equal(calls.find(x=>x.type==='execute').epoch,2);
});
test('manual takeover invalidates pending inference and context',async()=>{
 const d=deferred();const{c,calls}=setup({plan:()=>d.promise});const run=c.submit('old');await tick();c.cancel({clearHistory:true});d.resolve(plan);await run;assert.equal(calls.filter(x=>x.type==='execute').length,0);assert.equal(c.messages.length,0);
});
test('failure to confirm stop prevents planning and execution',async()=>{
 let planned=false;const{c}=setup({plan:()=>{planned=true;}},async()=>false);await c.submit('test');assert.equal(planned,false);
});
test('timeout after dispatch requests a stop and never marks completion',async()=>{
 const execute=deferred();const calls=[];const {c,states}=setup({plan:async()=>plan},async d=>{calls.push(d);if(d.type==='execute')return execute.promise;return true;});c.timeoutMs=15;
 const run=c.submit('test');await new Promise(r=>setTimeout(r,30));execute.resolve(null);await run;
 // Execution has its own 26-second watchdog; the gateway must also cancel immediately.
 assert.ok(calls.filter(x=>x.type==='stop').length>=2);assert.ok(!states.some(x=>x.phase==='done'));
});
test('unconfirmed stop is not reported as a successful stop',async()=>{const{c,states}=setup({plan:async()=>plan},async()=>false);await c.submit('test');assert.match(states.at(-1).message,/확인하지 못/);assert.doesNotMatch(states.at(-1).message,/멈췄어요/);});

test('late progress observation cannot overwrite a completed result',async()=>{
 const execution=deferred(),progress=deferred();let observations=0;const states=[];
 const c=new Conversation({planner:{plan:async()=>plan},control:async d=>d.type==='stop'?true:execution.promise,observe:async()=>++observations===1?{targets:[]}:progress.promise,publish:s=>states.push(s),progressMs:1});
 const run=c.submit('move');await new Promise(r=>setTimeout(r,10));
 execution.resolve({ok:true,message:'완료'});await run;
 progress.resolve({progress:{session:c.session,epoch:c.epoch,message:'아직 진행중'}});await tick();
 assert.equal(states.at(-1).phase,'done');
});

test('grounded steps use distinct transport epochs and stop between steps',async()=>{
 const goal={kind:'goal',message:'두 단계',steps:[{type:'turn',amount:90},{type:'jump',amount:1}]};
 const {c,calls,states}=setup({interpret:async()=>goal});await c.submit('test');
 const executions=calls.filter(x=>x.type==='execute');assert.equal(executions.length,2);
 assert.ok(executions[1].epoch>executions[0].epoch);assert.equal(states.at(-1).phase,'done');
});
test('late first-step result cannot launch a second step after new input',async()=>{
 const deferredExecution=deferred(),calls=[];
 const goal={kind:'goal',message:'두 단계',steps:[{type:'jump',amount:1},{type:'turn',amount:90}]};
 const {c}=setup({interpret:async t=>t==='old'?goal:{kind:'reply',message:'안녕'}},async d=>{calls.push(d);return d.type==='execute'?deferredExecution.promise:true;});
 const old=c.submit('old');await tick();await c.submit('new');deferredExecution.resolve({ok:true,message:'완료'});await old;
 assert.equal(calls.filter(x=>x.type==='execute').length,1);assert.equal(c.messages.at(-1).text,'안녕');
});
test('grounded pending goal is passed to followup resolver without execution',async()=>{
 const goal={kind:'goal',steps:[{type:'dig',amount:1,selector:{kind:'block',name:'dirt',relation:'any'}}]};let pending;
 const{c,calls}=setup({interpret:async()=>({kind:'clarify',message:'어느 쪽?',pendingGoal:goal}),resolveFollowup:async(t,p)=>{pending=p;return{kind:'reply',message:'취소했어요'};}});
 await c.submit('흙을 캐');await c.submit('취소');assert.deepEqual(pending.goal,goal);assert.equal(calls.filter(x=>x.type==='execute').length,0);
});
test('later-step ambiguity preserves only remaining steps for followup',async()=>{
 const goal={kind:'goal',message:'목표',steps:[{type:'jump',amount:1},{type:'approach',selector:{kind:'entity',name:'pig',relation:'any'}}]};
 const targets=[1,2].map(i=>({kind:'entity',name:'pig',key:'entity:'+i,dist:i+2}));const calls=[];
 const c=new Conversation({planner:{interpret:async()=>goal,queryObservation:async()=>({targets})},control:async d=>{calls.push(d);return d.type==='stop'?true:{ok:true,message:'완료'};},observe:async()=>({targets}),publish:()=>{}});
 await c.submit('test');assert.equal(calls.filter(x=>x.type==='execute').length,1);assert.equal(c.pending.goal.steps.length,1);assert.equal(c.pending.goal.steps[0].type,'approach');
});
