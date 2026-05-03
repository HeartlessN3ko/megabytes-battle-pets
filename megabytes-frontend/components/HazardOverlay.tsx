/**
 * HazardOverlay
 *
 * Renders the byte's active hazards over the home stage as floating emoji.
 * Each hazard's clear mechanic depends on its kind:
 *   - fire    🔥  3 taps    (rapid tap to "stomp it out")
 *   - leak    🌀  4 taps    (multi-tap to seal)
 *   - warning 📛  2 taps    (light)
 *   - corrupt 💀  2 swipes  (swipe to delete)
 *
 * One PanResponder per hazard distinguishes a tap (small movement, short
 * duration) from a swipe (movement >= SWIPE_PX). Each successful action
 * fires /hazard/:id/clear with action='tap' or 'swipe'. On a fully cleared
 * hazard the server returns { cleared: true, reward } — the overlay shakes
 * and fades; the parent refreshes byte data after.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TEST_CANDIDATES } from '../config/testCandidates';
import { TUNABLES } from '../config/tunables';

// Resolve the test-candidate sprite for a given hazard kind, or null when
// the layer is off / the slot is set to fall back. Consumers render the
// emoji glyph when this returns null. See `config/testCandidates.ts`.
function getHazardSprite(kind: string) {
  if (!TUNABLES.testCandidates.ENABLED) return null;
  const slotKey =
    kind === 'fire'    ? TUNABLES.testCandidates.hazardFire    :
    kind === 'corrupt' ? TUNABLES.testCandidates.hazardCorrupt :
    kind === 'leak'    ? TUNABLES.testCandidates.hazardLeak    :
    kind === 'warning' ? TUNABLES.testCandidates.hazardWarning :
    null;
  if (!slotKey) return null;
  return TEST_CANDIDATES.hazard[slotKey] ?? null;
}

export type Hazard = {
  id: string;
  kind: 'fire' | 'corrupt' | 'leak' | 'warning' | string;
  glyph: string;
  spawnedAt?: string | Date;
  position: { x: number; y: number }; // 0-1 coords on the parent stage
  tapsRequired: number;
  tapProgress: number;
  swipesRequired: number;
  swipeProgress: number;
};

type Props = {
  hazards: Hazard[];
  stageWidth: number;
  stageHeight: number;
  onClearAction: (hazardId: string, action: 'tap' | 'swipe') => Promise<unknown> | void;
};

const HAZARD_SIZE = 64;
const SWIPE_PX = 24;     // movement >= this counts as a swipe
const TAP_MAX_MS = 250;  // release within this is a tap

export function HazardOverlay({ hazards, stageWidth, stageHeight, onClearAction }: Props) {
  if (!hazards || hazards.length === 0 || stageWidth <= 0 || stageHeight <= 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hazards.map((h) => (
        <HazardSprite
          key={h.id}
          hazard={h}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          onClearAction={onClearAction}
        />
      ))}
    </View>
  );
}

function HazardSprite({
  hazard,
  stageWidth,
  stageHeight,
  onClearAction,
}: {
  hazard: Hazard;
  stageWidth: number;
  stageHeight: number;
  onClearAction: (hazardId: string, action: 'tap' | 'swipe') => Promise<unknown> | void;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [busy, setBusy] = useState(false);

  // Idle pulse for visibility.
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const triggerShake = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const fireAction = async (action: 'tap' | 'swipe') => {
    if (busy) return;
    triggerShake();
    setBusy(true);
    try {
      await onClearAction(hazard.id, action);
    } finally {
      // Brief lockout to prevent double-fires from one gesture.
      setTimeout(() => setBusy(false), 120);
    }
  };

  const startRef = useRef({ x: 0, y: 0, t: 0 });

  const responder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { x: 0, y: 0, t: Date.now() };
      },
      onPanResponderRelease: (_evt, gs) => {
        const dist = Math.sqrt(gs.dx * gs.dx + gs.dy * gs.dy);
        const elapsed = Date.now() - startRef.current.t;
        if (dist >= SWIPE_PX) {
          fireAction('swipe');
        } else if (elapsed <= TAP_MAX_MS || dist < SWIPE_PX / 2) {
          fireAction('tap');
        }
      },
      onPanResponderTerminate: () => { /* ignore */ },
    }),
    // fireAction closure is stable enough for a per-hazard responder
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazard.id],
  );

  // Position: percent of stage, anchored on hazard center.
  const left = Math.max(0, Math.min(stageWidth - HAZARD_SIZE, hazard.position.x * stageWidth - HAZARD_SIZE / 2));
  const top  = Math.max(0, Math.min(stageHeight - HAZARD_SIZE, hazard.position.y * stageHeight - HAZARD_SIZE / 2));

  // Progress display.
  const showTaps   = hazard.tapsRequired > 0;
  const showSwipes = hazard.swipesRequired > 0;

  const translateX = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-5, 5],
  });

  const sprite = getHazardSprite(hazard.kind);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.hazard,
        {
          left,
          top,
          transform: [{ translateX }, { scale: pulse }],
        },
      ]}
    >
      {sprite ? (
        <Image source={sprite} style={styles.sprite} resizeMode="contain" />
      ) : (
        <Text style={styles.glyph}>{hazard.glyph}</Text>
      )}
      <View style={styles.progressRow}>
        {showTaps && (
          <Text style={styles.progressTap}>
            {hazard.tapProgress}/{hazard.tapsRequired}
          </Text>
        )}
        {showSwipes && (
          <Text style={styles.progressSwipe}>
            ↕{hazard.swipeProgress}/{hazard.swipesRequired}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hazard: {
    position: 'absolute',
    width: HAZARD_SIZE,
    height: HAZARD_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  glyph: {
    fontSize: 38,
    textAlign: 'center',
  },
  sprite: {
    width: HAZARD_SIZE * 0.85,
    height: HAZARD_SIZE * 0.85,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -4,
  },
  progressTap: {
    color: '#ffe08b',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressSwipe: {
    color: '#ff7aa1',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
