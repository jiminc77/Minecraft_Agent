#!/bin/bash
# Stop both booth demos. The watchdog timer goes first so it does not revive anything.
# Units stay enabled, so a host reboot starts everything again.
systemctl --user stop booth-stability-watchdog.timer
systemctl --user stop ungyeol-api ungyeol-vlm booth-stability-gateway booth-stability-mindcraft \
  booth-stability-client booth-stability-xvfb booth-vllm-30b booth-mc
systemctl --user list-units 'booth-*' 'ungyeol-*' --all --no-pager --no-legend --plain |
  grep -v '^booth-stability-watchdog.service' | awk '{printf "%-36s %s %s\n", $1, $3, $4}'
echo "모두 껐습니다. 다시 켜려면 ops/start.sh를 실행하세요."
