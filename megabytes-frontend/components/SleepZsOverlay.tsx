import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/**
 * Z's overlay shown above the byte while sleeping.
 * Two staggered "Z" labels loop translateY: 0 → -30 + opacity: 1 → 0
 * over ~1.5s. Renders nothing when `visible` is false.
 */
type Props = {
  visible: boolean;
};

const CYCLE_MS = 1500;
const RISE = -30;

export default function SleepZsOverlay({ visible }: Props) {
  const z1 = useRef(new Animated.Value(0)).current;
  const z2 = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (!visible) {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      z1.setValue(0);
      z2.setValue(0);
      return;
    }

    const makeLoop = (val: Animated.Value) =>
      Animated.loop(
        Animated.timing(val, {
          toValue: 1,
          duration: CYCLE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );

    const loop1 = makeLoop(z1);
    loop1.start();

    // Stagger the second Z by half a cycle
    const t = setTimeout(() => {
      const loop2 = makeLoop(z2);
      loop2.start();
      loopsRef.current.push(loop2);
    }, CYCLE_MS / 2);

    loopsRef.current.push(loop1);

    return () => {
      clearTimeout(t);
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      z1.setValue(0);
      z2.setValue(0);
    };
  }, [visible, z1, z2]);

  if (!visible) return null;

  const styleFor = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, RISE] }) },
    ],
  });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.Text style={[styles.zSmall, styleFor(z2)]}>z</Animated.Text>
      <Animated.Text style={[styles.zBig, styleFor(z1)]}>Z</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -36,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 48,
    flexDirection: 'row',
    gap: 4,
  },
  zBig: {
    color: '#cfe8ff',
    fontSize: 26,
    fontWeight: '800',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: 'monospace',
  },
  zSmall: {
    color: '#9bbfe0',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
});
