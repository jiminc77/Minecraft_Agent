# 부스 운영 안내 (AILAB-spark-remote)

모든 서버 명령은 `ssh AILAB-spark-remote`로 접속한 뒤 실행합니다. 서비스는 모두 **user systemd 유닛**이므로 sudo가 필요 없습니다.

| 유닛 | 역할 | health 항목 |
|---|---|---|
| `booth-mc` | Minecraft 서버 (Paper, 25571) | — |
| `booth-vllm-30b` | LLM (vLLM, 8011). 시작에 3~5분 | `llm_ready` |
| `booth-stability-mindcraft` | 봇 Steve | `agent_in_game` |
| `booth-stability-xvfb` | 가상 화면 `:95` | — |
| `booth-stability-client` | 화면용 Minecraft 클라이언트 | `viewer_in_game`, `frame_age_ms` |
| `booth-stability-gateway` | 웹 UI (8772) | health 자체 |
| `booth-stability-watchdog.timer` | 20초마다 검사, 3회 연속 실패한 구성 요소 재시작 | — |

## 1. 실행

서버가 켜지면 모든 유닛이 자동으로 시작됩니다. 따로 할 일은 없습니다.

노트북에서는 LaunchAgent `com.jimin.minecraft-booth-tunnel`이 8772 터널을 자동으로 유지합니다. 브라우저에서 http://127.0.0.1:8772 를 엽니다.

터널을 직접 열 때는 다음 명령을 씁니다.

```bash
ssh -N -L 8772:127.0.0.1:8772 AILAB-spark-remote
```

## 2. 상태 확인

```bash
curl -s http://127.0.0.1:8772/health; echo
systemctl --user list-units 'booth-*'
```

정상일 때는 `"phase":"ready"`이고 `llm_ready`, `agent_in_game`, `viewer_in_game`이 모두 `true`입니다. `frame_age_ms`는 수백 ms 이하입니다.

로그는 다음과 같이 봅니다.

```bash
journalctl --user -u booth-stability-gateway -n 100 --no-pager
journalctl --user -u booth-vllm-30b -f
```

## 3. 시작·정지·재시작

```bash
# 한 구성 요소만 재시작
systemctl --user restart booth-stability-mindcraft

# 전체 정지: 타이머를 먼저 멈춰야 watchdog이 다시 살리지 않습니다
systemctl --user stop booth-stability-watchdog.timer
systemctl --user stop booth-stability-gateway booth-stability-mindcraft booth-stability-client booth-stability-xvfb booth-vllm-30b booth-mc

# 전체 시작
systemctl --user start booth-mc booth-vllm-30b booth-stability-xvfb booth-stability-client booth-stability-mindcraft booth-stability-gateway booth-stability-watchdog.timer
```

LLM을 재시작하면 3~5분 동안 명령을 받을 수 없습니다. 행사 중에는 꼭 필요할 때만 재시작합니다.

## 4. 문제별 대처

먼저 화면의 **행동 중지**나 **월드 초기화** 버튼을 눌러 봅니다. 그래도 안 되면 아래 표를 따릅니다.

| 증상 | 확인 | 대처 |
|---|---|---|
| 페이지가 안 열림 | 노트북에서 `curl -s 127.0.0.1:8772/health` | 응답이 없으면 터널 문제입니다. `launchctl kickstart -k gui/$(id -u)/com.jimin.minecraft-booth-tunnel`을 실행하고 `/tmp/minecraft-booth-tunnel.log`를 확인합니다. 서버에서는 응답이 오는데 노트북에서 안 오는 경우도 터널 문제입니다. |
| "언어 모델을 준비하고 있어요" / `llm_ready:false` | `journalctl --user -u booth-vllm-30b -n 50` | 부팅·재시작 직후 5분까지는 정상입니다. 그 뒤에도 false이면 `nvidia-smi`를 확인합니다. 실패하면 5절을 봅니다. |
| 봇이 없음 / `agent_in_game:false` | `systemctl --user is-active booth-mc` | `booth-mc`가 떠 있는지 확인한 뒤 `systemctl --user restart booth-stability-mindcraft`를 실행합니다. |
| 화면이 멈춤·검음 / `viewer_in_game:false` | `frame_age_ms` 값 | `systemctl --user restart booth-stability-xvfb booth-stability-client`를 실행합니다. 클라이언트가 붙기까지 30초 정도 걸립니다. |
| 봇이 이상하게 계속 움직임 | UI 상태 | **행동 중지** → **월드 초기화** 순서로 누르고, 그래도 계속되면 mindcraft를 재시작합니다. |
| 명령에 엉뚱하게 반응 | `booth/gateway/conversation.jsonl` 마지막 줄 | 모델이 해석한 계획이 기록되어 있습니다. 재현 문장을 남겨 두고 나중에 수정합니다. |
| 전체가 이상함 | — | 3절의 전체 정지 → 전체 시작 순서로 실행합니다. 마지막 수단은 서버 재부팅(`sudo reboot`)이며, 약 4분 뒤 자동으로 복구됩니다. |

watchdog은 1분 안팎의 장애를 자동으로 복구합니다. 복구된 뒤 이전 명령을 다시 실행하지는 않습니다.

## 5. 호스트 문제 (sudo 필요)

- **커널 업데이트 후 GPU가 사라짐** (`nvidia-smi` 실패, `/dev/nvidia0` 없음): 새 커널용 NVIDIA 모듈 패키지를 설치하고 재부팅합니다. 현재 사용 중인 패키지는 `linux-modules-nvidia-580-open-nvidia-hwe-24.04`입니다.
- **재부팅 후 서비스가 하나도 안 뜸** (`/run/user/1000` 없음, `systemctl --user` 실패): `systemctl status systemd-logind`과 `loginctl show-user user -p Linger`를 확인합니다. 이전에 끊어진 링크 `/etc/systemd/system/systemd-logind.service.requires/nvidia-conf-xconfig.service` 때문에 logind가 죽은 적이 있습니다.
- **vLLM이 `Python.h` 오류로 실패**: `tools/pyheaders`가 지워졌는지 확인합니다. 복구 방법은 `booth/MIGRATION-spark.md`에 있습니다.

## 6. 코드 수정과 반영

저장소는 https://github.com/jiminc77/Minecraft_Agent 이고, spark의 `/home/user/Workspace/Minecraft_Agent`가 작업 사본입니다.

```bash
cd /home/user/Workspace/Minecraft_Agent
git pull
systemctl --user restart booth-stability-gateway      # gateway/ 수정 시
systemctl --user restart booth-stability-mindcraft    # booth_*.js, mindcraft/ 수정 시
```

유닛 설정(포트, 경로, 환경 변수)은 `booth/ops/install-spark-services.py`에서 고친 뒤 `python3 booth/ops/install-spark-services.py`로 다시 설치합니다.

spark에는 아직 GitHub 푸시 인증이 없습니다. spark에서 직접 푸시하려면 `gh auth login`이나 배포 키를 먼저 설정합니다.

## 7. 수정 후 검증

```bash
cd /home/user/Workspace/Minecraft_Agent/booth
PATH=/home/user/Workspace/Minecraft_Agent/tools/node/bin:$PATH node --test tests/*.test.mjs   # 단위 검사, 수 초
bash ops/run-spark-verify.sh                                                                # 실게임 포함 전체, 약 15분
```

전체 검증은 실제 부스를 조작하므로 행사 중에는 실행하지 않습니다. 결과는 `booth/results/spark-20261027/`에 저장되며, 기존 결과와 비교하려면 실행 전에 이 폴더를 다른 이름으로 옮겨 둡니다. 수동 키 조작 관련 4개 사례는 기능을 제거했기 때문에 실패하는 것이 정상입니다(`booth/MIGRATION-spark.md` 참고).
