/**
 * Direct Groq API calls — STT (Whisper) + LLM (chat completions)
 * No server needed; the API key is stored locally on device.
 */

const GROQ_BASE = 'https://api.groq.com';

// ── System prompt (same as server.js) ────────────────────────────────────────
export const SYSTEM_PROMPT = `
You are Mochi, a living, expressive, and curious desktop AI robot companion.
CRITICAL INSTRUCTIONS:
1. ONLY RESPOND IN ENGLISH.
2. Maintain a cute, witty, and warm robotic personality.
3. You MUST ALWAYS start EVERY response with a face+move command in this EXACT format (no exceptions):
   [[FACE:<expression>,MOVE:<action>]]
   - Expression options: IDLE, HAPPY, ANGRY, SAD, WINK, BURGER, JUICE, MUSIC, NEWS, CAMERA
   - Move options: NONE, FORWARD, BACKWARD, LEFT, RIGHT, LOOK_UP, LOOK_DOWN, LOOK_CENTER
   - HAPPY → when excited, pleased, or greeted
   - ANGRY → when annoyed, challenged, or scolded
   - SAD → when something is unfortunate or you feel sorry
   - WINK → when joking or flirting
   - MUSIC → when user asks to play music, a song, or listen to audio only
   - NEWS → when sharing facts or news
   - CAMERA → ONLY when the user explicitly asks to take a photo, picture, or selfie
   - IDLE → neutral conversation
4. MEDIA RULE:
   - For listening to music, playing a song, or audio-only requests, add:
   MUSIC_QUERY: <search terms for the song>
   - For watching a video, music video, videoclip, or "show me" requests, add:
   VIDEO_QUERY: <search terms for the video>
   - For TikTok, short-video, "shot/i", "girl video", or TikTok creator/topic requests, add:
   TIKTOK_QUERY: <TikTok search terms>
   - Use TIKTOK_QUERY for "give me a shoti" and "search Joshua Garcia TikTok video".
   - Never add both query lines. Respect whether the user asked for audio or video.
   Example audio response:
   [[FACE:MUSIC,MOVE:NONE]] On it! Playing Despacito for you!
   MUSIC_QUERY: Despacito Luis Fonsi
   Example video response:
   [[FACE:MUSIC,MOVE:NONE]] Sure! Let's watch the music video.
   VIDEO_QUERY: Despacito Luis Fonsi official music video
   Example TikTok response:
   [[FACE:MUSIC,MOVE:NONE]] Sure! Here's a TikTok video.
   TIKTOK_QUERY: Joshua Garcia TikTok
5. Never include [[...]] anywhere else in your response — only at the very start.
`.trim();

function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/<\/think>/gi, '')
    .trim();
}

// ── Speech-to-Text ────────────────────────────────────────────────────────────
/**
 * Transcribe audio file via Groq Whisper.
 * @param audioUri  Local file URI (from expo-av)
 * @param apiKey    Groq API key
 * @returns Transcribed text
 */
export async function transcribeAudio(audioUri: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', {
    uri: audioUri,
    name: 'audio.m4a',
    type: 'audio/m4a',
  } as any);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const res = await fetch(`${GROQ_BASE}/openai/v1/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Do NOT set Content-Type — let fetch set multipart/form-data with boundary
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.text ?? '').trim();
}

// ── Chat / LLM ────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send a user message to Groq LLM.
 * @param userText  User's transcribed speech
 * @param apiKey    Groq API key
 * @returns Raw LLM response (may contain [[FACE:...]] tags and MUSIC_QUERY)
 */
export async function chatWithMochi(userText: string, apiKey: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ];

  // Try primary model, fall back to secondary
  for (const model of ['qwen/qwen3-32b', 'llama-3.3-70b-versatile']) {
    try {
      const res = await fetch(`${GROQ_BASE}/openai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          ...(model.includes('qwen') ? { reasoning_effort: 'none' } : {}),
          temperature: model.includes('qwen') ? 0.6 : 0.7,
          max_completion_tokens: 1024,
          top_p: 0.95,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 401) throw new Error(`AUTH:${err}`); // don't retry auth errors
        throw new Error(`LLM ${res.status}: ${err}`);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      return stripThinking(raw);
    } catch (err: any) {
      if (err.message?.startsWith('AUTH:')) throw err; // propagate auth errors
      if (model === 'llama-3.3-70b-versatile') throw err; // last model failed
      // else try next model
    }
  }

  throw new Error('LLM failed');
}

// ── Response parsing ──────────────────────────────────────────────────────────
export interface ParsedResponse {
  expression: string;
  move: string;
  spokenText: string;
  musicQuery: string | null;
  videoQuery: string | null;
  tiktokQuery: string | null;
}

export function parseResponse(raw: string, requestText = ''): ParsedResponse {
  // Extract [[FACE:X,MOVE:Y]]
  const tagMatch = raw.match(/\[\[FACE:([A-Z]+),MOVE:([A-Z_]+)\]\]/);
  const expression = tagMatch?.[1] ?? 'HAPPY';
  const move = tagMatch?.[2] ?? 'NONE';

  // Remove the tag
  let text = raw.replace(/\[\[.*?\]\]/g, '').trim();

  // Extract MUSIC_QUERY
  let musicQuery: string | null = null;
  const musicMatch = text.match(/\nMUSIC_QUERY:\s*(.+)/i) ?? text.match(/MUSIC_QUERY:\s*(.+)/i);
  if (musicMatch) {
    musicQuery = musicMatch[1].trim();
    text = text.replace(/\n?MUSIC_QUERY:.+/i, '').trim();
  }

  let videoQuery: string | null = null;
  const videoMatch = text.match(/\nVIDEO_QUERY:\s*(.+)/i) ?? text.match(/VIDEO_QUERY:\s*(.+)/i);
  if (videoMatch) {
    videoQuery = videoMatch[1].trim();
    text = text.replace(/\n?VIDEO_QUERY:.+/i, '').trim();
  }

  let tiktokQuery: string | null = null;
  const tiktokMatch = text.match(/\nTIKTOK_QUERY:\s*(.+)/i) ?? text.match(/TIKTOK_QUERY:\s*(.+)/i);
  if (tiktokMatch) {
    tiktokQuery = tiktokMatch[1].trim();
    text = text.replace(/\n?TIKTOK_QUERY:.+/i, '').trim();
  }

  const asksForTikTok = /\b(tiktok|tik tok|shot[io]?|short video|girl video|reels?)\b/i
    .test(requestText);
  if (asksForTikTok && !tiktokQuery) {
    tiktokQuery = videoQuery || musicQuery || requestText;
    videoQuery = null;
    musicQuery = null;
  }

  // Treat explicit video language as authoritative if the model accidentally
  // emits MUSIC_QUERY for a request that clearly asks to watch something.
  const asksForVideo = /\b(video|music video|videoclip|video clip|watch|panoorin|manood)\b/i
    .test(requestText);
  if (asksForVideo && musicQuery && !videoQuery) {
    videoQuery = musicQuery;
    musicQuery = null;
  }
  if (tiktokQuery) {
    videoQuery = null;
    musicQuery = null;
  } else if (videoQuery) {
    musicQuery = null;
  }

  return { expression, move, spokenText: text, musicQuery, videoQuery, tiktokQuery };
}
