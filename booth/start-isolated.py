"""Recreate transient units for the existing isolated trial. Never touch booth-* originals."""
from pathlib import Path
import subprocess,json
r=Path(__file__).resolve().parent
assert r.name!='mindcraft-trial'
settings=json.loads((r/'settings.json').read_text())
assert settings['port']==25571 and settings['mindserver_port']==8086
subprocess.run(['docker','start','booth-stability-mc'],check=True)
def unit(suffix,cmd,env={},cwd=r):
 name='booth-stability-'+suffix
 status=subprocess.run(['systemctl','--user','is-active','--quiet',name])
 if status.returncode==0:return
 loaded=subprocess.check_output(['systemctl','--user','show',name,'-p','LoadState','--value'],text=True).strip()
 if loaded=='loaded':
  subprocess.run(['systemctl','--user','restart',name],check=True);return
 args=['systemd-run','--user','--unit='+name,'--working-directory='+str(cwd)]
 for k,v in env.items():args+=['-E',k+'='+v]
 subprocess.run(args+cmd,check=True)
unit('mindcraft',['/usr/bin/node','main.js'],{'SETTINGS_JSON':json.dumps(settings)},r/'mindcraft')
unit('xvfb',[str(Path.home()/'Codex/steve-booth/tools/xvfb/usr/bin/Xvfb'),':95','-screen','0','854x480x24','-nolisten','tcp'])
unit('client',[str(Path.home()/'Codex/mindcraft-trial/mc-launcher/bin/portablemc'),'--main-dir',str(r/'mc-client'),'start','1.21.4','-u','Viewer','-s','127.0.0.1','-p','25571','--resolution','854x480'],{'DISPLAY':':95','LIBGL_ALWAYS_SOFTWARE':'1'})
unit('gateway',['/usr/bin/node','server.js'],{'BOOTH_PORT':'8772','BOOTH_MINDSERVER':'http://127.0.0.1:8086','BOOTH_RCON_PORT':'25581','BOOTH_CAPTURE_DISPLAY':':95','BOOTH_MODEL_LABEL':'Qwen3-30B + verified actions'},r/'gateway')
