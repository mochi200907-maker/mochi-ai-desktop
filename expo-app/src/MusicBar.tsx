import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

interface Props {
  title: string;
  isPlaying: boolean;
  onStop: () => void;
}

export function MusicBar({ title, isPlaying, onStop }: Props) {
  const slideY = useRef(new Animated.Value(100)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: isPlaying ? 0 : 100,
      useNativeDriver: true,
      damping: 14,
      stiffness: 120,
    }).start();
  }, [isPlaying]);

  // Pulse the note icon
  useEffect(() => {
    if (!isPlaying) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isPlaying]);

  return (
    <Animated.View style={[styles.bar, { transform: [{ translateY: slideY }] }]}>
      <Animated.Text style={[styles.noteIcon, { transform: [{ scale: pulse }] }]}>♫</Animated.Text>
      <Text style={styles.title} numberOfLines={1}>{title || 'Playing music…'}</Text>
      <TouchableOpacity onPress={onStop} style={styles.stopBtn} activeOpacity={0.7}>
        <Text style={styles.stopText}>■ Stop</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#00d2ff44',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    gap: 10,
  },
  noteIcon: {
    fontSize: 22,
    color: '#00d2ff',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  stopBtn: {
    backgroundColor: '#00d2ff22',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#00d2ff55',
  },
  stopText: {
    color: '#00d2ff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
