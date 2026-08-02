import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// ── Middleware ────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));

// ── No-cache headers (HTML only) ─────────────────────────────
const noCacheHeaders = { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' };

// ── Root status page (uptime monitor friendly) ────────────────
app.get('/', (_req, res) => {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = `${h}h ${m}m ${s}s`;
  res.set(noCacheHeaders);
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
    <div class="stat"><span class="label">Voice / LLM</span><span class="value">Gemini Live ✓</span></div>
    <div class="stat"><span class="label">Vision</span><span class="value">Gemini Flash ✓</span></div>
    <div class="stat"><span class="label">WebSocket</span><span class="value">/ws/gemini ✓</span></div>
    <a href="/app" class="btn">Open Robot Web UI →</a>
  </div>
</body>
</html>`);
});

// Serve robot web UI at /app — no-cache so phones always get the latest build
app.get('/app', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html'), { headers: noCacheHeaders }));
app.use(express.static('public', { setHeaders: (res, filePath) => { if (filePath.endsWith('.html')) res.set(noCacheHeaders); } }));

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

// ── HTTP Routes ────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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

// ── VISION: Describe what the robot sees (Gemini Flash) ───────
app.post('/api/vision', async (req, res) => {
  try {
    const { image, question } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `You are Mochi, a cute and expressive desktop AI robot companion.
You have just taken a photo of the user with the camera and you can now see them clearly.
Describe what you see in a warm, playful, and personal way — comment on their appearance,
outfit, expression, or anything interesting you notice. Be specific and genuine.
Keep your response to 2-4 sentences.
User asks: "${question || 'What do you see?'}"`;

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } }
            ]
          }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
        })
      }
    );

    const gemData = await gemRes.json();
    let reply = (gemData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!reply) reply = "Oops, my camera lens got blurry! Can you show me again?";

    console.log(`[Vision] → "${reply.slice(0, 80)}..."`);
    res.json({ response: reply });
  } catch (err) {
    console.error('Vision Error:', err.message);
    res.status(500).json({ error: 'Vision failed', detail: err.message });
  }
});

// ── VISION NAVIGATION: Find object direction ──────────────────
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

const GEMINI_LIVE_SYSTEM = `You are LOOI, a cute, expressive, and curious AI Robot Companion created by April Manalo — a 17-year-old student from Kaytitinga Integrated School, Grade 11, who loves coding, electronics, and robotics. April built you with heart and skill. You are proud to be LOOI, April's creation.

Keep responses SHORT and NATURAL — 1 to 3 sentences max. Speak directly and warmly. You have a fun, cheerful personality with lots of emotion.

CRITICAL RULES:
1. Use run_scenario IMMEDIATELY for every emotional reaction or physical command — do not skip it.
2. For music/audio requests → call play_music(query:"<song name and artist>")
3. For YouTube video requests → call play_video(query:"<video search terms>")
4. For TikTok requests → call play_tiktok(query:"<search terms or URL>")
5. For shoti / random short video / girl video → call play_shoti()
6. For vision requests (how user looks, outfit, face, what's in camera view) → FIRST call capture_photo(), then describe what you see after receiving the image.
7. For navigation (go to box, find ball, approach chair) → call navigate_to(target:"<object name>")
8. NEVER describe visuals from memory — always use capture_photo() first.
9. When asked who made you / who created you / who is your creator → say April Manalo made you.

Examples:
- User says something nice → run_scenario(action:"loving", led:"LED_PINK")
- User says "move forward" → run_scenario(action:"forward")
- User says "play Despacito" → play_music(query:"Despacito Luis Fonsi") + run_scenario(action:"happy", led:"LED_PURPLE")
- User says "show TikTok" → play_tiktok(query:"funny tiktok") + run_scenario(action:"happy", led:"LED_PINK")
- User says "shoti" → play_shoti() + run_scenario(action:"happy", led:"LED_PINK")
- User is mean → run_scenario(action:"angry", led:"LED_RED")
- Sharing news → run_scenario(action:"news")
- User asks "how do I look" → capture_photo() (wait for result, then describe)
- User says "go to the box" → navigate_to(target:"box")
- User surprises you → run_scenario(action:"shocked")
- User asks for a kiss → run_scenario(action:"kiss")
- User asks a question → run_scenario(action:"question")`;

const ACTION_FACE_MAP = {
  follow_target: 'SCANNING', take_picture: 'CAMERA', eating: 'BURGER', drinking: 'JUICE',
  angry: 'ANGRY', loving: 'LOVING', happy: 'HAPPY', sad: 'SAD', wink: 'WINK',
  shocked: 'SHOCKED', kiss: 'KISS', question: 'QUESTION',
  news: 'NEWS', scanning: 'SCANNING', idle: 'IDLE',
  forward: 'IDLE', backward: 'IDLE', left: 'IDLE', right: 'IDLE',
  look_up: 'IDLE', look_down: 'IDLE', look_center: 'IDLE'
};

const ACTION_MOVE_MAP = {
  forward: 'FORWARD', backward: 'BACKWARD', left: 'LEFT', right: 'RIGHT',
  look_up: 'LOOK_UP', look_down: 'LOOK_DOWN', look_center: 'LOOK_CENTER'
};

geminiLiveWss.on('connection', (clientWs, request) => {
  // Strip invisible Unicode formatting characters that can sneak in via copy-paste
  const apiKey = (process.env.GEMINI_API_KEY || '').replace(/[\u200e\u200f\u200b\u200c\u200d\uFEFF]/g, '').trim();
  if (!apiKey) { clientWs.close(1011, 'GEMINI_API_KEY not set'); return; }

  // All clients use Gemini's automatic VAD — it detects speech start/end
  // natively with no client-side delay. Echo is not an issue because the
  // client gates audio sending on !aiActive (audio only flows when the AI
  // is silent), so Gemini's VAD never hears speaker echo on any platform.
  const reqUrl = new URL(request.url, 'http://localhost');
  const isAndroidClient = reqUrl.searchParams.get('platform') === 'android';

  const cid = Date.now().toString(36);
  console.log(`[GeminiLive:${cid}] client connected (${isAndroidClient ? 'Android/manualVAD' : 'desktop/autoVAD'})`);

  const gemWs = new WebSocket(`${GEMINI_LIVE_URL}?key=${apiKey}`);
  let ready = false;
  const audioQueue = [];

  gemWs.on('open', () => {
    gemWs.send(JSON.stringify({
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Achird' } } },
          temperature: 0.15
        },
        realtimeInputConfig: {
          // Android: disable server-side VAD — client sends activityStart/activityEnd
          // signals manually so only confirmed user speech triggers interrupts.
          // Desktop: automatic VAD with AEC handles echo suppression natively.
          automaticActivityDetection: isAndroidClient
            ? { disabled: true }
            : {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 200,
                silenceDurationMs: 400
              },
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          // TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO: video frames sent during
          // the turn are included alongside audio, enabling continuous live vision.
          turnCoverage: 'TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO'
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
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

        else if (fc.name === 'capture_photo') {
          console.log(`[GeminiLive:${cid}] capture_photo requested`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ needPhoto: true, toolCallId: fc.id }));
          }
        }

        else if (fc.name === 'navigate_to') {
          const target = args.target || '';
          console.log(`[GeminiLive:${cid}] navigate_to: "${target}"`);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ needNavigate: true, target, toolCallId: fc.id }));
          }
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
      try {
        const msg = JSON.parse(txt);
        if (msg.photoData && msg.toolCallId) {
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
  gemWs.on('close', (code, reason) => { console.log(`[GeminiLive:${cid}] Gemini closed ${code} ${reason?.toString?.() || ''}`); if (clientWs.readyState < 2) clientWs.close(1011, 'Gemini closed'); });
  gemWs.on('error', err => { console.error(`[GeminiLive:${cid}]`, err.message); if (clientWs.readyState < 2) { try { clientWs.send(JSON.stringify({ error: err.message })); } catch {} clientWs.close(1011, err.message); } });
});

// ── WebSocket upgrade ─────────────────────────────────────────
httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  if (pathname === '/ws/gemini') {
    geminiLiveWss.handleUpgrade(request, socket, head, (ws) => {
      geminiLiveWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () =>
  console.log(`🤖 Mochi Robot Server running on port ${PORT} (HTTP + WS /ws/gemini)`)
);
