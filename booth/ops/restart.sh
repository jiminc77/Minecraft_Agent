#!/bin/bash
# Restart the whole booth (off and on). The LLM needs 3-5 minutes before commands work again.
systemctl --user restart booth-mc booth-vllm-30b booth-stability-xvfb booth-stability-client \
  booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer
echo "재시작했습니다. 3~5분 뒤 ops/status.sh로 확인하세요."
