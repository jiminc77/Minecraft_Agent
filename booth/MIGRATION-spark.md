# AILAB-spark-remote 이전 기록 (2026-10-27)

원본: `AILAB-simx-remote:~/Codex/mindcraft-stability-20261002` (x86_64, RTX PRO 6000, Docker).
대상: `AILAB-spark-remote:/home/user/Workspace/Minecraft_Agent/booth` (aarch64 GB10, Ubuntu 24.04, Docker 없음).
포트·설정·모델은 원본과 같습니다: 게이트웨이 8772, MindServer 8086, Paper 25571, RCON 25581, vLLM 8011, 화면 `:95`.

## 배치

| 위치 | 내용 |
|---|---|
| `booth/` | 원본 운영본 전체 (월드 `mc-data`, 결과, 백업, 감사 로그 포함) |
| `tools/node`, `tools/jdk` | Node 20.20.2 linux-arm64, Temurin JDK 21 aarch64 |
| `vllm-env/` | vLLM 0.32.0 (PyPI aarch64 휠, torch 2.13+cu130) |
| `mc-launcher/` | portablemc 4.4.1 (5.x는 명령 형식이 달라 고정) |
| `booth/mc-client` | 클라이언트 1.21.4 + LWJGL 3.3.3 arm64 네이티브, `--jvm`으로 Temurin 사용 |
| `~/.cache/huggingface` | Qwen/Qwen3-30B-A3B-Instruct-2507-FP8 (30GB) |

옮기지 않은 것: x86 `node_modules`와 `korean-env`(대상에서 재설치), `mc-client/bin`(portablemc 네이티브 추출 잔여물 38GB), Mojang x64 JVM.

## 원본과 달라진 점

- Paper를 Docker 대신 `booth-mc` user 유닛에서 Java로 직접 실행합니다. Docker의 포트 매핑 대신 `server.properties`에 `server-ip=127.0.0.1`, `server-port=25571`, `rcon.port=25581`을 넣었습니다(원본은 `server.properties.docker-orig`). RCON도 127.0.0.1에만 열립니다.
- Mindcraft `src/agent/vision/vision_interpreter.js`, `src/agent/vision/browser_viewer.js`: 카메라(`node-canvas-webgl`→`gl`)와 `prismarine-viewer`(→`canvas`)를 비전·뷰어가 켜졌을 때만 동적으로 불러옵니다. 두 네이티브 모듈은 arm64 사전 빌드가 없어 설치되지 않으며, 부스 설정(`allow_vision`/`render_bot_view` 꺼짐)에서는 쓰이지 않습니다.
- `npm ci --ignore-scripts` 후 `npx patch-package`를 실행했습니다. `mineflayer` 패치 실패는 원본과 같은 상태입니다(설치 버전 4.39.0).
- 클라이언트 유닛이 시작 전에 2분 넘은 `mc-client/bin/*`를 지웁니다.
- 서비스 설치: `python3 ops/install-spark-services.py` (`--write-only`로 파일만 생성). Mindcraft 설정은 `ops/spark-settings.json`.
- vLLM 시작 시 Triton이 C 보조 모듈을 컴파일하는데 `Python.h`가 없어 실패했습니다. 설치된 Python과 같은 버전(3.12.3-1ubuntu0.17)의 `python3.12-dev`, `libpython3.12-dev` deb를 `apt-get download`로 받아 `tools/pyheaders/root`에 풀고, vLLM 유닛에 `CPATH`로 지정했습니다(root 권한 불필요).
- vLLM은 GB10에서 시작에 약 5분 걸립니다(가중치 로딩 약 3분). 그동안 게이트웨이 health의 `llm_ready`는 false입니다.
- 노트북의 `com.jimin.minecraft-booth-tunnel` LaunchAgent가 이제 `AILAB-spark-remote`로 8772를 포워딩합니다.
- simx의 `booth-stability-*` 유닛과 타이머는 disable, Docker `booth-stability-mc`는 `--restart no`로 바꿨습니다. 파일·월드·데이터는 지우지 않았습니다.

## 호스트 조치 (2026-10-27, 사용자가 sudo로 실행)

끊어진 logind 의존성 링크 제거, `nvidia-driver-580-open`과 `linux-modules-nvidia-580-open-nvidia-hwe-24.04`(7.0 커널용), `xvfb ffmpeg libgl1-mesa-dri libglx-mesa0 libegl1 x11-utils` 설치, `loginctl enable-linger user`, 재부팅.

## spark 검증 (2026-10-27)

`ops/run-spark-verify.sh`로 STABILIZATION.md의 검증 세트를 다시 실행했습니다. 결과는 `results/spark-20261027/`에 있고, simx 당시 결과 파일은 덮어쓰지 않았습니다.

| 검사 | 결과 |
|---|---|
| 단위 검사 (`node --test tests/*.test.mjs`) | 59/59 |
| 30B 해석 검사 (`semantic-eval`) | 단일 발화 50/50, 대화 6/6 |
| 실게임 기본 (`redesign-live`) | 7/8 |
| 취소·다중 탭 (`resilience-live`) | 5/7 |
| 복합 작업 (`advanced-live`) | 6/6 |
| 확장 이동 (`extended-motion-live`) | 7/7 |
| 장애 복구 (`recovery-live`) | 3/4 |
| 무입력 초기화 (`idle-reset`) | 1/1 (123.2초) |

실패 4건은 모두 수동 키 조작(`keys` 메시지)을 시험하는 사례입니다. 운영본 CHANGELOG에 적힌 대로 수동 조작은 이미 제거되었고 게이트웨이(simx와 해시 동일)는 `keys` 메시지를 무시하므로, 이 사례들은 현재 기능에 해당하지 않습니다. 수동 조작 외 사례는 모두 통과했습니다. 브라우저(노트북 터널 경유)에서 `돼지 한 마리 잡아 줘` 실행과 3인칭 화면을 확인했습니다.

대조 검사 24개는 다시 실행하지 않았습니다.

### 호스트 재부팅 (2026-10-27 10:31 UTC)

서비스 설치 후 재부팅했고, 부팅 약 3.5분 뒤 health가 `llm_ready`, `agent_in_game`, `viewer_in_game` 모두 true가 되었습니다. 그 과정에서 Xvfb가 부팅 직후 한 번 segfault로 종료되었고, Mindcraft가 Paper보다 먼저 떠 접속에 실패했습니다. 두 경우 모두 `Restart=always`와 watchdog으로 자동 복구되었습니다.

## simx 정리 (2026-10-27)

코드 관리는 https://github.com/jiminc77/Minecraft_Agent 로 옮겼습니다. simx에서는 `~/Codex`의 부스 관련 디렉터리 8개(mindcraft-stability/trial/eval/research/staging, openha-trial, steve-booth, experiments), user 유닛, Docker 컨테이너 7개, 부스 전용 HF 모델 캐시 5개를 삭제했습니다. `itzg/minecraft-server` 이미지와 다른 프로젝트의 모델 캐시는 남겼습니다. 따라서 simx의 경로를 언급하는 문서(STABILIZATION.md 등)는 당시 기록으로만 읽어야 합니다.

## 이전 당시 발견한 호스트 문제

- 실행 중인 커널 `7.0.0-1019-nvidia`용 NVIDIA 모듈이 없어 GPU를 쓸 수 없었습니다.
- 제거된 `nvidia-conf-xconfig` 패키지가 남긴 끊어진 링크 `/etc/systemd/system/systemd-logind.service.requires/nvidia-conf-xconfig.service` 때문에 `systemd-logind`가 시작하지 못했습니다. 그 결과 SSH 세션이 사용자 슬라이스로 가지 않고 2GB로 제한된 `system.slice/ssh.service`에 남아, 그 안에서 띄운 Paper가 OOM으로 종료되었습니다. linger와 user systemd도 쓸 수 없었습니다.
