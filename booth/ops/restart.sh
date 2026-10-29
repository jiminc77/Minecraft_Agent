#!/bin/bash
# Restart the whole booth (off and on). The LLM needs 3-5 minutes before commands work again.
# --keep-llm leaves booth-vllm-30b running for the other demo (운결) that shares it.
LLM=booth-vllm-30b
[ "$1" = --keep-llm ] && LLM=
systemctl --user restart booth-mc $LLM booth-stability-xvfb booth-stability-client \
  booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer
if [ -n "$LLM" ]; then
  echo "재시작했습니다. 3~5분 뒤 ops/status.sh로 확인하세요."
else
  echo "LLM은 그대로 두고 재시작했습니다. 1~2분 뒤 ops/status.sh로 확인하세요."
fi
