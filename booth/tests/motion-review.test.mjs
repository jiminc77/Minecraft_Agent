import test from 'node:test';import assert from 'node:assert/strict';import {agrees} from '../gateway/motion-review.js';
test('command-form rotation disagrees with a walking proposal',()=>assert.equal(agrees('뒤를 볼게요. !turn(180)',{type:'move',direction:'back',amount:2}),false));
test('directions and amounts must both agree',()=>{assert.ok(agrees('!move("left", 3)',{type:'move',direction:'left',amount:3}));assert.equal(agrees('!move("right", 3)',{type:'move',direction:'left',amount:3}),false);assert.equal(agrees('!move("left", 5)',{type:'move',direction:'left',amount:3}),false);});
test('command-form text is parsed as data, never evaluated',()=>assert.equal(agrees('!move(process.exit(), 3)',{type:'move',direction:'left',amount:3}),false));
