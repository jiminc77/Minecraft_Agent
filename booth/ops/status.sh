#!/bin/bash
# Print health of both demos as OK/FAIL lines plus the state of every unit.
python3 - <<'PY'
import json, urllib.error, urllib.request

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        try:
            return json.load(e), None
        except Exception:
            return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)

def show(name, ok, note):
    print(f"{'OK  ' if ok else 'FAIL'} {name:<14}{note}")

h, err = get('http://127.0.0.1:8772/health')
if h is None:
    show('minecraft', False, f'응답 없음 ({err})')
else:
    show('llm', h.get('llm_ready'), 'booth-vllm-30b (켠 직후 5분은 FAIL이 정상)')
    show('minecraft', True, f"phase={h.get('phase')}")
    show('agent', h.get('agent_in_game'), 'booth-stability-mindcraft')
    show('viewer', h.get('viewer_in_game'), 'booth-stability-client')
    age = h.get('frame_age_ms')
    show('frame', age is not None and age < 2000, f'frame_age_ms={age}')

u, err = get('http://127.0.0.1:8080/api/ready')
if u is None:
    show('ungyeol', False, f'ungyeol-api 응답 없음 ({err})')
else:
    show('ungyeol', (u.get('saju') or {}).get('ok'), 'ungyeol-api')
    show('ungyeol-vlm', (u.get('vlm') or {}).get('ok'), 'ungyeol-vlm (켠 직후 5분은 FAIL이 정상)')
PY
echo
# The watchdog service is a short oneshot run by the timer, so its own state is not shown.
systemctl --user list-units 'booth-*' 'ungyeol-*' --no-pager --no-legend --plain |
  grep -v '^booth-stability-watchdog.service' | awk '{printf "%-36s %s %s\n", $1, $3, $4}'
