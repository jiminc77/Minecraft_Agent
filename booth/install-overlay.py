"""Install only into an isolated, already booth-patched Mindcraft checkout."""
from pathlib import Path
import shutil, json, tarfile, datetime
root=Path(__file__).resolve().parent
assert root.name != 'mindcraft-trial', 'Never install this experiment into the operating booth.'
mc=root/'mindcraft'
assert (mc/'src/agent/mindserver_proxy.js').exists(), 'Copy the booth-patched checkout first.'
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=root/'backups'/stamp;backup.mkdir(parents=True,exist_ok=False)
with tarfile.open(backup/'agent-before.tar.gz','w:gz') as tar:
 for rel in ['src/agent/agent.js','src/mindcraft/mindserver.js','src/agent/booth_control.js','src/agent/mindserver_proxy.js','src/agent/commands/booth_actions.js']:
  tar.add(mc/rel,arcname=rel)
for name in ['booth_control.js','booth_executor.js','booth_contract.js','booth_geometry.js','booth_observation.js']:
 shutil.copy2(root/name,mc/'src/agent'/name)
shutil.copy2(root/'booth_actions.js',mc/'src/agent/commands/booth_actions.js')
p=mc/'src/agent/mindserver_proxy.js';s=p.read_text()
marker="this.socket.on('disconnect', () => { boothControl(this.agent, {type:'stop'}).catch(console.error); });"
if marker not in s:
 needle="this.socket.on('booth-manual',"
 assert needle in s
 s=s.replace(needle,marker+'\n        '+needle)
 p.write_text(s)
print('Installed isolated overlay; backup:',backup)

p=mc/'src/mindcraft/mindserver.js';s=p.read_text()
old="conn.socket.timeout(15000).emit('booth-control', data"
new="conn.socket.timeout(data?.type === 'execute' ? 85000 : 15000).emit('booth-control', data"
if old in s:s=s.replace(old,new);p.write_text(s)
else:assert new in s, 'Unknown booth-control bridge; inspect before changing.'

p=mc/'src/agent/agent.js';s=p.read_text()
needle="this.bot.on('idle', () => {"
replacement=needle+"\n            if(this.bot.boothManualActive)return; // explicit manual owner controls release"
if replacement not in s:
 assert needle in s
 p.write_text(s.replace(needle,replacement))
