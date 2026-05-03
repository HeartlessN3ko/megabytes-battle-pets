/**
 * ActivityPopup
 *
 * Renders the byte's currently active "internet activity" pop-up window over
 * the home screen. The byte fakes accessing some app/site (educational
 * videos, suspicious sites, dark forums, etc.) — this is the visible surface.
 *
 * Tapping the popup:
 *   - Calls /closeActivity { action: 'tap' } and shakes
 *   - On the Nth tap (N = activity.tapResistance, server-side gated) the
 *     window force-closes; mood penalty is applied server-side scaled to kind
 *
 * Asset placeholder: decor_sunsetpainting.png (back-wall decor sprite) — used
 * as the window frame until proper browser-window pixel art ships. Glyph
 * tinting + label sit on top.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type ActiveActivity = {
  id: string;
  label: string;
  kind: 'good' | 'neutral' | 'bad' | string;
  startedAt: string | Date;
  expiresAt: string | Date;
  tapResistCount?: number;
};

type Props = {
  activity: ActiveActivity | null;
  onTap: () => Promise<unknown> | void;
};

const KIND_TINT: Record<string, string> = {
  good:    '#9df4a6',
  neutral: '#ffe08b',
  bad:     '#ff7a7a',
};

const WINDOW_BG = require('../assets/decor/decor_sunsetpainting.png');

export function ActivityPopup({ activity, onTap }: Props) {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);

  // Fade in on activity arrival, fade out on dismiss.
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: activity ? 1 : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [activity, fadeAnim]);

  if (!activity) return null;

  const tint = KIND_TINT[activity.kind] || '#bcc4d8';
  const resistCount = Number(activity.tapResistCount ?? 0);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = async () => {
    if (busy) return;
    triggerShake();
    setBusy(true);
    try {
      await onTap();
    } finally {
      setBusy(false);
    }
  };

  const translateX = shakeAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-6, 6],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { opacity: fadeAnim, transform: [{ translateX }] },
      ]}
    >
      <Pressable onPress={handlePress} style={styles.frame}>
        <Image source={WINDOW_BG} style={styles.bg} resizeMode="cover" />
        <View style={styles.scrim} pointerEvents="none" />
        <View style={styles.titleBar}>
          <View style={[styles.dot, { backgroundColor: '#ff5f56' }]} />
          <View style={[styles.dot, { backgroundColor: '#ffbd2e' }]} />
          <View style={[styles.dot, { backgroundColor: '#27c93f' }]} />
          <Text style={styles.titleText} numberOfLines={1}>BROWSER</Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.label, { color: tint }]} numberOfLines={2}>
            {activity.label}
          </Text>
          {resistCount > 0 && (
            <Text style={styles.resistHint}>RESISTING — TAP TO CLOSE</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  frame: {
    width: '70%',
    maxWidth: 320,
    minHeight: 96,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(26,31,46,0.78)',
    borderWidth: 2,
    borderColor: '#2a3145',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.32,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,11,20,0.4)',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.32)',
    gap: 6,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  titleText: {
    color: '#bcc4d8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginLeft: 8,
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  resistHint: {
    color: '#7a8398',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
