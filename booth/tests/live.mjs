import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url));
const {io}=require('socket.io-client');const WebSocket=require('ws');
const {Rcon}=await import('../gateway/rcon.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mind=io('http://127.0.0.1:8086');const ws=new WebSocket('ws://127.0.0.1:8772/ws');
await Promise.all([new Promise(r=>mind.on('connect',r)),new Promise(r=>ws.on('open',r))]);
const emit=(event,...args)=>new Promise((resolve,reject)=>mind.timeout(35000).emit(event,'Steve',...args,(err,v)=>err?reject(err):resolve(v)));
const snapshot=()=>emit('booth-state');const send=data=>ws.send(JSON.stringify(data));
const rcon=new Rcon({port:25581,password:fs.readFileSync(new URL('../rcon.secret',import.meta.url),'utf8').trim()});
async function cmd(text){return rcon.command(text);}
const health=async()=>await(await fetch('http://127.0.0.1:8772/health')).json();
async function wait(pred,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const h=await health();if(pred(h))return h;await sleep(100);}throw Error('wait_timeout');}
await wait(h=>h.phase==='ready');
async function reset(){send({type:'reset'});await sleep(150);await wait(h=>h.phase==='ready');await cmd('tp Steve 330.5 87 -349.5 0 0');await sleep(500);}
const rows=[];
async function prompt(text){const start=Date.now();send({type:'prompt',text});return await wait(h=>h.korean===text && ['done','clarify','unavailable','error'].includes(h.phase));}
const texts=process.env.CASES?JSON.parse(process.env.CASES):['왼쪽으로세칸가','왼쪽 압 대각선으로 세 칸 가','하늘을 봐','땅을 바','두 번 점프해','소를 때리지 말고 다가가','나무 한 개 캐 줘','저거 잡아','아무거나 하지 마','앞으로 두 칸 가고 오른쪽 봐','앞으로 백 칸 가','돼지 잡아 줘','흙 한 개 캐 줘','asdfgh'];
for(const text of texts){
 await reset();const before=await snapshot();const start=Date.now();const h=await prompt(text);const after=await snapshot();
 const row={text,ms:Date.now()-start,phase:h.phase,message:h.message,chat:h.chat,before,after};rows.push(row);console.log(JSON.stringify({text,ms:row.ms,phase:h.phase,message:h.message,delta:{x:after.pos.x-before.pos.x,z:after.pos.z-before.pos.z,jumps:after.jumps-before.jumps,dig:after.counters.dig-before.counters.dig,attack:after.counters.attack-before.counters.attack}}));
 fs.mkdirSync(new URL('../results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../results/live.json',import.meta.url),JSON.stringify(rows,null,2));
}
await reset();mind.close();ws.close();process.exit(0);
