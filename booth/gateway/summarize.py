"""Summarize eval JSON: success rate, latency and attack/dig inputs per command."""
import collections
import json
import statistics
import sys

rows = json.load(open(sys.argv[1]))
groups = collections.OrderedDict()
for row in rows:
    groups.setdefault(row["text"], []).append(row)

ok = 0
for text, runs in groups.items():
    wins = sum(r["success"] for r in runs)
    ok += wins
    reply = [r["replyMs"] for r in runs if r["replyMs"] is not None]
    motion = [r["firstMotionMs"] for r in runs if r["firstMotionMs"] is not None]
    attacks = [r["motion"]["attack"] + r["motion"]["dig"] for r in runs]
    failed = [r["reply"][-45:] for r in runs if not r["success"]]
    print(f"{wins}/{len(runs)}  {text:<28} reply~{statistics.median(reply) if reply else '-'}ms "
          f"motion~{statistics.median(motion) if motion else '-'}ms  attack+dig={attacks}"
          + (f"  fail: {failed}" if failed else ""))
print(f"TOTAL {ok}/{len(rows)}")
