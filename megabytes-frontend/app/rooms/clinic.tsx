import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, clinicRepair, enterRoom, getByte } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

const DEEP_PURGE_SECONDS = 90;
const STABILIZE_SECONDS = 30;

export default function ClinicRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Clinic scan active. Stabilization options available.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [corruption, setCorruption] = useState(0);
  const [corruptionTier, setCorruptionTier] = useState('none');

  const loadClinicStatus = useCallback(async () => {
    try {
      const data = await getByte();
      const nextValue = Number(data?.byte?.corruption ?? 0);
      setCorruption(Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0);
      setCorruptionTier(String(data?.corruptionTier || 'none').toUpperCase());
    } catch {
      setCorruption(0);
      setCorruptionTier('NONE');
    }
  }, []);

  useEffect(() => {
    enterRoom('Clinic', 1).catch(() => {});
    loadClinicStatus().catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadClinicStatus]);

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

    await loadClinicStatus().catch(() => {});
    setStatus(doneText);
    setBusy(false);
  }, [busy, loadClinicStatus]);

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'stabilize-short',
      title: 'STABILIZE',
      subtitle: 'Quick recovery pass',
      icon: 'medkit-outline',
      color: '#7cffc0',
      sceneEffect: 'stabilize',
      disabled: busy,
      onPress: () => runTimed('Stabilize', STABILIZE_SECONDS, () => careAction('rest'), 'Stabilize complete. Recovery profile improved.'),
    },
    {
      key: 'purge-long',
      title: 'DEEP PURGE',
      subtitle: `${DEEP_PURGE_SECONDS}s repair cycle`,
      icon: 'build-outline',
      color: '#79d2ff',
      sceneEffect: 'purge',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Deep Purge',
          DEEP_PURGE_SECONDS,
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
      metaProgress={{
        label: 'CORRUPTION',
        value: corruption,
        max: 100,
        tint: corruption >= 70 ? '#ff728f' : corruption >= 35 ? '#ffd86f' : '#7cffc0',
        detail: corruptionTier,
      }}
      primaryActions={primaryActions}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}
