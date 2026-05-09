import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { enterRoom, getByte } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';
import { TUNABLES } from '../../config/tunables';

export default function ArcadeRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Arcade booted. Pick a game to play with your byte.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [mood, setMood] = useState(0);
  const [bitsToday, setBitsToday] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await getByte();
      const nextMood = Number(data?.byte?.needs?.Mood ?? 0);
      setMood(Number.isFinite(nextMood) ? Math.max(0, Math.min(100, nextMood)) : 0);
      const today = Number(data?.byte?.arcadeBitsEarnedToday || 0);
      setBitsToday(Number.isFinite(today) ? Math.max(0, today) : 0);
    } catch {
      // leave previous values in place
    }
  }, []);

  useEffect(() => {
    enterRoom('Arcade', 1).catch(() => {});
    refresh().catch(() => {});
  }, [refresh]);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('arcade');
      refresh().catch(() => {});
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
    }, [refresh])
  );

  const launch = (id: string) =>
    router.push({ pathname: '/minigames/[id]', params: { id, variant: 'long', room: 'arcade' } });

  // 2 primary cards (Connect 4 + RPS — the two pre-built / port-from-existing flows)
  // and 3 secondary cards. RoomScene primary slot is a fixed 2-tuple.
  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'arcade-connect4',
      title: 'CONNECT 4',
      subtitle: 'Drop discs, win the line',
      icon: 'apps-outline',
      color: '#ff7a7a',
      disabled: false,
      onPress: () => launch('arcade-connect4'),
    },
    {
      key: 'arcade-rps',
      title: 'RPS',
      subtitle: 'Rock · Paper · Scissors',
      icon: 'hand-left-outline',
      color: '#d3a3ff',
      disabled: false,
      onPress: () => launch('arcade-rps'),
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'arcade-minesweeper',
      title: 'BYTE HUNT',
      subtitle: 'Find your bytes',
      icon: 'grid-outline',
      color: '#9df4a6',
      disabled: false,
      onPress: () => launch('arcade-minesweeper'),
    },
    {
      key: 'arcade-hangman',
      title: 'DECODE',
      subtitle: 'Recover the file',
      icon: 'text-outline',
      color: '#ffe08b',
      disabled: false,
      onPress: () => launch('arcade-hangman'),
    },
    {
      key: 'arcade-simon',
      title: 'ECHO',
      subtitle: 'Repeat the byte',
      icon: 'pulse-outline',
      color: '#9fb0ff',
      disabled: false,
      onPress: () => launch('arcade-simon'),
    },
  ];

  const cap = TUNABLES.arcade.DAILY_BIT_CAP;
  const ambient = `Pure entertainment surface. Plays pay mood + affection always; bits stop at ${cap}/day per byte.`;

  return (
    <RoomScene
      title="ARCADE"
      subtitle="EXTRA ACTIVITY DECK"
      roomTag={`BITS TODAY ${Math.min(bitsToday, cap)} / ${cap}`}
      ambient={ambient}
      sceneTint="rgba(28,18,68,0.22)"
      accent="#ff7a7a"
      statusLine={status}
      metaProgress={{
        label: 'MOOD',
        value: mood,
        max: 100,
        tint: mood >= 70 ? '#7cffc0' : mood >= 35 ? '#ffe08b' : '#ff8aa0',
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
