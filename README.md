# Gemini Voice Agent

맥미니에서 실행하는 실시간 음성 대화 웹앱. 아이폰 브라우저로 접속해서 AI 에이전트와 전화통화처럼 대화한다.

## 개요

- **Gemini Live API** 기반 실시간 음성 스트리밍
- **4개의 에이전트** (원영, 지수, 로즈, 리사) — 각각 다른 성격과 보이스
- **아이폰 Safari**에서 바로 사용 (앱 설치 불필요)
- **Tailscale VPN**으로 외부에서 맥미니에 접속

## 에이전트

| 에이전트 | 성격 | 전문분야 | 보이스 |
|---------|------|---------|--------|
| 원영 | 다정한 반말, 친한 친구 톤 | 일반 보조 | Kore |
| 지수 | 차분한 반말, 편집자 톤 | 블로그 글쓰기 | Aoede |
| 로즈 | 활기찬 반말, 에너지 있는 톤 | 숏폼 콘텐츠 | Puck |
| 리사 | 간결한 반말, 기술적 톤 | 코딩/자동화 | Charon |

## 기술 스택

- **서버**: Node.js (Express)
- **실시간 통신**: WebSocket
- **프론트엔드**: HTML/CSS/JS (바닐라, 모바일 최적화)
- **음성 처리**: Web Audio API
- **AI**: Gemini Live API (`gemini-2.0-flash-live-001`)
- **실행 환경**: 맥미니 (pm2 상시 실행)
- **원격 접속**: Tailscale VPN

## 아키텍처

```
아이폰 브라우저
    │ WebSocket (오디오 스트림)
    ▼
맥미니 Node.js 서버
    │ Gemini Live API WebSocket
    ▼
Google Gemini Live
    │ 음성 응답 스트림
    ▼
맥미니 서버 → 아이폰 브라우저
```

## 설치 방법

### 1. 저장소 클론

```bash
git clone https://github.com/oceancheol/gemini-voice-agent.git
cd gemini-voice-agent
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일에 Gemini API 키 입력:

```
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

### 4. 서버 실행

```bash
npm start
```

### 5. 접속

브라우저에서 `http://localhost:3000` 접속 (또는 Tailscale 주소)

## 맥미니 상시 실행 (pm2)

```bash
npm install -g pm2
pm2 start npm --name "gemini-voice-agent" -- start
pm2 startup
pm2 save
```

## 주의사항

- 마이크 권한은 HTTPS 또는 localhost에서만 동작
- Tailscale HTTPS 설정이 필요할 수 있음
- `.env` 파일은 절대 커밋하지 않는다 (`.gitignore`에 포함됨)

## 개발 로그

개발 과정은 커밋 단위로 기록됩니다. 자세한 내용은 [커밋 히스토리](https://github.com/oceancheol/gemini-voice-agent/commits/main)를 참고하세요.

## 라이선스

MIT
