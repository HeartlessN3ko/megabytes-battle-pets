import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Easing, Modal, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { enterRoom, getByte, powerNap, sleepCycle } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

// Floating Zzz particle — rises and fades over ~3s, loops while sleeping
function ZzzParticle({ delay, x, size }: { delay: number; x: number; size: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 3000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -80] });
  const opacity = anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.6, 0] });
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 1.3] });

  return (
    <Animated.Text style={[styles.zzzText, { left: x, fontSize: size, transform: [{ translateY }, { scale }], opacity }]}>
      Z
    </Animated.Text>
  );
}

export default function BedroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bedroom mode active. Recovery protocols ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [sleepDurationPickerOpen, setSleepDurationPickerOpen] = useState(false);
  const [sleepDurationMinutes, setSleepDurationMinutes] = useState(60);
  const [energy, setEnergy] = useState(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepUntilTs, setSleepUntilTs] = useState<number | null>(null);

  const loadBedroomStatus = React.useCallback(async () => {
    try {
      const data = await getByte();
      const nextEnergy = Number(data?.byte?.needs?.Bandwidth ?? 0);
      setEnergy(Number.isFinite(nextEnergy) ? Math.max(0, Math.min(100, nextEnergy)) : 0);
      setIsSleeping(Boolean(data?.byte?.isSleeping));
      setSleepUntilTs(data?.byte?.sleepUntil ? new Date(data.byte.sleepUntil).getTime() : null);
    } catch { setEnergy(0); }
  }, []);

  useEffect(() => {
    enterRoom('Bedroom', 1).catch(() => {});
    loadBedroomStatus().catch(() => {});
  }, [loadBedroomStatus]);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('bedroom');
      loadBedroomStatus().catch(() => {});
      if (!result) return;
      setStatus(result.summary);
      if (result.gameId === 'stabilize-signal') {
        setSleepDurationMinutes(60);
        setSleepDurationPickerOpen(true);
      } else {
        setResultWindow({
          title: `${result.title} - ${result.grade.toUpperCase()}`,
          body: result.summary,
          byteBits: result.byteBits,
          skillGain: result.skillGain,
          energyCost: result.energyCost,
          cooldownSeconds: result.cooldownSeconds,
        });
      }
    }, [loadBedroomStatus])
  );

  const wakeTimeLabel = sleepUntilTs
    ? `Wake at ${new Date(sleepUntilTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'nap-short',
      title: 'POWER NAP',
      subtitle: 'Quick rest program',
      icon: 'bed-outline',
      color: '#8f97ff',
      disabled: isSleeping,
      programLabel: 'Running stabilization program...',
      programMs: 1400,
      onPress: () => {
        setStatus('Initiating power nap cycle...');
        powerNap()
          .then((result) => {
            setResultWindow({ title: 'POWER NAP ACTIVE', body: `Byte is resting. Sleep until: ${new Date(result.sleepUntil).toLocaleTimeString()}. Bandwidth +12, Mood +8.` });
            loadBedroomStatus().catch(() => {});
          })
          .catch(() => { setResultWindow({ title: 'POWER NAP FAILED', body: 'Sleep cycle initiation failed. Try again.' }); });
      },
    },
    {
      key: 'sleep-long',
      title: 'SLEEP CYCLE',
      subtitle: 'Launch rest minigame',
      icon: 'moon-outline',
      color: '#a88eff',
      disabled: isSleeping,
      onPress: () => {
        setStatus('Deep-rest minigame ready.');
        router.push({ pathname: '/minigames/[id]', params: { id: 'stabilize-signal', variant: 'long', room: 'bedroom' } });
      },
    },
  ];

  return (
    <>
      <RoomScene
        title="BEDROOM"
        subtitle="RECOVERY POD"
        roomTag="REST PROTOCOLS"
        ambient="Use short rests for quick recovery or deep cycle sleep for stronger restoration."
        sceneTint="rgba(36,28,74,0.22)"
        accent="#9f9cff"
        backgroundSource={require('../../assets/backgrounds/bedroom.png')}
        statusLine={isSleeping ? `Byte is sleeping. Zzzz... ${wakeTimeLabel || ''}` : status}
        timerLine={isSleeping && wakeTimeLabel ? 'Training locked while resting. Tap byte to wake.' : undefined}
        metaProgress={{ label: 'ENERGY', value: energy, max: 100, tint: energy >= 70 ? '#7cffc0' : energy >= 35 ? '#a88eff' : '#8f97ff', detail: `${Math.round(energy)}%` }}
        primaryActions={primaryActions}
        secondaryActions={[]}
        resultWindow={resultWindow}
        onDismissResultWindow={() => setResultWindow(null)}
        onExit={() => router.replace('/(tabs)')}
      />

      {isSleeping && (
        <View style={styles.zzzOverlay} pointerEvents="none">
          <ZzzParticle delay={0} x={80} size={18} />
          <ZzzParticle delay={900} x={110} size={24} />
          <ZzzParticle delay={1800} x={60} size={14} />
        </View>
      )}

      <Modal visible={sleepDurationPickerOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.sleepBg} activeOpacity={1} onPress={() => setSleepDurationPickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sleepCard}>
            <Text style={styles.sleepTitle}>CHOOSE SLEEP DURATION</Text>
            <Text style={styles.sleepSubtitle}>How long should your byte rest?</Text>
            <View style={styles.sleepOptions}>
              {[1, 2, 4, 6, 8, 10].map((hours) => (
                <TouchableOpacity
                  key={`${hours}h`}
                  style={[styles.sleepOption, sleepDurationMinutes === hours * 60 && styles.sleepOptionSelected]}
                  onPress={() => setSleepDurationMinutes(hours * 60)}
                >
                  <Text style={styles.sleepOptionText}>{hours}H</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.sleepConfirm}
              onPress={() => {
                setSleepDurationPickerOpen(false);
                setStatus('Entering deep sleep cycle...');
                sleepCycle(sleepDurationMinutes)
                  .then((result) => {
                    setResultWindow({ title: 'SLEEP CYCLE ACTIVE', body: `Byte is in deep sleep. Sleep until: ${new Date(result.sleepUntil).toLocaleTimeString()}. Full recovery applied.` });
                    loadBedroomStatus().catch(() => {});
                  })
                  .catch(() => { setResultWindow({ title: 'SLEEP CYCLE FAILED', body: 'Deep sleep initiation failed. Try again.' }); });
              }}
            >
              <Text style={styles.sleepConfirmText}>CONFIRM</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  zzzOverlay: { position: 'absolute', bottom: 180, left: 0, right: 0, height: 120, pointerEvents: 'none' },
  zzzText: { position: 'absolute', color: '#c8c0ff', fontWeight: '900', opacity: 0 },
  sleepBg: { flex: 1, backgroundColor: 'rgba(0,0,18,0.86)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sleepCard: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(159,156,255,0.25)', backgroundColor: 'rgba(30,20,80,0.96)', padding: 16, gap: 12 },
  sleepTitle: { color: '#d9efff', fontSize: 13, fontWeight: '900', letterSpacing: 1.3 },
  sleepSubtitle: { color: '#a0d9ff', fontSize: 10.5 },
  sleepOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  sleepOption: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(159,156,255,0.2)', backgroundColor: 'rgba(8,18,62,0.78)', paddingHorizontal: 14, paddingVertical: 8 },
  sleepOptionSelected: { borderColor: '#9f9cff', backgroundColor: 'rgba(159,156,255,0.2)' },
  sleepOptionText: { color: '#d9efff', fontSize: 11, fontWeight: '700' },
  sleepConfirm: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(159,156,255,0.3)', backgroundColor: 'rgba(159,156,255,0.15)', paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  sleepConfirmText: { color: '#d9efff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});
