import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const require=createRequire(new URL('../gateway/package.json',import.meta.url)),WS=require('ws'),{io}=require('socket.io-client');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const health=async()=>await(await fetch('http://127.0.0.1:8772/health',{signal:AbortSignal.timeout(1500)})).json();
const socket=io('http://127.0.0.1:8086');await new Promise(r=>socket.on('connect',r));
const observe=()=>new Promise((r,j)=>socket.timeout(5000).emit('booth-state','Steve',(e,v)=>e?j(e):r(v)));
const rows=[];async function wait(fn,seconds=100){const until=Date.now()+seconds*1000;while(Date.now()<until){try{const h=await health();if(fn(h))return h;}catch{}await sleep(500);}throw Error('recovery_timeout');}
async function run(name,fn){const start=Date.now();try{const details=await fn();rows.push({name,ok:true,ms:Date.now()-start,details});}catch(e){rows.push({name,ok:false,ms:Date.now()-start,error:String(e)});}console.log(JSON.stringify(rows.at(-1)));fs.writeFileSync(new URL('../results/recovery-live.json',import.meta.url),JSON.stringify(rows,null,2));}
try{
 await wait(h=>h.phase==='ready'&&h.agent_in_game);
 await run('frozen gateway expires manual controls without socket close',async()=>{
  const ws=new WS('ws://127.0.0.1:8772/ws');await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'keys',keys:['forward']}));await wait(h=>h.phase==='manual');assert.ok((await observe()).controls.forward);
  // Abrupt loss exercises the lease, unlike graceful WebSocket close cleanup.
  execFileSync('systemctl',['--user','kill','--kill-who=main','--signal=SIGSTOP','booth-stability-gateway']);
  const start=Date.now();let state;while(Date.now()-start<4800){state=await observe();if(!Object.values(state.controls).some(Boolean))break;await sleep(200);}
  execFileSync('systemctl',['--user','kill','--kill-who=main','--signal=SIGCONT','booth-stability-gateway']);
  assert.ok(!Object.values(state.controls).some(Boolean));const stopMs=Date.now()-start;ws.send(JSON.stringify({type:'reset'}));const h=await wait(h=>h.phase==='ready'&&h.agent_in_game);ws.close();assert.equal(h.chat.length,0);return{stopMs,controls:state.controls};
 });
 for(const component of ['gateway','mindcraft','client'])await run(component+' process automatically recovers',async()=>{
  const unit='booth-stability-'+component;const before=execFileSync('systemctl',['--user','show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();const killedAt=Date.now();execFileSync('systemctl',['--user','kill','--kill-who=main','--signal=SIGKILL',unit]);await sleep(6000);
  const h=await wait(h=>h.phase==='ready'&&h.agent_in_game&&h.viewer_in_game&&h.viewer_checked_at>killedAt);
  const after=execFileSync('systemctl',['--user','show',unit,'-p','MainPID','--value'],{encoding:'utf8'}).trim();assert.notEqual(after,before);assert.notEqual(after,'0');assert.equal(h.chat.length,0);return{before,after,phase:h.phase,viewer:h.viewer_in_game};
 });
}finally{socket.close();execFileSync('systemctl',['--user','kill','--kill-who=main','--signal=SIGCONT','booth-stability-gateway']);execFileSync('systemctl',['--user','start','booth-stability-gateway']);}
process.exit(rows.every(r=>r.ok)?0:1);
