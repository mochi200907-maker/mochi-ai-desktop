// ─────────────────────────────────────────────────────────────
// Mochi AI Robot — app configuration
// STT + LLM: Groq API (key stored locally in device storage)
// TTS: HTTP call to Render-deployed TTS server (URL set in Settings)
// Music: Mostakim YouTube audio API → streamed URL → expo-av
// ─────────────────────────────────────────────────────────────

// VAD threshold in dB (-160 = total silence, 0 = loudest)
export const VAD_THRESHOLD_DB = -35;

// Silence duration before we cut the recording (ms)
export const SILENCE_DURATION_MS = 1600;

// Mostakim API base — pinged on startup to warm up the Render server
export const MOSTAKIM_BASE = 'https://mostakim.onrender.com';
