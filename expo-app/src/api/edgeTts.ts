/**
 * TTS via HTTP — calls the Render-deployed TTS server.
 * GET /api/tts?text=... → returns audio/mpeg
 * Uses expo-file-system to download to a temp file then read as base64.
 */
import * as FileSystem from 'expo-file-system';

/**
 * Synthesize speech via the TTS HTTP server.
 * @param text          Text to speak
 * @param ttsServerUrl  Base URL of the TTS server, e.g. https://my-tts.onrender.com
 * @returns base64-encoded MP3 string
 */
export async function synthesizeSpeech(text: string, ttsServerUrl: string): Promise<string> {
  const base = ttsServerUrl.replace(/\/$/, '');
  const url = `${base}/api/tts?text=${encodeURIComponent(text)}`;

  const tempPath = `${FileSystem.cacheDirectory ?? 'file:///tmp/'}tts_${Date.now()}.mp3`;

  let downloadResult: FileSystem.FileSystemDownloadResult;
  try {
    downloadResult = await FileSystem.downloadAsync(url, tempPath);
  } catch (err: any) {
    try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
    throw new Error(`TTS network error: ${err.message}`);
  }

  if (downloadResult.status !== 200) {
    try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
    throw new Error(`TTS server returned ${downloadResult.status}`);
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(tempPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
  } finally {
    try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
  }
}
