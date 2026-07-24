# LOOI AI Desktop Robot

## Files Included:
- `package.json` - Node.js dependencies configuration
- `server.js` - Express backend with Groq Speech-to-Text (Whisper), Dual LLM engine (Qwen / Llama fallback), and Edge-TTS
- `public/index.html` - Canvas dynamic eye animation UI with Web Audio VAD & BLE connection
- `esp32_firmware.ino` - ESP32 firmware for 4 motor drivers, 1 head servo, and BLE controls with realistic idle movements

## Quick Start
1. Extract ZIP file.
2. Run `npm install` in the project folder.
3. Set your `GROQ_API_KEY` environment variable.
4. Run `npm start`.
5. Upload `esp32_firmware.ino` to your ESP32 board.
6. Open browser on your phone connected to the same network at `http://<SERVER_IP>:3000`.
