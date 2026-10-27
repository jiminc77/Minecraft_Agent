// Independent command-form interpretation using the existing Mindcraft booth
// profile and command syntax. No proposal is included in this model input.
import {hasVerifiedQuantity} from './quantity.js';
import {readFileSync} from 'node:fs';
const profile=JSON.parse(readFileSync(new URL('../booth-profile.json',import.meta.url)));
const docs=`!move(direction, blocks): Walk relative to current facing without turning. Directions: forward, back, left, right, forward_left, forward_right, back_left, back_right. Unspecified short distance is 2 blocks.
!turn(degrees): Turn body/view horizontally IN PLACE; positive=right, negative=left, 180=turn around. Do not walk.
!lookVertical(degrees): Set vertical pitch: 90=sky, 0=level, -90=ground. Do not walk.
!jump(times): Jump in place a specified number of times.
!stop(): Stop current action.`;
export function parseMotionCommand(command){
 const m=command.match(/!(move|turn|lookVertical|jump|stop)\(([^)]*)\)/)||command.match(/!(stop)\b/);
 if(!m)return null;
 let args;try{args=JSON.parse('['+(m[2]||'')+']');}catch{return null;}
 const type={move:'move',turn:'turn',lookVertical:'look',jump:'jump',stop:'stop'}[m[1]];
 if(type==='stop')return {type};
 return type==='move'?{type,direction:args[0],amount:args[1]}:{type,amount:args[0]};
}
export function agrees(command,a,quantityVerified=false){
 const m=command.match(/!(move|turn|lookVertical|jump|stop)\(([^)]*)\)/)||command.match(/!(stop)\b/);
 if(!m)return false;
 let args;try{args=JSON.parse('['+(m[2]||'')+']');}catch{return false;}
 if(a.type==='move')return m[1]==='move'&&args[0]===a.direction&&(quantityVerified||Math.abs(args[1]-a.amount)<.1);
 if(a.type==='jump')return m[1]==='jump'&&(quantityVerified||args[0]===a.amount);
 if(a.type==='turn')return m[1]==='turn'&&Math.abs(((args[0]-a.amount+540)%360)-180)<3;
 if(a.type==='look')return m[1]==='lookVertical'&&Math.abs(args[0]-a.amount)<=15;
 return a.type==='stop'&&m[1]==='stop';
}
export async function reviewMotion(planner,text,context,action,signal,details=false){
 const examples=profile.conversation_examples.filter(ex=>/!(move|turn|lookVertical|jump)\(/.test(ex.at(-1).content));
 const system=profile.conversing.replace('$NAME','Steve').replace('$STATS',JSON.stringify({last_completed_action:context.lastAction||null})).replace('$INVENTORY','').replace('$COMMAND_DOCS',docs).replace('$EXAMPLES','').replace('(2-3 blocks)','(2 blocks)');
 const messages=[{role:'system',content:system},...examples.flat()];
 if(context.pending){messages.push({role:'user',content:context.pending.utterance},{role:'assistant',content:context.pending.question});}
 messages.push({role:'user',content:'visitor: '+text});
 const r=await planner.fetchImpl(`${planner.url}/chat/completions`,{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:planner.model,messages,temperature:0,max_tokens:100})});
 if(!r.ok)throw Error('motion_review_unavailable');
 const data=await r.json(),raw=data.choices?.[0]?.message?.content||'';
 const ok=data.choices?.[0]?.finish_reason==='stop'&&agrees(raw,action,hasVerifiedQuantity(text,action));
 planner.audit({stage:'motion_review',text,context,raw,action,agrees:ok});
 return details?{ok,alternative:data.choices?.[0]?.finish_reason==='stop'?parseMotionCommand(raw):null}:ok;
}
