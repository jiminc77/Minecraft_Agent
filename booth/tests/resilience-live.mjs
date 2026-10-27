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
async function run(name,fn){try{const details=await fn();rows.push({name,ok:true,details});}catch(e){rows.push({name,ok:false,error:String(e)});}console.log(JSON.stringify(rows.at(-1)));fs.writeFileSync(new URL('../results/resilience-live.json',import.meta.url),JSON.stringify(rows,null,2));}
try{
 await reset();
 await run('a second tab cannot release another tab manual keys',async()=>{
  const other=new WS('ws://127.0.0.1:8772/ws');await new Promise(r=>other.on('open',r));
  try{send({type:'keys',keys:['forward']});await wait(h=>h.phase==='manual');
   for(let i=0;i<5;i++){other.send(JSON.stringify({type:'keys',keys:[]}));await sleep(100);}
   assert.equal((await observe()).controls.forward,true);send({type:'keys',keys:[]});await sleep(200);assert.equal((await observe()).controls.forward,false);
  }finally{other.close();send({type:'keys',keys:[]});}return{ownerRetained:true};
 });
 await reset();
 await run('latest request cancels in-flight interpretation',async()=>{
  const before=await observe();send({type:'prompt',text:'돼지 잡아 줘'});await sleep(30);const h=await prompt('하늘을 봐');await sleep(2500);const after=await observe();assert.equal(h.phase,'done');assert.equal(after.counters.attack,before.counters.attack);assert.ok(Math.abs(after.pitch-90)<3);return{phase:h.phase,counters:after.counters};
 });
 await run('stop during interpretation prevents delayed action',async()=>{
  const before=await observe();send({type:'prompt',text:'돼지 한 마리 잡아 줘'});await wait(h=>h.phase==='thinking');send({type:'stop'});await wait(h=>h.phase==='stopped');await sleep(3000);const after=await observe();assert.equal(after.counters.attack,before.counters.attack);assert.ok(!Object.values(after.controls).some(Boolean));return{phase:(await health()).phase};
 });
 await run('reset during interpretation clears stale plan',async()=>{
  send({type:'prompt',text:'돼지를 잡아 줘'});await wait(h=>h.phase==='thinking');await reset();await sleep(2500);const h=await health();assert.equal(h.phase,'ready');assert.equal(h.chat.length,0);return{phase:h.phase};
 });
 await run('past report produces no attack',async()=>{
  const before=await observe();const h=await prompt('아까 돼지 잡으라고 했었어');const after=await observe();assert.ok(['reply','clarify','unavailable'].includes(h.chat.at(-1)?.status));assert.equal(after.counters.attack,before.counters.attack);return{phase:h.phase,message:h.message};
 });
 await run('repeated simple requests remain responsive',async()=>{
  for(let i=0;i<8;i++){const h=await prompt(i%2?'땅을 봐':'하늘을 봐');assert.equal(h.phase,'done');const o=await observe();assert.ok(Math.abs(o.pitch-(i%2?-90:90))<3);}return{completed:8};
 });
 await run('manual takeover cancels in-flight interpretation',async()=>{
  const before=await observe();send({type:'prompt',text:'돼지 잡아 줘'});await wait(h=>h.phase==='thinking');send({type:'keys',keys:['forward']});await wait(h=>h.phase==='manual');await sleep(200);send({type:'keys',keys:[]});await sleep(2500);const after=await observe();assert.equal(after.counters.attack,before.counters.attack);assert.ok(!Object.values(after.controls).some(Boolean));return{phase:(await health()).phase};
 });
 await reset();
}finally{ws.close();socket.close();}
process.exit(rows.every(r=>r.ok)?0:1);
