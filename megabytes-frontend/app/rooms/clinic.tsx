import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, clinicRepair, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';
import { isDemoModeActive, toDemoSeconds } from '../../services/demoSession';

const DEEP_PURGE_SECONDS = () => isDemoModeActive() ? 15 : 90;

export default function ClinicRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Clinic scan active. Stabilization options available.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Clinic', 1).catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const runTimed = useCallback(async (label: string, seconds: number, work: () => Promise<void>, doneText: string) => {
    if (busy) return;
    setBusy(true);
    setStatus(`Executing ${label} program task.`);
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
      key: 'stabilize-short',
      title: 'STABILIZE',
      subtitle: `${toDemoSeconds(30)}s recovery pass`,
      icon: 'medkit-outline',
      color: '#7cffc0',
      disabled: busy,
      onPress: () => runTimed('Stabilize', toDemoSeconds(30), () => careAction('rest'), 'Stabilize complete. Recovery profile improved.'),
    },
    {
      key: 'purge-long',
      title: 'DEEP PURGE',
      subtitle: `${DEEP_PURGE_SECONDS()}s repair cycle`,
      icon: 'build-outline',
      color: '#79d2ff',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Deep Purge',
          DEEP_PURGE_SECONDS(),
          async () => { await clinicRepair(); },
          'Deep Purge complete. Corruption reduced.'
        ),
    },
  ];

  return (
    <RoomScene
      title="CLINIC"
      subtitle="SYSTEM RECOVERY"
      roomTag="HEALTH OVERSIGHT"
      ambient="Use clinic passes to stabilize rough cycles and recover from intense care loops."
      sceneTint="rgba(20,66,58,0.2)"
      accent="#8fffd4"
      statusLine={status}
      timerLine={timerLine}
      primaryActions={primaryActions}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}


