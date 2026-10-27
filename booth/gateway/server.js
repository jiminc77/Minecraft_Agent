// Booth gateway: serves the visitor UI, proxies the first-person viewer, and
// bridges visitor input to the Mindcraft agent and the Paper server.
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { io } from 'socket.io-client';
import { Rcon } from './rcon.js';
import { restoreArena } from './arena.js';
import {normalizeKorean} from './korean-normalizer.js';
import { SemanticPlanner } from './semantic-planner.js';
import { Conversation } from './conversation.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BOOTH_PORT || 8772);
const AGENT = process.env.BOOTH_AGENT || 'Steve';
const RUN_SECONDS = Number(process.env.BOOTH_RUN_SECONDS || 120);
const MINDSERVER = process.env.BOOTH_MINDSERVER || 'http://127.0.0.1:8081';
const VIEWER_NAME = process.env.BOOTH_VIEWER_NAME || 'Viewer';
const CAPTURE_DISPLAY = process.env.BOOTH_CAPTURE_DISPLAY || ':90';
const CAPTURE_SIZE = process.env.BOOTH_CAPTURE_SIZE || '854x480';
const CAPTURE_FPS = Number(process.env.BOOTH_CAPTURE_FPS || 20);
const MODEL = process.env.BOOTH_MODEL_LABEL || '';

const rcon = new Rcon({
    port: Number(process.env.BOOTH_RCON_PORT || 25576),
    password: readFileSync(process.env.BOOTH_RCON_SECRET || path.join(ROOT, '../rcon.secret'), 'utf8').trim(),
});

const state = {
    phase: 'starting', korean: '', english: '', message: '에이전트를 준비하고 있습니다…',
    active_since: null, run_seconds: RUN_SECONDS, mode: 'mindcraft', translation_model: MODEL,
};
const update = fields => Object.assign(state, fields);

// ---- Mindcraft connection -------------------------------------------------
const mind = io(MINDSERVER, { reconnection: true });
let agentInGame = false;
let viewerInGame = false;
let viewerCheckedAt=0;
let llmReady=false;
let lastFrameAt = 0;
let busy = false; // reset in progress

mind.on('connect', () => console.log('MindServer connected'));
mind.on('disconnect', () => { agentInGame = false; conversation.cancel({clearHistory:true}); update({phase:'recovering',message:'에이전트 연결이 끊겨 요청을 취소했어요.'}); });
mind.on('agents-status', agents => {
    agentInGame = agents.some(a => a.name === AGENT && a.in_game);
    if (!agentInGame && !busy) update({ phase: 'recovering', message: '에이전트를 다시 연결하고 있습니다…' });
    else if (agentInGame && ['starting', 'recovering'].includes(state.phase)) resetWorld('월드를 준비하고 있습니다…');
});
// ---- Real client view: a spectator client rides Steve's camera ------------
let frame = null;
let frameSeq = 0;

function startCapture() {
    const ffmpeg = spawn('ffmpeg', ['-loglevel', 'error', '-f', 'x11grab', '-framerate', String(CAPTURE_FPS),
        '-video_size', CAPTURE_SIZE, '-i', CAPTURE_DISPLAY, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']);
    let buffer = Buffer.alloc(0);
    ffmpeg.stdout.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
            const start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
            const end = start < 0 ? -1 : buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
            if (end < 0) break;
            frame = buffer.subarray(start, end + 2);
            frameSeq++;
            lastFrameAt = Date.now();
            buffer = buffer.subarray(end + 2);
        }
    });
    ffmpeg.stderr.on('data', data => console.error('capture:', String(data).trim()));
    ffmpeg.on('exit', code => {
        console.error(`capture exited (${code}); restarting`);
        setTimeout(startCapture, 2000);
    });
}

async function spectate() {
    try {
        await rcon.command(`gamemode spectator ${VIEWER_NAME}`);
        await rcon.command(`execute as ${VIEWER_NAME} run spectate`);
        await new Promise(resolve => setTimeout(resolve, 400));
        await rcon.command(`spectate ${AGENT} ${VIEWER_NAME}`);
    } catch (error) {
        console.error('spectate failed', error.message);
    }
}

// Re-attach the spectator camera if it drifted away (reconnects, respawns).
setInterval(async () => {
    if (busy) return;
    try {
        const pos = async name => (await rcon.command(`data get entity ${name} Pos`)).match(/-?[\d.]+(?=d)/g)?.map(Number);
        const [a, b] = [await pos(VIEWER_NAME), await pos(AGENT)];
        viewerInGame=!!a;viewerCheckedAt=Date.now();
        if (a && b) {
            // Position equality does not prove spectator attachment after a client restart.
            await rcon.command(`gamemode spectator ${VIEWER_NAME}`);
            await rcon.command(`spectate ${AGENT} ${VIEWER_NAME}`);
        }
    } catch { viewerInGame=false;viewerCheckedAt=Date.now(); }
}, 10000);

const emit = (event, ...args) => new Promise(resolve => {
    if (!mind.connected) return resolve(null);
    mind.timeout(event==='booth-state'?5000:args[0]?.type==='execute'?100000:10000).emit(event, AGENT, ...args, (err, value) => resolve(err ? null : value));
});
const agentState = () => emit('booth-state');
const agentControl = data => emit('booth-control', data);
// A missing gateway must not leave a running or manual action latched.
setInterval(()=>{if(agentInGame)void agentControl({type:'heartbeat'});},1000);
const audit = record => appendFileSync(process.env.BOOTH_AUDIT_FILE || path.join(ROOT,'conversation.jsonl'),JSON.stringify({time:new Date().toISOString(),...record})+'\n');
const planner = new SemanticPlanner({audit});
void normalizeKorean('').catch(error=>console.error('Korean normalizer warmup:',error.message));
async function checkModel(){
    try{const r=await fetch(`${planner.url}/models`,{signal:AbortSignal.timeout(1500)});const body=await r.json();llmReady=r.ok&&body.data?.some(m=>m.id===planner.model)||false;}catch{llmReady=false;}
    update({llm_ready:llmReady});
}
void checkModel();setInterval(checkModel,3000);
planner.queryObservation = async (selector, signal) => {
    signal?.throwIfAborted();
    const result = await agentControl({type:'observe',selector});
    signal?.throwIfAborted();
    if (!result?.targets) throw Error('target_observation_missing');
    return result;
};
const conversation = new Conversation({control:agentControl,observe:agentState,planner,publish:update,audit});

async function resetWorld(message) {
    if (busy) return;
    busy = true;
    conversation.cancel({clearHistory:true});
    update({ phase: 'resetting', chat: [], korean: '', english: '', active_since: null, message });
    try {
        await agentControl({ type: 'stop' });
        await restoreArena(rcon, AGENT);
        await new Promise(resolve => setTimeout(resolve, 1200));
        await agentControl({ type: 'reset' });
        await spectate();
        update({ phase: 'ready', message: '명령을 입력하세요.' });
    } catch (error) {
        console.error('reset failed', error);
        update({ phase: 'error', message: `초기화 실패: ${error.message}` });
    } finally {
        busy = false;
    }
}

function sendPrompt(text) {
    update({ korean:text,english:'',active_since:Date.now()/1000 });
    void conversation.submit(text);
}
async function stopAgent() {
    update({phase:'stopping',message:'행동을 멈추고 있어요.'});
    const stopped=await conversation.stop();
    if(!stopped)return;
    conversation.add('assistant','행동을 멈췄어요.','stopped');
    conversation.show('stopped','행동을 멈췄어요.');
}

// Track the agent's activity and the per-command time limit.
setInterval(async () => {
    if (busy) return;
    if (state.active_since && Date.now() / 1000 - state.active_since >= RUN_SECONDS) {
        await resetWorld('행동 시간이 끝나 에이전트와 월드를 초기화하고 있습니다…');
        return;
    }
}, 250);

// ---- HTTP, viewer proxy and visitor WebSocket -----------------------------
const app = express();
app.get('/health', (req, res) => res.json({ ...state, agent_in_game: agentInGame, viewer_in_game:viewerInGame, viewer_checked_at:viewerCheckedAt, llm_ready:llmReady, frame_age_ms:lastFrameAt?Date.now()-lastFrameAt:null }));
app.use(express.static(path.join(ROOT, 'static'), { etag: false, setHeaders: res => res.set('Cache-Control', 'no-store') }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
        wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
    } else {
        socket.destroy();
    }
});

wss.on('connection', ws => {
    const timer = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'status', ...state }));
    }, 300);
    // Send only the newest frame and skip frames while the client is behind.
    let sentSeq = 0;
    const frames = setInterval(() => {
        if (ws.readyState !== ws.OPEN || !frame || frameSeq === sentSeq || ws.bufferedAmount > 256 * 1024) return;
        sentSeq = frameSeq;
        ws.send(frame);
    }, 1000 / CAPTURE_FPS / 2);
    ws.on('message', async raw => {
        let data;
        try { data = JSON.parse(raw); } catch { return; }
        if (data.type === 'prompt') {
            const text = String(data.text || '').replace(/\s+/g, ' ').trim();
            if (!text || text.length > 120) {
                ws.send(JSON.stringify({ type: 'input_error', message: '명령은 1~120자의 한 줄 문장으로 입력해 주세요.' }));
            } else if (!busy && agentInGame) {
                if(llmReady)sendPrompt(text);
                else{
                    audit({stage:'user_input_model_unavailable',text});
                    if(!await conversation.stop())return;
                    update({korean:text,active_since:Date.now()/1000});
                    conversation.add('user',text);
                    const message='언어 모델을 준비하고 있어요. 잠시 뒤 다시 입력해 주세요.';
                    conversation.add('assistant',message,'unavailable');conversation.show('unavailable',message);
                }
            }
        } else if (data.type === 'stop' && !busy) {
            await stopAgent();
        } else if (data.type === 'reset') {
            await resetWorld('에이전트와 월드를 초기화하고 있습니다…');
        }
    });
    ws.on('close', () => {
        clearInterval(timer);
        clearInterval(frames);
    });
});

startCapture();
server.listen(PORT, '127.0.0.1', () => console.log(`Booth gateway on http://127.0.0.1:${PORT}`));
