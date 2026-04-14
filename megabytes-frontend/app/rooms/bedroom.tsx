import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function BedroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bedroom mode active. Recovery protocols ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);

  useEffect(() => {
    enterRoom('Bedroom', 1).catch(() => {});
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('bedroom');
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
      key: 'nap-short',
      title: 'POWER NAP',
      subtitle: 'Quick rest program',
      icon: 'bed-outline',
      color: '#8f97ff',
      disabled: false,
      programLabel: 'Running stabilization program...',
      programMs: 1400,
      onPress: () => {
        setStatus('Stabilization pass complete. Quick rest applied.');
        careAction('rest')
          .then((result) => {
            setResultWindow({
              title: 'STABILIZATION COMPLETE',
              body: 'Quick stabilization program ran successfully. Byte recovered a little bandwidth and mood.',
              byteBits: Number(result?.earned || 0),
            });
          })
          .catch(() => {
            setResultWindow({
              title: 'STABILIZATION INCOMPLETE',
              body: 'Rest program failed to sync. Try again in a moment.',
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
    <RoomScene
      title="BEDROOM"
      subtitle="RECOVERY POD"
      roomTag="REST PROTOCOLS"
      ambient="Use short rests for quick recovery or deep cycle sleep for stronger restoration."
      sceneTint="rgba(36,28,74,0.22)"
      accent="#9f9cff"
      backgroundSource={require('../../assets/backgrounds/bedroom.png')}
      statusLine={status}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}


