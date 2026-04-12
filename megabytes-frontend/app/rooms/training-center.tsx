import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { enterRoom, trainStat } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function TrainingCenterRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Training center online. Drill systems ready.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Training_Center', 1).catch(() => {});
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
      key: 'drill-short',
      title: 'QUICK DRILL',
      subtitle: '30s focused stat gain',
      icon: 'barbell-outline',
      color: '#d48fff',
      disabled: busy,
      onPress: () => runTimed('Quick Drill', 30, () => trainStat('Power', 'good'), 'Quick Drill complete. Power improved.'),
    },
    {
      key: 'drill-long',
      title: 'FULL PROTOCOL',
      subtitle: '90s intensive set',
      icon: 'fitness-outline',
      color: '#ff9be8',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Full Protocol',
          90,
          async () => {
            await trainStat('Power', 'good');
            await trainStat('Defense', 'good');
          },
          'Full Protocol complete. Power and defense updated.'
        ),
    },
  ];

  return (
    <RoomScene
      title="TRAINING CENTER"
      subtitle="COMBAT PREP"
      roomTag="STAT DEVELOPMENT"
      ambient="Short drills are fast and efficient. Full protocols produce stronger long-term gains."
      sceneTint="rgba(52,26,60,0.2)"
      accent="#d893ff"
      statusLine={status}
      timerLine={timerLine}
      primaryActions={primaryActions}
      onExit={() => router.replace('/(tabs)')}
      onShop={() => router.push('/(tabs)/shop')}
    />
  );
}
