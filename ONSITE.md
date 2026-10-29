# 부스 운영 (마인크래프트 + 운결)

spark 한 대에서 마인크래프트(spark 모니터)와 운결(노트북, 랜선 직결)을 함께 돌립니다. spark를 켜면 두 데모가 자동으로 시작됩니다. spark 명령은 spark 터미널에서 입력합니다(모니터에서 `Ctrl+Alt+F4` → 로그인).

## 1. 처음 한 번만: 노트북 설정

랜선으로 spark와 연결하고 spark를 켠 상태에서 진행합니다. 시작 버튼 우클릭 → **터미널(관리자)**를 열고, 확인 결과가 맞을 때만 다음 단계로 넘어갑니다.

**① 유선 랜 이름 확인**
```powershell
Get-NetAdapter
```
`Status`가 `Up`인 유선 랜의 `Name`(보통 `이더넷`)을 아래 명령의 `"이더넷"` 자리에 넣습니다.

**② IP 고정**
```powershell
netsh interface ipv4 set address name="이더넷" static 172.27.183.100 255.255.255.0
```
확인: 응답이 4번 오면 성공입니다.
```powershell
ping 172.27.183.226
```

**③ 127.0.0.1 주소 연결 (웹캠용)**
```powershell
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8080 connectaddress=172.27.183.226 connectport=8080
```
확인: `"ok":true`가 나오면 성공입니다.
```powershell
curl.exe -s http://127.0.0.1:8080/api/ready
```

## 2. 켜기

1. spark에 모니터·키보드·마우스와 노트북 랜선을 연결하고 전원을 켭니다. 약 5분 뒤 두 데모가 준비됩니다.
2. spark 모니터에서 `Ctrl+Alt+F3` → 로그인 → 다음 명령을 실행하면 마인크래프트 화면이 열립니다.
   ```bash
   ~/spark-browser
   ```
3. 노트북 브라우저(Chrome 또는 Edge)에서 `http://127.0.0.1:8080`을 열고 카메라를 허용합니다.

## 3. 상태 확인

```bash
bash ~/Workspace/Minecraft_Agent/booth/ops/status.sh
```
위쪽 일곱 줄이 모두 `OK`이면 정상입니다.

## 4. 끄기·켜기·재시작

| 하려는 일 | 명령 | 걸리는 시간 |
|---|---|---|
| 전체 끄기 | `bash ~/Workspace/Minecraft_Agent/booth/ops/stop.sh` | |
| 전체 켜기 | `bash ~/Workspace/Minecraft_Agent/booth/ops/start.sh` | 약 5분 |
| 전체 재시작 | `bash ~/Workspace/Minecraft_Agent/booth/ops/restart.sh` | 약 5분 |
| 마인크래프트만 재시작 | `bash ~/Workspace/Minecraft_Agent/booth/ops/restart.sh minecraft` | 약 1분 |
| 운결만 재시작 | `bash ~/Workspace/Minecraft_Agent/booth/ops/restart.sh ungyeol` | 약 1분 |

spark를 재부팅하면 꺼 둔 상태였어도 두 데모가 자동으로 다시 켜집니다.

## 5. 돌발 상황

| 증상 | 대처 |
|---|---|
| 마인크래프트 봇이 멈추거나 이상하게 움직임 | 화면의 **행동 중지** → **월드 초기화**. 그래도 안 되면 마인크래프트만 재시작 |
| 마인크래프트 화면이 멈추거나 검음 | 마인크래프트만 재시작 |
| 운결이 응답하지 않거나 오류 | 운결만 재시작 |
| 두 데모 모두 응답 없음 | 전체 재시작 |
| spark 모니터의 브라우저가 닫힘 | `Ctrl+Alt+F3` → `~/spark-browser` |
| 노트북에서 운결이 안 열림 | 노트북에서 `ping 172.27.183.226`. 응답이 없으면 랜선 확인 후 1절 ②, 응답이 있으면 1절 ③을 다시 실행 |
| 웹캠이 안 됨 | 주소가 `127.0.0.1:8080`인지 확인하고 주소창 왼쪽 아이콘에서 카메라 허용 |
| 그래도 안 됨 | spark 재부팅(`sudo reboot`). 약 5분 뒤 자동으로 복구 |

## 행사 후 노트북 원래대로

```powershell
netsh interface ipv4 set address name="이더넷" dhcp
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8080
```

## 연구실에서 Mac으로 원격 접속

```bash
ssh -N -L 8772:127.0.0.1:8772 AILAB-spark-remote
```
브라우저에서 `http://127.0.0.1:8772`를 엽니다.
