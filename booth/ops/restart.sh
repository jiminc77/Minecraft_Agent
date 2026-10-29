#!/bin/bash
# Restart both demos, or only one with "minecraft" or "ungyeol".
# Restarting one demo keeps the shared LLM (booth-vllm-30b) running.
MC='booth-mc booth-stability-xvfb booth-stability-client booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer'
UG='ungyeol-api ungyeol-vlm'
case "${1:-all}" in
  minecraft) systemctl --user restart --no-block $MC; echo "마인크래프트를 재시작했습니다. 1분 뒤 ops/status.sh로 확인하세요." ;;
  ungyeol) systemctl --user restart --no-block $UG; echo "운결을 재시작했습니다. 1분 뒤 ops/status.sh로 확인하세요." ;;
  all) systemctl --user restart --no-block booth-vllm-30b $MC $UG; echo "전체를 재시작했습니다. 약 5분 뒤 ops/status.sh로 확인하세요." ;;
  *) echo "사용법: restart.sh [minecraft|ungyeol]"; exit 1 ;;
esac
