import test from 'node:test';import assert from 'node:assert/strict';
import {treeBlocks,carveStairs} from '../booth_geometry.js';
import {validatePlan} from '../booth_contract.js';
const solid=name=>({name,boundingBox:'block'}),air={name:'air',boundingBox:'empty'};
test('tree fixes a connected component and excludes neighboring separate trees',()=>{
 const read=({x,y,z})=>z===0&&[0,2].includes(x)&&y>=0&&y<4?solid('oak_log'):air;
 const tree=treeBlocks(read,{x:0,y:2,z:0});assert.equal(tree.blocks.length,4);assert.ok(tree.blocks.every(p=>p.x===0));
});
test('oversized connected tree fails before execution',()=>assert.throws(()=>treeBlocks(p=>p.y>=0&&p.y<40&&p.x===0&&p.z===0?solid('oak_log'):air,{x:0,y:0,z:0}),/너무 많아/));
const wall=({x,y,z})=>y<0?solid('stone'):x>=1&&x<=6&&y<3?solid('dirt'):air;
test('three high wall creates three ascending footholds with exact removal budget',()=>{
 const p=carveStairs(wall,{x:.5,y:0,z:.5},{x:1,y:1,z:0});assert.equal(p.rise,3);assert.deepEqual(p.stages.map(s=>s.feet.y),[1,2,3]);assert.equal(p.stages.flatMap(s=>s.remove).length,3);
 for(const s of p.stages)assert.ok(s.remove.every(p=>p.y>=s.feet.y));
});
test('foreign blocks and missing supports reject whole carve before digging',()=>{
 assert.throws(()=>carveStairs(p=>p.x===1&&p.y===2?solid('stone'):wall(p),{x:.5,y:0,z:.5},{x:1,y:1,z:0}));
 assert.throws(()=>carveStairs(p=>p.x===2&&p.y===1?air:wall(p),{x:.5,y:0,z:.5},{x:1,y:1,z:0}));
});
test('sequence schema rejects nested or excessive plans',()=>{
 const mk=steps=>({kind:'execute',message:'go',action:{type:'sequence',steps}});
 const move={type:'move',direction:'back',amount:3};
 assert.equal(validatePlan(mk([move,{type:'turn',amount:180}]),{targets:[]}).kind,'execute');
 assert.throws(()=>validatePlan(mk(Array(7).fill(move)),{targets:[]}));
 assert.throws(()=>validatePlan(mk([move,mk([move,move]).action]),{targets:[]}));
});

import {landingCandidates} from '../booth_geometry.js';
test('land candidates require dry feet, headroom and forward supported ground',()=>{
 const read=p=>p.y===-1?solid('stone'):p.y===0&&p.z<3?{name:'water',boundingBox:'empty'}:air;
 const candidates=landingCandidates(read,{x:.5,y:0,z:.5},Math.PI,'forward',8);
 assert.ok(candidates.length);assert.ok(candidates.every(c=>c.feet.z>=3));
 assert.equal(landingCandidates(()=>({name:'water',boundingBox:'empty'}),{x:0,y:0,z:0},0,'forward',5).length,0);
});
test('travel schema admits continuous and long combined movement but rejects oversized requests',()=>{
 const plan={kind:'execute',message:'이동',action:{type:'travel',direction:'forward',distance:null,jumping:true}};
 assert.equal(validatePlan(plan,{targets:[]}).kind,'execute');
 assert.equal(validatePlan({...plan,action:{...plan.action,distance:100}},{targets:[]}).kind,'execute');
 assert.throws(()=>validatePlan({...plan,action:{...plan.action,distance:101}},{targets:[]}));
});
