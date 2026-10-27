// Booth stage on the local Paper server: one-time snapshot and fast restore.
export const ARENA = {
    spawn: { x: 330.5, y: 87, z: -349.5, yaw: 180, pitch: 0 },
    min: { x: 306, y: 70, z: -373 },
    max: { x: 354, y: 110, z: -325 },
    backupOffsetX: 2000,
    animals: [
        ['pig', 333.5, -357.5], ['pig', 326.5, -355.5], ['pig', 336.5, -352.5],
        ['cow', 322.5, -352.5], ['sheep', 339.5, -346.5],
    ],
};

const box = (a, dx = 0) => `${a.min.x + dx} ${a.min.y} ${a.min.z} ${a.max.x + dx} ${a.max.y} ${a.max.z}`;

async function forceload(rcon, dx) {
    await rcon.command(`forceload add ${ARENA.min.x + dx} ${ARENA.min.z} ${ARENA.max.x + dx} ${ARENA.max.z}`);
}

export async function prepareArena(rcon) {
    for (const command of [
        'gamerule commandModificationBlockLimit 200000',
        'gamerule doDaylightCycle false', 'gamerule doWeatherCycle false',
        'gamerule doMobSpawning false', 'gamerule doInsomnia false',
        'gamerule announceAdvancements false', 'gamerule sendCommandFeedback false',
        'time set 1000', 'weather clear',
    ]) await rcon.command(command);
    await forceload(rcon, 0);
    await forceload(rcon, ARENA.backupOffsetX);
    // Wait for the forceloaded chunks to generate before copying.
    await new Promise(resolve => setTimeout(resolve, 3000));
    const { min } = ARENA;
    return rcon.command(`clone ${box(ARENA)} ${min.x + ARENA.backupOffsetX} ${min.y} ${min.z} replace force`);
}

export async function restoreArena(rcon, botName) {
    const { min, spawn } = ARENA;
    const out = [];
    out.push(await rcon.command(`clone ${box(ARENA, ARENA.backupOffsetX)} ${min.x} ${min.y} ${min.z} replace force`));
    out.push(await rcon.command(`kill @e[type=!player,x=${min.x},y=${min.y},z=${min.z},dx=${ARENA.max.x - min.x},dy=${ARENA.max.y - min.y},dz=${ARENA.max.z - min.z}]`));
    await new Promise(resolve=>setTimeout(resolve,1200));
    out.push(await rcon.command(`kill @e[type=item,x=${min.x},y=${min.y},z=${min.z},dx=${ARENA.max.x-min.x},dy=${ARENA.max.y-min.y},dz=${ARENA.max.z-min.z}]`));
    for (const [type, x, z] of ARENA.animals)
        out.push(await rcon.command(`execute positioned ${x} 0 ${z} positioned over motion_blocking_no_leaves run summon ${type} ~ ~ ~`));
    for (const command of [
        `clear ${botName}`, `effect clear ${botName}`, `gamemode survival ${botName}`,
        `tp ${botName} ${spawn.x} ${spawn.y} ${spawn.z} ${spawn.yaw} ${spawn.pitch}`,
        'time set 1000', 'weather clear',
    ]) out.push(await rcon.command(command));
    return out;
}
