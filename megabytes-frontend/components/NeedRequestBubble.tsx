import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/**
 * Floating request emote shown above the byte when a need is critical.
 * Shows a targeted emoji (🍔 🎮 🛁 💤) with a soft pulse + bob.
 * Renders null when `need` is null.
 */
export type NeedRequest =
  | 'hunger'
  | 'fun'
  | 'hygiene'
  | 'bandwidth'
  | 'attention'
  | null;

type Props = {
  need: NeedRequest;
};

const EMOJI: Record<Exclude<NeedRequest, null>, string> = {
  hunger: '🍔',
  fun: '🎮',
  hygiene: '🛁',
  bandwidth: '💤',
  attention: '❓',
};

const TINT: Record<Exclude<NeedRequest, null>, string> = {
  hunger: '#ffb85a',
  fun: '#ff7fd1',
  hygiene: '#7fd9ff',
  bandwidth: '#c8a3ff',
  attention: '#ffe666',
};

export default function NeedRequestBubble({ need }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (!need) {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      pulse.setValue(0);
      bob.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    bobLoop.start();
    loopsRef.current = [pulseLoop, bobLoop];

    return () => {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      pulse.setValue(0);
      bob.setValue(0);
    };
  }, [need, pulse, bob]);

  if (!need) return null;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.bubble,
          { borderColor: TINT[need], transform: [{ scale }, { translateY }] },
        ]}
      >
        <Text style={styles.emoji}>{EMOJI[need]}</Text>
      </Animated.View>
      <View style={[styles.tail, { borderTopColor: TINT[need] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -62,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: 'rgba(14,16,24,0.85)',
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  emoji: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
  },
  tail: {
    marginTop: -1,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
