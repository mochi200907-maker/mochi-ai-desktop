/**
 * useMochi — fully serverless hook
 * STT + LLM via Groq API directly, TTS via HTTP TTS server,
 * Music via Mostakim API → streamed URL → expo-av (no full download).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { VAD_THRESHOLD_DB, SILENCE_DURATION_MS } from './config';
import { transcribeAudio, chatWithMochi, parseResponse } from './api/groq';
import { synthesizeSpeech } from './api/edgeTts';
import { fetchMusic, fetchVideo, fetchTikTok, warmUpMostakim } from './api/music';

export type RobotState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'SEARCHING_MUSIC'
  | 'PLAYING_MUSIC'
  | 'SEARCHING_VIDEO'
  | 'PLAYING_VIDEO';

export type Expression =
  | 'IDLE' | 'HAPPY' | 'ANGRY' | 'SAD' | 'WINK'
  | 'MUSIC' | 'NEWS' | 'BURGER' | 'JUICE' | 'CAMERA';

interface MochiState {
  robotState: RobotState;
  expression: Expression;
  musicTitle: string;
  isPlayingMusic: boolean;
  videoTitle: string;
  videoUrl: string;
  videoProvider: 'youtube' | 'tiktok';
  isPlayingVideo: boolean;
  errorMsg: string;
  isReady: boolean;
}

interface MochiActions {
  start: (apiKey: string, ttsServerUrl: string) => void;
  stop: () => void;
  stopMusic: () => void;
  stopVideo: () => void;
  /** Reset expression to IDLE — called after camera capture/cancel. */
  resetExpression: () => void;
}


export function useMochi(): [MochiState & { micLevel: number }, MochiActions] {
  const [robotState, setRobotState] = useState<RobotState>('IDLE');
  const [expression, setExpression] = useState<Expression>('IDLE');
  const [musicTitle, setMusicTitle] = useState('');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoProvider, setVideoProvider] = useState<'youtube' | 'tiktok'>('youtube');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const apiKeyRef = useRef('');
  const ttsServerUrlRef = useRef('');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);
  const musicSoundRef = useRef<Audio.Sound | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  const robotStateRef = useRef<RobotState>('IDLE');
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  // pendingMusicRef: true from the moment we know music is coming until it starts/fails.
  // Prevents the TTS "didJustFinish" callback from reverting state to IDLE prematurely.
  const pendingMusicRef = useRef(false);
  // isPlayingMusicRef mirrors the isPlayingMusic state for use inside callbacks.
  const isPlayingMusicRef = useRef(false);
  const pendingVideoRef = useRef(false);
  const isPlayingVideoRef = useRef(false);

  useEffect(() => { robotStateRef.current = robotState; }, [robotState]);
  useEffect(() => { isPlayingMusicRef.current = isPlayingMusic; }, [isPlayingMusic]);
  useEffect(() => { isPlayingVideoRef.current = isPlayingVideo; }, [isPlayingVideo]);

  // ── Error helper ──────────────────────────────────────────────
  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  }

  // ── Stop TTS ──────────────────────────────────────────────────
  async function stopTTS() {
    try {
      if (ttsSoundRef.current) {
        await ttsSoundRef.current.stopAsync();
        await ttsSoundRef.current.unloadAsync();
        ttsSoundRef.current = null;
      }
    } catch {}
  }

  // ── Stop music ────────────────────────────────────────────────
  async function stopMusicInternal() {
    try {
      if (musicSoundRef.current) {
        await musicSoundRef.current.stopAsync();
        await musicSoundRef.current.unloadAsync();
        musicSoundRef.current = null;
      }
    } catch {}
    isPlayingMusicRef.current = false;
    setIsPlayingMusic(false);
  }

  // Video playback is rendered by the WebView using a YouTube embed.
  function startVideo(title: string, url: string, provider: 'youtube' | 'tiktok' = 'youtube') {
    pendingMusicRef.current = false;
    pendingVideoRef.current = false;
    setVideoTitle(title);
    setVideoUrl(url);
    setVideoProvider(provider);
    isPlayingVideoRef.current = true;
    setIsPlayingVideo(true);
    setRobotState('PLAYING_VIDEO');
    setExpression('MUSIC');
  }

  // ── Play TTS from base64 MP3 ───────────────────────────────────
  async function playTTS(base64: string) {
    try {
      await stopTTS();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const uri = `${FileSystem.cacheDirectory}mochi_tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      ttsSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          await sound.unloadAsync();
          ttsSoundRef.current = null;
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}

          // Only go back to IDLE if music is not playing AND not about to start
          const st = robotStateRef.current;
          const mediaBusy = pendingMusicRef.current || pendingVideoRef.current
            || isPlayingMusicRef.current || isPlayingVideoRef.current;
          if (!mediaBusy && st === 'SPEAKING' && activeRef.current) {
            setRobotState('IDLE');
            busyRef.current = false;
            startVAD();
          }
        }
      });
    } catch (err: any) {
      console.error('[TTS] playback error:', err.message);
      if (!pendingMusicRef.current && !isPlayingMusicRef.current) {
        busyRef.current = false;
        if (activeRef.current) startVAD();
      }
    }
  }

  // ── Play music — streamed URL, no full download ───────────────
  async function playMusic(url: string, title: string) {
    pendingMusicRef.current = false; // music is now actually starting
    try {
      await stopMusicInternal();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      setMusicTitle(title);

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        {
          shouldPlay: true,
          isLooping: false,
          progressUpdateIntervalMillis: 5000,
        }
      );
      musicSoundRef.current = sound;
      isPlayingMusicRef.current = true;
      setIsPlayingMusic(true);
      setRobotState('PLAYING_MUSIC');
      setExpression('MUSIC');

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          await sound.unloadAsync();
          musicSoundRef.current = null;
          isPlayingMusicRef.current = false;
          setIsPlayingMusic(false);
          setMusicTitle('');
          setRobotState('IDLE');
          setExpression('IDLE');
          busyRef.current = false;
          if (activeRef.current) startVAD();
        }
      });
    } catch (err: any) {
      console.error('[Music] playback error:', err.message);
      pendingMusicRef.current = false;
      isPlayingMusicRef.current = false;
      setIsPlayingMusic(false);
      busyRef.current = false;
      if (activeRef.current) startVAD();
    }
  }

  // ── Stop recording + clear VAD ────────────────────────────────
  async function stopRecording(): Promise<string | null> {
    clearInterval(vadIntervalRef.current!);
    clearTimeout(silenceTimerRef.current!);
    vadIntervalRef.current = null;
    silenceTimerRef.current = null;
    isSpeakingRef.current = false;

    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return null;
    try {
      await rec.stopAndUnloadAsync();
      return rec.getURI() ?? null;
    } catch { return null; }
  }

  // ── Process audio: STT → LLM → TTS (+music) ──────────────────
  async function processAudio(uri: string) {
    try {
      setRobotState('THINKING');

      // ① STT
      const userText = await transcribeAudio(uri, apiKeyRef.current);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      console.log('[STT]', userText);
      if (!userText) {
        busyRef.current = false;
        setRobotState('IDLE');
        startVAD();
        return;
      }

      // ② LLM
      const raw = await chatWithMochi(userText, apiKeyRef.current);
      const {
        expression: expr, spokenText, musicQuery, videoQuery, tiktokQuery,
      } = parseResponse(raw, userText);
      setExpression(expr as Expression);

      // Mark music as pending BEFORE TTS so the TTS callback doesn't revert to IDLE.
      // Also fire a warm-up ping immediately so Mostakim has maximum time to wake up
      // while TTS is being fetched and played (Render free tier cold start = 30-50s).
      if (musicQuery || videoQuery || tiktokQuery) {
        pendingMusicRef.current = true;
        pendingVideoRef.current = Boolean(videoQuery || tiktokQuery);
        warmUpMostakim();
      }

      // ③ TTS
      if (spokenText) {
        setRobotState('SPEAKING');
        const ttsUrl = ttsServerUrlRef.current;
        if (!ttsUrl) {
          showError('TTS server URL not set — go to Settings');
          // Still continue to music if requested
        } else {
          try {
            const base64 = await synthesizeSpeech(spokenText, ttsUrl);
            await playTTS(base64);
            if (musicQuery || videoQuery || tiktokQuery) await new Promise(r => setTimeout(r, 800)); // let speech start
          } catch (ttsErr: any) {
            console.error('[TTS]', ttsErr.message);
            showError('TTS failed: ' + ttsErr.message);
            // Don't abort — still play music if requested
          }
        }
      }

      // ④ Music search (streamed URL, no download)
      if (musicQuery) {
        setRobotState('SEARCHING_MUSIC');
        const result = await fetchMusic(musicQuery);
        if (result) {
          await playMusic(result.url, result.title);
        } else {
          pendingMusicRef.current = false;
          showError('Music not found');
          setRobotState('IDLE');
          busyRef.current = false;
          if (activeRef.current) startVAD();
        }
      } else if (videoQuery) {
        setRobotState('SEARCHING_VIDEO');
        const result = await fetchVideo(videoQuery);
        if (result?.url) {
          startVideo(result.title, result.url, result.provider || 'youtube');
        } else {
          pendingVideoRef.current = false;
          showError('Video not found');
          setRobotState('IDLE');
          busyRef.current = false;
          if (activeRef.current) startVAD();
        }
      } else if (tiktokQuery) {
        setRobotState('SEARCHING_VIDEO');
        const result = await fetchTikTok(tiktokQuery);
        if (result?.url) {
          startVideo(result.title, result.url, 'tiktok');
        } else {
          pendingVideoRef.current = false;
          showError('TikTok video not found');
          setRobotState('IDLE');
          busyRef.current = false;
          if (activeRef.current) startVAD();
        }
      } else if (!spokenText) {
        busyRef.current = false;
        setRobotState('IDLE');
        if (activeRef.current) startVAD();
      }
      // If TTS was played without music, playTTS callback restarts VAD

    } catch (err: any) {
      console.error('[Process] error:', err.message);
      pendingMusicRef.current = false;
      pendingVideoRef.current = false;
      if (err.message?.includes('AUTH:') || err.message?.includes('401')) {
        showError('API key invalid or expired — update it in Settings');
      } else {
        showError(err.message ?? 'Something went wrong');
      }
      busyRef.current = false;
      setRobotState('IDLE');
      if (activeRef.current) startVAD();
    }
  }

  // ── VAD loop ──────────────────────────────────────────────────
  async function startVAD() {
    if (busyRef.current || !activeRef.current) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await rec.startAsync();
      recordingRef.current = rec;
      isSpeakingRef.current = false;

      vadIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current) return;
        const st = robotStateRef.current;
        if (busyRef.current || (st !== 'IDLE' && st !== 'LISTENING')) {
          await stopRecording();
          return;
        }

        let status: Audio.RecordingStatus;
        try { status = await recordingRef.current.getStatusAsync(); } catch { return; }
        if (!status.isRecording) return;

        const level = status.metering ?? -160;
        const normalized = Math.min(1, Math.max(0, (level - (-80)) / (VAD_THRESHOLD_DB - (-80))));
        setMicLevel(normalized);

        if (level > VAD_THRESHOLD_DB) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setRobotState('LISTENING');
          }
          clearTimeout(silenceTimerRef.current!);
          silenceTimerRef.current = null;
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(async () => {
            const uri = await stopRecording();
            if (uri) {
              busyRef.current = true;
              await processAudio(uri);
            } else {
              if (activeRef.current) startVAD();
            }
          }, SILENCE_DURATION_MS);
        }
      }, 80);
    } catch (err: any) {
      console.error('[VAD] error:', err.message);
    }
  }

  // ── Start ─────────────────────────────────────────────────────
  const start = useCallback(async (apiKey: string, ttsServerUrl: string) => {
    apiKeyRef.current = apiKey;
    ttsServerUrlRef.current = ttsServerUrl;
    activeRef.current = true;
    busyRef.current = false;
    pendingMusicRef.current = false;

    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    setRobotState('IDLE');
    setExpression('IDLE');
    setIsReady(true);

    // Fire-and-forget warm-up ping so Mostakim is ready when user asks for music
    warmUpMostakim();

    startVAD();
  }, []);

  // ── Stop ──────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    activeRef.current = false;
    pendingMusicRef.current = false;
    pendingVideoRef.current = false;
    await stopRecording();
    await stopTTS();
    await stopMusicInternal();
    pendingMusicRef.current = false;
    isPlayingVideoRef.current = false;
    setIsPlayingVideo(false);
    setVideoTitle('');
    setVideoUrl('');
    setVideoProvider('youtube');
    setIsReady(false);
    setRobotState('IDLE');
    busyRef.current = false;
  }, []);

  // ── Stop music (from UI button) ───────────────────────────────
  const stopMusic = useCallback(async () => {
    pendingMusicRef.current = false;
    await stopMusicInternal();
    setMusicTitle('');
    setRobotState('IDLE');
    setExpression('IDLE');
    busyRef.current = false;
    if (activeRef.current) startVAD();
  }, []);

  // The video itself is rendered inside the face WebView.
  const stopVideo = useCallback(() => {
    pendingMusicRef.current = false;
    pendingVideoRef.current = false;
    isPlayingVideoRef.current = false;
    setIsPlayingVideo(false);
    setVideoTitle('');
    setVideoUrl('');
    setVideoProvider('youtube');
    setRobotState('IDLE');
    setExpression('IDLE');
    busyRef.current = false;
    if (activeRef.current) startVAD();
  }, []);

  // ── Reset expression (called after camera capture/cancel) ─────
  const resetExpression = useCallback(() => {
    setExpression('IDLE');
  }, []);

  return [
    {
      robotState, expression, musicTitle, isPlayingMusic,
      videoTitle, videoUrl, isPlayingVideo,
      videoProvider,
      errorMsg, isReady, micLevel,
    },
    { start, stop, stopMusic, stopVideo, resetExpression },
  ];
}
