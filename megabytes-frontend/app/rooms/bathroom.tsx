import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function BathroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bathroom diagnostics online. Hygiene bay is ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);

  useEffect(() => {
    enterRoom('Bathroom', 1).catch(() => {});
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('bathroom');
      if (!result) return;
      setStatus(result.summary);
      setResultWindow({
        title: `${result.title} - ${result.grade.toUpperCase()}`,
        body: result.summary,
        byteBits: result.byteBits,
        skillGain: result.skillGain,
        energyCost: result.energyCost,
        cooldownSeconds: result.cooldownSeconds,
      });
    }, [])
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
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}



