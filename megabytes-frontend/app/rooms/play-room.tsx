import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { enterRoom, getByte, interactByte } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function PlayRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Play room loaded. Engagement routines ready.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [mood, setMood] = useState(0);

  const loadPlayRoomStatus = React.useCallback(async () => {
    try {
      const data = await getByte();
      const nextMood = Number(data?.byte?.needs?.Mood ?? 0);
      setMood(Number.isFinite(nextMood) ? Math.max(0, Math.min(100, nextMood)) : 0);
    } catch {
      setMood(0);
    }
  }, []);

  useEffect(() => {
    enterRoom('Play_Room', 1).catch(() => {});
    loadPlayRoomStatus().catch(() => {});
  }, [loadPlayRoomStatus]);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('play-room');
      loadPlayRoomStatus().catch(() => {});
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
    }, [loadPlayRoomStatus])
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
      metaProgress={{
        label: 'MOOD',
        value: mood,
        max: 100,
        tint: mood >= 70 ? '#7cffc0' : mood >= 35 ? '#ff93e2' : '#ff9cdf',
        detail: `${Math.round(mood)}%`,
      }}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}



