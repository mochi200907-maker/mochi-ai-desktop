/**
 * Music search via Mostakim API (YouTube audio stream URLs)
 * These are direct stream URLs — expo-av plays them progressively,
 * no full download needed. Works for 30+ minute songs.
 */

const BASE = 'https://mostakim.onrender.com';

export interface MusicResult {
  url: string;
  title: string;
}

export interface VideoResult {
  url: string;
  title: string;
  thumbnail?: string;
  provider?: 'youtube' | 'tiktok';
}

/** Fire-and-forget ping to wake the Render server before music is needed. */
export function warmUpMostakim() {
  fetch(`${BASE}/mostakim/ytSearch?search=test`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(40000),
  }).catch(() => {});
}

async function searchYouTube(query: string): Promise<VideoResult | null> {
  try {
    const res = await fetch(
      `${BASE}/mostakim/ytSearch?search=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(35000),
      }
    );
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;
    const first = results[0];
    return {
      url: first.url,
      title: first.title || query,
      thumbnail: first.thumbnail || '',
    };
  } catch {
    return null;
  }
}

async function getAudioUrl(youtubeUrl: string): Promise<MusicResult | null> {
  try {
    const res = await fetch(
      `${BASE}/m/ytDl?url=${encodeURIComponent(youtubeUrl)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(40000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.status || !data.url) return null;
    return { url: data.url, title: data.title || 'Unknown' };
  } catch {
    return null;
  }
}

/**
 * Search for a song and return a streamable audio URL.
 * Retries once on failure to handle Render cold-start timeouts.
 */
export async function fetchMusic(query: string): Promise<MusicResult | null> {
  // First attempt
  const ytResult = await searchYouTube(query);
  if (ytResult?.url) {
    const result = await getAudioUrl(ytResult.url);
    if (result) return result;
  }

  // Retry once — Render may have just woken up
  const ytResult2 = await searchYouTube(query);
  if (!ytResult2?.url) return null;
  return getAudioUrl(ytResult2.url);
}

/** Search for a video and return its YouTube watch URL for video playback. */
export async function fetchVideo(query: string): Promise<VideoResult | null> {
  const result = await searchYouTube(query);
  if (result?.url) return result;
  return searchYouTube(query);
}

const TIKWM_BASE = 'https://www.tikwm.com';

function absoluteTikwmUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return /^https?:\/\//i.test(value)
    ? value
    : `${TIKWM_BASE}/${value.replace(/^\/+/, '')}`;
}

/** Search TikWM and return a direct MP4 URL for the WebView player. */
export async function fetchTikTok(query: string): Promise<VideoResult | null> {
  try {
    const trimmed = query.trim();
    const isLink = /^https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\//i.test(trimmed);
    const response = await fetch(
      isLink
        ? `${TIKWM_BASE}/api/?url=${encodeURIComponent(trimmed)}`
        : `${TIKWM_BASE}/api/feed/search?keywords=${encodeURIComponent(trimmed)}&count=10&cursor=0&web=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const body = await response.json();
    const data = isLink
      ? body?.data
      : body?.data?.videos?.find((video: any) => video?.play || video?.wmplay);
    if (body?.code !== 0 || !data) return null;
    const url = absoluteTikwmUrl(data.hdplay || data.play || data.wmplay);
    if (!url) return null;
    return {
      url,
      title: data.title || trimmed || 'TikTok video',
      thumbnail: absoluteTikwmUrl(data.cover),
      provider: 'tiktok',
    };
  } catch {
    return null;
  }
}
