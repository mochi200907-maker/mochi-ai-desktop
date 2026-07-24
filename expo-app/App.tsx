import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Animated,
  StyleSheet, StatusBar, Platform, PermissionsAndroid, Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { useMochi } from './src/useMochi';
import { MusicBar } from './src/MusicBar';
import { SettingsScreen } from './src/SettingsScreen';
import { LOOI_FACE_HTML } from './src/looiFaceHtml';
import { loadGroqKey, loadBleDeviceName, loadTtsServerUrl } from './src/storage';

// ── Request mic + camera permissions on Android at startup ─────
async function requestPermissions() {
  if (Platform.OS !== 'android') return;
  await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ]);
}

const STATE_LABEL: Record<string, string> = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  SEARCHING_MUSIC: 'SEARCHING…',
  PLAYING_MUSIC: 'PLAYING',
  SEARCHING_VIDEO: 'FINDING VIDEO…',
  PLAYING_VIDEO: 'VIDEO',
};
const STATE_COLOR: Record<string, string> = {
  IDLE: '#00d2ff',
  LISTENING: '#00ff99',
  THINKING: '#00d2ff',
  SPEAKING: '#00d2ff',
  SEARCHING_MUSIC: '#ffbc00',
  PLAYING_MUSIC: '#ffbc00',
  SEARCHING_VIDEO: '#ff4fd8',
  PLAYING_VIDEO: '#ff4fd8',
};

const BAR_SHAPE = [0.55, 0.85, 1.0, 0.85, 1.0, 0.75, 0.55];
const NUM_BARS = BAR_SHAPE.length;

type Screen = 'loading' | 'settings' | 'idle' | 'main';

export default function App() {
  useKeepAwake();

  const webViewRef = useRef<WebView>(null);
  const webViewReady = useRef(false);
  const immersiveRef = useRef(false);

  const [screen, setScreen] = useState<Screen>('loading');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [savedBleName, setSavedBleName] = useState('MOCHI_ESP32_ROBOT');
  const [savedTtsUrl, setSavedTtsUrl] = useState('');

  // Camera photo — shown briefly after capture
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  const barAnims = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(4))
  ).current;

  // Track previous expression to detect CAMERA transition (one-shot trigger)
  const prevExpressionRef = useRef<string>('IDLE');

  const [{
    robotState, expression, musicTitle, isPlayingMusic,
    videoTitle, videoUrl, videoProvider, isPlayingVideo,
    errorMsg, micLevel,
  }, actions] =
    useMochi();

  // ── On launch: load all saved settings ───────────────────────
  useEffect(() => {
    (async () => {
      await requestPermissions();
      const [key, ble, tts] = await Promise.all([
        loadGroqKey(),
        loadBleDeviceName(),
        loadTtsServerUrl(),
      ]);
      if (ble) setSavedBleName(ble);
      if (tts) setSavedTtsUrl(tts);
      if (key) {
        setSavedApiKey(key);
        setScreen('idle');
      } else {
        setScreen('settings');
      }
    })();
  }, []);

  // ── Waveform bars ─────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'main') return;
    BAR_SHAPE.forEach((shape, i) => {
      let targetHeight: number;
      if (robotState === 'LISTENING') {
        targetHeight = 4 + Math.max(0, micLevel) * 30 * shape;
      } else if (robotState === 'THINKING' || robotState === 'SPEAKING') {
        targetHeight = 4 + shape * 16;
      } else if (
        robotState === 'SEARCHING_MUSIC' || robotState === 'PLAYING_MUSIC'
        || robotState === 'SEARCHING_VIDEO' || robotState === 'PLAYING_VIDEO'
      ) {
        targetHeight = 4 + shape * 12;
      } else {
        targetHeight = 4;
      }
      Animated.spring(barAnims[i], {
        toValue: targetHeight,
        useNativeDriver: false,
        speed: 40,
        bounciness: 0,
      }).start();
    });
  }, [robotState, micLevel, screen]);

  // Pass video playback commands into the self-contained WebView player.
  useEffect(() => {
    if (!webViewReady.current) return;
    if (videoUrl && isPlayingVideo) {
      const safeUrl = JSON.stringify(videoUrl);
      const safeTitle = JSON.stringify(videoTitle || 'Playing video');
      const safeProvider = JSON.stringify(videoProvider || 'youtube');
      webViewRef.current?.injectJavaScript(
        `playVideo(${safeUrl}, ${safeTitle}, ${safeProvider}); true;`
      );
    } else {
      // Do not notify React Native again when state already requested a stop.
      webViewRef.current?.injectJavaScript('stopVideo(false); true;');
    }
  }, [videoUrl, videoTitle, isPlayingVideo]);

  // ── Sync expression + state into the WebView ─────────────────
  useEffect(() => {
    if (!webViewReady.current) return;
    webViewRef.current?.injectJavaScript(`
      currentExpression = '${expression}';
      robotState = '${robotState}';
      true;
    `);
    // Trigger camera ONLY on transition INTO CAMERA (one-shot, not on robotState changes)
    if (expression === 'CAMERA' && prevExpressionRef.current !== 'CAMERA') {
      webViewRef.current?.injectJavaScript(`triggerCamera(); true;`);
    }
    prevExpressionRef.current = expression;
  }, [expression, robotState]);

  // ── Auto-dismiss captured photo after 6s ─────────────────────
  useEffect(() => {
    if (!capturedPhoto) return;
    const t = setTimeout(() => setCapturedPhoto(null), 6000);
    return () => clearTimeout(t);
  }, [capturedPhoto]);

  // ── Settings saved ────────────────────────────────────────────
  function handleSettingsSave(key: string, bleName: string, ttsUrl: string) {
    setSavedApiKey(key);
    setSavedBleName(bleName);
    setSavedTtsUrl(ttsUrl);
    setScreen('idle');
  }

  // ── Start robot ───────────────────────────────────────────────
  function handleStart() {
    setScreen('main');
    actions.start(savedApiKey, savedTtsUrl);
  }

  // ── Stop robot ────────────────────────────────────────────────
  function handleStop() {
    actions.stop();
    setScreen('idle');
    webViewReady.current = false;
    setCapturedPhoto(null);
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('visible');
      immersiveRef.current = false;
    }
  }

  // ── LOADING ───────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <View style={styles.overlay}>
        <StatusBar hidden />
        <Text style={styles.overlayTitle}>Mochi</Text>
        <Text style={{ color: '#ffffff44', fontSize: 13 }}>Loading…</Text>
      </View>
    );
  }

  // ── SETTINGS SCREEN ───────────────────────────────────────────
  if (screen === 'settings') {
    return <SettingsScreen onSave={handleSettingsSave} />;
  }

  // ── START OVERLAY ─────────────────────────────────────────────
  if (screen === 'idle') {
    return (
      <View style={styles.overlay}>
        <StatusBar hidden />
        <Text style={styles.overlayTitle}>Mochi AI Robot</Text>

        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => setScreen('settings')}
          activeOpacity={0.7}
        >
          <Text style={styles.gearIcon}>⚙️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>▶  Start Mochi</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnSettings}
          onPress={() => setScreen('settings')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSettingsText}>⚙  Settings</Text>
        </TouchableOpacity>

        <Text style={styles.apiKeyHint} numberOfLines={1}>
          Key: {savedApiKey ? `${savedApiKey.slice(0, 6)}••••••••${savedApiKey.slice(-4)}` : 'none'}
        </Text>
        {savedTtsUrl ? (
          <Text style={[styles.apiKeyHint, { marginTop: -8, fontSize: 11 }]} numberOfLines={1}>
            TTS: {savedTtsUrl.replace('https://', '')}
          </Text>
        ) : (
          <Text style={[styles.apiKeyHint, { marginTop: -8, fontSize: 11, color: '#ff9900aa' }]}>
            TTS: not set (go to Settings)
          </Text>
        )}
        {savedBleName ? (
          <Text style={[styles.apiKeyHint, { marginTop: -8, fontSize: 11 }]}>
            BLE: {savedBleName}
          </Text>
        ) : null}
      </View>
    );
  }

  // ── MAIN ROBOT FACE SCREEN ────────────────────────────────────
  const stateColor = STATE_COLOR[robotState] ?? '#00d2ff';

  return (
    <View style={styles.main}>
      <StatusBar hidden />

      {/* Full-screen Mochi face with camera overlay built-in */}
      <WebView
        ref={webViewRef}
        style={StyleSheet.absoluteFill}
        source={{ html: LOOI_FACE_HTML }}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        onLoad={() => {
          webViewReady.current = true;
          webViewRef.current?.injectJavaScript(`
            currentExpression = '${expression}';
            robotState = '${robotState}';
            true;
          `);
          if (videoUrl && isPlayingVideo) {
            const safeUrl = JSON.stringify(videoUrl);
            const safeTitle = JSON.stringify(videoTitle || 'Playing video');
            const safeProvider = JSON.stringify(videoProvider || 'youtube');
            webViewRef.current?.injectJavaScript(
              `playVideo(${safeUrl}, ${safeTitle}, ${safeProvider}); true;`
            );
          }
        }}
        onMessage={(e) => {
          const data = e.nativeEvent.data;
          if (data === 'DOUBLE_TAP' && Platform.OS === 'android') {
            immersiveRef.current = !immersiveRef.current;
            if (immersiveRef.current) {
              NavigationBar.setVisibilityAsync('hidden');
              NavigationBar.setBehaviorAsync('overlay-swipe');
            } else {
              NavigationBar.setVisibilityAsync('visible');
            }
          } else if (data.startsWith('CAMERA_PHOTO:')) {
            // Photo captured — show it and reset expression so camera can't retrigger
            setCapturedPhoto(data.slice('CAMERA_PHOTO:'.length));
            actions.resetExpression();
          } else if (data === 'CAMERA_CANCEL') {
            // Camera dismissed without photo — reset expression
            actions.resetExpression();
          } else if (data === 'VIDEO_STOP') {
            actions.stopVideo();
          }
        }}
      />

      {/* Top-right HUD */}
      <View style={styles.hud} pointerEvents="none">
        <View style={styles.hudInner}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[styles.bar, { height: anim, backgroundColor: stateColor }]}
            />
          ))}
          <Text style={[styles.stateText, { color: stateColor }]}>
            {STATE_LABEL[robotState] ?? robotState}
          </Text>
        </View>
      </View>

      {/* Stop button */}
      <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
        <Text style={styles.stopBtnText}>✕</Text>
      </TouchableOpacity>

      {/* Error toast */}
      {!!errorMsg && (
        <View style={styles.errorToast}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Captured photo preview */}
      {!!capturedPhoto && (
        <TouchableOpacity
          style={styles.photoOverlay}
          onPress={() => setCapturedPhoto(null)}
          activeOpacity={1}
        >
          <Image
            source={{ uri: capturedPhoto }}
            style={styles.photoImage}
            resizeMode="contain"
          />
          <Text style={styles.photoDismiss}>Tap to dismiss</Text>
        </TouchableOpacity>
      )}

      {/* Music bar */}
      <MusicBar
        title={musicTitle}
        isPlaying={isPlayingMusic}
        onStop={actions.stopMusic}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center',
    gap: 16, paddingHorizontal: 40,
  },
  overlayTitle: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  gearBtn: { position: 'absolute', top: 48, right: 24, padding: 8 },
  gearIcon: { fontSize: 24 },
  btnPrimary: {
    backgroundColor: '#00d2ff', borderRadius: 30,
    paddingVertical: 16, paddingHorizontal: 40,
    width: '100%', alignItems: 'center',
  },
  btnPrimaryText: { color: '#000', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  btnSettings: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 30,
    paddingVertical: 12, paddingHorizontal: 30,
    width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  btnSettingsText: { color: '#ffffff99', fontSize: 15, fontWeight: '600' },
  apiKeyHint: {
    color: '#ffffff33', fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  main: { flex: 1, backgroundColor: '#000' },
  hud: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  hudInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 3, borderRadius: 2, backgroundColor: '#00d2ff' },
  stateText: { fontSize: 10, fontWeight: '800', letterSpacing: 2, opacity: 0.75, marginLeft: 5 },
  stopBtn: {
    position: 'absolute', top: 16, left: 16,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  stopBtnText: { color: '#ffffff66', fontSize: 13, fontWeight: '600' },
  errorToast: {
    position: 'absolute', bottom: 120, left: 20, right: 20,
    backgroundColor: '#ff4444cc', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center',
  },
  errorText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  photoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 50,
  },
  photoImage: { width: '90%', height: '70%', borderRadius: 16 },
  photoDismiss: { color: '#ffffff66', fontSize: 13, marginTop: 12 },
});
