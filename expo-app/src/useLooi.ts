import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { VAD_THRESHOLD_DB, SILENCE_DURATION_MS } from './config';

export type RobotState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'SEARCHING_MUSIC' | 'PLAYING_MUSIC';
export type Expression = 'IDLE' | 'HAPPY' | 'ANGRY' | 'SAD' | 'WINK' | 'MUSIC' | 'NEWS' | 'BURGER' | 'JUICE' | 'CAMERA';

interface LooiState {
  robotState: RobotState;
  expression: Expression;
  move: string;
  transcript: string;
  musicTitle: string;
  isPlayingMusic: boolean;
  errorMsg: string;
  wsConnected: boolean;
}

interface LooiActions {
  connect: (serverWsUrl: string) => void;
  disconnect: () => void;
  stopMusic: () => void;
}

export function useLooi(): [LooiState, LooiActions] {
  const [robotState, setRobotState] = useState<RobotState>('IDLE');
  const [expression, setExpression] = useState<Expression>('IDLE');
  const [move, setMove] = useState('NONE');
  const [transcript, setTranscript] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const ttsSoundRef = useRef<Audio.Sound | null>(null);
  const musicSoundRef = useRef<Audio.Sound | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);    // user is speaking
  const robotStateRef = useRef<RobotState>('IDLE');
  const busyRef = useRef(false);           // processing audio, don't record again yet

  // keep ref in sync with state
  useEffect(() => { robotStateRef.current = robotState; }, [robotState]);

  // ── Audio permissions + mode setup ────────────────────────────
  async function setupAudio() {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  }

  // ── Stop current TTS sound ─────────────────────────────────────
  async function stopTTS() {
    try {
      if (ttsSoundRef.current) {
        await ttsSoundRef.current.stopAsync();
        await ttsSoundRef.current.unloadAsync();
        ttsSoundRef.current = null;
      }
    } catch {}
  }

  // ── Stop music ─────────────────────────────────────────────────
  async function stopMusicSound() {
    try {
      if (musicSoundRef.current) {
        await musicSoundRef.current.stopAsync();
        await musicSoundRef.current.unloadAsync();
        musicSoundRef.current = null;
      }
    } catch {}
    setIsPlayingMusic(false);
  }

  // ── Play TTS from base64 MP3 ───────────────────────────────────
  async function playTTS(base64: string) {
    try {
      await stopTTS();
      // Switch mode to playback (not recording)
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
          // If no music queued, go back to IDLE and restart VAD
          if (!isPlayingMusic && robotStateRef.current === 'SPEAKING') {
            setRobotState('IDLE');
            busyRef.current = false;
            startVAD();
          }
        }
      });
    } catch (err: any) {
      console.error('[TTS] playback error:', err.message);
      busyRef.current = false;
      startVAD();
    }
  }

  // ── Play music from URL ────────────────────────────────────────
  async function playMusic(url: string) {
    try {
      await stopMusicSound();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, isLooping: false, progressUpdateIntervalMillis: 1000 }
      );
      musicSoundRef.current = sound;
      setIsPlayingMusic(true);

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          await sound.unloadAsync();
          musicSoundRef.current = null;
          setIsPlayingMusic(false);
          setMusicTitle('');
          setRobotState('IDLE');
          setExpression('IDLE');
          busyRef.current = false;
          startVAD();
        }
      });
    } catch (err: any) {
      console.error('[Music] playback error:', err.message);
      setIsPlayingMusic(false);
      busyRef.current = false;
      startVAD();
    }
  }

  // ── Stop active recording ──────────────────────────────────────
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

  // ── Send recorded audio to server ─────────────────────────────
  async function sendAudio(uri: string) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.deleteAsync(uri, { idempotent: true });

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(`AUDIO:${base64}`);
      }
    } catch (err: any) {
      console.error('[Audio] send error:', err.message);
      busyRef.current = false;
      startVAD();
    }
  }

  // ── VAD loop — detect speech then silence ──────────────────────
  async function startVAD() {
    if (busyRef.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

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
        if (busyRef.current || robotStateRef.current !== 'IDLE') {
          // Robot started doing something, stop recording
          await stopRecording();
          return;
        }

        let status: Audio.RecordingStatus;
        try { status = await recordingRef.current.getStatusAsync(); } catch { return; }
        if (!status.isRecording) return;

        const level = status.metering ?? -160;

        if (level > VAD_THRESHOLD_DB) {
          // Speech detected
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setRobotState('LISTENING');
          }
          clearTimeout(silenceTimerRef.current!);
          silenceTimerRef.current = null;
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
          // Silence after speech — wait then cut
          silenceTimerRef.current = setTimeout(async () => {
            const uri = await stopRecording();
            if (uri) {
              busyRef.current = true;
              await sendAudio(uri);
            } else {
              startVAD();
            }
          }, SILENCE_DURATION_MS);
        }
      }, 80);

    } catch (err: any) {
      console.error('[VAD] error:', err.message);
    }
  }

  // ── WebSocket message handler ──────────────────────────────────
  function handleMessage(msg: string) {
    if (msg.startsWith('STATE:')) {
      const s = msg.slice(6) as RobotState;
      setRobotState(s);
    } else if (msg.startsWith('FACE:')) {
      // FACE:HAPPY,MOVE:LOOK_UP
      const m = msg.slice(5).match(/([A-Z]+),MOVE:([A-Z_]+)/);
      if (m) { setExpression(m[1] as Expression); setMove(m[2]); }
    } else if (msg.startsWith('TRANSCRIPT:')) {
      setTranscript(msg.slice(11));
    } else if (msg.startsWith('TTS:')) {
      setRobotState('SPEAKING');
      playTTS(msg.slice(4));
    } else if (msg.startsWith('MUSIC_TITLE:')) {
      setMusicTitle(msg.slice(12));
    } else if (msg.startsWith('MUSIC_URL:')) {
      playMusic(msg.slice(10));
    } else if (msg === 'MUSIC_STOP') {
      stopMusicSound();
      setRobotState('IDLE');
      busyRef.current = false;
      startVAD();
    } else if (msg.startsWith('ERROR:')) {
      setErrorMsg(msg.slice(6));
      setTimeout(() => setErrorMsg(''), 3000);
    }
  }

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(async (serverWsUrl: string) => {
    await setupAudio();

    const ws = new WebSocket(serverWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send('READY');
      startVAD();
    };

    ws.onmessage = (e) => handleMessage(String(e.data));

    ws.onclose = () => {
      setWsConnected(false);
      setRobotState('IDLE');
      busyRef.current = false;
    };

    ws.onerror = () => {
      setErrorMsg('Connection failed');
      setTimeout(() => setErrorMsg(''), 3000);
    };
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    await stopRecording();
    await stopTTS();
    await stopMusicSound();
    wsRef.current?.close();
    wsRef.current = null;
    setWsConnected(false);
    setRobotState('IDLE');
    busyRef.current = false;
  }, []);

  // ── Stop music (from UI) ───────────────────────────────────────
  const stopMusic = useCallback(async () => {
    wsRef.current?.send('STOP_MUSIC');
    await stopMusicSound();
    setMusicTitle('');
    setRobotState('IDLE');
    setExpression('IDLE');
    busyRef.current = false;
    startVAD();
  }, []);

  return [
    { robotState, expression, move, transcript, musicTitle, isPlayingMusic, errorMsg, wsConnected },
    { connect, disconnect, stopMusic },
  ];
}
