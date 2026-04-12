import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function KitchenRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Kitchen ready. Select a feed routine.');
  useEffect(() => {
    enterRoom('Kitchen', 1).catch(() => {});
  }, []);


  const runFeed = useCallback(async (name: string, hunger: number, mood: number, stamina = 0) => {
    setStatus(`${name} in progress...`);
    try {
      await careAction('feed');
    } catch {}

    const staminaText = stamina ? ` Stamina +${stamina}.` : '';
    setStatus(`${name} complete. Hunger +${hunger}, Mood +${mood}.${staminaText}`);
  }, []);

  const actions: RoomAction[] = [
    {
      key: 'feed',
      title: 'FEED',
      subtitle: 'Hunger +30',
      icon: 'restaurant-outline',
      color: '#ffca58',
      onPress: () => runFeed('Feed', 30, 5),
    },
    {
      key: 'meal',
      title: 'MEAL',
      subtitle: 'Hunger +50',
      icon: 'fast-food-outline',
      color: '#ffa24b',
      onPress: () => runFeed('Meal', 50, 0, 2),
    },
    {
      key: 'snack',
      title: 'SNACK',
      subtitle: 'Hunger +15 Mood +10',
      icon: 'ice-cream-outline',
      color: '#ffd67a',
      onPress: () => runFeed('Snack', 15, 10),
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
      title="KITCHEN"
      subtitle="NUTRIENT PREP"
      roomTag="FEED MINIGAMES"
      ambient="Packets are queued for Byte intake. Better feeding cadence improves consistency and mood." 
      sceneTint="rgba(80,48,20,0.18)"
      accent="#ffc36a"
      statusLine={status}
      actions={actions}
    />
  );
}

