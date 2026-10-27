import {ground} from './target-grounding.js';
const vectors={forward:[1,0],back:[-1,0],left:[0,-1],right:[0,1],forward_left:[1,-1],forward_right:[1,1],back_left:[-1,-1],back_right:[-1,1]};
export const endpoint=(state,s)=>{const [f,r]=vectors[s.direction],y=state.yaw*Math.PI/180,n=Math.hypot(f,r);return{x:state.pos.x+(-Math.sin(y)*f+Math.cos(y)*r)*s.amount/n,y:state.pos.y,z:state.pos.z+(-Math.cos(y)*f-Math.sin(y)*r)*s.amount/n};};
export async function runGoal(goal,{observe,execute,signal,queryObservation,audit=()=>{},maxCalls=12}){
 let calls=0;const results=[];
 const alive=()=>{if(signal?.aborted)throw Error('cancelled');};
 async function act(action){alive();if(++calls>maxCalls)throw Error('action_budget');const result=await execute({kind:'execute',message:'목표를 수행하고 있어요.',action});alive();if(!result||typeof result.ok!=='boolean')throw Error('execution_unconfirmed');audit({stage:'step_execution',action,result});return result;}
 for(const [index,step] of goal.steps.entries()){
  alive();const before=step.selector&&queryObservation?await queryObservation({...step.selector,action:step.type},signal):await observe();alive();
  const bound=ground(step,before);if(!bound.ok)return{ok:false,kind:bound.kind,message:bound.message,results,calls,...(bound.kind==='clarify'?{pendingGoal:{...goal,steps:goal.steps.slice(index)}}:{})};
  let result;
  if(step.type==='move'){
   // Freeze the world-space goal once. A failed move must never repeat its full distance.
   const destination=endpoint(before,step);
   result=await act(step.amount<=30?{type:'move',direction:step.direction,amount:step.amount}:{type:'travel',direction:step.direction,distance:step.amount,jumping:false});
   let after=await observe();alive();
   const distance=()=>Math.hypot(after.pos.x-destination.x,after.pos.z-destination.z);
   if(distance()>.65){
    audit({stage:'replan',reason:'position_goal_not_reached',destination,observed:after.pos,remaining:distance()});
    // Generic navigation provides an alternative route; it cannot dig/place or change the goal.
    result=await act({type:'navigate',position:destination});after=await observe();alive();
   }
   result={...result,ok:result.ok&&distance()<=.65,message:result.ok&&distance()<=.65?'목표 위치에 도착했어요.':'경로를 바꿔도 목표 위치에 도착하지 못했어요.'};
  }else{
   const action={type:step.type};if(step.type==='travel'){action.direction=step.direction;action.distance=step.distance;action.jumping=step.jumping;}if(step.type==='land')action.direction=step.direction;if(['turn','look','jump','dig'].includes(step.type))action.amount=step.amount;if(bound.target)action.target=bound.target.key;
   result=await act(action);
   let after=await observe();alive();
   if(step.type==='attack'&&(result.evidence?.targetDead!==true||result.evidence?.targetKey!==bound.target.key))result={...result,ok:false,message:'선택한 동물의 사망을 확인하지 못했어요. 잡았다고 보고하지 않을게요.'};
   if(step.type==='approach'){
    let target=after.targets.find(t=>t.key===bound.target.key);
    if(result.ok&&target&&target.dist>3.5){
     audit({stage:'replan',reason:'selected_entity_moved',target:bound.target.key,distance:target.dist});
     result=await act(action);after=await observe();alive();
     target=after.targets.find(t=>t.key===bound.target.key);
    }
    const arrived=result.ok&&!!target&&target.dist<=3.5;
    result={...result,ok:arrived,message:arrived?result.message:'대상과의 최종 거리를 확인했지만 도착 기준을 만족하지 못했어요.'};
   }
  }
  results.push(result);if(!result.ok)return{ok:false,kind:'unavailable',message:result.message,results,calls};
 }
 return{ok:true,kind:'done',message:results.map(r=>r.message).join(' '),results,calls};
}
