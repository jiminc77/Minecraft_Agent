#!/usr/bin/env bash
set -e
cd ~/Codex/mindcraft-trial
for pair in "Qwen/Qwen2.5-7B-Instruct 8010 v2-qwen7b" "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8 8011 v2-qwen3-30b"; do
  set -- $pair
  python3 - "$1" "$2" <<"PY"
import json,sys
p=json.load(open("booth-profile.json")); p["model"]["model"]=sys.argv[1]; p["model"]["url"]=f"http://127.0.0.1:{sys.argv[2]}/v1"
json.dump(p,open("mindcraft/profiles/booth.json","w"),ensure_ascii=False,indent=4)
PY
  systemctl --user restart booth-mindcraft; sleep 25
  (cd gateway && REPEATS=3 OUT=eval-$3.json node eval.mjs > eval-$3.log 2>&1)
  echo "== $3"; python3 gateway/summarize.py gateway/eval-$3.json
done
cp booth-profile.json mindcraft/profiles/booth.json; systemctl --user restart booth-mindcraft
