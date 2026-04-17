import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { careAction, enterRoom, getByte } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function BathroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bathroom diagnostics online. Hygiene bay is ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [hygiene, setHygiene] = useState(0);

  const loadBathroomStatus = React.useCallback(async () => {
    try {
      const data = await getByte();
      const nextHygiene = Number(data?.byte?.needs?.Hygiene ?? 0);
      setHygiene(Number.isFinite(nextHygiene) ? Math.max(0, Math.min(100, nextHygiene)) : 0);
    } catch {
      setHygiene(0);
    }
  }, []);

  useEffect(() => {
    enterRoom('Bathroom', 1).catch(() => {});
    loadBathroomStatus().catch(() => {});
  }, [loadBathroomStatus]);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('bathroom');
      loadBathroomStatus().catch(() => {});
      if (!result) return;
      setStatus(result.summary);
      // Apply perfect-clean corruption decay for deep-clean minigame
      careAction('perfect-clean', result.grade || 'good').catch(() => {});
      setResultWindow({
        title: `${result.title} - ${result.grade.toUpperCase()}`,
        body: result.summary,
        byteBits: result.byteBits,
        skillGain: result.skillGain,
        energyCost: result.energyCost,
        cooldownSeconds: result.cooldownSeconds,
      });
    }, [loadBathroomStatus])
  );

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'clean-short',
      title: 'CLEAN SWEEP',
      subtitle: 'Quick clean program',
      icon: 'water-outline',
      color: '#53daff',
      disabled: false,
      programLabel: 'Running cleanup program...',
      programMs: 1450,
      onPress: () => {
        setStatus('Cleanup routine complete. Quick hygiene pass applied.');
        careAction('clean')
          .then((result) => {
            setResultWindow({
              title: 'RUN CLEANUP COMPLETE',
              body: 'Quick cleanup finished. Surface clutter cleared and hygiene restored a little.',
              byteBits: Number(result?.earned || 0),
            });
          })
          .catch(() => {
            setResultWindow({
              title: 'RUN CLEANUP INCOMPLETE',
              body: 'Cleanup program failed to sync. Try again in a moment.',
            });
          });
      },
    },
    {
      key: 'clean-long',
      title: 'DEEP CLEAN',
      subtitle: 'Launch deep-clean minigame',
      icon: 'sparkles-outline',
      color: '#8ce9ff',
      disabled: false,
      onPress: () => {
        setStatus('Deep-clean minigame ready.');
        router.push({ pathname: '/minigames/[id]', params: { id: 'run-cleanup', variant: 'long', room: 'bathroom' } });
      },
    },
  ];

  const secondaryActions: RoomAction[] = [];

  return (
    <RoomScene
      title="BATHROOM"
      subtitle="CLEANSE BAY"
      roomTag="HYGIENE CONTROL"
      ambient="Use quick clean for short upkeep and deep clean for full restoration runs."
      sceneTint="rgba(20,52,82,0.2)"
      accent="#78deff"
      backgroundSource={require('../../assets/backgrounds/bathroom.png')}
      statusLine={status}
      metaProgress={{
        label: 'CLEANLINESS',
        value: hygiene,
        max: 100,
        tint: hygiene >= 70 ? '#7cffc0' : hygiene >= 35 ? '#7ee8ff' : '#53daff',
        detail: `${Math.round(hygiene)}%`,
      }}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}



