import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { enterRoom, interactByte } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function PlayRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Play room loaded. Engagement routines ready.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Play_Room', 1).catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const runTimed = useCallback(async (label: string, seconds: number, work: () => Promise<void>, doneText: string) => {
    if (busy) return;
    setBusy(true);
    setStatus(`${label} started.`);
    let remaining = seconds;
    setTimerLine(`${label}: ${remaining}s remaining`);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) setTimerLine(`${label}: ${remaining}s remaining`);
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTimerLine(null);

    try {
      await work();
    } catch {}

    setStatus(doneText);
    setBusy(false);
  }, [busy]);

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'play-short',
      title: 'QUICK PLAY',
      subtitle: '30s mood boost',
      icon: 'game-controller-outline',
      color: '#ff93e2',
      disabled: busy,
      onPress: () => runTimed('Quick Play', 30, () => interactByte(), 'Quick Play complete. Mood and social drive improved.'),
    },
    {
      key: 'play-long',
      title: 'PLAY SESSION',
      subtitle: '90s full engagement',
      icon: 'sync-outline',
      color: '#8ebdff',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Play Session',
          90,
          async () => {
            await interactByte();
            await interactByte();
          },
          'Play Session complete. Byte is energized and socially engaged.'
        ),
    },
  ];

  return (
    <RoomScene
      title="PLAY ROOM"
      subtitle="ENGAGEMENT SPACE"
      roomTag="MOOD SUPPORT"
      ambient="Use quick play bursts or long sessions to maintain mood and bonding momentum."
      sceneTint="rgba(66,26,70,0.22)"
      accent="#ff8ed2"
      statusLine={status}
      timerLine={timerLine}
      primaryActions={primaryActions}
      onExit={() => router.replace('/(tabs)')}
      onShop={() => router.push('/(tabs)/shop')}
    />
  );
}

