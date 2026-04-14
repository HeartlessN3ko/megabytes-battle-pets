import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';

export default function KitchenRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Kitchen ready. Nutrient queues are online.');
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);

  useEffect(() => {
    enterRoom('Kitchen', 1).catch(() => {});
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('kitchen');
      if (!result) return;
      setStatus(result.summary);
      setResultWindow({
        title: `${result.title} - ${result.grade.toUpperCase()}`,
        body: result.summary,
        byteBits: result.byteBits,
        skillGain: result.skillGain,
        energyCost: result.energyCost,
        cooldownSeconds: result.cooldownSeconds,
      });
    }, [])
  );

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'feed-short',
      title: 'QUICK FEED',
      subtitle: 'Quick auto-feed',
      icon: 'restaurant-outline',
      color: '#ffca58',
      disabled: false,
      programLabel: 'Running nutrient upload program...',
      programMs: 1350,
      onPress: () => {
        setStatus('Nutrient upload finished. Quick care applied.');
        careAction('feed')
          .then((result) => {
            setResultWindow({
              title: 'NUTRIENT UPLOAD COMPLETE',
              body: 'Quick-feed program ran successfully. Lightweight hunger recovery applied.',
              byteBits: Number(result?.earned || 0),
            });
          })
          .catch(() => {
            setResultWindow({
              title: 'NUTRIENT UPLOAD INCOMPLETE',
              body: 'Quick-feed program failed to sync. Try again in a moment.',
            });
          });
      },
    },
    {
      key: 'meal-long',
      title: 'MEAL CYCLE',
      subtitle: 'Launch meal minigame',
      icon: 'fast-food-outline',
      color: '#ffa24b',
      disabled: false,
      onPress: () => {
        setStatus('Meal cycle minigame ready.');
        router.push({ pathname: '/minigames/[id]', params: { id: 'feed-upload', variant: 'long', room: 'kitchen' } });
      },
    },
  ];

  const secondaryActions: RoomAction[] = [];

  return (
    <RoomScene
      title="KITCHEN"
      subtitle="NUTRIENT PREP"
      roomTag="FEED PROTOCOLS"
      ambient="Choose a fast nutrient burst or a full cycle meal for deeper recovery."
      sceneTint="rgba(80,48,20,0.18)"
      accent="#ffc36a"
      backgroundSource={require('../../assets/backgrounds/kitchenroom.png')}
      statusLine={status}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}


