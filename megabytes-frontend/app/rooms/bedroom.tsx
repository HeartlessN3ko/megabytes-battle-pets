import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Modal, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { careAction, enterRoom, getByte, powerNap, sleepCycle } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function BedroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bedroom mode active. Recovery protocols ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [sleepDurationPickerOpen, setSleepDurationPickerOpen] = useState(false);
  const [sleepDurationMinutes, setSleepDurationMinutes] = useState(60);
  const [energy, setEnergy] = useState(0);

  const loadBedroomStatus = React.useCallback(async () => {
    try {
      const data = await getByte();
      const nextEnergy = Number(data?.byte?.needs?.Energy ?? 0);
      setEnergy(Number.isFinite(nextEnergy) ? Math.max(0, Math.min(100, nextEnergy)) : 0);
    } catch {
      setEnergy(0);
    }
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

      // If sleep cycle minigame completed, show duration picker
      if (result.gameId === 'stabilize-signal') {
        setSleepDurationMinutes(60); // Default to 1h
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

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'nap-short',
      title: 'POWER NAP',
      subtitle: 'Quick rest program',
      icon: 'bed-outline',
      color: '#8f97ff',
      disabled: false,
      programLabel: 'Running stabilization program...',
      programMs: 1400,
      onPress: () => {
        setStatus('Initiating power nap cycle...');
        powerNap()
          .then((result) => {
            setResultWindow({
              title: 'POWER NAP ACTIVE',
              body: `Byte is resting. Sleep until: ${new Date(result.sleepUntil).toLocaleTimeString()}. Bandwidth +12, Mood +8.`,
            });
            loadBedroomStatus().catch(() => {});
          })
          .catch(() => {
            setResultWindow({
              title: 'POWER NAP FAILED',
              body: 'Sleep cycle initiation failed. Try again in a moment.',
            });
          });
      },
    },
    {
      key: 'sleep-long',
      title: 'SLEEP CYCLE',
      subtitle: 'Launch rest minigame',
      icon: 'moon-outline',
      color: '#a88eff',
      disabled: false,
      onPress: () => {
        setStatus('Deep-rest minigame ready.');
        router.push({ pathname: '/minigames/[id]', params: { id: 'stabilize-signal', variant: 'long', room: 'bedroom' } });
      },
    },
  ];

  const secondaryActions: RoomAction[] = [];

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
        statusLine={status}
        metaProgress={{
          label: 'ENERGY',
          value: energy,
          max: 100,
          tint: energy >= 70 ? '#7cffc0' : energy >= 35 ? '#a88eff' : '#8f97ff',
          detail: `${Math.round(energy)}%`,
        }}
        primaryActions={primaryActions}
        secondaryActions={secondaryActions}
        resultWindow={resultWindow}
        onDismissResultWindow={() => setResultWindow(null)}
        onExit={() => router.replace('/(tabs)')}
      />

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
                  setResultWindow({
                    title: 'SLEEP CYCLE ACTIVE',
                    body: `Byte is in deep sleep. Sleep until: ${new Date(result.sleepUntil).toLocaleTimeString()}. Full recovery applied.`,
                  });
                  loadBedroomStatus().catch(() => {});
                })
                .catch(() => {
                  setResultWindow({
                    title: 'SLEEP CYCLE FAILED',
                    body: 'Deep sleep initiation failed. Try again in a moment.',
                  });
                });
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
  sleepBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,18,0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  sleepCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(159,156,255,0.25)',
    backgroundColor: 'rgba(30,20,80,0.96)',
    padding: 16,
    gap: 12,
  },
  sleepTitle: { color: '#d9efff', fontSize: 13, fontWeight: '900', letterSpacing: 1.3 },
  sleepSubtitle: { color: '#a0d9ff', fontSize: 10.5 },
  sleepOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  sleepOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(159,156,255,0.2)',
    backgroundColor: 'rgba(8,18,62,0.78)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sleepOptionSelected: {
    borderColor: '#9f9cff',
    backgroundColor: 'rgba(159,156,255,0.2)',
  },
  sleepOptionText: { color: '#d9efff', fontSize: 11, fontWeight: '700' },
  sleepConfirm: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(159,156,255,0.3)',
    backgroundColor: 'rgba(159,156,255,0.15)',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  sleepConfirmText: { color: '#d9efff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
});


