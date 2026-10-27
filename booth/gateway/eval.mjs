// Game-state evaluation of booth commands. Each case: restore arena, send a Korean
// command, watch the bot, and judge success from yaw/pitch/position/packets/world.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Rcon } from './rcon.js';
import { ARENA, restoreArena } from './arena.js';

const require = createRequire(import.meta.url);
const { io } = require('../mindcraft/node_modules/socket.io-client');

const AGENT = 'Steve';
const REPEATS = Number(process.env.REPEATS || 3);
const OUT = process.env.OUT || 'eval-results.json';
const rcon = new Rcon({ port: 25576, password: readFileSync('../rcon.secret', 'utf8').trim() });
const socket = io('http://localhost:8081');
await new Promise(resolve => socket.on('connect', resolve));

const outputs = [];
socket.on('bot-output', (name, message) => {
    if (name === AGENT) outputs.push({ t: Date.now(), message });
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = () => new Promise(resolve => socket.emit('booth-state', AGENT, resolve));
const control = data => new Promise(resolve => socket.emit('booth-control', AGENT, data, resolve));
const send = message => socket.emit('send-message', AGENT, { from: 'visitor', message });
const wrap = deg => ((deg + 540) % 360) - 180;

async function pigKills() {
    await rcon.command('scoreboard objectives add boothPigKills minecraft.killed:minecraft.pig');
    const res = await rcon.command(`scoreboard players get ${AGENT} boothPigKills`);
    const match = res.match(/has (\d+)/);
    return match ? Number(match[1]) : 0;
}

async function countInArena(type) {
    const { min, max } = ARENA;
    const res = await rcon.command(`execute if entity @e[type=${type},x=${min.x},y=${min.y},z=${min.z},dx=${max.x - min.x},dy=${max.y - min.y},dz=${max.z - min.z}]`);
    const match = res.match(/count: (\d+)/);
    return match ? Number(match[1]) : 0;
}

function motion(s0, s1) {
    const rad = s0.yaw * Math.PI / 180;
    const dx = s1.pos.x - s0.pos.x, dz = s1.pos.z - s0.pos.z;
    return {
        forward: dx * -Math.sin(rad) + dz * -Math.cos(rad),
        right: dx * Math.cos(rad) + dz * -Math.sin(rad),
        dist: Math.hypot(dx, dz),
        turnRight: -wrap(s1.yaw - s0.yaw),
        pitch: s1.pitch,
        swing: s1.counters.swing - s0.counters.swing,
        attack: s1.counters.attack - s0.counters.attack,
        dig: s1.counters.dig - s0.counters.dig,
    };
}

const logs = inv => Object.entries(inv).filter(([k]) => k.endsWith('_log')).reduce((n, [, v]) => n + v, 0);
const calm = m => m.attack === 0 && m.dig === 0;

const CASES = [
    { text: '하늘을 봐', judge: m => m.pitch >= 60 && m.dist < 0.6 && calm(m) },
    { text: '앞으로 조금 이동해', judge: m => m.forward >= 0.8 && m.forward <= 6 && Math.abs(m.right) < 1 && Math.abs(m.turnRight) < 20 && calm(m) },
    { text: '뒤로 돌아', judge: m => Math.abs(Math.abs(m.turnRight) - 180) <= 30 && m.dist < 1 && calm(m) },
    { text: '돼지 죽여줘', timeout: 45000, judge: (m, w) => w.pigKillsAfter > w.pigKillsBefore },
    { text: '나무를 캐 줘', timeout: 60000, judge: (m, w) => w.logsAfter > w.logsBefore },
    { text: '블록을 부수지 말고 앞으로 걸어가', judge: m => m.forward >= 0.8 && calm(m) },
    { text: '오른쪽으로 돌아', judge: m => Math.abs(m.turnRight - 90) <= 30 && m.dist < 1 && calm(m) },
    { text: '땅을 봐', judge: m => m.pitch <= -45 && m.dist < 0.6 && calm(m) },
    { text: '왼쪽으로 세 칸 가', judge: m => m.right <= -2 && m.right >= -4.5 && Math.abs(m.forward) < 1.2 && calm(m) },
    { text: '두 번 점프해', judge: (m, w) => m.dist < 1 && calm(m) && /!jump\(\s*2\s*\)/.test(w.reply) },
    { text: '소한테 가 봐', timeout: 30000, judge: (m, w) => w.cowDistAfter !== null && w.cowDistAfter <= 6 && calm(m) },
    { text: '앞으로 스무 칸 가', then: { after: 1500, text: '하늘을 봐' },
      judge: m => m.pitch >= 60 && m.forward < 15 && calm(m) },
    { text: '앞으로 스무 칸 가', then: { after: 1500, text: '멈춰' },
      judge: m => m.forward < 15 && calm(m) },
    // Same commands from other spots on the stage (the bot is rarely at spawn in practice).
    ...[[318, -340], [342, -362], [340, -336], [322, -365], [312, -352]].map(start =>
        ({ text: '나무를 캐 줘', start, timeout: 60000, judge: (m, w) => w.logsAfter > w.logsBefore })),
    ...[[318, -340], [342, -336]].map(start =>
        ({ text: '돼지 잡아 줘', start, timeout: 45000, judge: (m, w) => w.pigKillsAfter > w.pigKillsBefore })),
    { text: '오른쪽 앞 대각선으로 세 칸 가', judge: m => m.forward >= 1.2 && m.right >= 1.2 && calm(m) },
    { text: '왼쪽 대각선 앞으로 조금 가 줘', judge: m => m.forward >= 0.6 && m.right <= -0.6 && calm(m) },
];

async function reset() {
    await control({ type: 'stop' });
    await restoreArena(rcon, AGENT);
    await sleep(1500);
    await control({ type: 'reset' });
    await sleep(500);
}

const nearest = (s, name) => {
    const d = s.entities.filter(e => e.name === name).map(e => e.dist);
    return d.length ? Math.min(...d) : null;
};

async function runCase(c) {
    await reset();
    if (c.start) {
        await rcon.command(`spreadplayers ${c.start[0]} ${c.start[1]} 0 1 false ${AGENT}`);
        await sleep(1500);
    }
    const s0 = await state();
    const world = { pigsBefore: await countInArena('pig'), pigKillsBefore: await pigKills(), logsBefore: logs(s0.inventory) };
    outputs.length = 0;
    const t0 = Date.now();
    send(c.text);
    let firstMotion = null, sawActing = false, idleSince = null, lastState = s0;
    let secondSent = !c.then;
    let minCowDist = nearest(s0, 'cow');
    const deadline = t0 + (c.timeout || 20000);
    while (Date.now() < deadline) {
        await sleep(100);
        const s = await state();
        if (!s) continue;
        lastState = s;
        const m = motion(s0, s);
        const cow = nearest(s, 'cow');
        if (cow !== null && (minCowDist === null || cow < minCowDist)) minCowDist = cow;
        if (!firstMotion && (m.dist > 0.05 || Math.abs(m.turnRight) > 1 || Math.abs(s.pitch - s0.pitch) > 1 || m.swing > 0))
            firstMotion = Date.now() - t0;
        if (s.acting) { sawActing = true; idleSince = null; }
        else idleSince ??= Date.now();
        if (!secondSent && Date.now() - t0 >= c.then.after) {
            send(c.then.text);
            secondSent = true;
            sawActing = false;
            idleSince = null;
        }
        // Done once the (last) command has acted and the bot has been idle for 1.5 s,
        // or it replied without acting and stayed idle for 4 s.
        if (secondSent && idleSince && ((sawActing && Date.now() - idleSince > 1500) ||
            (!sawActing && outputs.length && Date.now() - idleSince > 4000))) break;
    }
    const m = motion(s0, lastState);
    Object.assign(world, {
        pigsAfter: await countInArena('pig'),
        pigKillsAfter: await pigKills(),
        logsAfter: logs(lastState.inventory),
        cowDistAfter: minCowDist,
        reply: outputs.map(o => o.message).join(' / '),
    });
    return {
        text: (c.then ? `${c.text} → ${c.then.text}` : c.text) + (c.start ? ` @${c.start.join(',')}` : ''),
        success: Boolean(c.judge(m, world)),
        reply: world.reply,
        replyMs: outputs.length ? outputs[0].t - t0 : null,
        firstMotionMs: firstMotion,
        totalMs: Date.now() - t0,
        timedOut: Date.now() >= deadline,
        stillActing: lastState.acting,
        motion: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(+v).toFixed(2)])),
        world: { pigsBefore: world.pigsBefore, pigsAfter: world.pigsAfter, pigKillsBefore: world.pigKillsBefore, pigKillsAfter: world.pigKillsAfter, logsBefore: world.logsBefore, logsAfter: world.logsAfter, cowDistAfter: world.cowDistAfter },
    };
}

const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const results = [];
for (const [i, c] of CASES.entries()) {
    if (only && !only.includes(i)) continue;
    for (let r = 0; r < REPEATS; r++) {
        const row = await runCase(c);
        results.push(row);
        console.log(JSON.stringify(row));
        writeFileSync(OUT, JSON.stringify(results, null, 2));
    }
}
await reset();
process.exit(0);
