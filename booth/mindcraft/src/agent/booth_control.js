import {queryBlocks,blockVisible} from './booth_observation.js';
// Booth-side system controls: state snapshot, stop/reset, and manual input.
// These are operator/visitor controls, not language-model behaviour.
import { Vec3 } from 'vec3';
import { executeBooth, halt } from './booth_executor.js';
import * as world from './library/world.js';

const DEG = Math.PI / 180;
const MANUAL_KEYS = ['forward', 'back', 'left', 'right', 'jump', 'sprint'];
const manual = { keys: new Set(), digging: false };

function invalidatePendingReplies(agent) {
    // promptConvo discards a generation when this timestamp changes mid-flight.
    agent.prompter.most_recent_msg_time = Date.now();
}

// Count outgoing swing/attack/dig packets so evaluations can see every attack input.
function installCounters(bot) {
    if (bot.boothCounters) return;
    bot.boothCounters = { swing: 0, attack: 0, dig: 0 };
    bot.boothJumps=0;
    bot.on('physicsTick',()=>{
        if(bot.boothGrounded && !bot.entity.onGround && bot.entity.velocity.y>.1)bot.boothJumps++;
        bot.boothGrounded=bot.entity.onGround;
    });
    const write = bot._client.write.bind(bot._client);
    bot._client.write = (name, params) => {
        if (name === 'arm_animation') bot.boothCounters.swing++;
        else if (name === 'use_entity' && (params?.mouse === 1 || params?.type === 1)) bot.boothCounters.attack++;
        else if (name === 'block_dig' && params?.status === 0) bot.boothCounters.dig++;
        return write(name, params);
    };
}

// Shorter planning slices keep the bot and viewer responsive while a path is computed.
function configureBot(bot) {
    if (bot.boothConfigured || !bot.pathfinder) return;
    bot.boothConfigured = true;
    bot.on('physicsTick',()=>{
        if(bot.boothManualActive)for(const key of MANUAL_KEYS)bot.setControlState(key,manual.keys.has(key));
    });
    // Mineflayer 4.33 treats pitch/yaw zero as missing. Use its public world raycast
    // with finite-number checks so a level view can identify blocks (also manual).
    bot.blockAtEntityCursor=(entity=bot.entity,maxDistance=256,matcher=null)=>{
        if(!entity?.position || !Number.isFinite(entity.pitch) || !Number.isFinite(entity.yaw))return null;
        const {pitch,yaw}=entity;
        const direction=new Vec3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
        return bot.world.raycast(entity.position.offset(0,entity.eyeHeight??1.62,0),direction,maxDistance,matcher);
    };
    bot.pathfinder.tickTimeout = 20;
    bot.pathfinder.thinkTimeout = 10000; // same total compute as the 40 ms / 5 s default
}

export function getBoothState(agent) {
    const bot = agent.bot;
    if (!bot?.entity) return null;
    installCounters(bot);
    configureBot(bot);
    const pos = bot.entity.position;
    const entities = world.getNearbyEntities(bot, 24)
        .filter(e => e !== bot.entity)
        .filter(e => ['pig','cow','sheep','chicken','rabbit'].includes(e.name))
        .sort((a,b)=>pos.distanceTo(a.position)-pos.distanceTo(b.position)).slice(0, 20)
        .map(e => ({ name: e.name, id: e.id, pos: {x:e.position.x,y:e.position.y,z:e.position.z}, dist: pos.distanceTo(e.position) }));
    const targets=entities.map(e=>({...e,key:`entity:${e.id}`,kind:'entity'}));
    const cursorEntity=bot.entityAtCursor?.(5);
    const cursorBlock=bot.blockAtCursor?.(5);
    let cursor=null;
    if(cursorEntity && targets.some(t=>t.id===cursorEntity.id))cursor=`entity:${cursorEntity.id}`;
    const addBlock=b=>{
        if(!b || b.name==='air')return;
        const p=b.position,key=`block:${p.x}:${p.y}:${p.z}`;
        if(!targets.some(t=>t.key===key))targets.push({key,kind:'block',name:b.name,pos:{x:p.x,y:p.y,z:p.z},dist:+pos.distanceTo(p).toFixed(1)});
        return key;
    };
    if(cursorBlock){const key=addBlock(cursorBlock);if(!cursor)cursor=key;}
    // Full block scans must not run for every telemetry poll: they delay interrupts.
    // Cursor and entities remain fresh; cached blocks are rechecked against the world.
    const activeMotion=agent.actions.executing || MANUAL_KEYS.some(k=>bot.getControlState(k));
    if(!bot.boothBlocks || (!activeMotion && Date.now()-bot.boothBlocksAt>1000)){
        const positions=bot.findBlocks({matching:b=>b.boundingBox==='block',maxDistance:8,count:60});
        const chosen=[],perType={};
        const remember=b=>{if(b && bot.canSeeBlock(b) && (perType[b.name]||0)<4){chosen.push({position:b.position.clone(),name:b.name});perType[b.name]=(perType[b.name]||0)+1;return true;}};
        for(const p of positions)remember(bot.blockAt(p));
        for(const name of ['oak_log','birch_log','spruce_log','oak_leaves','dirt']){
            for(const p of bot.findBlocks({matching:b=>b.name===name,maxDistance:16,count:12}))if(remember(bot.blockAt(p)))break;
        }
        bot.boothBlocks=chosen;bot.boothBlocksAt=Date.now();
    }
    for(const cached of bot.boothBlocks){const b=bot.blockAt(cached.position);if(b?.name===cached.name)addBlock(b);}
    for(const cached of bot.boothQueryBlocks||[]){const b=bot.blockAt(cached.position);if(Date.now()-cached.at<15000&&b?.name===cached.name&&blockVisible(bot,b))addBlock(b);}
    for(const t of targets){const dx=t.pos.x-pos.x,dz=t.pos.z-pos.z,yaw=bot.entity.yaw;t.relative={forward:+(-dx*Math.sin(yaw)-dz*Math.cos(yaw)).toFixed(1),right:+(dx*Math.cos(yaw)-dz*Math.sin(yaw)).toFixed(1),up:+(t.pos.y-pos.y).toFixed(1)};}
    return {
        progress:agent.boothProgress||null,targets,cursor,jumps:bot.boothJumps,controls:Object.fromEntries(MANUAL_KEYS.map(k=>[k,bot.getControlState(k)])),
        pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) },
        yaw: +(bot.entity.yaw / DEG).toFixed(1),
        pitch: +(bot.entity.pitch / DEG).toFixed(1),
        health: bot.health,
        inventory: world.getInventoryCounts(bot),
        entities,
        acting: !agent.isIdle(),
        action: agent.actions.currentActionLabel || '',
        counters: { ...bot.boothCounters },
    };
}

export async function boothControl(agent, data) {
    const bot = agent.bot;
    configureBot(bot);
    if(data?.type==='heartbeat'){
        bot.boothLeaseAt=Date.now();bot.boothLeaseExpired=false;
        if(!bot.boothLeaseTimer){
            bot.boothLeaseTimer=setInterval(()=>{
                if(!bot.boothLeaseExpired && Date.now()-bot.boothLeaseAt>3500){
                    bot.boothLeaseExpired=true;
                    void boothControl(agent,{type:'stop'}).catch(()=>{halt(bot);bot.clearControlStates();});
                }
            },250);
            bot.once('end',()=>{clearInterval(bot.boothLeaseTimer);bot.boothLeaseTimer=null;});
        }
        return true;
    }
    if(data?.type==='observe'){
        const selector=data.selector;
        if(!selector||!['block','entity'].includes(selector.kind)||typeof selector.name!=='string'||selector.name.length>80)return null;
        const queried=selector.kind==='block'&&(selector.name||['tree','carve'].includes(selector.action))?queryBlocks(bot,selector):null;
        if(queried)bot.boothQueryBlocks=queried.blocks.map(b=>({position:b.position.clone(),name:b.name,at:Date.now()}));
        const state=getBoothState(agent);
        if(queried){
            const keys=new Set(queried.blocks.map(b=>`block:${b.position.x}:${b.position.y}:${b.position.z}`));
            state.targets=state.targets.filter(t=>t.kind!=='block'||t.name!==selector.name||keys.has(t.key));
            state.coverage=queried.coverage;
        }else state.coverage={radius:24,truncated:state.entities.length>=20,query:'entity_or_cursor'};
        return state;
    }
    if(data?.type==='execute'&&bot.boothLeaseExpired)return{ok:false,message:'제어 서버 연결이 끊겨 실행하지 않았어요.'};
    if(data?.type==='execute')return executeBooth(agent,data,getBoothState);
    if (data?.type === 'stop' || data?.type === 'reset') {
        if(data.session && agent.boothSession===data.session && data.epoch<agent.boothEpoch)return false;
        agent.boothSession=data.session||null;agent.boothEpoch=data.epoch??((agent.boothEpoch||0)+1);
        const session=agent.boothSession,epoch=agent.boothEpoch;
        bot.boothManualActive=false;
        invalidatePendingReplies(agent);
        halt(bot);
        releaseManual(bot);
        await agent.actions.stop();
        if(agent.boothSession!==session || agent.boothEpoch!==epoch)return false;
        agent.actions.cancelResume();
        agent.clearBotLogs();
        bot.clearControlStates();
        if (data.type === 'reset') {
            agent.history.clear();
            bot.boothBlocks=null;bot.boothQueryBlocks=[];
            if (bot.boothCounters) bot.boothCounters = { swing: 0, attack: 0, dig: 0 };
            if (typeof data.yaw === 'number')
                await bot.look(data.yaw * DEG, (data.pitch ?? 0) * DEG, true);
        }
        return true;
    }
    return false;
}

function releaseManual(bot) {
    manual.keys.clear();
    if (manual.digging) {
        bot.stopDigging();
        manual.digging = false;
    }
}

export async function boothManual(agent, data) {
    const bot = agent.bot;
    if (data?.begin) {
        bot.boothManualActive=true;
        agent.boothSession=null;agent.boothEpoch=(agent.boothEpoch||0)+1;
        halt(bot);
        invalidatePendingReplies(agent);
        const epoch=agent.boothEpoch;
        if (!agent.isIdle()) await agent.actions.stop();
        if(agent.boothEpoch!==epoch)return;
        agent.actions.cancelResume();
    }
    if (Array.isArray(data?.keys)) {
        manual.keys = new Set(data.keys.filter(k => MANUAL_KEYS.includes(k)));
        for (const key of MANUAL_KEYS)
            bot.setControlState(key, manual.keys.has(key));
    }
    if (Array.isArray(data?.camera)) {
        const [dPitch, dYaw] = data.camera.map(v => Math.max(-45, Math.min(45, Number(v) || 0)));
        const pitch = Math.max(-90, Math.min(90, bot.entity.pitch / DEG - dPitch));
        await bot.look(bot.entity.yaw - dYaw * DEG, pitch * DEG, true);
    }
    if (data?.attack === true && !manual.digging) {
        const target = bot.entityAtCursor?.(3.5);
        if (target) {
            bot.attack(target);
        } else {
            const block = bot.blockAtCursor(4.5);
            if (block && bot.canDigBlock(block)) {
                manual.digging = true;
                bot.dig(block, 'ignore').catch(() => {}).finally(() => { manual.digging = false; });
            } else {
                bot.swingArm();
            }
        }
    } else if (data?.attack === false && manual.digging) {
        bot.stopDigging();
        manual.digging = false;
    }
}
