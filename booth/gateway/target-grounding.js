export function ground(s,observation){
 if(!s.selector||s.selector.kind==='none')return {ok:true,target:null};
 if(['dig','attack','approach'].includes(s.type)&&!s.selector.name&&s.selector.relation==='any')return{ok:false,kind:'clarify',message:'대상의 종류를 확인하지 못했어요. 이름을 알려주거나 직접 가리켜 주세요.'};
 let candidates=observation.targets.filter(t=>t.kind===s.selector.kind&&(!s.selector.name||t.name===s.selector.name));
 if(s.type==='tree')candidates=candidates.filter(t=>t.name.endsWith('_log'));
 if(s.type==='carve')candidates=candidates.filter(t=>['dirt','grass_block','coarse_dirt','rooted_dirt'].includes(t.name));
 const relation=s.selector.relation;
 if(relation==='cursor')candidates=candidates.filter(t=>t.key===observation.cursor);
 if(['left','right','front','back'].includes(relation))candidates=candidates.filter(t=>{const r=t.relative||{};return relation==='left'?r.right<-.5:relation==='right'?r.right>.5:relation==='front'?r.forward>.5:r.forward<-.5;});
 if(['nearest','farthest'].includes(relation)){candidates.sort((a,b)=>a.dist-b.dist);if(relation==='farthest')candidates.reverse();if(s.selector.selection==='unique'&&candidates.length>1&&Math.abs(candidates[0].dist-candidates[1].dist)<.3)return{ok:false,kind:'clarify',message:'비슷한 거리에 대상이 여러 개 있어요. 어느 쪽인가요?'};candidates=candidates.slice(0,1);}
 if(relation==='cursor'&&!observation.cursor)return {ok:false,kind:'clarify',message:'어떤 대상을 말씀하시나요? 이름이나 위치를 알려주세요.'};
 if(!['nearest','farthest'].includes(relation)&&s.selector.selection==='any'&&candidates.length){candidates.sort((a,b)=>a.dist-b.dist);return {ok:true,target:candidates[0]};}
 if(observation.coverage?.truncated&&relation!=='cursor')return{ok:false,kind:'clarify',message:'조회 범위에 대상이 너무 많아요. 위치나 범위를 좁혀 주세요.'};
 if(candidates.length!==1)return {ok:false,kind:candidates.length?'clarify':'unavailable',message:candidates.length?'조건에 맞는 대상이 여러 개예요. 위치를 더 알려주세요.':'조회한 범위에서 조건에 맞는 대상을 확인하지 못했어요. 가려졌거나 범위 밖에 있을 수 있어요.'};
 return {ok:true,target:candidates[0]};
}
