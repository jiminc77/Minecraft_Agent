import test from 'node:test';import assert from 'node:assert/strict';import {checkQuantity} from '../gateway/quantity.js';
test('spaceless native numeral independently verifies model quantity',()=>{assert.equal(checkQuantity('왼쪽으로세칸가',{type:'move',amount:3}),null);assert.ok(checkQuantity('왼쪽으로세칸가',{type:'move',amount:5}));});
test('unknown numeral is not converted to one',()=>assert.ok(checkQuantity('왼쪽으로 새 칸 가',{type:'move',amount:1})));
test('Sino and digit numerals remain unbounded for comparison',()=>{assert.equal(checkQuantity('오른쪽으로 사십오 도 돌아',{type:'turn',amount:45}),null);assert.ok(checkQuantity('앞으로 백 칸 가',{type:'move',amount:10}));assert.equal(checkQuantity('뒤로 2.5칸',{type:'move',amount:2.5}),null);});
test('native tens and repeated actions are understood by public parser',()=>{assert.equal(checkQuantity('점프 스물 세 번',{type:'jump',amount:23}),null);assert.equal(checkQuantity('나무 한 개 캐 줘',{type:'dig',amount:1}),null);});
