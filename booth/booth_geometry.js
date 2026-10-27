// Pure geometry: no language matching, no world mutations. Unknown blocks fail closed.
export const EARTH=new Set(['dirt','grass_block','coarse_dirt','rooted_dirt']);
const air=b=>b && ['air','cave_air','void_air'].includes(b.name);
const solid=b=>b?.boundingBox==='block';
const key=p=>`${p.x}:${p.y}:${p.z}`;
export function treeBlocks(read,start,max=32){
 const root=read(start);if(!root?.name.endsWith('_log'))throw Error('선택한 원목이 사라졌어요.');
 const seen=new Set(),queue=[start],out=[];
 while(queue.length){
  const p=queue.shift(),k=key(p);if(seen.has(k))continue;seen.add(k);
  const b=read(p);if(!b)throw Error('나무 주변 지형을 읽지 못했어요.');
  if(b.name!==root.name)continue;
  out.push({...p});if(out.length>max)throw Error('연결된 원목이 너무 많아 나무 한 그루의 범위를 정하지 못했어요.');
  for(const [dx,dy,dz]of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])queue.push({x:p.x+dx,y:p.y+dy,z:p.z+dz});
 }
 return {name:root.name,blocks:out};
}
export function carveStairs(read,position,target,maxRise=4){
 const start={x:Math.floor(position.x),y:Math.floor(position.y+.1),z:Math.floor(position.z)};
 const dx=target.x-start.x,dz=target.z-start.z;
 if(Math.max(Math.abs(dx),Math.abs(dz))>6)throw Error('흙 벽에 조금 더 가까이 다가가 주세요.');
 if(dx===0&&dz===0)throw Error('발밑이 아닌 앞의 흙 벽을 지정해 주세요.');
 const step=Math.abs(dx)>Math.abs(dz)?{x:Math.sign(dx),z:0}:{x:0,z:Math.sign(dz)};
 const sideways=step.x?Math.abs(dz):Math.abs(dx);
 if(sideways>1)throw Error('벽을 정면으로 바라보고 가까이 서 주세요.');
 let first=0;
 for(let n=1;n<=6;n++){
  const p={x:start.x+step.x*n,y:start.y,z:start.z+step.z*n},b=read(p);
  if(!b)throw Error('앞의 지형을 읽지 못했어요.');
  if(EARTH.has(b.name)){first=n;break;}
  if(!air(b)||!air(read({...p,y:p.y+1}))||!solid(read({...p,y:p.y-1})))throw Error('벽까지 평평한 접근 경로가 없어요.');
 }
 if(!first)throw Error('앞에서 깎을 흙 벽을 찾지 못했어요.');
 const column={x:start.x+step.x*first,z:start.z+step.z*first};
 let top=start.y;
 while(top<=start.y+maxRise && EARTH.has(read({...column,y:top})?.name))top++;
 const rise=top-start.y;
 if(rise<1||rise>maxRise)throw Error('현재는 최대 네 칸 높이의 단순한 흙 벽을 깎을 수 있어요.');
 const stages=[];
 for(let i=0;i<rise;i++){
  const x=column.x+step.x*i,z=column.z+step.z*i,feet=start.y+i+1,remove=[];
  // Every footstep must retain solid earth below; never dig a supporting block.
  if(!EARTH.has(read({x,y:feet-1,z})?.name))throw Error('계단 발판이 이어지지 않는 지형이라 멈췄어요.');
  for(let y=feet;y<=Math.max(top,feet+1);y++){
   const b=read({x,y,z});if(!b)throw Error('지형을 읽지 못했어요.');
   if(air(b))continue;
   if(!EARTH.has(b.name))throw Error('흙 이외의 블록이 있어 계단을 만들 수 없어요.');
   remove.push({x,y,z,name:b.name});
  }
  // Top-down clearing avoids leaving an overhead obstacle while ascending.
  stages.push({feet:{x,y:feet,z},remove:remove.reverse()});
 }
 if(!stages.some(s=>s.remove.length))throw Error('이미 한 칸 높이로 올라갈 수 있는 지형이에요.');
 return {rise,stages};
}

export function landingCandidates(read,position,yaw,direction,maxDistance=24){
 const vectors={forward:[1,0],back:[-1,0],left:[0,-1],right:[0,1],forward_left:[1,-1],forward_right:[1,1],back_left:[-1,-1],back_right:[-1,1]};
 const [f,r]=vectors[direction],n=Math.hypot(f,r),vx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)/n,vz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)/n;
 const origin={x:Math.floor(position.x),y:Math.floor(position.y),z:Math.floor(position.z)},out=[];
 const clear=b=>b?.boundingBox==='empty'&&!['water','lava','powder_snow'].includes(b.name);
 for(let dx=-maxDistance;dx<=maxDistance;dx++)for(let dz=-maxDistance;dz<=maxDistance;dz++){
  const distance=Math.hypot(dx,dz);if(distance<1||distance>maxDistance||(dx*vx+dz*vz)/distance<.7)continue;
  for(let dy=4;dy>=-2;dy--){
   const p={x:origin.x+dx,y:origin.y+dy,z:origin.z+dz},support={...p,y:p.y-1};const block=read(support);
   if(!solid(block)||block.name.endsWith('_log')||block.name.endsWith('_leaves')||['magma_block','cactus','campfire','soul_campfire'].includes(block.name))continue;
   if(clear(read(p))&&clear(read({...p,y:p.y+1})))out.push({feet:p,support,name:block.name,distance:Math.hypot(dx,dy,dz)});
  }
 }
 return out.sort((a,b)=>a.distance-b.distance);
}
