#!/usr/bin/env python3
"""Recover failed booth components, never replay visitor requests."""
import json, subprocess, urllib.request
from pathlib import Path
statefile=Path.home()/'.cache/minecraft-booth-watchdog.json'
try: counts=json.loads(statefile.read_text())
except (FileNotFoundError,ValueError): counts={}
try:
 with urllib.request.urlopen('http://127.0.0.1:8772/health',timeout=5) as response: health=json.load(response)
except Exception: health={}
checks={'gateway':bool(health),'mindcraft':health.get('agent_in_game',False),'client':health.get('viewer_in_game',False)}
for component,good in checks.items():
 if not health and component!='gateway':continue
 counts[component]=0 if good else counts.get(component,0)+1
 if counts[component]>=3:
  # Restart only this component. Stale conversation plans are never resumed.
  subprocess.run(['systemctl','--user','restart','booth-stability-'+component],check=True)
  counts[component]=0
statefile.parent.mkdir(parents=True,exist_ok=True);statefile.write_text(json.dumps(counts))
