# Minecraft Agent 부스

한국어 자연어 명령을 받아 Minecraft 봇을 움직이는 행사 부스 데모입니다. [Mindcraft](https://github.com/mindcraft-bots/mindcraft)(MIT) 에이전트와 로컬 LLM(vLLM, Qwen3-30B-A3B FP8)을 사용합니다.

운영 위치는 `AILAB-spark-remote:/home/user/Workspace/Minecraft_Agent`이고, 이 저장소의 루트가 그 디렉터리입니다.

## 구성

| 경로 | 내용 |
|---|---|
| `booth/` | 부스 동작 코드(`booth_*.js`), 설정, 문서 |
| `booth/gateway/` | 웹 UI, 한국어 해석·계획, 화면 스트리밍, 월드 초기화 (127.0.0.1:8772) |
| `booth/mindcraft/` | 부스용으로 수정한 Mindcraft (upstream `5f3acc8`) |
| `booth/ops/` | systemd user 유닛 설치(`install-spark-services.py`), watchdog, 검증 실행 스크립트 |
| `booth/tests/` | 단위·해석·실게임 검사 |
| `booth/results/` | 검사 결과 원자료 |

문서: [booth/README.md](booth/README.md) (기능과 운영), [booth/STABILIZATION.md](booth/STABILIZATION.md) (안정화 결과), [booth/MIGRATION-spark.md](booth/MIGRATION-spark.md) (spark 이전과 검증), [booth/CHANGELOG.md](booth/CHANGELOG.md).

## 저장소에 없는 것

호스트에만 있으며 커밋하지 않습니다.

- 런타임: `tools/`(Node 20, JDK 21), `vllm-env/`, `mc-launcher/`(portablemc 4.4.1), `booth/korean-env/`, 각 `node_modules/`
- Minecraft: `booth/mc-data/`(Paper 서버와 무대 월드), `booth/mc-client/`(클라이언트)
- 비밀 값과 방문객 기록: `booth/rcon.secret`, `booth/gateway/conversation.jsonl`, `booth/mindcraft/bots/`

새 호스트에 설치하는 절차와 호스트 요구 사항은 `booth/MIGRATION-spark.md`에 있습니다.

## 접속

```bash
ssh -N -L 8772:127.0.0.1:8772 AILAB-spark-remote
```

브라우저에서 `http://127.0.0.1:8772`를 엽니다.
