import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url)),WS=require('ws'),{io}=require('socket.io-client');
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8772/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const ws=new WS('ws://127.0.0.1:8772/ws'),socket=io('http://127.0.0.1:8086');await Promise.all([new Promise(r=>ws.on('open',r)),new Promise(r=>socket.on('connect',r))]);
const health=async()=>await(await fetch('http://127.0.0.1:8772/health')).json();const send=d=>ws.send(JSON.stringify(d));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const observe=()=>new Promise((r,j)=>socket.timeout(10000).emit('booth-state','Steve',(e,v)=>e?j(e):r(v)));
async function wait(fn,seconds=60){const end=Date.now()+seconds*1000;while(Date.now()<end){const h=await health();if(fn(h))return h;await sleep(100);}throw Error('timeout');}
async function prompt(text){const before=await health(),lastId=before.chat.at(-1)?.id;send({type:'prompt',text});return wait(h=>h.korean===text&&h.chat.at(-1)?.id!==lastId&&h.chat.at(-1)?.role==='assistant'&&!['thinking','running','stopping'].includes(h.phase));}
async function reset(){send({type:'reset'});await wait(h=>h.phase==='resetting');await wait(h=>h.phase==='ready');}
const rows=[];
async function run(name,fn){try{const details=await fn();rows.push({name,ok:true,details});}catch(e){rows.push({name,ok:false,error:String(e)});}console.log(JSON.stringify(rows.at(-1)));fs.writeFileSync(new URL('../results/redesign-live.json',import.meta.url),JSON.stringify(rows,null,2));}
try{
 await reset();
 await run('attack request verifies actual death, not arrival',async()=>{const before=await observe();const h=await prompt('가장 가까운 돼지 한 마리 잡아줘');const after=await observe();assert.equal(h.phase,'done');assert.ok(after.counters.attack>before.counters.attack);assert.match(h.message,/잡았어요/);return{state:h,before:before.counters,after:after.counters};});
 // Attack may chase the pig beyond the cow's observation radius. Restore the approach fixture.
 await reset();
 await run('attack negation approaches without attacking',async()=>{const before=await observe();const h=await prompt('소를 죽이지 말고 가까이만 가');const after=await observe();assert.equal(h.phase,'done');assert.equal(after.counters.attack,before.counters.attack);return{state:h,counters:after.counters};});
 await run('sequential jump then signed rotation',async()=>{const before=await observe();const h=await prompt('점프 한 번 하고 오른쪽으로 45도 돌아');const after=await observe();assert.equal(h.phase,'done');const wrap=x=>((x+180)%360+360)%360-180;assert.ok(Math.abs(wrap(before.yaw-after.yaw-45))<3);assert.ok(after.jumps>before.jumps);return{state:h,yaw:[before.yaw,after.yaw],jumps:[before.jumps,after.jumps]};});
 await run('clarification accepts an independent replacement',async()=>{const q=await prompt('저거 해줘');assert.equal(q.phase,'clarify');const h=await prompt('위로 30도 봐');assert.equal(h.phase,'done');const o=await observe();assert.ok(Math.abs(o.pitch-30)<3);return{question:q.message,answer:h.message};});
 await reset();
 await run('named answer resolves missing pointer and removes one block',async()=>{
  const sky=await prompt('하늘을 봐');assert.equal(sky.phase,'done');
  const q=await prompt('저거 한 개 캐줘');assert.equal(q.phase,'clarify');
  const before=await observe();const h=await prompt('흙');const after=await observe();
  assert.equal(h.phase,'done');assert.ok(after.counters.dig>before.counters.dig);assert.match(h.message,/블록 1개/);
  return{question:q.message,answer:h.message,counters:[before.counters,after.counters]};
 });
 await reset();
 await run('continuous movement is interrupted by stop button',async()=>{send({type:'prompt',text:'앞으로 계속 걸어'});await wait(h=>h.phase==='running');await sleep(300);send({type:'stop'});await wait(h=>h.phase==='stopped');await sleep(500);const a=await observe();await sleep(600);const b=await observe();assert.ok(Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z)<.1);assert.ok(!Object.values(b.controls).some(Boolean));return{pos:b.pos,controls:b.controls};});
 await run('unsupported request does not act',async()=>{const before=await observe();const h=await prompt('집을 지어줘');const after=await observe();assert.equal(h.phase,'unavailable');assert.deepEqual(before.counters,after.counters);return{state:h};});
 await run('manual takeover and reset remain available',async()=>{send({type:'keys',keys:['forward']});await wait(h=>h.phase==='manual');send({type:'keys',keys:[]});await reset();const h=await health();assert.equal(h.chat.length,0);return{phase:h.phase};});
}finally{ws.close();socket.close();}
process.exit(rows.every(r=>r.ok)?0:1);
