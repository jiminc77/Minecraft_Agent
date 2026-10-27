// Generic short-motion commands for the booth. They take parameters chosen by the
// language model; no phrase-specific behaviour lives here.
import * as skills from '../library/skills.js';

const DEG = Math.PI / 180;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const MOVE_CONTROLS = {
    forward: ['forward'], back: ['back'], left: ['left'], right: ['right'],
    forward_left: ['forward', 'left'], forward_right: ['forward', 'right'],
    back_left: ['back', 'left'], back_right: ['back', 'right'],
};

function runAsAction(label, actionFn) {
    return async function (agent, ...args) {
        const result = await agent.actions.runAction(`action:${label}`, async () => {
            await actionFn(agent, ...args);
        }, { timeout: 1 });
        if (result.interrupted && !result.timedout)
            return;
        return result.message;
    };
}

async function smoothLook(bot, yaw, pitch, durationMs = 450) {
    const startYaw = bot.entity.yaw;
    const startPitch = bot.entity.pitch;
    let delta = yaw - startYaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const steps = Math.max(1, Math.round(durationMs / 50));
    for (let i = 1; i <= steps; i++) {
        if (bot.interrupt_code) return false;
        const t = i / steps;
        await bot.look(startYaw + delta * t, startPitch + (pitch - startPitch) * t, true);
        await sleep(50);
    }
    return true;
}

export const boothActionsList = [
    {
        name: '!move',
        description: 'Walk a given number of blocks relative to where you are facing, without turning or breaking anything. Stops when the distance is reached.',
        params: {
            'direction': { type: 'string', description: 'One of "forward", "back", "left", "right", "forward_left", "forward_right", "back_left", "back_right" (the last four are diagonals).' },
            'blocks': { type: 'float', description: 'How many blocks to walk.', domain: [0.5, 30, '[]'] }
        },
        perform: runAsAction('move', async (agent, direction, blocks) => {
            const bot = agent.bot;
            const controls = MOVE_CONTROLS[direction];
            if (!controls) {
                skills.log(bot, `Unknown direction "${direction}".`);
                return;
            }
            bot.modes.pause('unstuck');
            const start = bot.entity.position.clone();
            const deadline = Date.now() + 2000 + blocks * 600;
            let lastPos = start.clone();
            let stuckSince = null;
            let reached=false;
            // Stop inside a physics tick, even when several ticks catch up before
            // the 50 ms wall-clock loop can resume.
            const checkDistance=()=>{
                const p=bot.entity.position;
                if(Math.hypot(p.x-start.x,p.z-start.z)>=blocks-.15){reached=true;bot.clearControlStates();}
            };
            bot.on('physicsTick',checkDistance);
            for (const control of controls) bot.setControlState(control, true);
            try {
                while (!reached && !bot.interrupt_code && Date.now() < deadline) {
                    const pos = bot.entity.position;
                    const travelled = Math.hypot(pos.x - start.x, pos.z - start.z);
                    if (travelled >= blocks - 0.15) break;
                    const moved = Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z);
                    lastPos = pos.clone();
                    bot.setControlState('jump', bot.entity.isCollidedHorizontally);
                    if (moved < 0.01) {
                        stuckSince ??= Date.now();
                        if (Date.now() - stuckSince > 1200) break;
                    } else {
                        stuckSince = null;
                    }
                    await sleep(50);
                }
            } finally {
                bot.removeListener('physicsTick',checkDistance);
                bot.clearControlStates();
            }
            const end = bot.entity.position;
            const travelled = Math.hypot(end.x - start.x, end.z - start.z);
            skills.log(bot, `Walked ${direction} ${travelled.toFixed(1)} of ${blocks} blocks.`);
        })
    },
    {
        name: '!turn',
        description: 'Turn your body and view horizontally in place. Positive degrees turn right, negative turn left; 180 turns around.',
        params: {
            'degrees': { type: 'float', description: 'Degrees to turn (right is positive).', domain: [-360, 360, '[]'] }
        },
        perform: runAsAction('turn', async (agent, degrees) => {
            const bot = agent.bot;
            bot.modes.pause('idle_staring');
            const duration = Math.min(1200, 300 + Math.abs(degrees) * 4);
            await smoothLook(bot, bot.entity.yaw - degrees * DEG, bot.entity.pitch, duration);
            skills.log(bot, `Turned ${degrees} degrees.`);
        })
    },
    {
        name: '!lookVertical',
        description: 'Tilt your view up or down to an absolute angle without turning. 90 is straight up at the sky, 0 is straight ahead, -90 is straight down at the ground.',
        params: {
            'degrees': { type: 'float', description: 'Target pitch in degrees.', domain: [-90, 90, '[]'] }
        },
        perform: runAsAction('lookVertical', async (agent, degrees) => {
            const bot = agent.bot;
            bot.modes.pause('idle_staring');
            await smoothLook(bot, bot.entity.yaw, degrees * DEG, 500);
            skills.log(bot, `Now looking at pitch ${degrees} degrees.`);
        })
    },
    {
        name: '!jump',
        description: 'Jump in place a given number of times.',
        params: {
            'times': { type: 'int', description: 'Number of jumps.', domain: [1, 10, '[]'] }
        },
        perform: runAsAction('jump', async (agent, times) => {
            const bot = agent.bot;
            for (let i = 0; i < times && !bot.interrupt_code; i++) {
                bot.setControlState('jump', true);
                await sleep(250);
                bot.setControlState('jump', false);
                await sleep(450);
            }
            bot.clearControlStates();
            skills.log(bot, `Jumped ${times} times.`);
        })
    },
];
