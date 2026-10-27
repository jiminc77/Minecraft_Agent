import {treeBlocks,carveStairs,landingCandidates} from './booth_geometry.js';
import pf from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { boothActionsList } from './commands/booth_actions.js';
import { validatePlan } from './booth_contract.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const DEG=Math.PI/180;
export function halt(bot){
 bot.interrupt_code=true;
 bot.clearControlStates();
 bot.pathfinder?.setGoal(null);
 bot.pvp?.stop();
 bot.stopDigging();
}
export async function executeBooth(agent,data,observe){
 const current=()=>agent.boothSession===data.session && agent.boothEpoch===data.epoch;
 if(!current() || agent.boothExecuted===`${data.session}:${data.epoch}`)return {ok:false,message:'취소되었거나 이미 처리한 요청이에요.'};
 agent.boothExecuted=`${data.session}:${data.epoch}`;
 try{validatePlan(data.plan,observe(agent));}catch{return {ok:false,message:'대상이나 명령을 확인할 수 없어 실행하지 않았어요.'};}
 let expired=false;
 const timer=setTimeout(()=>{expired=true;if(current())halt(agent.bot);},80000);
 const steps=data.plan.action.type==='sequence'?data.plan.action.steps:[data.plan.action],results=[];
 try{
  for(let i=0;i<steps.length;i++){
   if(!current()||expired)break;
   agent.boothProgress={session:data.session,epoch:data.epoch,message:`${i+1}/${steps.length} 단계 실행 중`};
   const result=await executeSingle(agent,{...data,plan:{kind:'execute',message:data.plan.message,action:steps[i]}},observe);
   results.push(result);if(!result.ok)break;
  }
  if(!current())return {ok:false,message:'새 입력으로 목표를 중단했어요.',results};
  if(steps.length===1)return results[0]||{ok:false,message:'시간 제한으로 중단했어요.'};
  const completed=results.filter(r=>r.ok).length,ok=completed===steps.length&&!expired;
  return {ok,message:ok?`${steps.length}단계를 완료했어요. ${results.map(r=>r.message).join(' ')}`:`${steps.length}단계 중 ${completed}단계 완료 후 멈췄어요. ${results.at(-1)?.message||'시간이 초과되었어요.'}`,results,completed};
 }finally{clearTimeout(timer);if(current())agent.boothProgress=null;}
}
async function executeSingle(agent,data,observe){
 const bot=agent.bot;
 const current=()=>agent.boothSession===data.session && agent.boothEpoch===data.epoch;
 if(!current())return {ok:false,message:'취소된 요청이에요.'};
 const before=observe(agent);
 try {validatePlan(data.plan,before);}catch{return {ok:false,message:'대상이나 명령을 확인할 수 없어 실행하지 않았어요.'};}
 const a=data.plan.action;
 if(!a)return {ok:false,message:'실행할 행동이 없어요.'};
 const target=before.targets.find(t=>t.key===a.target);
 let ok=false, detail='', count=0, killed=false;
 let timer;
 const alive=()=>current() && !bot.interrupt_code;
 const oldMovements=bot.pathfinder.movements;
 const safe=new pf.Movements(bot);safe.canDig=false;safe.scafoldingBlocks=[];safe.allow1by1towers=false;safe.allowParkour=false;
 bot.pathfinder.setMovements(safe);
 const goalAction=['tree','carve','travel','land','navigate'].includes(a.type);
 const deadline=Date.now()+(goalAction?75000:25000);
 const progress=message=>{if(current())agent.boothProgress={session:data.session,epoch:data.epoch,message};};
 const read=p=>bot.blockAt(new Vec3(p.x,p.y,p.z));
 function visible(b){
  const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0),delta=b.position.offset(.5,.5,.5).minus(eye);
  const distance=delta.norm();
  const hit=bot.world.raycast(eye,delta.normalize(),distance+.1);
  return hit?.position.equals(b.position);
 }
 async function digExact(p,name){
  const b=read(p);if(!alive()||Date.now()>=deadline||b?.name!==name||!bot.canDigBlock(b)||!visible(b))return false;
  await bot.dig(b,true);await sleep(100);
  if(read(p)?.name===name)return false;count++;return true;
 }
 async function approach(entity,distance){
  bot.pathfinder.setGoal(new pf.goals.GoalFollow(entity,distance),true);
  while(alive() && Date.now()<deadline && entity.isValid!==false && bot.entities[entity.id]) {
   if(bot.entity.position.distanceTo(entity.position)<=distance+.25){bot.pathfinder.setGoal(null);return true;}
   await sleep(50);
  }
  bot.pathfinder.setGoal(null);return false;
 }
 try {
  timer=setTimeout(()=>{if(current())halt(bot);},goalAction?76000:26000);
  if(['move','turn','look','jump'].includes(a.type)) {
   // Reuse Mindcraft booth actions, but guard their callback after ActionManager's await.
   const name={move:'!move',turn:'!turn',look:'!lookVertical',jump:'!jump'}[a.type];
   const command=boothActionsList.find(c=>c.name===name);
   const guarded=Object.create(agent);
   guarded.actions={runAction:(label,fn,opts)=>agent.actions.runAction(label,async()=>{if(current())await fn();},opts)};
   await command.perform(guarded,...(a.type==='move'?[a.direction,a.amount]:[a.amount]));
   if(!current())return {ok:false,message:'새 입력으로 행동을 중단했어요.'};
   await sleep(250);
   const after=observe(agent), dx=after.pos.x-before.pos.x,dz=after.pos.z-before.pos.z;
   if(a.type==='move') {
    const yaw=before.yaw*DEG, f=-dx*Math.sin(yaw)-dz*Math.cos(yaw), r=dx*Math.cos(yaw)-dz*Math.sin(yaw);
    const vectors={forward:[1,0],back:[-1,0],left:[0,-1],right:[0,1],forward_left:[1,-1],forward_right:[1,1],back_left:[-1,-1],back_right:[-1,1]};
    const [vf,vr]=vectors[a.direction], norm=Math.hypot(vf,vr), along=(f*vf+r*vr)/norm, side=Math.abs(f*vr-r*vf)/norm;
    ok=Math.abs(along-a.amount)<.65 && side<.7;
    detail=`${Math.hypot(dx,dz).toFixed(1)}칸 이동했어요.${ok?'':' 요청한 거리까지 이동하지 못했어요.'}`;
   }else if(a.type==='jump'){count=after.jumps-before.jumps;ok=count===a.amount;detail=`${count}번 점프했어요.${ok?'':' 요청한 횟수를 완료하지 못했어요.'}`;}
   else {
    const wrap=n=>((n+540)%360)-180;
    ok=a.type==='look'?Math.abs(after.pitch-a.amount)<3:Math.abs(wrap(before.yaw-after.yaw-a.amount))<3;
    detail=ok?'시점을 바꿨어요.':'요청한 시점으로 바꾸지 못했어요.';
   }
  }else if(a.type==='stop'){ok=true;detail='행동을 멈췄어요.';}
  else {
   const result=await agent.actions.runAction(`booth:${a.type}`,async()=>{
    if(!current())return;
    if(a.type==='approach'||a.type==='attack'){
     const entity=bot.entities[target.id];
     if(!entity || entity.name!==target.name)return;
     if(a.type==='approach'){ok=await approach(entity,2);detail=ok?'대상 가까이 이동했어요.':'대상에 도달하지 못했어요.';return;}
     const died=e=>{if(e.id===entity.id)killed=true;};bot.on('entityDead',died);
     try {
      // Reuse upstream PvP targeting while retaining a bounded, explicit entity ID.
      bot.pvp.attack(entity);
      while(alive() && Date.now()<deadline && !killed && bot.entities[entity.id])await sleep(50);
      ok=killed;detail=ok?'지정한 동물을 잡았어요.':'동물을 잡았는지 확인하지 못해 멈췄어요.';
     }finally{bot.removeListener('entityDead',died);bot.pvp.stop();}
    }else if(a.type==='navigate'){
     const p=a.position;
     try{await bot.pathfinder.goto(new pf.goals.GoalBlock(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z)));}catch{detail='이동할 경로를 완료하지 못했어요.';return;}
     await sleep(200);ok=alive()&&Math.hypot(bot.entity.position.x-p.x,bot.entity.position.z-p.z)<=.65&&Math.abs(bot.entity.position.y-p.y)<1;
     detail=ok?'목표 위치에 도착했어요.':'목표 위치 도착을 확인하지 못했어요.';
    }else if(a.type==='travel'){
     const controls={forward:['forward'],back:['back'],left:['left'],right:['right'],forward_left:['forward','left'],forward_right:['forward','right'],back_left:['back','left'],back_right:['back','right']}[a.direction];
     const start=bot.entity.position.clone();let reached=false,stuckSince=null,last=start.clone(),blocked=false;
     const travelled=()=>Math.hypot(bot.entity.position.x-start.x,bot.entity.position.z-start.z);
     const tick=()=>{if(a.distance!==null&&travelled()>=a.distance-.15){reached=true;bot.clearControlStates();}};
     bot.on('physicsTick',tick);
     try{
      for(const key of controls)bot.setControlState(key,true);
      while(alive()&&Date.now()<deadline&&!reached){
       bot.setControlState('jump',(a.jumping&&(a.distance===null||a.distance-travelled()>3))||bot.entity.isCollidedHorizontally||bot.entity.isInWater);
       if(bot.entity.position.distanceTo(last)<.01){stuckSince??=Date.now();if(Date.now()-stuckSince>1800){blocked=true;break;}}else stuckSince=null;
       last=bot.entity.position.clone();progress(`${a.jumping?'점프하며 ':''}${travelled().toFixed(1)}칸 이동 중${a.distance===null?'':` / ${a.distance}칸`}`);
       await sleep(50);
      }
     }finally{bot.removeListener('physicsTick',tick);bot.clearControlStates();}
     await sleep(250);
     const distance=travelled();ok=a.distance!==null&&reached&&Math.abs(distance-a.distance)<.65;
     detail=`${distance.toFixed(1)}칸 이동했어요. ${ok?'요청한 이동을 완료했어요.':blocked?'앞으로 나아갈 수 없어 멈췄어요.':a.distance===null?'이동 시간 제한에 도달해 멈췄어요.':'목표 거리에 도달하지 못해 멈췄어요.'}`;
    }else if(a.type==='land'){
     const candidates=landingCandidates(read,bot.entity.position,bot.entity.yaw,a.direction);
     const destination=candidates.find(c=>{
      const b=read(c.support),eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0);
      const delta=b.position.offset(.5,.99,.5).minus(eye),distance=delta.norm();
      const hit=bot.world.raycast(eye,delta.normalize(),distance+.1,block=>block.boundingBox==='block');
      return hit?.position.equals(b.position);
     });
     if(!destination){detail='말씀하신 방향에서 올라설 수 있는 육지를 찾지 못했어요.';return;}
     const p=destination.feet;progress('발판과 머리 공간을 확인한 육지로 이동 중이에요.');
     try{await bot.pathfinder.goto(new pf.goals.GoalBlock(p.x,p.y,p.z));}catch{detail='육지는 찾았지만 올라갈 경로를 완료하지 못했어요.';return;}
     await sleep(200);
     const feet=bot.entity.position.floored();
     ok=alive()&&bot.entity.position.distanceTo(new Vec3(p.x+.5,p.y,p.z+.5))<1&&!bot.entity.isInWater&&read(feet.offset(0,-1,0))?.boundingBox==='block';
     detail=ok?'물 밖의 육지에 올라왔어요.':'육지 도착을 확인하지 못해 멈췄어요.';
    }else if(a.type==='tree'){
     let shape;
     try{shape=treeBlocks(read,target.pos);}catch(e){detail=e.message;return;}
     // Freeze the connected tree before the first dig; never switch to another tree.
     const remaining=[...shape.blocks];
     while(alive() && Date.now()<deadline && remaining.length){
      remaining.sort((p,q)=>p.y-q.y || bot.entity.position.distanceTo(new Vec3(p.x,p.y,p.z))-bot.entity.position.distanceTo(new Vec3(q.x,q.y,q.z)));
      const p=remaining[0],b=read(p);
      if(b?.name!==shape.name){detail='나무가 바뀌어 남은 작업을 중단했어요.';break;}
      if(bot.entity.position.distanceTo(b.position)>3 || !visible(b)){
       try{await bot.pathfinder.goto(new pf.goals.GoalNear(p.x,Math.floor(bot.entity.position.y),p.z,2));}catch{detail='남은 원목에 닿을 경로가 없어요.';break;}
      }
      if(!await digExact(p,shape.name)){detail='남은 원목에 닿지 못했어요.';break;}
      remaining.shift();progress(`이 나무의 원목 ${count}/${shape.blocks.length}개를 캤어요.`);
     }
     ok=remaining.length===0;
     detail=`이 나무의 원목 ${count}/${shape.blocks.length}개를 캤어요. ${ok?'원목 채굴을 완료했어요. 잎은 남겼어요.':detail||'시간 제한으로 멈췄어요.'}`;
    }else if(a.type==='carve'){
     let shape;
     try{shape=carveStairs(read,bot.entity.position,target.pos);}catch(e){detail=e.message;return;}
     let completed=0;
     for(const stage of shape.stages){
      if(!alive()||Date.now()>=deadline)break;
      for(const p of stage.remove){
       if(!await digExact(p,p.name)){detail='다음 흙 블록에 닿지 못해 멈췄어요.';break;}
       progress(`계단을 깎고 있어요. 흙 ${count}개 제거, ${completed}/${shape.rise}단 도달.`);
      }
      if(detail)break;
      if(!alive())break;
      // Recheck both headroom and foothold immediately before ascending.
      const p=stage.feet;
      if(read({...p,y:p.y-1})?.boundingBox!=='block'||read(p)?.boundingBox!=='empty'||read({...p,y:p.y+1})?.boundingBox!=='empty'){detail='계단 공간이 바뀌어서 멈췄어요.';break;}
      try{await bot.pathfinder.goto(new pf.goals.GoalBlock(p.x,p.y,p.z));}catch{detail='깎은 계단에 올라가지 못했어요.';break;}
      if(!alive()||bot.entity.position.distanceTo(new Vec3(p.x+.5,p.y,p.z+.5))>1){detail='계단 도착을 확인하지 못했어요.';break;}
      completed++;progress(`${completed}/${shape.rise}단 올라갔어요. 흙 ${count}개 제거.`);
     }
     ok=completed===shape.rise;
     detail=`흙 ${count}개를 깎고 ${completed}/${shape.rise}단 올라갔어요. ${ok?'계단 길을 완성했어요.':detail||'시간 제한으로 멈췄어요.'}`;
    }else if(a.type==='dig'){
     let block=bot.blockAt(new Vec3(target.pos.x,target.pos.y,target.pos.z));
     while(alive() && Date.now()<deadline && count<a.amount){
      if(!block || block.name!==target.name)break;
      if(bot.entity.position.distanceTo(block.position) > 4){
       try{await bot.pathfinder.goto(new pf.goals.GoalNear(block.position.x,block.position.y,block.position.z,3));}catch{break;}
      }
      block=bot.blockAt(block.position);
      if(!alive() || block?.name!==target.name || !bot.canDigBlock(block))break;
      const pos=block.position.clone();
      await bot.dig(block,true);
      await sleep(100);
      if(bot.blockAt(pos)?.name===target.name)break;
      count++;
      // Bounded pickup uses the same non-digging pathfinder. It cannot break a
      // second block to reach a drop, unlike a general collect-block task.
      bot.pathfinder.setGoal(new pf.goals.GoalNear(pos.x,pos.y,pos.z,1));
      const pickupDeadline=Math.min(deadline,Date.now()+2200);
      while(alive() && Date.now()<pickupDeadline){
       if(bot.entity.position.distanceTo(pos.offset(.5,0,.5))<1.5){await sleep(300);break;}
       await sleep(50);
      }
      bot.pathfinder.setGoal(null);
      // Every next dig is budgeted before it begins; navigation cannot break blocks.
      if(count<a.amount)block=bot.findBlock({matching:b=>b.name===target.name,maxDistance:12});
     }
     ok=count===a.amount;detail=`블록 ${count}개를 캤어요.${ok?'':' 요청한 수량을 완료하지 못했어요.'}`;
    }
   },{timeout:goalAction?1.3:.5});
   if(!result.success || result.interrupted)ok=false;
  }
 }catch(error){detail='장애물이나 대상 변화 때문에 행동을 완료하지 못했어요.';console.error('booth execution',error);}
 finally {
  clearTimeout(timer);
  if(current()){bot.pathfinder.setGoal(null);bot.pvp.stop();bot.clearControlStates();bot.pathfinder.setMovements(oldMovements);}
 }
 if(!current())return {ok:false,message:'새 입력으로 행동을 중단했어요.'};
 const after=observe(agent);
 if(a.type==='move'||(a.type==='travel'&&a.distance!==null)){
  const requested=a.type==='travel'?a.distance:a.amount;
  const dx=after.pos.x-before.pos.x,dz=after.pos.z-before.pos.z,yaw=before.yaw*DEG;
  const f=-dx*Math.sin(yaw)-dz*Math.cos(yaw),r=dx*Math.cos(yaw)-dz*Math.sin(yaw);
  const vectors={forward:[1,0],back:[-1,0],left:[0,-1],right:[0,1],forward_left:[1,-1],forward_right:[1,1],back_left:[-1,-1],back_right:[-1,1]};
  const [vf,vr]=vectors[a.direction],norm=Math.hypot(vf,vr);
  ok=ok&&Math.abs((f*vf+r*vr)/norm-requested)<.65&&Math.abs(f*vr-r*vf)/norm<.7;
  detail=`${Math.hypot(dx,dz).toFixed(1)}칸 이동했어요.${ok?'':' 요청한 거리와 다르게 이동해 멈췄어요.'}`;
 }
 if(!['attack','dig','tree','carve'].includes(a.type) && (after.counters.attack!==before.counters.attack||after.counters.dig!==before.counters.dig)){ok=false;detail='요청하지 않은 동작이 감지되어 멈췄어요.';}
 return {ok,message:detail||'대상이 없어 행동을 완료하지 못했어요.',before,after,count,evidence:{action:a.type,targetKey:a.target||null,targetDead:a.type==='attack'?killed:null,removedBlocks:count}};
}
