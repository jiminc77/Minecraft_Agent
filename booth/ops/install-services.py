#!/usr/bin/env python3
"""Persist the running booth's exact launch configuration; no shared system changes."""
from pathlib import Path
import subprocess, datetime, sys
root=Path.home()/'Codex/mindcraft-stability-20261002'
units=['booth-vllm-30b','booth-stability-xvfb','booth-stability-client','booth-stability-mindcraft','booth-stability-gateway']
if '--without-model' in sys.argv:units.remove('booth-vllm-30b')
dest=Path.home()/'.config/systemd/user';dest.mkdir(parents=True,exist_ok=True)
backup=root/'backups'/('services-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir(parents=True)
for name in units:
 raw=subprocess.check_output(['systemctl','--user','cat',name],text=True)
 (backup/(name+'.service')).write_text(raw)
 raw='\n'.join(line for line in raw.splitlines() if not line.startswith('#') and not line.startswith(('Restart=','RestartSec=','TimeoutStopSec=','KillMode=','StartLimitIntervalSec=')))
 # Keep exact environment, executable and working directory from the active service.
 raw=raw.replace('[Unit]','[Unit]\nStartLimitIntervalSec=0')
 raw=raw.replace('[Service]','[Service]\nRestart=always\nRestartSec=5\nTimeoutStopSec=20\nKillMode=control-group')
 if name=='booth-stability-client':raw=raw.replace('[Unit]','[Unit]\nAfter=booth-stability-xvfb.service\nRequires=booth-stability-xvfb.service')
 raw+='\n[Install]\nWantedBy=default.target\n'
 (dest/(name+'.service')).write_text(raw)
(dest/'booth-stability-watchdog.service').write_text('[Unit]\nDescription=Minecraft booth recovery check\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 '+str(root/'ops/watchdog.py')+'\n')
(dest/'booth-stability-watchdog.timer').write_text('[Unit]\nDescription=Minecraft booth recovery timer\n[Timer]\nOnBootSec=120\nOnUnitActiveSec=20\n[Install]\nWantedBy=timers.target\n')
subprocess.run(['systemctl','--user','stop',*reversed(units)],check=True)
subprocess.run(['systemctl','--user','daemon-reload'],check=True)
subprocess.run(['systemctl','--user','enable',*units],check=True)
subprocess.run(['systemctl','--user','start',*units],check=True)
subprocess.run(['docker','update','--restart','unless-stopped','booth-stability-mc'],check=True)
subprocess.run(['systemctl','--user','enable','--now','booth-stability-watchdog.timer'],check=True)
print('Saved service backup:',backup)
