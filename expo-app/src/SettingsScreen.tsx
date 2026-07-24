import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { loadGroqKey, loadBleDeviceName, loadTtsServerUrl, saveAllSettings } from './storage';

interface Props {
  onSave: (apiKey: string, bleDeviceName: string, ttsServerUrl: string) => void;
}

function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    fetch(url, options)
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

export function SettingsScreen({ onSave }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [bleDeviceName, setBleDeviceName] = useState('MOCHI_ESP32_ROBOT');
  const [ttsServerUrl, setTtsServerUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingTts, setTestingTts] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const [ttsTested, setTtsTested] = useState<'ok' | 'fail' | null>(null);
  const [ttsMsgText, setTtsMsgText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [key, ble, tts] = await Promise.all([
        loadGroqKey(),
        loadBleDeviceName(),
        loadTtsServerUrl(),
      ]);
      if (key) setApiKey(key);
      if (ble) setBleDeviceName(ble);
      if (tts) setTtsServerUrl(tts);
    })();
  }, []);

  async function handleTest() {
    if (!apiKey.trim()) { setTestResult('fail'); setTestMsg('Enter an API key first'); return; }
    setTesting(true);
    setTestResult(null);
    setTestMsg('');
    try {
      const res = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/models',
        { headers: { Authorization: `Bearer ${apiKey.trim()}` } },
        10000,
      );
      if (res.ok) {
        setTestResult('ok');
        setTestMsg('API key is valid ✓');
      } else {
        setTestResult('fail');
        setTestMsg(res.status === 401 ? 'Invalid or expired key' : `Error ${res.status}`);
      }
    } catch (e: any) {
      setTestResult('fail');
      setTestMsg(e?.message?.includes('timed out') ? 'Request timed out' : 'Network error');
    } finally {
      setTesting(false);
    }
  }

  async function handleTestTts() {
    const url = ttsServerUrl.trim();
    if (!url) { setTtsTested('fail'); setTtsMsgText('Enter TTS server URL first'); return; }
    setTestingTts(true);
    setTtsTested(null);
    setTtsMsgText('');
    try {
      const res = await fetchWithTimeout(
        `${url.replace(/\/$/, '')}/api/tts?text=hello`,
        {},
        15000,
      );
      if (res.ok && res.headers.get('content-type')?.includes('audio')) {
        setTtsTested('ok');
        setTtsMsgText('TTS server reachable ✓');
      } else {
        setTtsTested('fail');
        setTtsMsgText(`Server error: ${res.status}`);
      }
    } catch (e: any) {
      setTtsTested('fail');
      setTtsMsgText(e?.message?.includes('timed out') ? 'Timed out (server cold-starting?)' : 'Cannot reach TTS server');
    } finally {
      setTestingTts(false);
    }
  }

  async function handleSave() {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;
    setSaving(true);
    try {
      await saveAllSettings({
        groqApiKey: trimmedKey,
        bleDeviceName: bleDeviceName.trim() || 'MOCHI_ESP32_ROBOT',
        ttsServerUrl: ttsServerUrl.trim(),
      });
      onSave(trimmedKey, bleDeviceName.trim() || 'MOCHI_ESP32_ROBOT', ttsServerUrl.trim());
    } catch (e: any) {
      Alert.alert('Save failed', `Could not save settings: ${e?.message ?? 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  const canSave = apiKey.trim().length > 10 && !saving;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar hidden />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>⚙️</Text>
          <Text style={styles.title}>Mochi Settings</Text>
          <Text style={styles.subtitle}>
            Settings are saved permanently on this device.
          </Text>
        </View>

        {/* Groq API Key */}
        <View style={styles.section}>
          <Text style={styles.label}>GROQ API KEY</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#ffffff33"
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowKey(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.eyeIcon}>{showKey ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Get a free key at <Text style={styles.link}>console.groq.com</Text></Text>
        </View>

        {testResult !== null && (
          <View style={[styles.testResult, { backgroundColor: testResult === 'ok' ? '#00ff9922' : '#ff444422' }]}>
            <Text style={[styles.testResultText, { color: testResult === 'ok' ? '#00ff99' : '#ff7777' }]}>
              {testMsg}
            </Text>
          </View>
        )}

        {/* TTS Server URL */}
        <View style={styles.section}>
          <Text style={styles.label}>TTS SERVER URL</Text>
          <TextInput
            style={[styles.input, styles.inputFull]}
            value={ttsServerUrl}
            onChangeText={setTtsServerUrl}
            placeholder="https://your-tts-server.onrender.com"
            placeholderTextColor="#ffffff33"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            Deploy the TTS server on Render and paste its URL here.{'\n'}
            Example: https://mochi-tts.onrender.com
          </Text>
        </View>

        {ttsTested !== null && (
          <View style={[styles.testResult, { backgroundColor: ttsTested === 'ok' ? '#00ff9922' : '#ff444422' }]}>
            <Text style={[styles.testResultText, { color: ttsTested === 'ok' ? '#00ff99' : '#ff7777' }]}>
              {ttsMsgText}
            </Text>
          </View>
        )}

        {/* BLE Device Name */}
        <View style={styles.section}>
          <Text style={styles.label}>ESP32 BLE DEVICE NAME</Text>
          <TextInput
            style={[styles.input, styles.inputFull]}
            value={bleDeviceName}
            onChangeText={setBleDeviceName}
            placeholder="MOCHI_ESP32_ROBOT"
            placeholderTextColor="#ffffff33"
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
          />
          <Text style={styles.hint}>
            Must match the BLE name set in your ESP32 firmware.{'\n'}
            Default: MOCHI_ESP32_ROBOT
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTest}
            disabled={testing || !apiKey.trim()}
            activeOpacity={0.75}
          >
            {testing
              ? <ActivityIndicator color="#00d2ff" size="small" />
              : <Text style={styles.testBtnText}>Test Groq API Key</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTestTts}
            disabled={testingTts || !ttsServerUrl.trim()}
            activeOpacity={0.75}
          >
            {testingTts
              ? <ActivityIndicator color="#00d2ff" size="small" />
              : <Text style={styles.testBtnText}>Test TTS Server</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#000" size="small" />
              : <Text style={styles.saveBtnText}>Save &amp; Continue</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Info box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🔐  Settings saved permanently on device.{'\n'}
            🎙  Voice processed via Groq (Whisper + Qwen3).{'\n'}
            🔊  Speech via TTS server (Render deploy).{'\n'}
            🎵  Music streamed directly from YouTube audio.{'\n'}
            📡  BLE connects to your physical ESP32 robot.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050d1f' },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 40, gap: 20 },
  header: { alignItems: 'center', marginBottom: 8, gap: 8 },
  emoji: { fontSize: 40 },
  title: { color: '#ffffff', fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { color: '#ffffff88', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  section: { gap: 8 },
  label: { color: '#00d2ff', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff11', borderRadius: 14,
    borderWidth: 1, borderColor: '#ffffff22', overflow: 'hidden',
  },
  input: {
    flex: 1, color: '#fff', fontSize: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputFull: {
    backgroundColor: '#ffffff11', borderRadius: 14,
    borderWidth: 1, borderColor: '#ffffff22',
    paddingHorizontal: 16, paddingVertical: 14,
    color: '#fff', fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  eyeIcon: { fontSize: 18 },
  hint: { color: '#ffffff55', fontSize: 12, lineHeight: 18 },
  link: { color: '#00d2ff', textDecorationLine: 'underline' },
  testResult: { borderRadius: 12, padding: 12, alignItems: 'center' },
  testResultText: { fontSize: 14, fontWeight: '600' },
  btnGroup: { gap: 12 },
  testBtn: {
    backgroundColor: 'transparent', borderRadius: 30,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#00d2ff55',
    minHeight: 48, justifyContent: 'center',
  },
  testBtnText: { color: '#00d2ff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  saveBtn: { backgroundColor: '#00d2ff', borderRadius: 30, paddingVertical: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.4 },
  infoBox: {
    backgroundColor: '#ffffff08', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#ffffff11', marginTop: 4,
  },
  infoText: { color: '#ffffff66', fontSize: 13, lineHeight: 22 },
});
