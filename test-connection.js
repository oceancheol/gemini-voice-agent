'use strict';
require('dotenv').config();
const { WebSocket } = require('ws');

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

console.log('Gemini Live API 연결 테스트...\n');

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('✅ 연결 성공! setup 전송 중...');
  ws.send(JSON.stringify({
    setup: {
      model: 'models/gemini-2.5-flash-native-audio-latest',
      generation_config: {
        response_modalities: ['AUDIO'],
      }
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📩 응답:', JSON.stringify(msg, null, 2));
  if (msg.setupComplete !== undefined || msg.setup_complete !== undefined) {
    console.log('\n✅ Setup 완료! 연결 정상\n');
    ws.close();
    process.exit(0);
  }
});

ws.on('close', (code, reason) => {
  console.log(`\n❌ 연결 종료: code=${code} reason="${reason.toString()}"`);
  process.exit(1);
});

ws.on('error', (err) => {
  console.error('❌ 에러:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ 타임아웃 (10초)');
  process.exit(1);
}, 10000);
