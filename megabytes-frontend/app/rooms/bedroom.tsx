import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function BedroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bedroom mode active. Recovery protocols ready.');
  useEffect(() => {
    enterRoom('Bedroom', 1).catch(() => {});
  }, []);


  const runRest = useCallback(async (name: string, bandwidth: number, mood: number) => {
    setStatus(`${name} initiated...`);
    try {
      await careAction('rest');
    } catch {}
    setStatus(`${name} complete. Bandwidth +${bandwidth}, Mood +${mood}.`);
  }, []);

  const runCalm = useCallback(() => {
    setStatus('Calm pulse completed. Mood +20 demo effect.');
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'rest',
      title: 'REST',
      subtitle: 'Bandwidth +40',
      icon: 'bed-outline',
      color: '#8f97ff',
      onPress: () => runRest('Rest', 40, 5),
    },
    {
      key: 'sleep',
      title: 'SLEEP',
      subtitle: 'Bandwidth +70',
      icon: 'moon-outline',
      color: '#a88eff',
      onPress: () => runRest('Sleep', 70, 10),
    },
    {
      key: 'calm',
      title: 'CALM',
      subtitle: 'Mood +20',
      icon: 'pulse-outline',
      color: '#6fd4ff',
      onPress: runCalm,
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
      title="BEDROOM"
      subtitle="RECOVERY POD"
      roomTag="REST AND MOOD"
      ambient="Long rest stabilizes performance. Calm actions help recover mood after intense care and training loops." 
      sceneTint="rgba(36,28,74,0.22)"
      accent="#9f9cff"
      statusLine={status}
      actions={actions}
    />
  );
}

