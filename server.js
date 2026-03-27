'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const AGENTS = require('./agents');

// ─── Validate env ─────────────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set. Create a .env file.');
  process.exit(1);
}

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Gemini Live API ──────────────────────────────────────────────────────────
const GEMINI_MODEL = 'models/gemini-2.0-flash-live-001';
const GEMINI_WS_URL =
  `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent` +
  `?key=${process.env.GEMINI_API_KEY}`;

// ─── Browser WebSocket handler ────────────────────────────────────────────────
wss.on('connection', (browserWs) => {
  let geminiWs = null;
  console.log('[server] Browser connected');

  browserWs.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      return;
    }

    // ── Start call ──────────────────────────────────────────────────────────
    if (msg.type === 'start') {
      const agent = AGENTS[msg.agent] || AGENTS.wonyo;
      console.log(`[server] Starting session: ${agent.name} (${agent.voice})`);

      geminiWs = new WebSocket(GEMINI_WS_URL);

      geminiWs.on('open', () => {
        console.log('[gemini] Connected');

        // Send setup message
        geminiWs.send(JSON.stringify({
          setup: {
            model: GEMINI_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: agent.voice,
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: agent.systemPrompt }],
            },
          },
        }));
      });

      geminiWs.on('message', (data) => {
        let geminiMsg;
        try {
          geminiMsg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Setup complete → tell browser it's ready
        if (geminiMsg.setupComplete !== undefined) {
          console.log('[gemini] Setup complete');
          send(browserWs, { type: 'ready' });
          return;
        }

        const content = geminiMsg.serverContent;
        if (!content) return;

        // Audio / text parts
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              send(browserWs, { type: 'audio', data: part.inlineData.data });
            }
            if (part.text) {
              send(browserWs, { type: 'transcript', role: 'agent', text: part.text });
            }
          }
        }

        // Turn complete
        if (content.turnComplete) {
          send(browserWs, { type: 'turnComplete' });
        }

        // Interrupted (user spoke while agent was speaking)
        if (content.interrupted) {
          send(browserWs, { type: 'interrupted' });
        }
      });

      geminiWs.on('close', (code, reason) => {
        console.log(`[gemini] Closed: ${code} ${reason || ''}`);
        send(browserWs, { type: 'end' });
        geminiWs = null;
      });

      geminiWs.on('error', (err) => {
        console.error('[gemini] Error:', err.message);
        send(browserWs, { type: 'error', message: err.message });
      });

    // ── Audio chunk from browser → Gemini ──────────────────────────────────
    } else if (msg.type === 'audio') {
      if (geminiWs?.readyState === WebSocket.OPEN) {
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: 'audio/pcm;rate=16000',
              data: msg.data,
            }],
          },
        }));
      }

    // ── Stop call ───────────────────────────────────────────────────────────
    } else if (msg.type === 'stop') {
      if (geminiWs) {
        geminiWs.close();
        geminiWs = null;
      }
    }
  });

  browserWs.on('close', () => {
    console.log('[server] Browser disconnected');
    if (geminiWs) {
      geminiWs.close();
      geminiWs = null;
    }
  });

  browserWs.on('error', (err) => {
    console.error('[server] Browser WS error:', err.message);
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎙  Gemini Voice Agent`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   http://0.0.0.0:${PORT}  (network)\n`);
});
