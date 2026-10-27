import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url));const{io}=require('socket.io-client');const WebSocket=require('ws');const{Rcon}=await import('../gateway/rcon.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const health=async()=>await(await fetch('http://127.0.0.1:8772/health')).json();
async function until(fn,timeout=95000){let end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(80);}throw Error('timeout');}
await until(async()=>{try{return (await health()).phase==='ready';}catch{return false;}});
const mind=io('http://127.0.0.1:8086'),ws=new WebSocket('ws://127.0.0.1:8772/ws');await Promise.all([new Promise(r=>mind.on('connect',r)),new Promise(r=>ws.on('open',r))]);
const emit=(event,...args)=>new Promise((resolve,reject)=>mind.timeout(35000).emit(event,'Steve',...args,(err,v)=>err?reject(err):resolve(v)));
const state=()=>emit('booth-state');const send=d=>ws.send(JSON.stringify(d));
const rcon=new Rcon({port:25581,password:fs.readFileSync(new URL('../rcon.secret',import.meta.url),'utf8').trim()});const cmd=s=>rcon.command(s);
const results=[];const output=new URL('../results/natural-live.json',import.meta.url);
async function reset(){send({type:'reset'});await sleep(200);await until(async()=>{const h=await health();return h.phase==='ready';});await cmd('tp Steve 330.5 87 -349.5 0 0');await sleep(400);}
async function ask(text){send({type:'prompt',text});return until(async()=>{const h=await health();return h.korean===text && ['done','clarify','unavailable','error'].includes(h.phase)?h:false;});}
async function run(name,fn){await reset();const before=await state(),start=Date.now();let result;try{result={name,ok:true,details:await fn(before)};}catch(e){result={name,ok:false,error:String(e)};}result.ms=Date.now()-start;result.before=before;result.after=await state();results.push(result);fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify({name,ok:result.ok,error:result.error,details:result.details,ms:result.ms}));}
// Flat repeatable fixture, backed up only inside this isolated Minecraft server.
for(const s of ['gamerule commandModificationBlockLimit 250000','gamerule randomTickSpeed 0','forceload add 306 -373 354 -325','forceload add 2306 -373 2354 -325'])await cmd(s);
await sleep(1000);
for(const s of ['fill 306 87 -373 354 110 -325 air','fill 306 84 -373 354 85 -325 stone','fill 306 86 -373 354 86 -325 grass_block','setblock 334 87 -349 dirt','fill 330 87 -342 330 90 -342 oak_log','fill 329 91 -343 331 92 -341 oak_leaves[persistent=true]','clone 306 70 -373 354 110 -325 2306 70 -373 replace force'])await cmd(s);


await cmd('forceload add 992 992 1120 1008');await sleep(1500);
async function flat(){
 await cmd('fill 998 87 998 1110 92 1002 air');await cmd('fill 998 86 998 1110 86 1002 stone');
 await cmd('tp Steve 1000.5 87 1000.5 -90 0');await sleep(500);
 return state();
}
await run('100 blocks is executed without truncating to 30',async()=>{const b=await flat();const h=await ask('걸어가자 앞으로 100칸');assert.equal(h.phase,'done');const s=await state();assert.ok(Math.abs(s.pos.x-b.pos.x-100)<.65);return{message:h.message,distance:s.pos.x-b.pos.x};});
await run('jumping overlaps with forward motion',async()=>{const b=await flat();send({type:'prompt',text:'점프하면서 10칸 앞으로 가자'});let overlap=false,lastY=b.pos.y,rising=false,ascents=0;const h=await until(async()=>{const s=await state();if(s.controls.forward&&s.controls.jump)overlap=true;if(s.pos.y>lastY+.02){if(!rising)ascents++;rising=true;}else if(s.pos.y<lastY-.02)rising=false;lastY=s.pos.y;const h=await health();return h.korean==='점프하면서 10칸 앞으로 가자'&&['done','clarify','unavailable','error'].includes(h.phase)?h:false;});assert.equal(h.phase,'done');const s=await state();assert.ok(overlap);assert.ok(ascents>=2,`observed ${ascents} upward arcs`);assert.ok(Math.abs(s.pos.x-b.pos.x-10)<.65);return{message:h.message,jumps:s.jumps-b.jumps,ascents,overlap};});
await run('continuous walking proceeds beyond old default until button stop',async()=>{const b=await flat();send({type:'prompt',text:'멈추지 말고 쭉 가라고'});await until(async()=>(await state()).pos.x-b.pos.x>8,15000);send({type:'stop'});await until(async()=>(await health()).phase==='stopped');const s=await state();assert.ok(!s.controls.forward);return{distance:s.pos.x-b.pos.x,message:(await health()).message};});
await run('new utterance cancels continuous walking',async()=>{await flat();send({type:'prompt',text:'앞으로 멈추지 말고 걸어가'});await until(async()=>(await state()).controls.forward,15000);const h=await ask('하늘을 봐');assert.equal(h.phase,'done');const s=await state();assert.ok(!s.controls.forward);assert.ok(s.pitch>85);return{message:h.message};});
await run('swim to forward dry land',async()=>{
 await flat();await cmd('fill 1007 87 998 1110 87 1002 dirt');await cmd('fill 998 87 998 1006 87 1002 water');await cmd('tp Steve 1001.5 87 1000.5 -90 0');await sleep(700);
 const h=await ask('앞의 육지까지 가자');assert.equal(h.phase,'done');const s=await state();assert.ok(s.pos.x>=1007);assert.ok(s.pos.y>=87);return{message:h.message,pos:s.pos};
});
await run('no land found does not invent a destination',async()=>{
 await flat();await cmd('fill 998 87 998 1035 87 1002 water');await cmd('tp Steve 1001.5 87 1000.5 -90 0');await sleep(700);
 // Extend water across the entire forward cone to exclude sideways shore.
 await cmd('fill 1002 86 976 1026 86 1024 stone');await cmd('fill 1002 87 976 1026 87 1024 water');await cmd('fill 1002 88 976 1026 93 1024 air');await sleep(500);
 const b=await state();const h=await ask('앞의 육지까지 가자');assert.ok(['unavailable','clarify'].includes(h.phase));const s=await state();assert.equal(s.counters.dig,b.counters.dig);assert.equal(s.counters.attack,b.counters.attack);return{message:h.message};
});
await run('oversized travel is rejected without clamping',async()=>{const b=await flat();const h=await ask('앞으로 1000칸 가자');assert.ok(['clarify','unavailable'].includes(h.phase));const s=await state();assert.ok(Math.hypot(s.pos.x-b.pos.x,s.pos.z-b.pos.z)<.2);return{message:h.message};});
await reset();console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,total:results.length}));mind.close();ws.close();process.exit(results.every(r=>r.ok)?0:1);
