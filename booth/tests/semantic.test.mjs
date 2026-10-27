import test from 'node:test';import assert from 'node:assert/strict';
import {SemanticPlanner} from '../gateway/semantic-planner.js';import {runGoal} from '../gateway/closed-loop.js';import {ground} from '../gateway/target-grounding.js';
const entity={kind:'entity',key:'entity:1',name:'pig',dist:2,relative:{right:1,forward:1}};
const obs={targets:[entity],pos:{x:0,y:0,z:0},yaw:0};
const selector={kind:'entity',name:'pig',relation:'any',selection:'any'};
const goal=steps=>({kind:'goal',mode:'new_request',request:'요청',message:'실행',steps});
const stub=result=>new SemanticPlanner({fetchImpl:async(_url,options)=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(JSON.parse(options.body).response_format.json_schema.name==='request_intent'?{needs_context:result.mode==='answer',kind:result.kind,mode:result.mode,request:'요청',message:'',actions:result.steps.map(s=>s.type)}:result)}}]})})});
test('attack contract is executable and cannot finish from approach-only evidence',async()=>{
 const g=await stub(goal([{type:'attack',selector}])).interpret('request',obs);let sent;
 const result=await runGoal(g,{observe:async()=>obs,execute:async p=>{sent=p.action;return{ok:true,message:'가까이 갔어요.'};}});
 assert.equal(sent.type,'attack');assert.equal(result.ok,false);assert.match(result.message,/사망/);
});
test('attack completion requires positive death evidence, absence is not death',async()=>{
 const result=await runGoal(goal([{type:'attack',selector}]),{observe:async()=>obs,execute:async()=>({ok:true,message:'동물을 잡았어요.',evidence:{targetDead:true,targetKey:'entity:1'}})});
 assert.equal(result.ok,true);assert.equal(result.message,'동물을 잡았어요.');
});
test('non-action contract carrying steps is rejected',async()=>{await assert.rejects(()=>stub({...goal([{type:'jump',amount:1}]),kind:'reply'}).interpret('request',obs));});
test('out-of-range quantities are not clipped or executed',async()=>{const p=stub(goal([{type:'move',direction:'forward',amount:1000}]));assert.equal((await p.interpret('request',obs)).kind,'unavailable');});
test('reference answer cannot change pending action or quantity',async()=>{
 const pending={utterance:'목표',goal:goal([{type:'attack',selector}])};
 const changed={...goal([{type:'approach',selector}]),mode:'answer'};
 const result=await stub(changed).resolveFollowup('request',pending,obs);assert.equal(result.kind,'clarify');assert.deepEqual(result.pendingGoal,pending.goal);
});
test('new request can replace pending goal',async()=>{
 const result=await stub(goal([{type:'look',amount:90}])).resolveFollowup('request',{goal:goal([{type:'attack',selector}])},obs);assert.equal(result.kind,'goal');assert.equal(result.steps[0].type,'look');
});
test('indefinite one target can select a visible candidate, definite ambiguity asks',()=>{
 const targets=[entity,{...entity,key:'entity:2',dist:4}];assert.equal(ground({type:'attack',selector},{targets}).target.key,'entity:1');
 assert.equal(ground({type:'attack',selector:{...selector,selection:'unique'}},{targets}).kind,'clarify');
});
test('truncated query can select any visible block, cannot assert unique or farthest',()=>{
 const s={type:'dig',selector:{kind:'block',name:'dirt',relation:'any',selection:'any'}};const o={coverage:{truncated:true},targets:[{kind:'block',name:'dirt',key:'block:1',dist:2}]};assert.equal(ground(s,o).ok,true);
 assert.equal(ground({...s,selector:{...s.selector,selection:'unique'}},o).kind,'clarify');assert.equal(ground({...s,selector:{...s.selector,relation:'farthest'}},o).kind,'clarify');
});
test('travel preserves simultaneous jump and exact distance',async()=>{
 let action;const r=await runGoal(goal([{type:'travel',direction:'left',distance:8,jumping:true}]),{observe:async()=>obs,execute:async p=>{action=p.action;return{ok:true,message:'8칸 이동했어요.'};}});assert.equal(r.ok,true);assert.deepEqual(action,{type:'travel',direction:'left',distance:8,jumping:true});
});
test('executor failure is never overwritten by approach distance',async()=>{
 const r=await runGoal(goal([{type:'approach',selector}]),{observe:async()=>obs,execute:async()=>({ok:false,message:'실행 실패'})});assert.equal(r.ok,false);
});

test('complete fresh request bypasses dialogue rewrite despite previous command',async()=>{
 let call=0;
 const p=new SemanticPlanner({fetchImpl:async(_url,o)=>{const data=JSON.parse(o.body),name=data.response_format.json_schema.name;let result;
 if(name==='dialogue_resolution')result={mode:'new_request',request:'old command'};
 else if(name==='request_intent'){assert.equal(JSON.parse(data.messages.at(-1).content).latest,'new command');result={kind:'goal',mode:'new_request',request:'new command',message:'',actions:['look']};}
 else result={steps:[{type:'look',amount:90}]};call++;return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};}});
 const r=await p.interpret('new command',obs,{lastRequest:'old command'});assert.equal(r.kind,'goal');assert.equal(call,2);
});
test('death evidence for a different entity cannot complete the requested attack',async()=>{
 const r=await runGoal(goal([{type:'attack',selector}]),{observe:async()=>obs,execute:async()=>({ok:true,message:'완료',evidence:{targetDead:true,targetKey:'entity:99'}})});assert.equal(r.ok,false);
});

test('unresolved referent cannot replay a completed goal without a pending question',async()=>{
 let calls=0;const p=new SemanticPlanner({fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({kind:'clarify',needs_context:true,mode:'new_request',request:'ambiguous',message:'어떤 동작인가요?',actions:[]})}}]})};}});
 const r=await p.interpret('ambiguous',obs,{lastRequest:'previous action',lastAction:{completed:true},history:[{role:'user',text:'previous action'}]});assert.equal(r.kind,'clarify');assert.equal(calls,1);
});

test('past reports cannot enter planning or execution',async()=>{
 let calls=0;const p=new SemanticPlanner({fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({kind:'reply',needs_context:false,mode:'chat',request:'I previously requested an action',message:'',actions:[]})}}]})};}});
 const r=await p.interpret('report',obs,{lastRequest:'attack a pig'});assert.equal(r.kind,'reply');assert.equal(r.steps.length,0);assert.equal(calls,1);
});
test('an unrecognized named target cannot become arbitrary nearest block removal',()=>{
 const r=ground({type:'dig',amount:1,selector:{kind:'block',name:'',relation:'any',selection:'any'}},{targets:[{kind:'block',name:'dirt',key:'block:1',dist:1}]});assert.equal(r.kind,'clarify');assert.equal(r.ok,false);
});
test('missing context and pointer cannot be filled with a guessed visible target',async()=>{
 const g={...goal([{type:'attack',selector}]),mode:'answer'};
 const r=await stub(g).interpret('ambiguous pointer',obs);assert.equal(r.kind,'clarify');assert.deepEqual(r.steps,[]);
});
test('indefinite nearest ties and matching side members can choose a candidate',()=>{
 const targets=[{...entity,dist:2},{...entity,key:'entity:2',dist:2.1}];
 assert.equal(ground({type:'attack',selector:{...selector,relation:'nearest'}},{targets}).ok,true);
 assert.equal(ground({type:'attack',selector:{...selector,relation:'nearest',selection:'unique'}},{targets}).kind,'clarify');
 assert.equal(ground({type:'approach',selector:{...selector,relation:'right'}},{targets,coverage:{truncated:true}}).ok,true);
 assert.equal(ground({type:'attack',selector:{...selector,relation:'nearest'}},{targets,coverage:{truncated:true}}).kind,'clarify');
});

test('independent parameters exclude completed context and bind semantic vertical reference',async()=>{
 const p=new SemanticPlanner({fetchImpl:async(_url,o)=>{const data=JSON.parse(o.body),name=data.response_format.json_schema.name;let result;
 if(name==='request_intent')result={needs_context:false,kind:'goal',mode:'new_request',request:'view',message:'',actions:['look']};
 else {const input=JSON.parse(data.messages.at(-1).content);assert.equal(input.previousRequest,null);assert.equal(input.previousAction,null);const shape=data.response_format.json_schema.schema.properties.steps.items.anyOf[0];assert.ok(!shape.properties.reference.enum.includes('explicit_angle'));result={steps:[{type:'look',reference:'ground_down',amount:90}]};}
 return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};}});
 const r=await p.interpret('view',obs,{lastRequest:'old view',lastAction:{steps:[{type:'look',amount:90}],completed:true}});assert.equal(r.steps[0].amount,-90);assert.equal(r.steps[0].reference,undefined);
});

test('moving approach target gets one bounded retry with the same entity',async()=>{
 let calls=0;const r=await runGoal(goal([{type:'approach',selector}]),{observe:async()=>({...obs,targets:[{...entity,dist:calls===0?8:calls===1?4:2}]}),execute:async p=>{assert.equal(p.action.target,entity.key);calls++;return{ok:true,message:'접근'};}});assert.equal(r.ok,true);assert.equal(calls,2);
 calls=0;const fail=await runGoal(goal([{type:'approach',selector},{type:'jump',amount:1}]),{observe:async()=>({...obs,targets:[{...entity,dist:8}]}),execute:async p=>{assert.equal(p.action.type,'approach');calls++;return{ok:true,message:'접근'};}});assert.equal(fail.ok,false);assert.equal(calls,2);
});
