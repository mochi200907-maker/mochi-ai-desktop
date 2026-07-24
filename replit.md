# LOOI / Mochi AI Desktop Robot

## Project overview
A serverless AI robot companion system consisting of:
- **`server.js`** — Express + WebSocket backend (serves web UI, proxies TTS + music for browser clients). Port 5000. Requires `GROQ_API_KEY` secret.
- **`public/index.html`** — Full browser UI with canvas face animation, VAD, BLE, TTS, audio-only music, YouTube video playback, and TikTok MP4 playback.
- **`expo-app/`** — React Native / Expo mobile app (fully serverless — calls Groq API directly from the device).
- **`esp32_firmware.ino`** — Arduino firmware for the physical ESP32 robot (2 DC motors + 1 head servo).

## How to run

### Web UI
1. Add `GROQ_API_KEY` secret in Replit Secrets.
2. Run the **"Start application"** workflow (`node server.js`).
3. Open the preview at port 5000.

### Expo mobile app
1. `cd expo-app && npx expo start`
2. Scan QR with Expo Go (Android/iOS).
3. In Settings, enter your Groq API key and the TTS server URL.
4. Optionally configure the BLE device name (default: `MOCHI_ESP32_ROBOT`).

### TTS server (for mobile app)
The mobile app calls an HTTP TTS server instead of the unreliable Edge TTS WebSocket.
Deploy `server.js` on Render (or any Node host) and set the URL in the app's Settings screen.
The `/api/tts?text=...` GET endpoint returns `audio/mpeg`.

### ESP32 firmware
Upload `esp32_firmware.ino` via Arduino IDE to your ESP32 board. Set BLE name to match the device name configured in the Expo app settings.
Explicit `LOOK_UP`, `LOOK_DOWN`, and `LOOK_CENTER` commands stop the motors and hold the head position for 20 seconds before autonomous exploration resumes. Autonomous look phases use the same 20-second hold.

## Stack
- **Backend**: Node.js (ESM), Express 4, ws, groq-sdk, node-edge-tts
- **Mobile**: Expo 51, React Native 0.74, expo-av, expo-file-system
- **AI**: Groq (Whisper STT + Qwen3-32b LLM with thinking disabled + llama fallback)
- **TTS**: node-edge-tts (Microsoft Edge TTS WebSocket, no key needed) — HTTP `/api/tts?text=` endpoint
- **Music**: Mostakim YouTube audio API → direct streamed URL → audio-only playback.
- **Video**: Mostakim YouTube search → original YouTube watch URL → embedded YouTube video player.
- **TikTok**: TikWM keyword search or TikTok URL resolver → direct MP4 URL → native HTML/WebView video player.

## Architecture notes — mobile app
- **Storage**: `expo-file-system` writing to `documentDirectory` (persistent on device). In-memory cache avoids repeated disk reads within a session. All three settings (Groq key, TTS URL, BLE name) saved in one atomic write via `saveAllSettings()`.
- **TTS flow**: `synthesizeSpeech(text, ttsServerUrl)` → `FileSystem.downloadAsync` to temp file → read as base64 → `playTTS(base64)`.
- **Music flow**: `fetchMusic(query)` → Mostakim search + ytDl (2 sequential HTTP calls, ~10-20s) → streamed audio URL → `expo-av`. Mostakim server is warm-up pinged on `start()` to reduce cold-start latency.
- **Video flow**: `fetchVideo(query)` → Mostakim search → YouTube watch URL → WebView YouTube embed. Video requests use `VIDEO_QUERY`; audio-only requests use `MUSIC_QUERY`, and explicit video wording wins if the model emits the wrong query type.
- **TikTok flow**: TikTok/shoti/short-video/girl-video requests use `TIKTOK_QUERY` → TikWM `/api/feed/search` (or `/api/?url=` for a supplied TikTok link) → direct MP4 playback. The web client uses `/api/tiktok/url`; Expo resolves TikWM directly and passes `videoProvider: 'tiktok'` into its WebView.
- **Music-after-TTS fix**: `pendingMusicRef` is set `true` before TTS starts when music is requested. The TTS `didJustFinish` callback checks `pendingMusicRef.current || isPlayingMusicRef.current` before returning to IDLE — prevents premature state reset during the music search window.
- **Camera**: When the LLM responds with `CAMERA` expression, React Native injects `triggerCamera()` into the WebView. The HTML5 camera overlay (`getUserMedia`) opens, user taps "Capture", and the WebView sends `CAMERA_PHOTO:<dataUrl>` via postMessage. The photo is shown in a full-screen overlay for 6 seconds.

## Web UI — Speech features
- **STT**: Web Speech API (`SpeechRecognition`) — real-time streaming transcript in browser, no server call, no Groq key needed for STT.
- **Wake word**: "mochi" or "hey mochi" activates the robot. Status bar shows amber "WAKE" while waiting.
- **Active mode**: After wake word, all follow-up speech goes straight to the LLM — no need to repeat the wake word.
- **Inactivity timeout**: 2 minutes of no interaction → back to wake word mode automatically.
- **TTS**: Edge Neural TTS via `/api/tts/stream` (primary, sounds best); Web Speech API `speechSynthesis` as fallback.
- Speech recognition is paused while TTS plays to prevent mic feedback.

## User preferences
- Keep existing project structure and stack.
- Thinking/reasoning must be disabled on Qwen3 (`reasoning_effort: 'none'`) for fast responses.
- BLE device name must be configurable in the mobile app Settings screen.
- Settings (API key, TTS URL, BLE name) must persist permanently on device — never disappear on reopen.
- Music API is called directly from the mobile app (not the server). Music streams directly, no full download.
- TTS server is a separate Render deployment; the mobile app calls it via HTTP.
