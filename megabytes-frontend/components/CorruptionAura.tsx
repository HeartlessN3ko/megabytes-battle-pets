/**
 * CorruptionAura — a semi-transparent CRT/glitch aura that wraps the byte.
 *
 * Replaces the "sick" sprite as the corruption visual. Intensity scales with
 * the byte's corruption value: invisible below the threshold, fully manifest
 * at 100. Three layered effects compose the "internet dirt" look:
 *
 *  1. Horizontal scanlines across the byte silhouette.
 *  2. Two colored tear bars (magenta / cyan) that shift horizontally —
 *     cheap chromatic-aberration fake without needing a shader.
 *  3. Periodic jitter + flicker of the whole wrapper.
 *
 * Sized to match the byte sprite and placed as a child of the byteStage so
 * it translates with roamX automatically.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

type Props = {
  /** Byte corruption value (0–100). */
  corruption: number;
  /** Aura size in px (square). */
  size: number;
  /** Size of the containing byte sprite box. Used to center the aura. Defaults to size (no centering). */
  containerSize?: number;
};

const THRESHOLD = 25;

export default function CorruptionAura({ corruption, size, containerSize }: Props) {
  const container = containerSize ?? size;
  const offsetX = (container - size) / 2;
  // Align to the byte's ground plane: bottom of container, minus a touch for sprite bottom padding.
  const offsetY = container - size;
  // Clamp: invisible below threshold, ramps to 1.0 at 100.
  const intensity = Math.max(0, Math.min(1, (corruption - THRESHOLD) / (100 - THRESHOLD)));

  const jitter   = useRef(new Animated.Value(0)).current;
  const flicker  = useRef(new Animated.Value(0.85)).current;
  const tearDrv  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (intensity <= 0) return;

    const jitterLoop = Animated.loop(Animated.sequence([
      Animated.delay(900 + Math.random() * 1400),
      Animated.timing(jitter, { toValue: 2,  duration: 60, useNativeDriver: true }),
      Animated.timing(jitter, { toValue: -2, duration: 60, useNativeDriver: true }),
      Animated.timing(jitter, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]));

    const flickerLoop = Animated.loop(Animated.sequence([
      Animated.timing(flicker, { toValue: 1,    duration: 420, useNativeDriver: true }),
      Animated.timing(flicker, { toValue: 0.65, duration: 260, useNativeDriver: true }),
    ]));

    const tearLoop = Animated.loop(Animated.sequence([
      Animated.delay(600),
      Animated.timing(tearDrv, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(tearDrv, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]));

    jitterLoop.start();
    flickerLoop.start();
    tearLoop.start();
    return () => {
      jitterLoop.stop();
      flickerLoop.stop();
      tearLoop.stop();
    };
  }, [intensity, jitter, flicker, tearDrv]);

  // Pre-computed scanline rows (every 3px). Every 6th row is a highlight.
  const scanlines = useMemo(() => {
    const rows: { top: number; highlight: boolean }[] = [];
    for (let y = 0; y < size; y += 3) {
      rows.push({ top: y, highlight: Math.floor(y / 3) % 6 === 0 });
    }
    return rows;
  }, [size]);

  if (intensity <= 0) return null;

  const scanAlpha = 0.35 + intensity * 0.45;
  const tearAlpha = 0.4  + intensity * 0.5;
  const tearMax   = size * 0.12;
  const tearPosX  = tearDrv.interpolate({ inputRange: [0, 1], outputRange: [0,  tearMax] });
  const tearNegX  = tearDrv.interpolate({ inputRange: [0, 1], outputRange: [0, -tearMax] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          top: offsetY,
          left: offsetX,
          opacity: flicker,
          transform: [{ translateX: jitter }],
        },
      ]}
    >
      {scanlines.map((l, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: l.top,
            height: 1,
            backgroundColor: l.highlight
              ? `rgba(0, 180, 255, ${scanAlpha * 0.8})`
              : `rgba(8, 0, 30, ${scanAlpha})`,
          }}
        />
      ))}

      {/* Magenta tear bar — shifts right. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size * 0.32,
          height: 2,
          backgroundColor: `rgba(255, 60, 120, ${tearAlpha})`,
          transform: [{ translateX: tearPosX }],
        }}
      />

      {/* Cyan tear bar — shifts left. */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: size * 0.58,
          height: 2,
          backgroundColor: `rgba(60, 220, 255, ${tearAlpha})`,
          transform: [{ translateX: tearNegX }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
