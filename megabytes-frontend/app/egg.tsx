import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  Animated, Dimensions, StatusBar, ImageBackground, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEvolution } from '../context/EvolutionContext';
import { careAction, hatchByte } from '../services/api';
import { toDemoSeconds } from '../services/demoSession';

const { width } = Dimensions.get('window');

function Particle({ emoji, startX, delay, size }: { emoji: string; startX: number; delay: number; size: number }) {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(y,       { toValue: -(60 + Math.random() * 60), duration: 1400, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 900, delay: 300, useNativeDriver: true }),
        ]),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.Text style={{
      position: 'absolute', left: startX, bottom: 20,
      fontSize: size, transform: [{ translateY: y }, { scale }], opacity,
    }}>
      {emoji}
    </Animated.Text>
  );
}

export default function EggScreen() {
  const router = useRouter();
  const { reloadFromServer } = useEvolution();

  const eggBob      = useRef(new Animated.Value(0)).current;
  const eggScale    = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const whiteFlash  = useRef(new Animated.Value(0)).current;

  const [particles, setParticles] = useState<any[]>([]);
  const [inspectVisible, setInspectVisible] = useState(false);
  const [hatchTimeMs, setHatchTimeMs] = useState(toDemoSeconds(10) * 1000); // 10s real, ~0.4s demo
  const particleId = useRef(0);
  const hatchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hatchProgress = Math.max(0, 1 - (hatchTimeMs / (toDemoSeconds(10) * 1000)));

  // Simple bob - no nesting
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(eggBob, { toValue: -12, duration: 1400, useNativeDriver: true }),
        Animated.timing(eggBob, { toValue: 0,   duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Hatch timer countdown
  useEffect(() => {
    if (hatchTimeMs <= 0) return;

    hatchTimerRef.current = setInterval(() => {
      setHatchTimeMs(prev => {
        const next = prev - 100;
        if (next <= 0) {
          if (hatchTimerRef.current) clearInterval(hatchTimerRef.current);
          // Auto-hatch when timer expires
          setTimeout(() => triggerEvolution(), 300);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (hatchTimerRef.current) clearInterval(hatchTimerRef.current);
    };
  }, []);

  // Progress bar animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: hatchProgress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [hatchProgress]);

  const spawnParticles = useCallback((emoji: string, count: number) => {
    const newP = Array.from({ length: count }, (_, i) => ({
      id: particleId.current++,
      emoji,
      x: width * 0.3 + (Math.random() - 0.5) * width * 0.4,
      delay: i * 120,
      size: 18 + Math.random() * 14,
    }));
    setParticles(p => [...p, ...newP]);
    setTimeout(() => setParticles(p => p.filter(x => !newP.find(n => n.id === x.id))), 1800);
  }, []);

  const triggerEvolution = useCallback(() => {
    Animated.sequence([
      Animated.timing(eggScale, { toValue: 1.2, duration: 300, useNativeDriver: true }),
      Animated.timing(whiteFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start(async () => {
      try {
        await hatchByte();
        // Don't auto-advance stage; byte remains at stage 1 until natural evolution triggers
      } catch {}
      router.replace('/(tabs)');
    });
  }, []);

  const handleFeed = useCallback(async () => {
    spawnParticles('❤️', 5);
    Animated.sequence([
      Animated.timing(eggScale, { toValue: 1.1, duration: 120, useNativeDriver: true }),
      Animated.spring(eggScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    try { await careAction('feed'); } catch {}
  }, [spawnParticles]);

  const handleClean = useCallback(async () => {
    spawnParticles('💧', 6);
    Animated.sequence([
      Animated.timing(eggScale, { toValue: 1.08, duration: 100, useNativeDriver: true }),
      Animated.spring(eggScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    try { await careAction('clean'); } catch {}
  }, [spawnParticles]);

  const handleLove = useCallback(() => {
    spawnParticles('💗', 7);
    Animated.sequence([
      Animated.timing(eggScale, { toValue: 1.12, duration: 130, useNativeDriver: true }),
      Animated.spring(eggScale, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }, [spawnParticles]);

  const progressColor = progressAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#4466ff', '#aa44ff', '#ffcc00'],
  });

  return (
    <ImageBackground
      source={require('../assets/backgrounds/bg916.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>INCUBATION</Text>
          <Text style={styles.headerSub}>A MEGA-BYTE is forming inside</Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { flex: progressAnim, backgroundColor: progressColor }]} />
            <View style={{ flex: 1 }} />
          </View>
          <Text style={styles.progressLabel}>
            {hatchTimeMs <= 0 ? 'HATCHING...' : `INCUBATION ${Math.round(hatchProgress * 100)}%`}
          </Text>
        </View>

        <View style={styles.eggStage}>
          <Animated.View style={{ transform: [{ translateY: eggBob }, { scale: eggScale }] }}>
            <Image
              source={require('../assets/bytes/missingno-egg.png')}
              style={styles.eggSprite}
              resizeMode="contain"
            />
          </Animated.View>
          {particles.map(p => (
            <Particle key={p.id} emoji={p.emoji} startX={p.x} delay={p.delay} size={p.size} />
          ))}
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>SPECIAL EGG</Text>
          <Text style={styles.statusSub}>
            {hatchTimeMs <= 0
              ? 'HATCHING NOW!'
              : `Incubating... ${Math.ceil(hatchTimeMs / 1000)}s remaining`}
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleFeed} activeOpacity={0.75}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(0,180,80,0.2)', borderColor: '#00cc55' }]}>
              <Text style={styles.actionEmoji}>⬆️</Text>
            </View>
            <Text style={styles.actionLabel}>NUTRIENTS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleLove} activeOpacity={0.75}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,60,120,0.2)', borderColor: '#ff4488' }]}>
              <Text style={styles.actionEmoji}>💗</Text>
            </View>
            <Text style={styles.actionLabel}>LOVE</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleClean} activeOpacity={0.75}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(0,140,255,0.2)', borderColor: '#0088ff' }]}>
              <Text style={styles.actionEmoji}>🫧</Text>
            </View>
            <Text style={styles.actionLabel}>CLEAN</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={() => setInspectVisible(true)} activeOpacity={0.75}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(180,140,0,0.2)', borderColor: '#ccaa00' }]}>
              <Text style={styles.actionEmoji}>🔍</Text>
            </View>
            <Text style={styles.actionLabel}>INSPECT</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      <Animated.View style={[styles.whiteFlash, { opacity: whiteFlash }]} pointerEvents="none" />

      <Modal visible={inspectVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBg} onPress={() => setInspectVisible(false)} activeOpacity={1}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔍 INSPECTION REPORT</Text>
            <View style={styles.modalDivider} />
            <Text style={styles.modalBody}>
              {hatchTimeMs <= 0
                ? 'This is a Diamond Egg.\n\nSomething stirs inside. The shell pulses with golden light.\n\nIT IS HATCHING!'
                : `This is a Diamond Egg.\n\nThe shell is warm to the touch. A faint heartbeat can be felt.\n\nIncubation time remaining: ${Math.ceil(hatchTimeMs / 1000)}s`}
            </Text>
            <TouchableOpacity style={styles.modalClose} onPress={() => setInspectVisible(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg:   { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 20, gap: 4 },
  headerTitle: { color: '#7ec8ff', fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  headerSub:   { color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 1 },
  progressWrap: { paddingHorizontal: 30, marginTop: 16, gap: 6 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', overflow: 'hidden' },
  progressFill:  { borderRadius: 4 },
  progressLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 2, textAlign: 'center', fontWeight: '700' },
  eggStage:  { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  eggSprite: { width: width * 0.55, height: width * 0.55, backgroundColor: 'transparent' },
  statusCard: { marginHorizontal: 24, marginBottom: 16, backgroundColor: 'rgba(8,20,60,0.85)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(80,160,255,0.25)', padding: 16, alignItems: 'center', gap: 6 },
  statusTitle: { color: '#ffe566', fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  statusSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  buttonRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  actionBtn:  { alignItems: 'center', gap: 8, flex: 1 },
  actionIcon: { width: 58, height: 58, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  actionEmoji:{ fontSize: 26 },
  actionLabel:{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  whiteFlash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff' },
  modalBg:    { flex: 1, backgroundColor: 'rgba(0,0,20,0.85)', alignItems: 'center', justifyContent: 'center' },
  modalCard:  { backgroundColor: 'rgba(8,20,60,0.98)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(80,160,255,0.3)', padding: 24, width: width * 0.82, gap: 12 },
  modalTitle: { color: '#7ec8ff', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  modalDivider:{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  modalBody:  { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 22 },
  modalClose: { marginTop: 8, backgroundColor: 'rgba(80,160,255,0.15)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(80,160,255,0.3)', padding: 12, alignItems: 'center' },
  modalCloseText: { color: '#7ec8ff', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
});

