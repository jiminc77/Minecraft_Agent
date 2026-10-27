// Authored goal-language probes; frozen observation, no game execution.
import fs from 'node:fs';import {Planner} from '../gateway/goal-planner.js';
const observation={pos:{x:0.5,y:0,z:0.5},yaw:180,pitch:0,cursor:'block:0:1:2',targets:[{key:'block:0:1:2',kind:'block',name:'dirt',pos:{x:0,y:1,z:2},dist:2,relative:{forward:2,right:0,up:1}},{key:'block:3:0:3',kind:'block',name:'oak_log',pos:{x:3,y:0,z:3},dist:4,relative:{forward:3,right:-3,up:0}}]};
const cases=[
 ['오른쪽으로 90도 돌고 두 칸 걸어줘','sequence'],['세 번 점프한 다음 하늘을 봐줘','sequence'],['앞으로 두 칸, 그다음 뒤로 두 칸','sequence'],['제자리에서 180도 돌고 앞으로 세 걸음','sequence'],
 ['저 나무 한 그루의 원목 전부 캐자','tree'],['가장 가까운 나무 원목을 남김없이 캐줘','tree'],['앞의 나무 한 그루만 다 없애줘, 잎은 놔둬','tree'],['나무 다 캐서 없애자','tree'],
 ['앞에 쌓인 흙을 파서 올라갈 계단을 내줘','carve'],['이 흙 벽에 한 칸 폭으로 계단길을 깎아줘','carve'],['새 블록 놓지 말고 흙 벽을 깎아서 올라가자','carve'],
 ['돌을 놓아서 계단 지어줘','nonaction'],['작업대를 만들어줘','nonaction'],
 ['왼편으로 네 걸음 옮겨줘','move'],['대각선 오른쪽 앞으로 2칸 걸어','move'],['앞쪽으로 다섯 발짝 걸어줘','move'],['제자리에서 두 번 뛰어올라','jump'],
 ['멈추라고 할 때까지 계속 걸어','nonaction'],['숲에 있는 나무를 전부 없애','nonaction'],['반가워 스티브','reply']
];
const rows=[];
for(const [text,expected]of cases){const audit=[],p=new Planner({audit:r=>audit.push(r)});let plan,error;
 try{plan=await p.plan(text,observation,{},AbortSignal.timeout(30000));}catch(e){error=String(e);}
 const actual=plan?.kind==='execute'?plan.action.type:plan?.kind;
 const ok=expected==='nonaction'?plan&&plan.kind!=='execute':actual===expected;
 rows.push({text,expected,actual,ok:!!ok,plan,error,audit});console.log(JSON.stringify({text,expected,actual,ok:!!ok}));
}
fs.writeFileSync(new URL('../results/goals-language20.json',import.meta.url),JSON.stringify({mode:'language only; kind-level probes, not physical completion',passed:rows.filter(r=>r.ok).length,total:rows.length,rows},null,2));
