import fs from 'node:fs';import {Planner} from '../gateway/goal-planner.js';
const observation={pos:{x:0.5,y:87,z:0.5},yaw:180,pitch:0,cursor:null,targets:[{key:'block:0:87:8',kind:'block',name:'dirt',pos:{x:0,y:87,z:8},dist:8,relative:{forward:8,right:0,up:0}}]};
const cases=[
 ['앞으로 멈추지 말고 걸어가','travel',null,false],['멈추지 말고 쭉 가라고','travel',null,false],['계속 앞으로 걸어줘','travel',null,false],['점프하면서 계속 앞으로 가','travel',null,true],
 ['점프하면서 10칸 앞으로 가자','travel',10,true],['앞으로 8칸 가는 동안 계속 점프해','travel',8,true],['앞으로 5칸 이동과 점프를 동시에 해','travel',5,true],['점프하며 앞으로 열 칸 가줘','travel',10,true],
 ['걸어가자 앞으로 100칸','travel',100,false],['전진 80칸 부탁해','travel',80,false],['앞으로 백 칸 가','travel',100,false],
 ['앞의 육지까지 가자','land'],['앞쪽 뭍으로 올라가줘','land'],['앞쪽 물 밖으로 나가자','land'],
 ['한 번 점프한 뒤 앞으로 10칸 가','sequence'],['앞으로 10칸 간 다음 두 번 점프해','sequence'],['점프하지 말고 앞으로 10칸 걸어','move'],
 ['앞으로 천 칸 가','nonaction'],['잠수해서 바닥을 탐험해','nonaction']
];
const rows=[];
for(const [text,type,distance,jumping]of cases){const audit=[];let plan,error;try{plan=await new Planner({audit:r=>audit.push(r)}).plan(text,observation,{},AbortSignal.timeout(30000));}catch(e){error=String(e);}
 const a=plan?.action,ok=type==='nonaction'?plan&&plan.kind!=='execute':plan?.kind==='execute'&&(a.type===type||(type==='move'&&a.type==='travel'&&a.distance===10&&a.jumping===false&&a.direction==='forward'))&&(type!=='travel'||a.distance===distance&&a.jumping===jumping&&a.direction==='forward');
 rows.push({text,expected:{type,distance,jumping},ok:!!ok,plan,error,audit});console.log(JSON.stringify({text,ok:!!ok,plan,error}));
}
fs.writeFileSync(new URL('../results/natural-language.json',import.meta.url),JSON.stringify({mode:'frozen observation, no physical game execution',passed:rows.filter(r=>r.ok).length,total:rows.length,rows},null,2));
