import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function BathroomRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Bathroom diagnostics online. Remove corruption residue.');
  useEffect(() => {
    enterRoom('Bathroom', 1).catch(() => {});
  }, []);


  const runClean = useCallback(async (name: string, hygiene: number, extra = '') => {
    setStatus(`${name} cycle running...`);
    try {
      await careAction('clean');
    } catch {}

    setStatus(`${name} complete. Hygiene +${hygiene}.${extra}`);
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'clean',
      title: 'CLEAN',
      subtitle: 'Hygiene +30',
      icon: 'water-outline',
      color: '#53daff',
      onPress: () => runClean('Clean', 30),
    },
    {
      key: 'deep-clean',
      title: 'DEEP CLEAN',
      subtitle: 'Hygiene +50',
      icon: 'sparkles-outline',
      color: '#8ce9ff',
      onPress: () => runClean('Deep Clean', 50, ' cleanse.sys applied'),
    },
    {
      key: 'quick-wash',
      title: 'QUICK WASH',
      subtitle: 'Hygiene +15',
      icon: 'flash-outline',
      color: '#7cb7ff',
      onPress: () => runClean('Quick Wash', 15, ' Speed +1 demo boost'),
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
      title="BATHROOM"
      subtitle="CLEANSE BAY"
      roomTag="HYGIENE CONTROL"
      ambient="Corruption traces are easier to clear here. Delayed cleanup tends to drag mood and behavior metrics." 
      sceneTint="rgba(20,52,82,0.2)"
      accent="#78deff"
      statusLine={status}
      actions={actions}
    />
  );
}

