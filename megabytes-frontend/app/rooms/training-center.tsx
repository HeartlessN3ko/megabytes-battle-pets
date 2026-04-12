import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { enterRoom, trainStat } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function TrainingCenterRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Training center online. Select a drill set.');
  useEffect(() => {
    enterRoom('Training_Center', 1).catch(() => {});
  }, []);


  const runDrill = useCallback(async (label: string, stat: string) => {
    setStatus(`${label} running...`);
    try {
      await trainStat(stat, 'good');
      setStatus(`${label} complete. ${stat} training registered.`);
    } catch {
      setStatus(`${label} complete. Demo mode fallback used.`);
    }
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'power',
      title: 'POWER DRILL',
      subtitle: 'Power growth',
      icon: 'barbell-outline',
      color: '#ff7f7f',
      onPress: () => runDrill('Power Drill', 'Power'),
    },
    {
      key: 'speed',
      title: 'SPEED DRILL',
      subtitle: 'Speed growth',
      icon: 'flash-outline',
      color: '#73d7ff',
      onPress: () => runDrill('Speed Drill', 'Speed'),
    },
    {
      key: 'defense',
      title: 'DEFENSE DRILL',
      subtitle: 'Defense growth',
      icon: 'shield-outline',
      color: '#8ea8ff',
      onPress: () => runDrill('Defense Drill', 'Defense'),
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
      title="TRAINING CENTER"
      subtitle="COMBAT PREP"
      roomTag="STAT DEVELOPMENT"
      ambient="Focused drills increase combat readiness. Over-training should eventually tie into fatigue and bandwidth." 
      sceneTint="rgba(52,26,60,0.2)"
      accent="#d893ff"
      statusLine={status}
      actions={actions}
    />
  );
}

