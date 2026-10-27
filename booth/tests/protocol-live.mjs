import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url));const{io}=require('socket.io-client');const WebSocket=require('ws');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mind=io('http://127.0.0.1:8086'),ws=new WebSocket('ws://127.0.0.1:8772/ws');await Promise.all([new Promise(r=>mind.on('connect',r)),new Promise(r=>ws.on('open',r))]);
const emit=(event,...args)=>new Promise((resolve,reject)=>mind.timeout(35000).emit(event,'Steve',...args,(err,v)=>err?reject(err):resolve(v)));
const control=d=>emit('booth-control',d),state=()=>emit('booth-state'),session=crypto.randomUUID();
const results=[];
async function run(name,fn){try{results.push({name,ok:true,details:await fn()});}catch(error){results.push({name,ok:false,error:String(error)});}console.log(results.at(-1));}
const plan={kind:'execute',message:'점프',action:{type:'jump',amount:1}};
await run('duplicate request rejected without second jump',async()=>{await control({type:'stop',session,epoch:1});const b=await state();assert.equal((await control({type:'execute',session,epoch:1,plan})).ok,true);assert.equal((await control({type:'execute',session,epoch:1,plan})).ok,false);assert.equal((await state()).jumps-b.jumps,1);});
await run('old request rejected after epoch changes',async()=>{await control({type:'stop',session,epoch:2});const b=await state();assert.equal((await control({type:'execute',session,epoch:1,plan})).ok,false);assert.equal((await state()).jumps,b.jumps);});
await run('invalid action arguments rejected on agent side',async()=>{await control({type:'stop',session,epoch:3});const b=await state();const result=await control({type:'execute',session,epoch:3,plan:{...plan,action:{type:'move',direction:'left_forward',amount:3}}});assert.equal(result.ok,false);assert.deepEqual((await state()).pos,b.pos);});
await run('invented entity target rejected on agent side',async()=>{await control({type:'stop',session,epoch:4});const b=await state();assert.equal((await control({type:'execute',session,epoch:4,plan:{...plan,action:{type:'attack',target:'entity:99999999'}}})).ok,false);assert.equal((await state()).counters.attack,b.counters.attack);});
await run('empty and overlong input rejected before model',async()=>{const errors=[];const onMessage=(d,b)=>{if(!b){const m=JSON.parse(d);if(m.type==='input_error')errors.push(m);}};ws.on('message',onMessage);ws.send(JSON.stringify({type:'prompt',text:'   '}));ws.send(JSON.stringify({type:'prompt',text:'가'.repeat(121)}));await sleep(400);ws.off('message',onMessage);assert.equal(errors.length,2);});
ws.send(JSON.stringify({type:'reset'}));await sleep(5000);
fs.writeFileSync(new URL('../results/protocol-live.json',import.meta.url),JSON.stringify(results,null,2));mind.close();ws.close();process.exit(results.every(x=>x.ok)?0:1);
