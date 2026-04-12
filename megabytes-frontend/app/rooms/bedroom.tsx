import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function BedroomRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Bedroom mode active. Recovery protocols ready.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Bedroom', 1).catch(() => {});
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
      key: 'nap-short',
      title: 'POWER NAP',
      subtitle: '30s quick rest',
      icon: 'bed-outline',
      color: '#8f97ff',
      disabled: busy,
      onPress: () => runTimed('Power Nap', 30, () => careAction('rest'), 'Power Nap complete. Bandwidth restored.'),
    },
    {
      key: 'sleep-long',
      title: 'SLEEP CYCLE',
      subtitle: '90s deep rest',
      icon: 'moon-outline',
      color: '#a88eff',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Sleep Cycle',
          90,
          async () => {
            await careAction('rest');
            await careAction('rest');
          },
          'Sleep Cycle complete. Major recovery and mood stabilization applied.'
        ),
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'calm',
      title: 'CALM PULSE',
      subtitle: 'Instant mood smooth',
      icon: 'pulse-outline',
      color: '#6fd4ff',
      disabled: busy,
      onPress: () => {
        if (busy) return;
        setStatus('Calm pulse complete. Mood has stabilized.');
      },
    },
  ];

  return (
    <RoomScene
      title="BEDROOM"
      subtitle="RECOVERY POD"
      roomTag="REST PROTOCOLS"
      ambient="Use short rests for quick recovery or deep cycle sleep for stronger restoration."
      sceneTint="rgba(36,28,74,0.22)"
      accent="#9f9cff"
      statusLine={status}
      timerLine={timerLine}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      onExit={() => router.replace('/(tabs)')}
      onShop={() => router.push('/(tabs)/shop')}
    />
  );
}
