const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d", { alpha: false });
const form = document.getElementById("prompt-form");
const promptBox = document.getElementById("prompt");
const submit = document.getElementById("submit");
const connection = document.getElementById("connection");
const phase = document.getElementById("phase");
const timer = document.getElementById("timer");
const currentPrompt = document.getElementById("current-prompt");
const englishGoal = document.getElementById("english-goal");
const message = document.getElementById("message");
const placeholder = document.getElementById("screen-placeholder");
const stop = document.getElementById("stop");
const reset = document.getElementById("reset");
let socket;
let connected = false;
let state = {};
let drawing = false;
let pendingFrame = null;
let pendingPrompt = null;
let retryPending = false;
let chatSignature="";
const chat=document.getElementById("chat");
function sendPrompt(text) {
  const value = text.trim();
  if (!value) return;
  if(!connected){message.textContent="연결이 복구된 뒤 다시 보내 주세요.";return;}
  pendingPrompt = value;
  retryPending = !connected;
  if (connected) socket.send(JSON.stringify({ type: "prompt", text: value }));
  currentPrompt.textContent = value;
  englishGoal.hidden = true;
  message.textContent = connected ? "이전 행동을 멈추고 새 명령을 전달했습니다…" : "재연결 후 명령을 실행합니다…";
  promptBox.value = "";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendPrompt(promptBox.value);
});

promptBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendPrompt(button.dataset.prompt));
});

stop.addEventListener("click", () => {
  if (!connected || stop.disabled) return;
  pendingPrompt = null;
  retryPending = false;
  socket.send(JSON.stringify({ type: "stop" }));
  stop.disabled = true;
  message.textContent = "행동 중지를 요청했습니다…";
});

reset.addEventListener("click", () => {
  if (!connected || reset.disabled) return;
  pendingPrompt = null;
  retryPending = false;
  socket.send(JSON.stringify({ type: "reset" }));
  reset.disabled = true;
  message.textContent = "초기화를 요청했습니다…";
});

async function drawFrames() {
  if (drawing) return;
  drawing = true;
  while (pendingFrame) {
    const frame = pendingFrame;
    pendingFrame = null;
    try {
      const image = await createImageBitmap(frame);
      if (canvas.width !== image.width || canvas.height !== image.height) {
        canvas.width = image.width;
        canvas.height = image.height;
      }
      ctx.drawImage(image, 0, 0);
      image.close();
      placeholder.hidden = true;
    } catch (error) {
      console.error("화면 프레임 처리 실패", error);
    }
  }
  drawing = false;
}

function setStatus(data) {
  state = data;
  const signature=JSON.stringify(data.chat||[]);
  if(signature!==chatSignature){
    chatSignature=signature;chat.replaceChildren();
    for(const item of data.chat||[]){
      const bubble=document.createElement('p');bubble.className=`bubble ${item.role}`;
      const label=document.createElement('strong');label.textContent=item.role==='user'?'나':'스티브';
      const text=document.createElement('span');text.textContent=item.text;
      bubble.append(label,text);chat.append(bubble);
    }
    chat.scrollTop=chat.scrollHeight;
  }
  phase.textContent = ({
    starting: "서버 준비 중", ready: "명령 대기 중", switching: "새 명령 전환 중",
    stopping: "행동 중단 중", stopped: "멈춤", clarify:"확인 필요", unavailable:"수행 불가",
    thinking: "명령 이해 중", running: "스티브 행동 중", done: "명령 완료",
    resetting: "월드 초기화 중", recovering: "게임 복구 중", error: "확인 필요",
  })[data.phase] || data.phase;
  message.textContent = data.message || "";
  if (data.korean) currentPrompt.textContent = data.korean;
  else if (data.phase === "stopped") currentPrompt.textContent = "멈춤";
  else if (data.phase === "ready") currentPrompt.textContent = "대기 중";
  englishGoal.hidden = true;
  if (!englishGoal.hidden) englishGoal.textContent = `스티브: ${data.english}`;
  if (pendingPrompt && ["thinking", "running", "done", "stopped"].includes(data.phase) && data.korean === pendingPrompt) {
    pendingPrompt = null;
    retryPending = false;
  }
  submit.disabled = !connected || data.phase === "starting" || data.phase === "resetting" || data.phase === "recovering";
  stop.disabled = !connected || data.phase === "starting" || data.phase === "resetting" || data.phase === "recovering" || ["ready", "stopped", "done"].includes(data.phase);
  reset.disabled = !connected || data.phase === "starting" || data.phase === "resetting" || data.phase === "recovering";
}

function updateTimer() {
  const duration = state.run_seconds || 120;
  const remaining = state.active_since
    ? Math.max(0, Math.ceil(duration - (Date.now() / 1000 - state.active_since)))
    : duration;
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  timer.textContent = `남은 시간 ${minutes}:${seconds}`;
}
setInterval(updateTimer, 200);
updateTimer();

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket.binaryType = "blob";
  socket.addEventListener("open", () => {
    connected = true;
    connection.textContent = "서버 연결됨";
    connection.classList.remove("offline");
    submit.disabled = false;
    stop.disabled = false;
    reset.disabled = false;
  });
  socket.addEventListener("message", (event) => {
    if (event.data instanceof Blob) {
      pendingFrame = event.data;
      drawFrames();
      return;
    }
    try {
      const data = JSON.parse(event.data);
      if (data.type === "status") setStatus(data);
      else if (data.type === "input_error") message.textContent = data.message;
    } catch (error) {
      console.error("서버 메시지 처리 실패", error);
    }
  });
  socket.addEventListener("close", () => {
    connected = false;
      pendingMouseX = 0;
    pendingMouseY = 0;
    pendingPrompt=null; retryPending=false;
    submit.disabled = true;
    stop.disabled = true;
    reset.disabled = true;
    connection.textContent = "연결 끊김 · 재연결 중";
    connection.classList.add("offline");
    message.textContent = "서버 연결을 다시 시도하고 있습니다…";
    setTimeout(connect, 2000);
  });
}

connect();
