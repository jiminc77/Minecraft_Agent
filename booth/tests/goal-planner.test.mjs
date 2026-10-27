import test from 'node:test';import assert from 'node:assert/strict';
import {Planner} from '../gateway/goal-planner.js';
const observe={targets:[{key:'block:0:0:1',kind:'block',name:'oak_log',pos:{x:0,y:0,z:1}}]};
const goal={kind:'tree',target:'block:0:0:1',message:'나무 원목을 캘게요.',steps:[],utterance:'나무 다 캐',reason:'원목 전체'};
function fake(replies){return new Planner({fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:(()=>{const next=replies.shift();return typeof next==='string'?next:JSON.stringify(next);})()}}]})})});}
test('whole-tree goal stays whole and needs an independent semantic review',async()=>{
 const p=fake([goal,{ok:true,reason:'맞음',question:''}]);const plan=await p.plan('나무 다 캐',observe,{});assert.deepEqual(plan.action,{type:'tree',target:'block:0:0:1'});
});
test('semantic mismatch rejects a valid geometric target',async()=>{
 const p=fake([goal,{ok:false,reason:'보라는 요청',question:'시점을 바꿀까요?'}]);assert.equal((await p.plan('나무를 봐',observe,{},undefined,1)).kind,'clarify');
});
test('invented goal target never reaches execution',async()=>{
 const p=fake([{...goal,target:'block:99:99:99'}]);assert.equal((await p.plan('나무 다 캐',observe,{})).kind,'unavailable');
});
test('greeting response does not create an executable command',async()=>{
 const p=fake([{...goal,kind:'chat',message:'안녕하세요!'}]);assert.equal((await p.plan('안녕',observe,{})).kind,'reply');
});
test('long sequence cannot silently discard steps',async()=>{
 const p=fake([{...goal,kind:'sequence',steps:Array(7).fill('왼쪽 봐')}]);assert.equal((await p.plan('일곱 단계',observe,{})).kind,'unavailable');
});
test('internal semantic error gets one bounded repair before asking the user',async()=>{
 const p=fake([goal,{ok:false,reason:'잘못된 수량',question:'수량?'},goal,{ok:true,reason:'수정됨',question:''}]);
 assert.equal((await p.plan('나무 다 캐',observe,{})).kind,'execute');
});

test('conflicting step interpretation remains gated by the whole-goal review',async()=>{
 const motion={interpretation:'이동',multiple_actions:false,ambiguous:false,action_type:'move',direction:'back',amount:2,target_reference:'none',target_name:'',target_key:'',question:''};
 const sequence={...goal,kind:'sequence',steps:['뒤로 돌아','앞으로 3칸 가']};
 for(const approved of [true,false]){
  const p=fake([sequence,motion,'!turn(180)',{...motion,direction:'forward',amount:3},'!move("forward", 3)',{ok:approved,reason:'전체 원문 검토',question:''}]);
  const result=await p.plan('뒤로 돌아서 앞으로 3칸',observe,{},undefined,1);
  assert.equal(result.kind,approved?'execute':'clarify');
  if(approved)assert.deepEqual(result.action.steps[0],{type:'turn',amount:180});
 }
});
