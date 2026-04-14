import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { enterRoom, interactByte } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function PlayRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Play room loaded. Engagement routines ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);

  useEffect(() => {
    enterRoom('Play_Room', 1).catch(() => {});
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('play-room');
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
      key: 'play-short',
      title: 'QUICK PLAY',
      subtitle: 'Quick engagement program',
      icon: 'game-controller-outline',
      color: '#ff93e2',
      disabled: false,
      programLabel: 'Running engagement simulation...',
      programMs: 1300,
      onPress: () => {
        setStatus('Engagement pulse complete. Quick fun boost applied.');
        interactByte()
          .then(() => {
            setResultWindow({
              title: 'ENGAGEMENT COMPLETE',
              body: 'Quick engagement program ran successfully. Mood and fun nudged upward.',
            });
          })
          .catch(() => {
            setResultWindow({
              title: 'ENGAGEMENT INCOMPLETE',
              body: 'Engagement program failed to sync. Try again in a moment.',
            });
          });
      },
    },
    {
      key: 'play-long',
      title: 'PLAY SESSION',
      subtitle: 'Launch play minigame',
      icon: 'sync-outline',
      color: '#8ebdff',
      disabled: false,
      onPress: () => {
        setStatus('Play-session minigame ready.');
        router.push({ pathname: '/minigames/[id]', params: { id: 'engage-simulation', variant: 'long', room: 'play-room' } });
      },
    },
  ];

  const secondaryActions: RoomAction[] = [];

  return (
    <RoomScene
      title="PLAY ROOM"
      subtitle="ENGAGEMENT SPACE"
      roomTag="MOOD SUPPORT"
      ambient="Use quick play bursts or long sessions to maintain mood and bonding momentum."
      sceneTint="rgba(66,26,70,0.22)"
      accent="#ff8ed2"
      statusLine={status}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}



