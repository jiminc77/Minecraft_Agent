## 2026-10-03 추가: 관전 전용 UI · 3인칭

- WASD/Space/마우스 시점/좌클릭/커서 잠금 기능과 안내·조준점을 제거했습니다. 게이트웨이는 과거 keys/mouse 메시지도 무시합니다. 채팅과 중지·초기화만 제공합니다.
- Viewer를 뒤에서 따라가는 3인칭으로 변경했습니다. `ops/third-person.py`와 client unit `camera.conf`의 ExecStartPost가 접속 후 F5를 한 번 보내 재시작 시에도 적용합니다. 클라이언트 재시작 후 실제 화면으로 확인했습니다.
- 브라우저 클릭/키 입력이 포인터를 잠그지 않는지, 과거 입력 패킷이 이동·시점·공격을 일으키지 않는지, 채팅 이동·초기화가 유지되는지 확인했습니다.
- 이전 문서의 수동 조작 및 물리 ESC 검증 항목은 더 이상 현재 기능에 해당하지 않습니다. 해당 수동 조작 테스트는 과거 기록입니다.
- 변경 전 백업: 로컬 `backups/view-only-*`, 원격 `backups/view-only/before.tar.gz`.

# 대화형 Minecraft 부스 안정화 시제품

2026-10-03 현재 8772가 유일하게 실행 중인 부스입니다. 기존 8765(STEVE-1), 8767(Mindcraft) 및 연구 전용 8087 에이전트/컨테이너는 정지했습니다. 데이터는 보존했습니다. **채팅·취소·실행 검증은 구현했지만, 자유 발화 전체의 신뢰성을 보장하는 운영 교체판은 아닙니다.**


## 2026-10-03 안정화 배포

최신 검증과 한계는 [STABILIZATION.md](STABILIZATION.md)를 우선합니다. 아래 날짜별 내용은 이전 구현 기록을 포함합니다.

- 공개 Kiwi의 한국어 오타/띄어쓰기 교정과 Hangul 조합을 사용합니다. 교정 전후 수량이 달라지거나 대상 뜻이 모호하면 실행하지 않습니다.
- 독립 명령의 분류·인자 추출에서 이전 행동을 제외합니다. 확인 답변과 명확한 정정에만 필요한 문맥을 사용합니다. 동작 종류/수량/대상은 구조화 계약으로 검증합니다.
- 매 단계 실제 대상을 다시 조회하고 결과를 확인합니다. 실패한 단계를 성공으로 보고하거나 후속 단계를 실행하지 않습니다.
- 수동 키 소유권, 취소 세대, 에이전트 제어 임대 만료로 오래된 요청과 다른 탭의 키 해제가 현재 조작을 덮어쓰지 않게 했습니다.
- 8772 한 부스만 운영합니다. 영구 user systemd 유닛, 프로세스 자동 재시작, 게임 접속 watchdog, Docker 재시작 정책을 적용했습니다.

### 운영 확인

```bash
ssh AILAB-simx-remote 'systemctl --user is-active booth-vllm-30b booth-stability-mindcraft booth-stability-gateway booth-stability-xvfb booth-stability-client booth-stability-watchdog.timer; curl -s 127.0.0.1:8772/health'
```

게이트웨이는 `agent_in_game`, `viewer_in_game`, `llm_ready`, `frame_age_ms`를 노출합니다. 모델 준비 중에는 행동을 멈춘 후 준비 안내를 표시합니다. 장애 복구 때 이전 방문객 명령을 재실행하지 않습니다. 원격 `ops/install-services.py`는 기존 실행 설정을 백업한 뒤 영구 유닛을 설치합니다. 이미 설치되어 있으므로 일상 운영에서 반복 실행할 필요는 없습니다. Python 의존성은 `ops/requirements-korean.txt`, gateway의 Python 경로는 user unit drop-in `korean.conf`에 고정되어 있습니다.

## 2026-10-03 재설계: 현재 실행 경로

현재 서버 진입점은 `gateway/semantic-planner.js`이다. 아래 첫 적용 기록의 기능 제외 목록은 이전 버전이며 현재는 공격, 지속/점프 이동, 나무 원목, 흙 계단길, 육지 이동을 기존 실행기에 다시 연결했다. 실행기는 공개 Mindcraft/Mineflayer와 기존 부스 스킬을 재사용한다. 제작/설치/재료 계획은 지원하지 않는다.

1. 최신 발화를 과거 문맥 없이 먼저 분류한다. 완전한 새 명령은 문맥 재작성 단계를 통과하지 않는다.
2. 질문의 답이나 생략된 정정에만 대화 해소 단계를 적용한다. 보류한 질문도 없고 현재 식별한 행동도 없으면 완료된 목표를 다시 사용하지 않는다. 따라서 완료 뒤 대상 이름만 말하는 정정에는 행동을 다시 명시해야 할 수 있다. 새 요청으로 분류한 경우 원문을 유지한다. 버튼 중지는 이전 목표 참조를 지운다.
3. 지원하는 전체 행동 목록으로 요청 결과를 추출하고, 그 목록에 맞는 스키마로 인자를 채운다. 행동 추가/누락/순서, 수량 범위, 단일 동작의 명시 수량을 코드로 검사한다. 전체 문장의 모든 의미를 형식적으로 증명하는 검증기는 아니다.
4. 단계 시작마다 실제 대상 관찰을 조회한다. 임의의 한 대상을 허용한 요청은 관찰된 후보 중 가까운 대상을 쓰고, 특정 대상을 구별하지 못하면 질문한다. 조회 한도/후보/선택 결과를 `target_grounding` 로그로 남긴다. 일반적인 나무/흙 지형 조회도 가능하다.
5. 공격은 선택한 entity key의 사망 이벤트 증거가 있어야 성공이다. 접근/이동 성공으로 공격을 완료했다고 보고하지 않는다. 최종 답변은 실행기가 측정한 각 단계 결과를 합친다.

문장별 행동 분기나 특정 한국어 프롬프트 예외 처리는 추가하지 않았다. 분류기에는 행동 API를 설명하는 일반적인 영어 예시가 있으며, 모델 성능이 프롬프트에 영향을 받는다는 한계는 남아 있다. 폐기한 설계/실패 로그를 `mindcraft-redesign-staging/results`와 본 프로젝트 `results/redesign-*`에 보존한다. 이전 의미 검토 모델의 faithful=true를 성공 증거로 사용하지 않는다.

로컬 변경 전 백업: `backups/redesign-20261003-131906/source.tar.gz`. 원격 적용 직전 백업: `backups/redesign-20261003/before.tar.gz`. 단일 부스 8772 구성 및 이전 서비스 정지 상태는 유지한다. 단위 검사는 `node --test tests/*.test.mjs`, 해석 평가는 `node tests/semantic-eval.mjs`, 실제 게임 검사는 `node tests/redesign-live.mjs`이다. 마지막 검사는 8772 월드를 초기화하고 동물/블록을 변경하므로 방문객 사용 중에는 실행하지 않는다.

## 2026-10-03 적용: 의도 검증·질문·대상 관찰

연구판의 독립 의도 추출, 원문 근거 검사, 의미 검토, 요청 대상별 관찰 조회를 8772 대화 UI에 연결했다. 확인 질문에 대한 답은 보류한 목표에 결합하고 독립 명령은 기존 목표를 취소한다. 각 단계에 새로운 실행 epoch를 발급하며 새 발화/수동 조작/초기화 후 늦게 도착한 응답은 후속 실행을 일으키지 않는다. 다음 단계에서 대상이 모호하면 완료한 단계를 제외한 나머지 목표를 보류한다.

현재 UI 실행 문법은 이동(0.5~100칸), 회전, 상하 시선, 점프, 동물 접근, 지정 블록 1개 제거, 중지 및 최대 6단계 순차 행동이다. **이전판의 공격, 연속/동시 이동, 육지 찾기, 나무 전체 및 계단 목표는 새 검증 경로에 포함하지 않았다.** 지원하지 않는 요청을 이전 해석기로 우회 실행하지 않는다. 아래 기존 기능/평가 기록은 적용 전 버전의 기록이다.

필요한 실행 구성: booth-stability-{mindcraft,gateway,xvfb,client}, booth-vllm-30b, Docker booth-stability-mc. 하나의 부스를 위해 필요한 구성 요소들이다. 이전 steve-booth는 disable/stop, booth-{gateway,client,mindcraft,xvfb}와 booth-mc는 stop. 원본 mindcraft-trial의 모델/클라이언트 런타임과 의존성은 계속 공유하므로 삭제하면 안 된다. 임시 유닛의 재부팅 복구는 아직 별도 작업이다.

백업: 로컬 backups/apply-grounded-20261003-130712/source.tar.gz, 원격 backups/apply-grounded-20261003/source.tar.gz 및 units.txt. 원격 백업에는 설정이 들어 있으므로 외부 공유하지 않는다. 필요 시 백업 소스를 복원하고 원격 start-isolated.py로 8772 스택을 시작한다. 원복 범위/유닛 환경은 units.txt 참조.

## 접속

```bash
ssh -N -L 8772:127.0.0.1:8772 AILAB-simx-remote
```

브라우저: <http://127.0.0.1:8772>

- 로컬 원본: 이 디렉터리 (`stability-v1`)
- 원격 실행: `/home/simx2204/Codex/mindcraft-stability-20261002`
- 별도 MC 25571 / RCON 25581 / MindServer 8086 / 화면 :95 / gateway 8772
- 기존 Qwen3-30B-A3B-Instruct-2507-FP8 vLLM 8011 공유. 모델은 동일한 30B이며 서비스는 영구 유닛으로 전환했습니다.

## 동작 — 목표 단위 실행으로 확장 (2026-10-02 오후)

발화를 받으면 먼저 기존 행동을 취소합니다. 목표 해석기가 단일 행동, 짧은 순차 계획, 나무 원목 전체 채굴, 기존 흙 지형을 깎는 계단, 일반 대화, 확인 질문을 구분합니다. 모델은 기존 Qwen 30B 그대로이며 Mindcraft/Mineflayer의 동작·길찾기·채굴을 재사용합니다.

- 순차 계획: 최대 6개의 기본 행동. `뒤로 돌아서 앞으로 3발짝`은 회전 뒤 새 방향으로 걷습니다. 각 단계 전 대상과 요청 세대를 다시 확인하고 실패하면 남은 단계를 실행하지 않습니다.
- 나무: 선택 원목과 면으로 연결된 같은 종류 원목을 최대 32개까지 먼저 고정합니다. 접근 후 하나씩 캐고 제거 개수를 확인합니다. 잎·다른 나무로 대상을 바꾸지 않습니다. 높은 나무, 대각선으로만 이어진 가지, 붙어 있는 여러 나무를 일반적으로 구분하는 기능은 없습니다.
- 흙 계단: 블록을 설치하지 않고 기존 흙을 깎습니다. 정면 가까운 벽에서 한 칸 폭, 최대 네 칸 높이의 발판과 머리 공간을 사전 검사하고 흙만 제거한 뒤 단계별로 올라갑니다. 흙 외 블록·빈 발판·복잡한 지형은 중단합니다. 임의 지형 전체를 해결하는 건축 에이전트는 아닙니다.
- `계속 앞으로 걸어`는 거리 재질문 없이 연속 이동합니다. 새 입력·중지 버튼·수동 조작 또는 최대 75초 제한으로 멈춥니다. 진행 불가 지형에서는 일찍 중단합니다.
- 한 번에 최대 100칸 이동하고 실제 도착 거리를 검사합니다. `점프하면서 10칸`은 이동과 점프를 동시에 수행하며 마지막 구간은 착지 후 걷기로 거리를 맞춥니다. `점프한 다음 이동`은 기존 순차 계획으로 처리합니다.
- `앞의 육지까지`는 요청 방향 24칸 내에서 마른 발판과 머리 공간, 시야를 확인하고 기존 Mineflayer 길찾기로 접근합니다. 육지나 경로를 확인하지 못하면 중단합니다. 잠수·수중 탐험은 지원하지 않습니다.
- 불명확한 대상이나 지원하지 않는 요청에는 질문/안내를 하고, 인사는 행동 없이 답합니다.
- 현재 의미 해석은 의도 분류와 타입별 인자 추출의 두 단계입니다. 수량·순서·범위·관찰 대상을 실행 전에 검사합니다. 이전의 독립 의미 검토 모델과 일치 투표는 사용하지 않습니다.

실행 중 채팅에 단계/채굴 개수를 표시합니다. 마지막 발화 후 120초 초기화, 새 발화·중지·초기화·수동 입력의 전체 취소 규칙은 유지합니다. 단일 기본 행동은 약 26초, 나무/계단/확장 이동은 약 76초, 전체 실행은 80초, 해석 포함 요청은 90초 제한입니다. 재접속 때 명령을 자동 재전송하지 않습니다. 정식 user systemd 유닛과 watchdog을 설치했습니다. 프로세스 강제 종료 후 복구는 검증했으며 호스트 재부팅 자체는 시험하지 않았습니다.

새 검증 기록은 [RESULTS.md](RESULTS.md) 맨 위를 참조하세요. 아래 수치는 **목표 확장 이전 버전**의 기준 결과입니다.

## 검증 결과

[자세한 결과와 실패 기록](RESULTS.md)을 확인하세요.

| 검사 | 결과 |
|---|---|
| 제어·스키마·수량 단위 테스트 | 21/21 통과 |
| 실제 게임 핵심 시나리오 | 최종 14/14 통과 |
| 실제 에이전트 프로토콜 검사 | 5/5 통과 |
| 실제 120초 유휴 초기화 | 120초에 초기화 시작, 복원 포함 약 123.2초 후 준비 완료 |
| 기존 500개 언어 회귀 검사 | 올바른 단일 행동 선택 381, 수행 대신 질문/불가 51, 잘못된 선택 1. 나머지는 아래 보고서에서 구분 |
| 추가 40개 언어 검사 | 올바른 행동 25, 적절한 비실행 11, 입력 거절 1, 수행 대신 질문 3, 잘못된 선택 0 |
| 운영 보존 | 기존 소스 112개 SHA256 일치, 원래 6개 서비스 active, 8765·8767 ready |

500개 검사는 **고정 관찰 정보로 언어 해석 계층을 검사한 것**입니다. 500개를 게임에서 다시 실행한 결과가 아닙니다. 실제 게임 검사는 별도 19개 시나리오와 유휴 초기화입니다. 이전 426/461 게임 성공률과 직접 비교하면 안 됩니다.

남은 주요 한계는 `양 옆으로 가줘`의 양(동물)/양옆(방향) 중의성, 정상 요청에 대한 과도한 확인 질문, 실제 지형·장애물에서의 범용 수행률입니다. 물리 ESC 키와 노트북 화면 지연의 정량 측정도 별도 확인이 필요합니다. 이 이유로 운영 8765/8767로 교체하지 않았습니다.

## 재사용한 공개 구현

- [Mindcraft](https://github.com/mindcraft-bots/mindcraft), upstream `5f3acc8`: 기존 봇·ActionManager·부스 동작과 프로필/명령 문법.
- [Mineflayer Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder): 즉시 경로 해제, GoalFollow, 채굴 없는 이동. 기존 설치 2.4.5.
- [Mineflayer](https://github.com/PrismarineJS/mineflayer): 게임 상태·raycast·채굴/사망 이벤트. 4.33의 0도 시선 검사 오류는 공개 world.raycast로 우회.
- [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs/): 형식 제한. 의미의 정확성을 보장하는 기능으로 취급하지 않음.
- [AJV](https://github.com/ajv-validator/ajv): JSON Schema 검증.
- [hangul-util](https://github.com/hyukson/hangul-util) 1.0.0, MIT: 한국어 수사 변환. 문장별 행동 매핑이 아닌 수량 검증에만 사용.
- [LangGraph interrupt](https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/agents/human-in-the-loop.md)는 검토했으나, 이 단일 행동 부스에 그래프 실행기·저장 체계를 추가하는 대신 작은 대화 상태 모듈을 작성했습니다.

## 파일과 재실행

- `gateway/conversation.js`: 대기 질문, 취소, session/epoch, 채팅 기록.
- `gateway/goal-planner.js`: 목표 분류, 순차 분해, 전체 의미 검토, 한 번의 내부 재계획.
- `gateway/planner.js`: 기본 행동 의미 추출·대상 결정·실행 여부 판단.
- `booth_geometry.js`: 나무 연결 범위와 흙 계단 발판/제거 블록 사전 계산.
- `gateway/motion-review.js`: 기존 Mindcraft 프로필로 기본 동작을 독립 해석.
- `gateway/quantity.js`, `booth_contract.js`: 수량·명령 검증.
- `booth_control.js`, `booth_executor.js`: 관찰, 즉시 중단, 제한된 실행과 결과 판정.
- `gateway/static/`: 채팅 UI.
- `tests/`, `results/`: 재현 스크립트·전체 판정·원시 모델 출력.
- `CHANGELOG.md`: 변경 사항과 초기 실패에서 바꾼 점.

기존에 준비된 격리 실행 디렉터리에서:

```bash
npm ci --ignore-scripts
python3 install-overlay.py   # 덮어쓰기 전 에이전트 파일 백업
python3 start-isolated.py    # booth-stability-*만 시작
npm test
node tests/goals-live.mjs
node tests/scenarios.mjs
node tests/protocol-live.mjs
node tests/idle-reset.mjs
OUT=goals-language500 node tests/regression.mjs
DATASET=tests/heldout.json OUT=heldout40 OUT=goals-language500 node tests/regression.mjs
```

시험 스크립트는 격리 월드를 초기화하므로 방문객이 8772를 사용하는 동안 실행하지 마세요. systemd 유닛은 아직 임시 유닛입니다. 재부팅 후에는 `start-isolated.py`로 다시 띄워야 합니다. 중지는 해당 네 유닛과 `booth-stability-mc` 컨테이너만 대상으로 합니다.
