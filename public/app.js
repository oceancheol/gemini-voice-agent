'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const INPUT_SAMPLE_RATE  = 16000;  // Gemini Live expects 16kHz
const OUTPUT_SAMPLE_RATE = 24000;  // Gemini Live outputs 24kHz
const SCRIPT_PROCESSOR_SIZE = 4096;

// ── State ─────────────────────────────────────────────────────────────────────
let ws            = null;
let audioCtx      = null;
let micStream     = null;
let micSource     = null;
let micProcessor  = null;
let nextPlayTime  = 0;
let isCallActive  = false;
let selectedAgent = 'wonyo';

const AGENTS = {
  wonyo: { name: '원영', emoji: '🌸' },
  jisoo: { name: '지수', emoji: '📝' },
  rose:  { name: '로즈', emoji: '🌹' },
  lisa:  { name: '리사', emoji: '💻' },
  jenny: { name: '제니', emoji: '💎' },
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const agentBtns      = document.querySelectorAll('.agent-btn');
const callBtn        = document.getElementById('call-btn');
const avatarWrap     = document.getElementById('avatar-wrap');
const avatarEl       = document.getElementById('avatar');
const agentName      = document.getElementById('agent-name');
const callStatus     = document.getElementById('call-status');
const transcriptEl   = document.getElementById('transcript');
const transcriptInner = document.getElementById('transcript-inner');
const iconCall       = callBtn.querySelector('.icon-call');
const iconEnd        = callBtn.querySelector('.icon-end');

// ── Init UI ───────────────────────────────────────────────────────────────────
updateAgentUI(selectedAgent);

agentBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (isCallActive) return;
    agentBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedAgent = btn.dataset.agent;
    updateAgentUI(selectedAgent);
  });
});

callBtn.addEventListener('click', () => {
  if (isCallActive) {
    endCall();
  } else {
    startCall();
  }
});

// ── Start Call ────────────────────────────────────────────────────────────────
async function startCall() {
  setStatus('연결 중...', '');

  try {
    // AudioContext — use native rate; we'll downsample manually
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    nextPlayTime = 0;

    // WebSocket
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', agent: selectedAgent }));
    };

    ws.onmessage = handleServerMessage;

    ws.onclose = (e) => {
      console.log('[ws] closed', e.code, e.reason);
      if (isCallActive) endCall();
    };

    ws.onerror = (e) => {
      console.error('[ws] error', e);
      setStatus('연결 실패', 'error');
      endCall();
    };

  } catch (err) {
    setStatus('오류: ' + err.message, 'error');
    cleanup();
  }
}

// ── Server Messages ───────────────────────────────────────────────────────────
function handleServerMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  console.log('[server→browser]', msg.type, msg.message || '');

  switch (msg.type) {
    case 'ready':
      onCallReady();
      break;

    case 'audio':
      playAudioChunk(msg.data);
      break;

    case 'interrupted':
      // Gemini detected barge-in — reset playback queue
      nextPlayTime = audioCtx ? audioCtx.currentTime : 0;
      break;

    case 'transcript':
      addTranscript(msg.role, msg.text);
      break;

    case 'turnComplete':
      break;

    case 'error':
      setStatus('오류: ' + msg.message, 'error');
      endCall();
      break;

    case 'end':
      endCall();
      break;
  }
}

async function onCallReady() {
  isCallActive = true;
  callBtn.classList.add('active');
  iconCall.style.display = 'none';
  iconEnd.style.display  = '';
  avatarWrap.classList.add('ringing');
  setStatus('통화 중', 'active');

  try {
    await startMicrophone();
  } catch (err) {
    console.error('[mic] 마이크 오류:', err.name, err.message);
    setStatus('마이크 오류: ' + err.name, 'error');
    // endCall을 늦게 호출해서 에러 상태가 보이게 함
    setTimeout(endCall, 2000);
  }
}

// ── Microphone ────────────────────────────────────────────────────────────────
async function startMicrophone() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
      channelCount:     1,
    },
  });

  micSource    = audioCtx.createMediaStreamSource(micStream);
  micProcessor = audioCtx.createScriptProcessor(SCRIPT_PROCESSOR_SIZE, 1, 1);

  const nativeSampleRate = audioCtx.sampleRate;

  micProcessor.onaudioprocess = (e) => {
    if (!isCallActive || ws?.readyState !== WebSocket.OPEN) return;

    const float32 = e.inputBuffer.getChannelData(0);

    // Downsample to 16kHz if needed
    const pcm16k = (nativeSampleRate === INPUT_SAMPLE_RATE)
      ? float32
      : downsample(float32, nativeSampleRate, INPUT_SAMPLE_RATE);

    const int16  = float32ToInt16(pcm16k);
    const base64 = bufferToBase64(int16.buffer);

    ws.send(JSON.stringify({ type: 'audio', data: base64 }));
  };

  micSource.connect(micProcessor);
  // Connect to destination to keep ScriptProcessor alive (Safari quirk)
  micProcessor.connect(audioCtx.destination);
}

// ── Audio Playback ────────────────────────────────────────────────────────────
function playAudioChunk(base64) {
  if (!audioCtx) return;

  try {
    const bytes  = base64ToUint8Array(base64);
    const int16  = new Int16Array(bytes.buffer);
    const float32 = int16ToFloat32(int16);

    // Create buffer at Gemini's output rate (24kHz)
    const buffer = audioCtx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);

    // Schedule seamlessly after previous chunk
    const now = audioCtx.currentTime;
    if (nextPlayTime < now + 0.05) {
      nextPlayTime = now + 0.05;
    }
    src.start(nextPlayTime);
    nextPlayTime += buffer.duration;

  } catch (err) {
    console.warn('[audio] Playback error:', err.message);
  }
}

// ── End Call ──────────────────────────────────────────────────────────────────
function endCall() {
  isCallActive = false;

  callBtn.classList.remove('active');
  iconCall.style.display = '';
  iconEnd.style.display  = 'none';
  avatarWrap.classList.remove('ringing');
  setStatus('통화 대기', '');
  clearTranscript();

  cleanup();
}

function cleanup() {
  // Stop microphone
  if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
  if (micSource)    { micSource.disconnect();    micSource    = null; }
  if (micStream)    { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

  // Close WebSocket
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
    ws.close();
    ws = null;
  }

  // Close AudioContext
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  nextPlayTime = 0;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function updateAgentUI(agentId) {
  const a = AGENTS[agentId];
  agentName.textContent = a.name;
  avatarEl.textContent  = a.emoji;
}

function setStatus(text, cls) {
  callStatus.textContent = text;
  callStatus.className   = 'call-status' + (cls ? ' ' + cls : '');
}

function addTranscript(role, text) {
  if (!text?.trim()) return;
  const line = document.createElement('div');
  line.className = `transcript-line ${role}`;
  line.textContent = text;
  transcriptInner.appendChild(line);
  // 최근 20줄만 유지
  while (transcriptInner.children.length > 20) {
    transcriptInner.removeChild(transcriptInner.firstChild);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function clearTranscript() {
  transcriptInner.innerHTML = '';
}

// ── Audio Utils ───────────────────────────────────────────────────────────────

/** Average-based downsampling (good quality for voice) */
function downsample(float32, inRate, outRate) {
  const ratio     = inRate / outRate;
  const outLength = Math.floor(float32.length / ratio);
  const out       = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end   = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end; j++) sum += float32[j];
    out[i] = sum / (end - start);
  }
  return out;
}

function float32ToInt16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i]  = s < 0 ? s * 32768 : s * 32767;
  }
  return out;
}

function int16ToFloat32(int16) {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    out[i] = int16[i] / 32768;
  }
  return out;
}

function bufferToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  let   binary = '';
  // Process in chunks to avoid call stack overflow on large buffers
  const CHUNK  = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const out    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
