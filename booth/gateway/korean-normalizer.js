import {combineHangul,divideHangul} from 'hangul-util';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
let child=null,sequence=0,buffer='';const pending=new Map();
function start(){
 const process=spawn(globalThis.process.env.BOOTH_KOREAN_PYTHON,[fileURLToPath(new URL('./korean-normalizer.py',import.meta.url))],{stdio:['pipe','pipe','pipe']});child=process;buffer='';
 process.stdout.setEncoding('utf8');process.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const row=JSON.parse(line),entry=pending.get(row.id);if(entry){pending.delete(row.id);row.error?entry.reject(Error('korean_normalization_failed')):entry.resolve(row);}}catch{}}});
 const failed=()=>{if(child===process)child=null;for(const entry of pending.values())entry.reject(Error('korean_normalizer_disconnected'));pending.clear();};
 process.once('error',failed);process.once('exit',failed);process.stderr.on('data',()=>{});
 process.unref();process.stdin.unref?.();process.stdout.unref?.();process.stderr.unref?.();
 return process;
}
export async function normalizeKorean(text,signal){
 text=combineHangul(divideHangul(text));
 if(!process.env.BOOTH_KOREAN_PYTHON)return{text,typoCost:0,enabled:false};
 signal?.throwIfAborted();if(pending.size>=16)throw Error('korean_normalizer_busy');
 const worker=child||start(),id=++sequence;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);pending.delete(id);};
  const aborted=()=>{cleanup();reject(signal.reason||Error('aborted'));};
  const timer=setTimeout(()=>{cleanup();reject(Error('korean_normalizer_timeout'));},15000);
  pending.set(id,{resolve:row=>{cleanup();resolve({...row,enabled:true});},reject:e=>{cleanup();reject(e);}});
  signal?.addEventListener('abort',aborted,{once:true});
  worker.stdin.write(JSON.stringify({id,text})+'\n',error=>{if(error){cleanup();reject(error);}});
 });
}
