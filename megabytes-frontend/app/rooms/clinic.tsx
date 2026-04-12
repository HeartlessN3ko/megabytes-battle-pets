import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function ClinicRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Clinic scan active. Stabilization options available.');
  useEffect(() => {
    enterRoom('Clinic', 1).catch(() => {});
  }, []);


  const runRecovery = useCallback(async (name: string, action: 'clean' | 'rest') => {
    setStatus(`${name} routine running...`);
    try {
      await careAction(action);
    } catch {}
    setStatus(`${name} complete. Recovery data synced.`);
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'stabilize',
      title: 'STABILIZE',
      subtitle: 'Bandwidth and mood support',
      icon: 'medkit-outline',
      color: '#7cffc0',
      onPress: () => runRecovery('Stabilize', 'rest'),
    },
    {
      key: 'patch',
      title: 'PATCH CLEANSE',
      subtitle: 'Hygiene and corruption care',
      icon: 'build-outline',
      color: '#79d2ff',
      onPress: () => runRecovery('Patch Cleanse', 'clean'),
    },
    {
      key: 'diagnostics',
      title: 'DIAGNOSTICS',
      subtitle: 'Mock clinic readout',
      icon: 'pulse-outline',
      color: '#b5a4ff',
      onPress: () => setStatus('Diagnostics complete. No critical alerts found.'),
    },
    {
      key: 'exit',
      title: 'EXIT',
      subtitle: 'Return to home',
      icon: 'arrow-back-outline',
      color: '#88b5ff',
      onPress: () => router.replace('/(tabs)'),
    },
  ];

  return (
    <RoomScene
      title="CLINIC"
      subtitle="SYSTEM RECOVERY"
      roomTag="HEALTH OVERSIGHT"
      ambient="The clinic is a support room for stabilizing rough runs. Full systems can connect item-based recovery later." 
      sceneTint="rgba(20,66,58,0.2)"
      accent="#8fffd4"
      statusLine={status}
      actions={actions}
    />
  );
}

