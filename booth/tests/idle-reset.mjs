import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url));const WebSocket=require('ws');const sleep=ms=>new Promise(r=>setTimeout(r,ms));const health=async()=>await(await fetch('http://127.0.0.1:8772/health')).json();
const ws=new WebSocket('ws://127.0.0.1:8772/ws');await new Promise(r=>ws.on('open',r));
ws.send(JSON.stringify({type:'prompt',text:'안녕'}));
let start;for(let i=0;i<50;i++){const h=await health();if(h.korean==='안녕'&&h.active_since){start=h;break;}await sleep(100);}
assert.ok(start);const deadline=Date.now()+132000;let done;
while(Date.now()<deadline){const h=await health();if(h.phase==='ready'&&h.active_since===null){done=h;break;}await sleep(1000);}
const result={ok:!!done,start,end:done,elapsedSeconds:Date.now()/1000-start.active_since};
fs.writeFileSync(new URL('../results/idle-reset.json',import.meta.url),JSON.stringify(result,null,2));console.log({ok:result.ok,elapsedSeconds:result.elapsedSeconds});ws.close();process.exit(result.ok?0:1);
