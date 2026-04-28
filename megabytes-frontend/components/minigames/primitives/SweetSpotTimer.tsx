/**
 * SweetSpotTimer
 *
 * Reusable primitive for sweet-spot timing minigames. A marker traverses a
 * horizontal track. The wrapping drill commits via the ref's commit() method;
 * the primitive freezes the marker and reports back where it stopped, how
 * close it was to the sweet-spot center, and a {perfect | good | fail} grade.
 *
 * The primitive does not own touch input. The wrapping drill decides what
 * surface the player taps and calls commit() in its handler. That keeps the
 * visual contract narrow and lets each drill style its own fantasy.
 *
 * Used by:
 *  - PowerDrill (charge-and-release)
 *  - AccuracyDrill (intercept timing) [planned]
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';

export type SweetSpotGrade = 'perfect' | 'good' | 'fail';

export type SweetSpotResult = {
  /** Marker position at commit, 0-1. */
  position: number;
  /** Absolute distance from windowCenter, 0-1. */
  distance: number;
  /** 1.0 = bullseye, 0.0 = outside window. Linear inside the window. */
  precision: number;
  /** True if distance <= tolerance. */
  inWindow: boolean;
  grade: SweetSpotGrade;
};

export type SweetSpotTimerHandle = {
  /** Freeze the marker and return the result. Returns null if already committed. */
  commit: () => SweetSpotResult | null;
  /** Reset and resume sweeping. */
  reset: () => void;
};

export type SweetSpotTimerProps = {
  /** Sweet-spot center on the track, 0-1. Default 0.5. */
  windowCenter?: number;
  /** Half-width of the success window, 0-1. Default 0.08 (16% of track wide). */
  tolerance?: number;
  /** Time for the marker to traverse the track once, ms. Default 1100. */
  sweepMs?: number;
  /** Bounce off the edges (vs. wrap to start). Default true. */
  bounce?: boolean;
  /** Pause the marker. Default false. */
  paused?: boolean;
  /** Sweet-spot zone color. */
  accent?: string;
  /** Track background color. */
  trackColor?: string;
  /** Marker color. */
  markerColor?: string;
  /** Track height in px. Default 60. */
  height?: number;
  /** Min precision for 'perfect'. Default 0.85. */
  perfectThreshold?: number;
  /** Min precision for 'good'. Default 0.45. */
  goodThreshold?: number;
};

const DEFAULT_TOLERANCE = 0.08;
const DEFAULT_SWEEP_MS = 1100;
const MARKER_WIDTH_PX = 4;

export const SweetSpotTimer = forwardRef<SweetSpotTimerHandle, SweetSpotTimerProps>(
  (
    {
      windowCenter = 0.5,
      tolerance = DEFAULT_TOLERANCE,
      sweepMs = DEFAULT_SWEEP_MS,
      bounce = true,
      paused = false,
      accent = '#ffd86b',
      trackColor = '#1a1f2e',
      markerColor = '#ffffff',
      height = 60,
      perfectThreshold = 0.85,
      goodThreshold = 0.45,
    },
    ref,
  ) => {
    const pos = useRef(new Animated.Value(0)).current;
    const committedAtRef = useRef<number | null>(null);
    const livePosRef = useRef(0);
    const animRef = useRef<Animated.CompositeAnimation | null>(null);
    const [trackWidth, setTrackWidth] = useState(0);

    // Mirror animated value into a plain ref so commit() reads it synchronously.
    useEffect(() => {
      const id = pos.addListener(({ value }) => {
        livePosRef.current = value;
      });
      return () => pos.removeListener(id);
    }, [pos]);

    const stopSweep = () => {
      animRef.current?.stop();
      animRef.current = null;
    };

    const startSweep = () => {
      stopSweep();
      const segment = bounce
        ? Animated.sequence([
            Animated.timing(pos, {
              toValue: 1,
              duration: sweepMs,
              easing: Easing.linear,
              useNativeDriver: false,
            }),
            Animated.timing(pos, {
              toValue: 0,
              duration: sweepMs,
              easing: Easing.linear,
              useNativeDriver: false,
            }),
          ])
        : Animated.sequence([
            Animated.timing(pos, {
              toValue: 1,
              duration: sweepMs,
              easing: Easing.linear,
              useNativeDriver: false,
            }),
            Animated.timing(pos, {
              toValue: 0,
              duration: 0,
              useNativeDriver: false,
            }),
          ]);
      const loop = Animated.loop(segment);
      animRef.current = loop;
      loop.start();
    };

    useEffect(() => {
      if (paused || committedAtRef.current !== null) {
        stopSweep();
        return undefined;
      }
      startSweep();
      return stopSweep;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paused, sweepMs, bounce]);

    useImperativeHandle(
      ref,
      () => ({
        commit: () => {
          if (committedAtRef.current !== null) return null;
          stopSweep();
          const stoppedAt = livePosRef.current;
          committedAtRef.current = stoppedAt;
          const distance = Math.abs(stoppedAt - windowCenter);
          const inWindow = distance <= tolerance;
          const precision = inWindow ? 1 - distance / tolerance : 0;
          let grade: SweetSpotGrade;
          if (precision >= perfectThreshold) grade = 'perfect';
          else if (precision >= goodThreshold) grade = 'good';
          else grade = 'fail';
          return { position: stoppedAt, distance, precision, inWindow, grade };
        },
        reset: () => {
          committedAtRef.current = null;
          pos.setValue(0);
          livePosRef.current = 0;
          if (!paused) startSweep();
        },
      }),
      [windowCenter, tolerance, perfectThreshold, goodThreshold, paused],
    );

    const handleLayout = (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w > 0 && w !== trackWidth) setTrackWidth(w);
    };

    const zoneLeft = Math.max(0, trackWidth * (windowCenter - tolerance));
    const zoneWidth = Math.max(0, trackWidth * tolerance * 2);
    const markerRange = Math.max(0, trackWidth - MARKER_WIDTH_PX);

    return (
      <View
        onLayout={handleLayout}
        style={[styles.track, { height, backgroundColor: trackColor }]}
      >
        {trackWidth > 0 && (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.zone,
                {
                  left: zoneLeft,
                  width: zoneWidth,
                  backgroundColor: accent,
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.marker,
                {
                  width: MARKER_WIDTH_PX,
                  backgroundColor: markerColor,
                  transform: [
                    {
                      translateX: pos.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, markerRange],
                      }),
                    },
                  ],
                },
              ]}
            />
          </>
        )}
      </View>
    );
  },
);

SweetSpotTimer.displayName = 'SweetSpotTimer';

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  zone: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 4,
    opacity: 0.55,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
