// Read-only, bounded query of a named block type; no movement or world edits.
export function blockVisible(bot,b){
 if(!b?.position)return false;
 const eye=bot.entity.position.offset(0,bot.entity.eyeHeight??1.62,0),delta=b.position.offset(.5,.5,.5).minus(eye),distance=delta.norm();
 if(distance>17||distance<.01)return false;
 const hit=bot.world.raycast(eye,delta.normalize(),distance+.1);
 return !!hit?.position.equals(b.position);
}
export function queryBlocks(bot,selector){
 if(selector.kind!=='block'||typeof selector.name!=='string'||(!selector.name&&!['tree','carve'].includes(selector.action)))return{blocks:[],coverage:{radius:16,truncated:false,query:'cursor_only'}};
 const definition=bot.registry.blocksByName[selector.name];
 if(!definition&&selector.name)return{blocks:[],coverage:{radius:16,truncated:false,query:'unknown_type'}};
 const matches=b=>selector.name?b?.name===selector.name:selector.action==='tree'?b?.name?.endsWith('_log'):['dirt','grass_block','coarse_dirt','rooted_dirt'].includes(b?.name);
 const positions=bot.findBlocks({matching:definition?definition.id:matches,maxDistance:16,count:256});
 const blocks=positions.map(p=>bot.blockAt(p)).filter(b=>matches(b)&&blockVisible(bot,b));
 return{blocks,coverage:{radius:16,truncated:positions.length>=256,query:'named_type',visible:blocks.length,occluded:positions.length-blocks.length}};
}
