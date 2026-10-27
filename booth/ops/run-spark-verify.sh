#!/bin/bash
# Re-run the STABILIZATION.md verification set on spark without touching the simx result files.
cd /home/user/Workspace/Minecraft_Agent/booth || exit 1
export PATH=/home/user/Workspace/Minecraft_Agent/tools/node/bin:$PATH
OUT=results/spark-20261027
ORIG=$OUT/.orig
mkdir -p "$ORIG"
for t in semantic-eval redesign-live resilience-live advanced-live extended-motion-live recovery-live idle-reset; do
  f=results/$t.json
  [ -f "$f" ] && [ ! -f "$ORIG/$t.json" ] && cp -p "$f" "$ORIG/$t.json"
  echo "=== $t start $(date +%T)"
  timeout 1800 node tests/$t.mjs > "$OUT/$t.log" 2>&1
  echo "=== $t exit $? $(date +%T)"
  [ -f "$f" ] && mv "$f" "$OUT/$t.json"
  [ -f "$ORIG/$t.json" ] && cp -p "$ORIG/$t.json" "$f"
done
echo "=== all done $(date +%T)"
