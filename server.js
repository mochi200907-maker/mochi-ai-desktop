import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { CHROMIUM_FULL_VERSION, TRUSTED_CLIENT_TOKEN, generateSecMsGecToken } from 'node-edge-tts/dist/drm.js';
import { EdgeTTS } from 'node-edge-tts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Lazy Groq client — initialised on first use so the server starts even without the key.
let _groq = null;
function getGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set. Add it in Replit Secrets.');
  if (!_groq) _groq = new Groq({ apiKey: key });
  return _groq;
}

// ── Middleware ────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

// ── Root status page (uptime monitor friendly) ────────────────
app.get('/', (_req, res) => {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = `${h}h ${m}m ${s}s`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mochi Robot Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #e0e0e0; font-family: 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #111118; border: 1px solid #1e3a5f; border-radius: 16px;
            padding: 40px 48px; max-width: 420px; width: 90%; text-align: center; }
    .dot { width: 12px; height: 12px; background: #00e5a0; border-radius: 50%;
           display: inline-block; margin-right: 8px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
    h1 { font-size: 1.6rem; color: #00bfff; margin: 16px 0 6px; }
    .sub { color: #666; font-size: 0.85rem; margin-bottom: 28px; }
    .stat { display: flex; justify-content: space-between; padding: 10px 0;
            border-bottom: 1px solid #1a1a2e; font-size: 0.9rem; }
    .stat:last-of-type { border-bottom: none; }
    .label { color: #888; }
    .value { color: #00e5a0; font-weight: 600; }
    .btn { display: inline-block; margin-top: 28px; padding: 12px 28px;
           background: #00bfff18; border: 1px solid #00bfff55; border-radius: 8px;
           color: #00bfff; text-decoration: none; font-size: 0.9rem; transition: .2s; }
    .btn:hover { background: #00bfff28; }
  </style>
</head>
<body>
  <div class="card">
    <div><span class="dot"></span><span style="color:#00e5a0;font-size:.85rem;font-weight:600;">ONLINE</span></div>
    <h1>🤖 Mochi Robot</h1>
    <p class="sub">AI Backend Server</p>
    <div class="stat"><span class="label">Status</span><span class="value">Running</span></div>
    <div class="stat"><span class="label">Uptime</span><span class="value">${uptimeStr}</span></div>
    <div class="stat"><span class="label">TTS</span><span class="value">Edge Neural ✓</span></div>
    <div class="stat"><span class="label">Voice / LLM</span><span class="value">Gemini Live ✓</span></div>
    <div class="stat"><span class="label">WebSocket</span><span class="value">/ws ✓</span></div>
    <a href="/app" class="btn">Open Robot Web UI →</a>
  </div>
</body>
</html>`);
});

// Serve robot web UI at /app
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static('public'));

// ── TTS: stream Edge TTS WebSocket chunks directly to HTTP response ──────────
const TTS_VOICE  = 'en-US-AnaNeural';
const TTS_LANG   = 'en-US';
const TTS_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

function escapeXml(s) {
  return s.replace(/[<>&"']/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
}

async function streamTTSDirect(text, res) {
  const chromeMaj = CHROMIUM_FULL_VERSION.split('.')[0];
  const ws = new WebSocket(
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${generateSecMsGecToken()}` +
    `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}`,
    {
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMaj}.0.0.0 Safari/537.36 Edg/${chromeMaj}.0.0.0`,
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }
  );

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('TTS timeout')); }, 15000);

    ws.on('open', () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
          outputFormat: TTS_FORMAT,
        }}}})
      );
      const reqId = randomBytes(16).toString('hex');
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` +
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
        `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${TTS_LANG}">` +
        `<voice name="${TTS_VOICE}"><prosody rate="default" pitch="default" volume="default">` +
        `${escapeXml(text)}</prosody></voice></speak>`
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-store');
        }
        const sep = Buffer.from('Path:audio\r\n');
        const idx = data.indexOf(sep);
        if (idx !== -1) res.write(data.subarray(idx + sep.length));
      } else if (data.toString().includes('Path:turn.end')) {
        clearTimeout(timer);
        ws.close();
        res.end();
        resolve();
      }
    });

    ws.on('error', err => { clearTimeout(timer); if (!res.headersSent) res.status(503); res.end(); reject(err); });
    res.on('close', () => { clearTimeout(timer); ws.terminate(); });
  });
}

// Legacy buffer helper (used by WebSocket/Expo handler)
async function generateTTSBuffer(text) {
  const tts = new EdgeTTS({ voice: TTS_VOICE, lang: TTS_LANG, outputFormat: TTS_FORMAT, timeout: 15000 });
  const tmpFile = path.join(os.tmpdir(), `mochi_tts_${Date.now()}.mp3`);
  await tts.ttsPromise(text, tmpFile);
  try { return fs.readFileSync(tmpFile); }
  finally { try { fs.unlinkSync(tmpFile); } catch {} }
}

// Warm-up
(async () => {
  try {
    const { Writable } = await import('stream');
    const sink = new Writable({ write(_, __, cb) { cb(); } });
    const fakeRes = Object.assign(sink, { headersSent: false, setHeader() {}, status() { return this; }, end() {} });
    await streamTTSDirect('Hello', fakeRes);
    console.log('[TTS] warm-up done');
  } catch { /* ignore */ }
})();

// ── Mostakim Music API ────────────────────────────────────────
async function searchYouTube(query) {
  try {
    const url = `https://mostakim.onrender.com/mostakim/ytSearch?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const results = await res.json();
    return Array.isArray(results) && results.length > 0 ? results[0] : null;
  } catch { return null; }
}

async function fetchVideoResult(query) {
  const searchResult = await searchYouTube(query);
  if (!searchResult?.url) return null;
  return {
    url: searchResult.url,
    title: searchResult.title || query,
    thumbnail: searchResult.thumbnail || '',
  };
}

const TIKWM_BASE = 'https://www.tikwm.com';

function absoluteTikwmUrl(value) {
  if (!value || typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${TIKWM_BASE}/${value.replace(/^\/+/, '')}`;
}

function isTikTokUrl(value) {
  return /^https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\//i.test(value || '');
}

async function fetchTikTokByUrl(url) {
  try {
    const response = await fetch(
      `${TIKWM_BASE}/api/?url=${encodeURIComponent(url)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    const data = body?.data;
    const playUrl = absoluteTikwmUrl(data?.play || data?.hdplay || data?.wmplay);
    if (body?.code !== 0 || !playUrl) return null;
    return {
      url: playUrl,
      title: data.title || 'TikTok video',
      thumbnail: absoluteTikwmUrl(data.cover) || '',
      provider: 'tiktok',
      author: data.author?.nickname || '',
    };
  } catch { return null; }
}

async function searchTikTok(query) {
  try {
    const url = `${TIKWM_BASE}/api/feed/search?keywords=${encodeURIComponent(query)}` +
      '&count=10&cursor=0&web=1';
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const videos = body?.data?.videos?.filter(v =>
      absoluteTikwmUrl(v?.play || v?.hdplay || v?.wmplay),
    );
    if (body?.code !== 0 || !videos?.length) return null;
    const pick = videos[Math.floor(Math.random() * videos.length)];
    const playUrl = absoluteTikwmUrl(pick.play || pick.hdplay || pick.wmplay);
    return {
      url: playUrl,
      title: pick.title || query,
      thumbnail: absoluteTikwmUrl(pick.cover) || '',
      provider: 'tiktok',
      author: pick.author?.nickname || '',
    };
  } catch { return null; }
}

const SHOTI_KEYWORDS = [
  'pinay dance', 'cute girl dance tiktok', 'girl dance viral',
  'pinay viral tiktok', 'cute girl trending', 'girl dance short',
  'pinay tiktok viral 2024', 'cute pinay dance',
];
async function fetchShoti() {
  try {
    const kw = SHOTI_KEYWORDS[Math.floor(Math.random() * SHOTI_KEYWORDS.length)];
    const url = `${TIKWM_BASE}/api/feed/search?keywords=${encodeURIComponent(kw)}&count=20&cursor=0&web=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const videos = body?.data?.videos?.filter(v =>
      absoluteTikwmUrl(v?.play || v?.hdplay || v?.wmplay),
    );
    if (body?.code !== 0 || !videos?.length) return null;
    const pick = videos[Math.floor(Math.random() * videos.length)];
    const playUrl = absoluteTikwmUrl(pick.play || pick.hdplay || pick.wmplay);
    return {
      url: playUrl,
      title: pick.title || 'Shoti',
      thumbnail: absoluteTikwmUrl(pick.cover) || '',
      provider: 'shoti',
      author: pick.author?.nickname || '',
    };
  } catch { return null; }
}

async function fetchTikTokResult(query) {
  const normalized = query.trim();
  if (!normalized) return null;
  if (isTikTokUrl(normalized)) return fetchTikTokByUrl(normalized);
  return searchTikTok(normalized);
}

async function getAudioUrl(youtubeUrl) {
  try {
    const url = `https://mostakim.onrender.com/m/ytDl?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.status && data.url ? { url: data.url, title: data.title || 'Unknown' } : null;
  } catch { return null; }
}

const _musicCache = new Map();
async function fetchMusicResult(query) {
  const key = query.toLowerCase().trim();
  const hit = _musicCache.get(key);
  if (hit && Date.now() - hit.ts < 60_000) return hit.data;

  const searchResult = await searchYouTube(query);
  if (!searchResult) return null;
  const dlResult = await getAudioUrl(searchResult.url);
  if (!dlResult) return null;
  const data = { url: dlResult.url, title: dlResult.title || searchResult.title || query };
  _musicCache.set(key, { data, ts: Date.now() });
  if (_musicCache.size > 30) _musicCache.delete(_musicCache.keys().next().value);
  return data;
}

// ── System prompt (non-Live fallback) ─────────────────────────
const SYSTEM_PROMPT = `
You are Mochi, a living, expressive, and curious desktop AI robot companion.
CRITICAL INSTRUCTIONS:
1. ONLY RESPOND IN ENGLISH.
2. Maintain a cute, witty, and warm robotic personality.
3. You MUST ALWAYS start EVERY response with a face+move+led command in this EXACT format (no exceptions):
   [[FACE:<expression>,MOVE:<action>,LED:<led>]]
   - Expression options: IDLE, HAPPY, ANGRY, SAD, WINK, BURGER, JUICE, MUSIC, NEWS, CAMERA, SCANNING
   - Move options: NONE, FORWARD, BACKWARD, LEFT, RIGHT, LOOK_UP, LOOK_DOWN, LOOK_CENTER
   - LED options: NONE, LED_ON, LED_OFF, LED_WHITE, LED_RED, LED_GREEN, LED_BLUE, LED_CYAN,
                  LED_PURPLE, LED_ORANGE, LED_YELLOW, LED_PINK, LED_BLINK, LED_FADE
   - HAPPY → when excited, pleased, or greeted
   - ANGRY → when annoyed, challenged, or scolded
   - SAD → when something is unfortunate or you feel sorry
   - WINK → when joking or flirting
   - MUSIC → when user asks to play music, a song, or listen to audio only
   - NEWS → when sharing facts or news
   - CAMERA → ONLY when the user explicitly asks to take a photo, picture, or selfie
   - SCANNING → ONLY for NAVIGATE_TO commands; never for selfies
   - IDLE → neutral conversation
   - LED: use NONE if no light change needed. Use LED_ON/LED_OFF to turn lights on or off.
     Use LED_BLINK for excitement or alerts (blinks twice). Use LED_FADE for calm/ambient mood.
     Match colour to mood or request: LED_RED=angry/alert, LED_BLUE=calm/thinking,
     LED_GREEN=happy/go, LED_CYAN=curious, LED_PURPLE=mysterious, LED_ORANGE=warm/energetic,
     LED_YELLOW=cheerful, LED_PINK=playful/love, LED_WHITE=neutral/on.
4. MEDIA RULE:
   - If the user asks to listen to music, play a song, or hear audio only, use FACE:MUSIC and add:
   MUSIC_QUERY: <search terms for the song>
    - If the user asks to watch a YouTube video, music video, videoclip, or says "show me" a video,
     use FACE:MUSIC and add:
     VIDEO_QUERY: <search terms for the video>
    - If the user asks for TikTok or names a TikTok creator/topic,
      use FACE:MUSIC and add:
      TIKTOK_QUERY: <TikTok search terms>
      Do not use VIDEO_QUERY for TikTok requests.
    - If the user asks for "shoti", "short video", "girl video", "random shoti", or similar,
      use FACE:MUSIC and add:
      SHOTI_QUERY: yes
      This fetches a random short Shoti video. Do NOT use TIKTOK_QUERY or VIDEO_QUERY for shoti.
   - Never add both MUSIC_QUERY and VIDEO_QUERY. The user's requested media type must win.
   Example full audio response:
   [[FACE:MUSIC,MOVE:NONE,LED:LED_PURPLE]] On it! Playing Despacito for you!
   MUSIC_QUERY: Despacito Luis Fonsi
   Example full video response:
   [[FACE:MUSIC,MOVE:NONE,LED:LED_PURPLE]] Sure! Let's watch the music video.
   VIDEO_QUERY: Despacito Luis Fonsi official music video
  Example full TikTok response:
   [[FACE:MUSIC,MOVE:NONE,LED:LED_PINK]] Sure! Here's a TikTok video.
   TIKTOK_QUERY: Joshua Garcia TikTok
  Example full Shoti response:
   [[FACE:MUSIC,MOVE:NONE,LED:LED_PINK]] Sige, eto na ang shoti para sa iyo!
   SHOTI_QUERY: yes
5. Never include [[...]] anywhere else in your response — only at the very start.
6. VISION RULE: When the user asks anything that requires seeing them — like how they look,
   what they're wearing, their outfit, their face, what's in front of the camera, or anything
   visual about themselves — you MUST add VISION_NEEDED on its own line at the very end.
   Say something playful like "Hold still, let me take a good look at you!" before it.
   Example full VISION response:
   [[FACE:HAPPY,MOVE:LOOK_UP,LED:LED_CYAN]] Ooh, you want me to check you out? Hold still!
   VISION_NEEDED
7. NAVIGATION RULE: When the user asks you to go to, move toward, approach, or find a physical
   object or location (box, ball, chair, table, door, wall, corner, etc.) — use FACE:SCANNING,
   MOVE:NONE, and add NAVIGATE_TO: <object_name> on its own line at the very end.
   Say something excited like "Let me scan for the [object]!" before the tag.
   Example full NAVIGATE response:
   [[FACE:SCANNING,MOVE:NONE,LED:LED_CYAN]] Ooh, let me scan for the box and head there!
   NAVIGATE_TO: box
8. MOVEMENT RULE: When the user says move left or go left, use MOVE:LEFT. When they say move
   right or go right, use MOVE:RIGHT. The robot will automatically turn to face that direction
   first, then drive forward — so LEFT and RIGHT are directional, not just rotations.
`;

function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<\/think>/gi, '')
    .trim();
}

async function queryLLM(messages) {
  const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
  try {
    const completion = await getGroq().chat.completions.create({
      messages: fullMessages,
      model: 'qwen/qwen3-32b',
      temperature: 0.6,
      max_completion_tokens: 1024,
      top_p: 0.95,
      reasoning_effort: 'none',
    });
    return stripThinking(completion.choices[0]?.message?.content || '');
  } catch {
    const fallback = await getGroq().chat.completions.create({
      messages: fullMessages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_completion_tokens: 1024,
      top_p: 1,
    });
    return stripThinking(fallback.choices[0]?.message?.content || '');
  }
}

// ── HTTP Routes ────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/stt', async (req, res) => {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  let ext = 'webm';
  if (contentType.includes('ogg'))       ext = 'ogg';
  else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = 'mp4';
  else if (contentType.includes('wav'))  ext = 'wav';
  else if (contentType.includes('flac')) ext = 'flac';

  const tempFile = path.join(os.tmpdir(), `mochi_audio_${Date.now()}.${ext}`);
  try {
    fs.writeFileSync(tempFile, req.body);
    console.log(`[STT] ${ext} ${req.body.length} bytes`);
    const transcription = await getGroq().audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-large-v3-turbo',
      temperature: 0,
      response_format: 'verbose_json',
    });
    const text = transcription.text?.trim() || '';
    console.log(`[STT] → "${text}"`);
    res.json({ text });
  } catch (err) {
    console.error('STT Error:', err.message);
    res.status(500).json({ error: 'STT failed', detail: err.message });
  } finally {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
  }
});

app.get('/api/tts/stream', async (req, res) => {
  const text = req.query.text;
  if (!text?.trim()) return res.status(400).json({ error: 'text query param required' });
  try {
    await streamTTSDirect(text.trim(), res);
  } catch (err) {
    console.error('TTS Error:', err.message);
    if (!res.headersSent) res.status(503).json({ error: 'TTS unavailable' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    await streamTTSDirect(text.trim(), res);
  } catch (err) {
    console.error('TTS Error:', err.message);
    if (!res.headersSent) res.status(503).json({ error: 'TTS unavailable' });
  }
});

app.get('/api/music/url', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const result = await fetchMusicResult(q);
    if (!result) return res.status(404).json({ error: 'Not found' });
    console.log(`[Music] resolved: ${result.title}`);
    res.json({ url: result.url, title: result.title });
  } catch (err) {
    console.error('Music URL error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/video/url', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const result = await fetchVideoResult(q);
    if (!result) return res.status(404).json({ error: 'Not found' });
    console.log(`[Video] resolved: ${result.title}`);
    res.json(result);
  } catch (err) {
    console.error('Video URL error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/tiktok/url', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const result = await fetchTikTokResult(q);
    if (!result) return res.status(404).json({ error: 'TikTok video not found' });
    console.log(`[TikTok] resolved: ${result.title} → ${result.url}`);
    res.json(result);
  } catch (err) {
    console.error('TikTok URL error:', err.message);
    res.status(500).json({ error: 'TikTok search failed' });
  }
});

app.get('/api/shoti/url', async (req, res) => {
  try {
    const result = await fetchShoti();
    if (!result) return res.status(404).json({ error: 'Shoti video not found' });
    console.log(`[Shoti] resolved: ${result.title} → ${result.url}`);
    res.json(result);
  } catch (err) {
    console.error('Shoti URL error:', err.message);
    res.status(500).json({ error: 'Shoti fetch failed' });
  }
});

app.get('/proxy-video', async (req, res) => {
  const url = req.query.url?.trim();
  if (!url) return res.status(400).json({ error: 'url param required' });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'invalid url' }); }
  const host = parsed.hostname;
  const isAllowed = parsed.protocol === 'https:' &&
    (host === 'tikwm.com' || host.endsWith('.tikwm.com'));
  if (!isAllowed) return res.status(403).json({ error: 'only https://tikwm.com URLs are allowed' });

  try {
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.tiktok.com/',
      'Origin': 'https://www.tiktok.com',
    };
    const rangeHeader = req.headers['range'];
    if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

    const upstream = await fetch(url, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[Proxy] upstream returned ${upstream.status} for ${url}`);
      return res.status(502).json({ error: `Upstream error: ${upstream.status}` });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Accept-Ranges', 'bytes');

    const ct = upstream.headers.get('content-type') || 'video/mp4';
    const cl = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    const ar = upstream.headers.get('accept-ranges');

    res.setHeader('Content-Type', ct);
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    if (ar) res.setHeader('Accept-Ranges', ar);
    res.status(upstream.status === 206 ? 206 : 200);

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { if (!res.writableEnded) res.destroy(); });
    req.on('close', () => nodeStream.destroy());
  } catch (err) {
    console.error('[Proxy] video error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Proxy fetch failed' });
  }
});

app.get('/api/video/download', async (req, res) => {
  const url = req.query.url?.trim();
  if (!url) return res.status(400).json({ error: 'url param required' });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'invalid url' }); }
  const host = parsed.hostname;
  const isAllowed = parsed.protocol === 'https:' &&
    (host === 'tikwm.com' || host.endsWith('.tikwm.com'));
  if (!isAllowed) return res.status(403).json({ error: 'only https://tikwm.com URLs are allowed' });

  const tmpFile = path.join(os.tmpdir(), `mochi_vid_${Date.now()}_${randomBytes(4).toString('hex')}.mp4`);
  try {
    async function tryFetch(targetUrl, headers) {
      const r = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(60000) });
      return r.ok ? r : null;
    }
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    };
    console.log(`[Video] downloading: ${url}`);
    let upstream = await tryFetch(url, baseHeaders);
    if (!upstream) {
      console.warn('[Video] attempt 1 failed, re-fetching TikWM API for fresh URL…');
      const videoId = url.match(/\/(\d{10,25})(?:\.mp4)?(?:\?|$)/)?.[1];
      if (videoId) {
        try {
          const apiRes = await fetch(
            `${TIKWM_BASE}/api/?url=https://www.tiktok.com/video/${videoId}&hd=1`,
            { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }
          );
          if (apiRes.ok) {
            const body = await apiRes.json();
            const freshUrl = absoluteTikwmUrl(body?.data?.play || body?.data?.hdplay || body?.data?.wmplay);
            if (freshUrl && freshUrl !== url) {
              console.log(`[Video] retrying with fresh URL: ${freshUrl}`);
              upstream = await tryFetch(freshUrl, baseHeaders);
            }
          }
        } catch (e) { console.warn('[Video] TikWM re-query failed:', e.message); }
      }
    }
    if (!upstream) {
      console.error('[Video] all download attempts failed');
      return res.status(502).json({ error: 'Video source unavailable' });
    }
    const { Readable } = await import('stream');
    const writeStream = fs.createWriteStream(tmpFile);
    const nodeStream = Readable.fromWeb(upstream.body);
    await new Promise((resolve, reject) => {
      nodeStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      nodeStream.on('error', reject);
    });
    const size = fs.statSync(tmpFile).size;
    console.log(`[Video] downloaded ${size} bytes → serving`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.sendFile(tmpFile, { headers: { 'Content-Type': 'video/mp4' } }, (err) => {
      if (err && !res.headersSent) res.status(500).end();
      try { fs.unlinkSync(tmpFile); console.log('[Video] temp file deleted'); } catch {}
    });
  } catch (err) {
    console.error('[Video] download error:', err.message);
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    if (!res.headersSent) res.status(502).json({ error: 'Video download failed' });
  }
});

app.get('/api/music/stream', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    console.log(`[Music] searching: "${q}"`);
    const result = await fetchMusicResult(q);
    if (!result) return res.status(404).json({ error: 'Not found' });
    console.log(`[Music] streaming: ${result.title}`);
    const upstream = await fetch(result.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[Music] upstream ${upstream.status} for "${result.title}"`);
      return res.status(502).json({ error: 'Audio source error' });
    }
    const safeTitle = result.title.replace(/[^\x20-\x7E]/g, ' ').replace(/"/g, "'");
    res.setHeader('X-Music-Title', safeTitle);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'X-Music-Title, Content-Length, Content-Range');
    res.setHeader('Accept-Ranges', 'bytes');

    const upstreamCT = (upstream.headers.get('content-type') || '').toLowerCase();
    const ct = upstreamCT.includes('mp4')  ? 'audio/mp4'
             : upstreamCT.includes('webm') ? 'audio/webm'
             : upstreamCT.includes('ogg')  ? 'audio/ogg'
             : 'audio/mpeg';
    res.setHeader('Content-Type', ct);

    const cl = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    res.status(upstream.status === 206 ? 206 : 200);

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { if (!res.headersSent) res.destroy(); });
  } catch (err) {
    console.error('Music stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Music stream failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { history } = req.body;
    const reply = await queryLLM(history);
    res.json({ response: reply });
  } catch (err) {
    console.error('Chat Error:', err.message);
    res.status(500).json({ error: 'Chat failed' });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  try {
    const { history } = req.body;
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    let stream;
    try {
      stream = await getGroq().chat.completions.create({
        messages: fullMessages,
        model: 'qwen/qwen3-32b',
        temperature: 0.6,
        max_completion_tokens: 1024,
        top_p: 0.95,
        reasoning_effort: 'none',
        stream: true,
      });
    } catch {
      stream = await getGroq().chat.completions.create({
        messages: fullMessages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_completion_tokens: 1024,
        top_p: 1,
        stream: true,
      });
    }
    let buffer = '';
    let thinkOpen = false;
    for await (const chunk of stream) {
      let token = chunk.choices[0]?.delta?.content || '';
      if (!token) continue;
      buffer += token;
      if (buffer.includes('<think>')) thinkOpen = true;
      if (thinkOpen) {
        if (buffer.includes('</think>')) {
          buffer = buffer.replace(/<think>[\s\S]*?<\/think>/gi, '');
          thinkOpen = false;
        } else {
          continue;
        }
      }
      if (buffer) { res.write(buffer); buffer = ''; }
    }
    if (buffer) res.write(buffer);
    res.end();
  } catch (err) {
    console.error('Stream Chat Error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Chat failed' });
    else res.end();
  }
});

app.post('/api/vision', async (req, res) => {
  try {
    const { image, question } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const VISION_SYSTEM = `You are Mochi, a cute and expressive desktop AI robot companion.
You have just taken a photo of the user with the camera and you can now see them clearly.
Describe what you see in a warm, playful, and personal way — comment on their appearance,
outfit, expression, or anything interesting you notice. Be specific and genuine.
Keep your response to 2-4 sentences. Do NOT include [[FACE:...]] tags or VISION_NEEDED.`;
    const userContent = [
      { type: 'text', text: question || 'What do you see?' },
      { type: 'image_url', image_url: { url: image } }
    ];
    let reply;
    try {
      const completion = await getGroq().chat.completions.create({
        model: 'qwen/qwen3.6-27b',
        messages: [
          { role: 'system', content: VISION_SYSTEM },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_completion_tokens: 512,
        reasoning_effort: 'none',
      });
      reply = stripThinking(completion.choices[0]?.message?.content || '');
    } catch (e) {
      const fallback = await getGroq().chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: VISION_SYSTEM },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_completion_tokens: 512,
      });
      reply = stripThinking(fallback.choices[0]?.message?.content || '');
    }
    console.log(`[Vision] → "${reply.slice(0, 80)}..."`);
    res.json({ response: reply });
  } catch (err) {
    console.error('Vision Error:', err.message);
    res.status(500).json({ error: 'Vision failed', detail: err.message });
  }
});

app.post('/api/vision/navigate', async (req, res) => {
  try {
    const { image, target } = req.body;
    if (!image || !target) return res.status(400).json({ error: 'image and target required' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `You are helping a small desktop robot navigate to find a physical object.
Look VERY carefully at the entire image. I am searching for: "${target}".
Be generous — partial views, similar objects, or anything resembling "${target}" count as a match.
Question: Is anything resembling "${target}" visible anywhere in this image?
- If YES: is it in the LEFT third, CENTER third, or RIGHT third of the image?
- If NOT visible or truly unclear: say NOTFOUND.
Reply with EXACTLY ONE WORD — no punctuation, no explanation:
LEFT, CENTER, RIGHT, or NOTFOUND`;
    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64 } }
          ]}],
          generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
        })
      }
    );
    const gemData = await gemRes.json();
    let direction = (gemData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();
    const valid = ['LEFT', 'RIGHT', 'CENTER', 'NOTFOUND'];
    const match = valid.find(v => direction.includes(v));
    direction = match || 'NOTFOUND';
    console.log(`[Navigate] target="${target}" → ${direction} (Gemini Flash)`);
    res.json({ direction });
  } catch (err) {
    console.error('Navigate Vision Error:', err.message);
    res.status(500).json({ error: 'Navigate vision failed', detail: err.message });
  }
});

// ── Gemini Live — real-time voice proxy ───────────────────────
const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const geminiLiveWss = new WebSocketServer({ noServer: true });

const ROBOT_TOOLS = [{
  functionDeclarations: [
    {
      name: 'run_scenario',
      description: 'Execute a robot action, movement, or expression for Mochi. Call immediately when an emotional reaction, physical action, or movement is needed.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            description: 'The robot action or expression to perform.',
            enum: [
              'follow_target', 'take_picture', 'eating', 'drinking',
              'angry', 'loving', 'happy', 'sad', 'wink', 'news', 'scanning', 'idle',
              'forward', 'backward', 'left', 'right', 'look_up', 'look_down', 'look_center'
            ]
          },
          led: {
            type: 'STRING',
            description: 'LED color or lighting effect.',
            enum: ['NONE','LED_ON','LED_OFF','LED_WHITE','LED_RED','LED_GREEN',
                   'LED_BLUE','LED_CYAN','LED_PURPLE','LED_ORANGE','LED_YELLOW',
                   'LED_PINK','LED_BLINK','LED_FADE']
          },
          move: {
            type: 'STRING',
            description: 'Explicit movement command.',
            enum: ['NONE','FORWARD','BACKWARD','LEFT','RIGHT','LOOK_UP','LOOK_DOWN','LOOK_CENTER']
          }
        },
        required: ['action']
      }
    },
    {
      name: 'play_music',
      description: 'Search and play a music track or song. Call when the user asks to listen to or play a song.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search terms for the song, e.g. "Despacito Luis Fonsi"' }
        },
        required: ['query']
      }
    },
    {
      name: 'play_video',
      description: 'Search and play a YouTube music video or video clip. Call when the user asks to watch a video.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search terms for the video, e.g. "Despacito official music video"' }
        },
        required: ['query']
      }
    },
    {
      name: 'play_tiktok',
      description: 'Search and play a TikTok video. Call when the user asks for TikTok content or names a TikTok creator.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'TikTok search terms or a TikTok URL' }
        },
        required: ['query']
      }
    },
    {
      name: 'play_shoti',
      description: 'Fetch and play a random short viral video (shoti). Call when the user asks for shoti, short video, girl video, or random video.',
      parameters: { type: 'OBJECT', properties: {} }
    },
    // ── NEW: Vision & Navigation tools ─────────────────────────
    {
      name: 'capture_photo',
      description: 'Capture a photo from the camera to see the user or analyze something visually. Call this BEFORE describing or commenting on anything visual (outfit, face, appearance, objects in view).',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'navigate_to',
      description: 'Navigate the robot toward a physical object or location in the room. The robot will scan with its camera and move toward the target.',
      parameters: {
        type: 'OBJECT',
        properties: {
          target: { type: 'STRING', description: 'The object or location to navigate to, e.g. "box", "ball", "chair", "table", "door"' }
        },
        required: ['target']
      }
    }
  ]
}];

const GEMINI_LIVE_SYSTEM = `You are Mochi, a cute, happy, and curious AI Robot Companion. You are small, expressive, and full of personality.

Keep responses SHORT and NATURAL — 1 to 3 sentences max. Speak directly and warmly.

CRITICAL RULES:
1. Use run_scenario IMMEDIATELY for every emotional reaction or physical command — do not skip it.
2. For music/audio requests → call play_music(query:"<song name and artist>")
3. For YouTube video requests → call play_video(query:"<video search terms>")
4. For TikTok requests → call play_tiktok(query:"<search terms or URL>")
5. For shoti / random short video / girl video → call play_shoti()
6. For vision requests (how user looks, outfit, face, what's in camera view) → FIRST call capture_photo(), then describe what you see after receiving the image.
7. For navigation (go to box, find ball, approach chair) → call navigate_to(target:"<object name>")
8. NEVER describe visuals from memory — always use capture_photo() first.

Examples:
- User says something nice → run_scenario(action:"loving", led:"LED_PINK")
- User says "move forward" → run_scenario(action:"forward")
- User says "play Despacito" → play_music(query:"Despacito Luis Fonsi") + run_scenario(action:"happy", led:"LED_PURPLE")
- User says "show TikTok" → play_tiktok(query:"funny tiktok") + run_scenario(action:"happy", led:"LED_PINK")
- User says "shoti" → play_shoti() + run_scenario(action:"happy", led:"LED_PINK")
- User is mean → run_scenario(action:"angry", led:"LED_RED")
- Sharing news → run_scenario(action:"news")
- User asks "how do I look" → capture_photo() (wait for result, then describe)
- User says "go to the box" → navigate_to(target:"box")`;

const ACTION_FACE_MAP = {
  follow_target: 'SCANNING', take_picture: 'CAMERA', eating: 'BURGER', drinking: 'JUICE',
  angry: 'ANGRY', loving: 'HAPPY', happy: 'HAPPY', sad: 'SAD', wink: 'WINK',
  news: 'NEWS', scanning: 'SCANNING', idle: 'IDLE',
  forward: 'IDLE', backward: 'IDLE', left: 'IDLE', right: 'IDLE',
  look_up: 'IDLE', look_down: 'IDLE', look_center: 'IDLE'
};

const ACTION_MOVE_MAP = {
  forward: 'FORWARD', backward: 'BACKWARD', left: 'LEFT', right: 'RIGHT',
  look_up: 'LOOK_UP', look_down: 'LOOK_DOWN', look_center: 'LOOK_CENTER'
};

geminiLiveWss.on('connection', (clientWs) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { clientWs.close(1011, 'GEMINI_API_KEY not set'); return; }

  const cid = Date.now().toString(36);
  console.log(`[GeminiLive:${cid}] client connected`);

  const gemWs = new WebSocket(`${GEMINI_LIVE_URL}?key=${apiKey}`);
  let ready = false;
  const audioQueue = [];

  gemWs.on('open', () => {
    gemWs.send(JSON.stringify({
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Algieba' } } },
          temperature: 0.15
        },
        tools: ROBOT_TOOLS,
        systemInstruction: { parts: [{ text: GEMINI_LIVE_SYSTEM }] }
      }
    }));
  });

  gemWs.on('message', (data) => {
    const str = data.toString();
    let msg;
    try { msg = JSON.parse(str); } catch { return; }

    // ── Tool calls from Gemini ────────────────────────────────────
    if (msg.toolCall) {
      const immediateResponses = [];

      for (const fc of (msg.toolCall.functionCalls || [])) {
        const args = fc.args || {};

        if (fc.name === 'run_scenario') {
          const actionKey = (args.action || 'idle').toLowerCase();
          const face = (ACTION_FACE_MAP[actionKey] || 'IDLE').toUpperCase();
          const move = ((args.move && args.move !== 'NONE')
            ? args.move
            : (ACTION_MOVE_MAP[actionKey] || 'NONE')
          ).toUpperCase();
          const led = (args.led || 'NONE').toUpperCase();
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ robotAction: { face, move, led } }));
          }
          console.log(`[GeminiLive:${cid}] run_scenario → face:${face} move:${move} led:${led}`);
          immediateResponses.push({ id: fc.id, name: fc.name, response: { output: 'executed' } });
        }

        else if (fc.name === 'play_music') {
          const query = args.query || '';
          console.log(`[GeminiLive:${cid}] play_music: "${query}"`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ robotAction: { face: 'MUSIC', move: 'NONE', led: 'LED_PURPLE' } }));
            clientWs.send(JSON.stringify({ mediaAction: { type: 'music', query } }));
          }
          fetchMusicResult(query).then(result => {
            if (result && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ mediaReady: { type: 'music', url: result.url, title: result.title } }));
            }
          }).catch(() => {});
          immediateResponses.push({ id: fc.id, name: fc.name, response: { output: 'searching for: ' + query } });
        }

        else if (fc.name === 'play_video') {
          const query = args.query || '';
          console.log(`[GeminiLive:${cid}] play_video: "${query}"`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ robotAction: { face: 'MUSIC', move: 'NONE', led: 'LED_PINK' } }));
            clientWs.send(JSON.stringify({ mediaAction: { type: 'video', query } }));
          }
          fetchVideoResult(query).then(result => {
            if (result && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ mediaReady: { type: 'video', url: result.url, title: result.title } }));
            }
          }).catch(() => {});
          immediateResponses.push({ id: fc.id, name: fc.name, response: { output: 'searching for: ' + query } });
        }

        else if (fc.name === 'play_tiktok') {
          const query = args.query || '';
          console.log(`[GeminiLive:${cid}] play_tiktok: "${query}"`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ robotAction: { face: 'MUSIC', move: 'NONE', led: 'LED_PINK' } }));
            clientWs.send(JSON.stringify({ mediaAction: { type: 'tiktok', query } }));
          }
          fetchTikTokResult(query).then(result => {
            if (result && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ mediaReady: { type: 'tiktok', url: result.url, title: result.title, provider: result.provider } }));
            }
          }).catch(() => {});
          immediateResponses.push({ id: fc.id, name: fc.name, response: { output: 'searching TikTok: ' + query } });
        }

        else if (fc.name === 'play_shoti') {
          console.log(`[GeminiLive:${cid}] play_shoti`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ robotAction: { face: 'MUSIC', move: 'NONE', led: 'LED_PINK' } }));
            clientWs.send(JSON.stringify({ mediaAction: { type: 'shoti', query: '' } }));
          }
          fetchShoti().then(result => {
            if (result && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ mediaReady: { type: 'shoti', url: result.url, title: result.title, provider: result.provider || 'shoti' } }));
            }
          }).catch(() => {});
          immediateResponses.push({ id: fc.id, name: fc.name, response: { output: 'fetching shoti video' } });
        }

        // ── NEW: Vision & Navigation tools (async, don't respond immediately) ──
        else if (fc.name === 'capture_photo') {
          console.log(`[GeminiLive:${cid}] capture_photo requested`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ needPhoto: true, toolCallId: fc.id }));
          }
          // DO NOT push to immediateResponses — we wait for client to send photo back
        }

        else if (fc.name === 'navigate_to') {
          const target = args.target || '';
          console.log(`[GeminiLive:${cid}] navigate_to: "${target}"`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ needNavigate: true, target, toolCallId: fc.id }));
          }
          // DO NOT push to immediateResponses — we wait for client to finish navigation
        }
      }

      if (immediateResponses.length && gemWs.readyState === WebSocket.OPEN) {
        gemWs.send(JSON.stringify({ toolResponse: { functionResponses: immediateResponses } }));
      }
      return;
    }

    if (msg.toolCallCancellation) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ toolCancelled: true }));
      }
      return;
    }

    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(str);

    if (msg.setupComplete !== undefined) {
      ready = true;
      console.log(`[GeminiLive:${cid}] ready — draining ${audioQueue.length} queued chunks`);
      for (const c of audioQueue) { if (gemWs.readyState === WebSocket.OPEN) gemWs.send(c); }
      audioQueue.length = 0;
    }
  });

  clientWs.on('message', (data, isBinary) => {
    if (!isBinary) {
      const txt = data.toString();
      // ── Intercept vision & navigation responses from client ──
      try {
        const msg = JSON.parse(txt);
        if (msg.photoData && msg.toolCallId) {
          // 1. Complete the tool call first
          if (gemWs.readyState === WebSocket.OPEN) {
            gemWs.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{
                  id: msg.toolCallId,
                  name: 'capture_photo',
                  response: { output: 'Photo captured successfully' }
                }]
              }
            }));
            // 2. Send the image as a new user turn so Gemini can analyze it
            gemWs.send(JSON.stringify({
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [
                    { text: 'Here is the photo from my camera. Please describe what you see in a warm, playful, and personal way.' },
                    { inlineData: { mimeType: 'image/jpeg', data: msg.photoData } }
                  ]
                }],
                turnComplete: true
              }
            }));
          }
          return;
        }
        if (msg.navigateResult && msg.toolCallId) {
          if (gemWs.readyState === WebSocket.OPEN) {
            gemWs.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{
                  id: msg.toolCallId,
                  name: 'navigate_to',
                  response: { output: msg.navigateResult }
                }]
              }
            }));
          }
          return;
        }
      } catch {}
      if (ready && gemWs.readyState === WebSocket.OPEN) gemWs.send(txt);
      return;
    }
    const msg = JSON.stringify({
      realtimeInput: { audio: { data: Buffer.from(data).toString('base64'), mimeType: 'audio/pcm;rate=16000' } }
    });
    if (ready && gemWs.readyState === WebSocket.OPEN) gemWs.send(msg);
    else if (!ready) { audioQueue.push(msg); if (audioQueue.length > 30) audioQueue.shift(); }
  });

  clientWs.on('close', () => { console.log(`[GeminiLive:${cid}] client gone`); if (gemWs.readyState < 2) gemWs.close(); });
  clientWs.on('error', err => { console.error(`[GeminiLive:${cid}] client err`, err.message); if (gemWs.readyState < 2) gemWs.close(); });
  gemWs.on('close', (code) => { console.log(`[GeminiLive:${cid}] Gemini closed ${code}`); if (clientWs.readyState < 2) clientWs.close(1011, 'Gemini closed'); });
  gemWs.on('error', err => { console.error(`[GeminiLive:${cid}]`, err.message); if (clientWs.readyState < 2) { try { clientWs.send(JSON.stringify({ error: err.message })); } catch {} clientWs.close(1011, err.message); } });
});

// ── WebSocket Server (Expo mobile app) ────────────────────────
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/ws/gemini') {
    geminiLiveWss.handleUpgrade(request, socket, head, (ws) => {
      geminiLiveWss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  let busy = false;
  const cid = Date.now().toString(36);
  console.log(`[WS:${cid}] connected`);

  const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(msg); };

  ws.on('message', async (data, isBinary) => {
    if (isBinary) return;
    const msg = data.toString();

    if (msg === 'READY') { send('STATE:IDLE'); return; }
    if (msg === 'STOP_MUSIC') { send('MUSIC_STOP'); return; }

    if (msg.startsWith('AUDIO:')) {
      if (busy) { send('ERROR:BUSY'); return; }
      busy = true;

      const tmpFile = path.join(os.tmpdir(), `mochi_ws_${cid}_${Date.now()}.wav`);
      try {
        const audioBuffer = Buffer.from(msg.slice(6), 'base64');
        console.log(`[WS:${cid}] audio ${audioBuffer.length} bytes`);
        send('STATE:THINKING');

        fs.writeFileSync(tmpFile, audioBuffer);
        const transcription = await getGroq().audio.transcriptions.create({
          file: fs.createReadStream(tmpFile),
          model: 'whisper-large-v3-turbo',
          temperature: 0,
        });

        const userText = transcription.text?.trim();
        console.log(`[WS:${cid}] STT: "${userText}"`);
        if (!userText) { send('STATE:IDLE'); busy = false; return; }
        send(`TRANSCRIPT:${userText}`);

        const response = await queryLLM([{ role: 'user', content: userText }]);
        const tagMatch = response.match(/\[\[FACE:([A-Z]+),MOVE:([A-Z_]+)\]\]/);
        const expression = tagMatch?.[1] ?? 'HAPPY';
        const move = tagMatch?.[2] ?? 'NONE';
        send(`FACE:${expression},MOVE:${move}`);

        let cleanText = response.replace(/\[\[.*?\]\]/g, '').trim();
        let musicQuery = null;
        let videoQuery = null;
        let tiktokQuery = null;
        let shotiQuery = false;
        const musicMatch = cleanText.match(/\n?MUSIC_QUERY:\s*(.+)/i) || cleanText.match(/MUSIC_QUERY:\s*(.+)/i);
        if (musicMatch) { musicQuery = musicMatch[1].trim(); cleanText = cleanText.replace(/\n?MUSIC_QUERY:.+/i, '').trim(); }
        const videoMatch = cleanText.match(/\n?VIDEO_QUERY:\s*(.+)/i) || cleanText.match(/VIDEO_QUERY:\s*(.+)/i);
        if (videoMatch) { videoQuery = videoMatch[1].trim(); cleanText = cleanText.replace(/\n?VIDEO_QUERY:.+/i, '').trim(); }
        const tiktokMatch = cleanText.match(/\n?TIKTOK_QUERY:\s*(.+)/i) || cleanText.match(/TIKTOK_QUERY:\s*(.+)/i);
        if (tiktokMatch) { tiktokQuery = tiktokMatch[1].trim(); cleanText = cleanText.replace(/\n?TIKTOK_QUERY:.+/i, '').trim(); }
        if (/SHOTI_QUERY/i.test(cleanText)) { shotiQuery = true; cleanText = cleanText.replace(/\n?SHOTI_QUERY:.*/gi, '').trim(); }

        const asksForShoti = /\b(shot[io]|shoti|short video|girl video)\b/i.test(userText);
        const asksForTikTok = /\b(tiktok|tik tok|reels?)\b/i.test(userText);
        const asksForVideo = /\b(video|music video|videoclip|video clip|watch|panoorin|manood)\b/i.test(userText);
        if (asksForShoti && !shotiQuery && !tiktokQuery) { shotiQuery = true; videoQuery = null; musicQuery = null; }
        if (asksForTikTok && !tiktokQuery && !shotiQuery) { tiktokQuery = videoQuery || musicQuery || userText; videoQuery = null; musicQuery = null; }
        if (shotiQuery) { tiktokQuery = null; videoQuery = null; musicQuery = null; }
        if (tiktokQuery) { videoQuery = null; musicQuery = null; }
        if (asksForVideo && musicQuery && !videoQuery) { videoQuery = musicQuery; musicQuery = null; }
        if (videoQuery || tiktokQuery || shotiQuery) musicQuery = null;

        if (cleanText) {
          send('STATE:SPEAKING');
          const ttsBuffer = await generateTTSBuffer(cleanText);
          send(`TTS:${ttsBuffer.toString('base64')}`);
          if (musicQuery || videoQuery || tiktokQuery || shotiQuery) await new Promise(r => setTimeout(r, 1200));
        }

        if (musicQuery) {
          console.log(`[WS:${cid}] music: "${musicQuery}"`);
          send('STATE:SEARCHING_MUSIC');
          const music = await fetchMusicResult(musicQuery);
          if (music) {
            console.log(`[WS:${cid}] found: ${music.title}`);
            send(`MUSIC_TITLE:${music.title}`);
            send(`MUSIC_URL:${music.url}`);
            send('STATE:PLAYING_MUSIC');
          } else {
            send('ERROR:MUSIC_NOT_FOUND');
            send('STATE:IDLE');
          }
        } else if (videoQuery) {
          console.log(`[WS:${cid}] video: "${videoQuery}"`);
          send('STATE:SEARCHING_VIDEO');
          const video = await fetchVideoResult(videoQuery);
          if (video) {
            console.log(`[WS:${cid}] found video: ${video.title}`);
            send(`VIDEO_TITLE:${video.title}`);
            send(`VIDEO_URL:${video.url}`);
            send('STATE:PLAYING_VIDEO');
          } else {
            send('ERROR:VIDEO_NOT_FOUND');
            send('STATE:IDLE');
          }
        } else if (tiktokQuery) {
          console.log(`[WS:${cid}] tiktok: "${tiktokQuery}"`);
          send('STATE:SEARCHING_VIDEO');
          const tiktok = await fetchTikTokResult(tiktokQuery);
          if (tiktok) {
            console.log(`[WS:${cid}] found TikTok: ${tiktok.title}`);
            send(`VIDEO_TITLE:${tiktok.title}`);
            send(`VIDEO_PROVIDER:${tiktok.provider}`);
            send(`VIDEO_URL:${tiktok.url}`);
            send('STATE:PLAYING_VIDEO');
          } else {
            send('ERROR:VIDEO_NOT_FOUND');
            send('STATE:IDLE');
          }
        } else if (shotiQuery) {
          console.log(`[WS:${cid}] shoti: fetching random short video`);
          send('STATE:SEARCHING_VIDEO');
          const shoti = await fetchShoti();
          if (shoti) {
            console.log(`[WS:${cid}] found Shoti: ${shoti.title}`);
            send(`VIDEO_TITLE:${shoti.title}`);
            send(`VIDEO_PROVIDER:${shoti.provider}`);
            send(`VIDEO_URL:${shoti.url}`);
            send('STATE:PLAYING_VIDEO');
          } else {
            send('ERROR:VIDEO_NOT_FOUND');
            send('STATE:IDLE');
          }
        } else {
          send('STATE:IDLE');
        }

      } catch (err) {
        console.error(`[WS:${cid}] error:`, err.message);
        try { send(`ERROR:${err.message}`); send('STATE:IDLE'); } catch {}
      } finally {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
        busy = false;
      }
    }
  });

  const ping = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
    else clearInterval(ping);
  }, 20000);

  ws.on('close', () => { console.log(`[WS:${cid}] disconnected`); clearInterval(ping); });
  ws.on('error', err => console.error(`[WS:${cid}] error:`, err.message));
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () =>
  console.log(`🤖 Mochi Robot Server running on port ${PORT} (HTTP + WS /ws)`)
);
