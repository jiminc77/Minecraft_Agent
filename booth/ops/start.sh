#!/bin/bash
# Start both booth demos on spark: Minecraft and Ungyeol. They share booth-vllm-30b.
systemctl --user start --no-block booth-mc booth-vllm-30b booth-stability-xvfb booth-stability-client \
  booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer ungyeol-vlm ungyeol-api
echo "시작했습니다. 약 5분 뒤 ops/status.sh로 확인하세요."
