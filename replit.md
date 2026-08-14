# LOOI AI Desktop Robot (Mochi)

An AI-powered robot face server — animated canvas eyes, Groq Whisper STT, LLM chat, Edge TTS, and optional BLE control for an ESP32 robot.

## Stack
- **Backend**: Node.js (ESM), Express, WebSocket (`ws`)
- **STT**: Groq Whisper (`whisper-large-v3-turbo`) via `/api/stt`
- **LLM**: Groq (Qwen / Llama fallback) via `/api/chat`
- **TTS**: Microsoft Edge TTS (`node-edge-tts`), streamed as MP3
- **Frontend**: Single HTML file (`public/index.html`) — Canvas eye animation, VAD, BLE

## How to run
```
npm install
node server.js        # or use the "Start application" workflow
```
App runs on **port 5000**. Open `http://<host>:5000/app` for the robot face UI.

## Required secrets
| Secret | Where to set |
|---|---|
| `GROQ_API_KEY` | Replit Secrets |
| `GEMINI_API_KEY` | Replit Secrets — required for the live voice assistant and spoken face-registration command |
| `DATABASE_URL` | Replit-managed Neon/PostgreSQL secret — required for face profile storage |

## Face identity
LOOI now supports opt-in face registration from the robot UI. Say “register this face,” then say your name while looking at the camera. The browser creates a 128-value face embedding with `face-api.js`; only that embedding and the name are stored in NeonDB, not the camera photo. Recognition is device-scoped through a local browser identifier, can be turned on/off with the Face identity toggle, and only sends a verified name context to Gemini after a match.

The face models are loaded from the `face-api.js` CDN on first use, so the browser needs network access. A camera permission and a secure HTTPS preview are also required on phones.

The server starts without the key but STT/LLM calls will fail until it's set.

## STT on Android
Android Chrome does not reliably support the Web Speech Recognition API.
The client auto-detects Android and switches to a **MediaRecorder + VAD + Groq Whisper** pipeline instead:
1. RMS-based voice activity detection (threshold 0.012)
2. MediaRecorder captures `audio/webm;codecs=opus`
3. Clip POSTed to `/api/stt` → Groq Whisper transcription
4. Result fed into the normal chat pipeline

Desktop/non-Android browsers continue to use the Web Speech API for lower latency.

## Key files
- `server.js` — all backend routes (STT, TTS, LLM, music/video proxy, WebSocket)
- `public/index.html` — full robot UI (canvas face, VAD, BLE, MediaRecorder STT fallback)
- `esp32_firmware.ino` — ESP32 firmware (4 motors, head servo, BLE)

## User preferences
- Keep existing project structure; do not migrate or restructure unless asked.
