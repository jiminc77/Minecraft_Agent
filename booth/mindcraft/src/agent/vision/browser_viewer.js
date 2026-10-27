import settings from '../settings.js';

// prismarine-viewer pulls in the native `canvas` module, which has no arm64 prebuild;
// load it only when the bot view is enabled.
export function addBrowserViewer(bot, count_id) {
    if (!settings.render_bot_view) return;
    import('prismarine-viewer').then(({ default: prismarineViewer }) => {
        prismarineViewer.mineflayer(bot, { port: 3000+count_id, firstPerson: true, });
    });
}
