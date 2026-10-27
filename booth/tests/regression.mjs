// Language regression only: frozen observations, no game writes. Do not label as E2E.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {Planner} from '../gateway/goal-planner.js';
const cases=JSON.parse(fs.readFileSync(process.env.DATASET||new URL('../../experiments/2026-10-02-500/cases.json',import.meta.url)));
const base={pos:{x:330.5,y:87,z:-349.5},yaw:180,pitch:0,cursor:null,targets:[
 {key:'entity:1',kind:'entity',name:'pig',id:1,dist:7,pos:{x:337.5,y:87,z:-349.5},relative:{forward:0,right:-7,up:0}},
 {key:'entity:2',kind:'entity',name:'cow',id:2,dist:8,pos:{x:322.5,y:87,z:-349.5},relative:{forward:0,right:8,up:0}},
 {key:'entity:3',kind:'entity',name:'sheep',id:3,dist:11,pos:{x:330.5,y:87,z:-360.5},relative:{forward:-11,right:0,up:0}},
 {key:'block:330:87:-342',kind:'block',name:'oak_log',dist:7,pos:{x:330,y:87,z:-342}},
 {key:'block:334:87:-349',kind:'block',name:'dirt',dist:4,pos:{x:334,y:87,z:-349}},
 {key:'block:330:86:-350',kind:'block',name:'grass_block',dist:1,pos:{x:330,y:86,z:-350}},
]};
const rows=[];let index=0;
function grade(c,p,o){
 const e=c.expect,a=p.action;
 if(c.event)return 'system_event_not_run';
 if(e.kind==='exploratory')return p.kind==='execute'?'exploratory_action':'exploratory_nonaction';
 if(e.kind==='clarify')return p.kind==='clarify'?'appropriate_nonaction':'wrong_action';
 if(e.kind==='unavailable')return p.kind!=='execute'?'appropriate_nonaction':'wrong_action';
 if(['social','invalid'].includes(e.kind))return p.kind!=='execute'?'appropriate_nonaction':'wrong_action';
 if(p.kind!=='execute')return 'nonaction_instead_of_task';
 let ok=false;
 if(e.kind==='look')ok=a.type==='look'&&a.amount>=e.pitch[0]&&a.amount<=e.pitch[1];
 if(e.kind==='turn')ok=a.type==='turn'&&Math.abs(((a.amount-e.angle+540)%360)-180)<=5;
 if(e.kind==='move')ok=a.type==='move'&&a.direction===e.direction&&Math.abs(a.amount-e.distance)<.1;
 if(e.kind==='jump')ok=a.type==='jump'&&a.amount===e.count;
 if(e.kind==='stop')ok=a.type==='stop';
 if(e.kind==='kill')ok=a.type==='attack'&&o.targets.find(t=>t.key===a.target)?.name===e.entity;
 if(e.kind==='approach')ok=a.type==='approach'&&o.targets.find(t=>t.key===a.target)?.name===e.entity;
 if(e.kind==='collect')ok=a.type==='dig'&&a.amount===e.count&&o.targets.find(t=>t.key===a.target)?.name===e.block;
 return ok?'correct_intent':'wrong_action';
}
async function worker(){
 while(index<cases.length){const c=cases[index++];const o=structuredClone(base);let context={};
  if(c.condition==='absent'){const name=c.expect.requested?.entity||c.expect.entity||c.expect.requested?.block||c.expect.block;o.targets=o.targets.filter(t=>t.name!==name);}
  if(c.subgroup==='deictic'){const t={key:'block:330:88:-347',kind:'block',name:'oak_leaves',dist:2,pos:{x:330,y:88,z:-347}};o.targets.push(t);o.cursor=t.key;}
  const audit=[];const p=new Planner({audit:r=>audit.push(r)});const started=Date.now();let row;
  try{
   if(c.first && c.sequence_mode==='after'){
    const previous=await p.plan(c.first,o,{},AbortSignal.timeout(20000));
    if(previous.kind==='execute')context.lastAction={...previous.action,completed:true};
   }
   const normalized=c.text.replace(/\s+/g,' ').trim();
   const inputInvalid=!normalized||normalized.length>120;
   const plan=c.event||inputInvalid?null:await p.plan(normalized,o,context,AbortSignal.timeout(20000));
   row={id:c.id,text:c.text,group:c.group,expect:c.expect,plan,grade:c.event?'system_event_not_run':inputInvalid?'input_rejected':grade(c,plan,o),ms:Date.now()-started,audit};
  }catch(error){row={id:c.id,text:c.text,grade:'error',error:String(error),audit};}
  rows.push(row);fs.appendFileSync(new URL('../results/'+(process.env.OUT||'language500')+'.jsonl',import.meta.url),JSON.stringify(row)+'\n');
  if(rows.length%25===0)console.log(rows.length,rows.reduce((a,r)=>(a[r.grade]=(a[r.grade]||0)+1,a),{}));
 }
}
fs.mkdirSync(new URL('../results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../results/'+(process.env.OUT||'language500')+'.jsonl',import.meta.url),'');
await Promise.all([worker(),worker()]);
fs.writeFileSync(new URL('../results/'+(process.env.OUT||'language500')+'-summary.json',import.meta.url),JSON.stringify({mode:'language-only frozen observations; events not executed',n:rows.length,planner_sha256:createHash('sha256').update(fs.readFileSync(new URL('../gateway/goal-planner.js',import.meta.url))).digest('hex'),grades:rows.reduce((a,r)=>(a[r.grade]=(a[r.grade]||0)+1,a),{})},null,2));
