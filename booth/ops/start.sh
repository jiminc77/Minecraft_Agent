#!/bin/bash
# Start the whole booth. The LLM needs 3-5 minutes before commands work.
systemctl --user start booth-mc booth-vllm-30b booth-stability-xvfb booth-stability-client \
  booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer
echo "부스를 시작했습니다. 3~5분 뒤 ops/status.sh로 확인하세요."
