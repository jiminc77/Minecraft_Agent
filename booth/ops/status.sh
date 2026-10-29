#!/bin/bash
# Print booth health as OK/FAIL lines plus the state of every booth unit.
python3 - <<'EOF'
import json, urllib.request
try:
    with urllib.request.urlopen('http://127.0.0.1:8772/health', timeout=5) as r:
        h = json.load(r)
except Exception as e:
    print(f'FAIL gateway        응답 없음 ({e})')
    raise SystemExit
checks = [
    ('gateway', True, f"phase={h.get('phase')}"),
    ('llm', h.get('llm_ready'), 'booth-vllm-30b (시작 직후 3~5분은 false가 정상)'),
    ('agent', h.get('agent_in_game'), 'booth-stability-mindcraft'),
    ('viewer', h.get('viewer_in_game'), 'booth-stability-client'),
    ('frame', h.get('frame_age_ms') is not None and h['frame_age_ms'] < 2000, f"frame_age_ms={h.get('frame_age_ms')}"),
]
for name, ok, note in checks:
    print(f"{'OK  ' if ok else 'FAIL'} {name:<14}{note}")
EOF
echo
# The watchdog service is a short oneshot run by the timer, so its own state is not shown.
systemctl --user list-units 'booth-*' --no-pager --no-legend --plain | grep -v '^booth-stability-watchdog.service' |
  awk '{printf "%-36s %s %s\n", $1, $3, $4}'
