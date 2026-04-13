import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';
import { markHomeClutterCleared } from '../../services/homeRuntimeState';

export default function BathroomRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Bathroom diagnostics online. Hygiene bay is ready.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Bathroom', 1).catch(() => {});
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
      key: 'clean-short',
      title: 'CLEAN SWEEP',
      subtitle: '30s quick clean',
      icon: 'water-outline',
      color: '#53daff',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Clean Sweep',
          30,
          async () => {
            await careAction('clean');
            markHomeClutterCleared();
          },
          'Clean Sweep complete. Hygiene improved and clutter cleared.'
        ),
    },
    {
      key: 'clean-long',
      title: 'DEEP CLEAN',
      subtitle: '60s intensive clean',
      icon: 'sparkles-outline',
      color: '#8ce9ff',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Deep Clean',
          60,
          async () => {
            await careAction('clean');
            await careAction('clean');
            markHomeClutterCleared();
          },
          'Deep Clean complete. Hygiene up, corruption pressure reduced.'
        ),
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'polish',
      title: 'POLISH',
      subtitle: 'Instant mood polish',
      icon: 'color-wand-outline',
      color: '#8fb8ff',
      disabled: busy,
      onPress: async () => {
        if (busy) return;
        setStatus('Polish routine complete. Byte looks refreshed.');
      },
    },
  ];

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
      timerLine={timerLine}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      onExit={() => router.replace('/(tabs)')}
      onShop={() => router.push('/(tabs)/shop')}
    />
  );
}

