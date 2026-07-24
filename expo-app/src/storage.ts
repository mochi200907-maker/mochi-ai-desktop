/**
 * Persistent settings storage using expo-file-system.
 * Stored in the app's document directory (survives app restarts on device).
 */
import * as FileSystem from 'expo-file-system';

// Fallback in case documentDirectory is null (shouldn't happen on device builds)
const DOC_DIR = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? 'file:///tmp/';
const SETTINGS_FILE = `${DOC_DIR}mochi_settings.json`;

interface Settings {
  groqApiKey: string;
  bleDeviceName: string;
  ttsServerUrl: string;
}

const DEFAULTS: Settings = {
  groqApiKey: '',
  bleDeviceName: 'MOCHI_ESP32_ROBOT',
  ttsServerUrl: '',
};

// In-memory cache — avoids redundant disk reads within the same session
let _cache: Settings | null = null;

async function readSettings(): Promise<Settings> {
  if (_cache) return _cache;
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE);
    if (!info.exists) return { ...DEFAULTS };
    const raw = await FileSystem.readAsStringAsync(SETTINGS_FILE, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as Partial<Settings>;
    _cache = {
      groqApiKey: parsed.groqApiKey ?? '',
      bleDeviceName: parsed.bleDeviceName ?? 'MOCHI_ESP32_ROBOT',
      ttsServerUrl: parsed.ttsServerUrl ?? '',
    };
    return _cache;
  } catch (e) {
    console.warn('[Storage] readSettings failed, using defaults:', e);
    return { ...DEFAULTS };
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  _cache = { ...settings };
  try {
    await FileSystem.writeAsStringAsync(
      SETTINGS_FILE,
      JSON.stringify(settings),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  } catch (e) {
    console.error('[Storage] writeSettings failed:', e);
    throw e; // propagate so the caller knows saving failed
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveGroqKey(key: string): Promise<void> {
  const settings = await readSettings();
  await writeSettings({ ...settings, groqApiKey: key.trim() });
}

export async function loadGroqKey(): Promise<string> {
  const settings = await readSettings();
  return settings.groqApiKey;
}

export async function clearGroqKey(): Promise<void> {
  const settings = await readSettings();
  await writeSettings({ ...settings, groqApiKey: '' });
}

export async function saveBleDeviceName(name: string): Promise<void> {
  const settings = await readSettings();
  await writeSettings({ ...settings, bleDeviceName: name.trim() });
}

export async function loadBleDeviceName(): Promise<string> {
  const settings = await readSettings();
  return settings.bleDeviceName;
}

export async function saveTtsServerUrl(url: string): Promise<void> {
  const settings = await readSettings();
  await writeSettings({ ...settings, ttsServerUrl: url.trim() });
}

export async function loadTtsServerUrl(): Promise<string> {
  const settings = await readSettings();
  return settings.ttsServerUrl;
}

/** Save all settings at once — avoids multiple sequential file writes. */
export async function saveAllSettings(opts: {
  groqApiKey: string;
  bleDeviceName: string;
  ttsServerUrl: string;
}): Promise<void> {
  await writeSettings({
    groqApiKey: opts.groqApiKey.trim(),
    bleDeviceName: opts.bleDeviceName.trim() || 'MOCHI_ESP32_ROBOT',
    ttsServerUrl: opts.ttsServerUrl.trim(),
  });
}
