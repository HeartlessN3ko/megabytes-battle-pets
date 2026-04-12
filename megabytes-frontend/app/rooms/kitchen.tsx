import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { careAction, enterRoom } from '../../services/api';
import RoomScene, { RoomAction } from '../../components/RoomScene';

export default function KitchenRoom() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState('Kitchen ready. Nutrient queues are online.');
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    enterRoom('Kitchen', 1).catch(() => {});
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
      key: 'feed-short',
      title: 'QUICK FEED',
      subtitle: '30s nutrient upload',
      icon: 'restaurant-outline',
      color: '#ffca58',
      disabled: busy,
      onPress: () => runTimed('Quick Feed', 30, () => careAction('feed'), 'Quick Feed complete. Hunger restored.'),
    },
    {
      key: 'meal-long',
      title: 'MEAL CYCLE',
      subtitle: '90s full meal prep',
      icon: 'fast-food-outline',
      color: '#ffa24b',
      disabled: busy,
      onPress: () =>
        runTimed(
          'Meal Cycle',
          90,
          async () => {
            await careAction('feed');
            await careAction('feed');
          },
          'Meal Cycle complete. Hunger and stamina profile boosted.'
        ),
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'snack',
      title: 'SNACK',
      subtitle: 'Instant mood snack',
      icon: 'ice-cream-outline',
      color: '#ffd67a',
      disabled: busy,
      onPress: async () => {
        if (busy) return;
        try {
          await careAction('feed');
        } catch {}
        setStatus('Snack delivered. Mood and hunger nudged upward.');
      },
    },
  ];

  return (
    <RoomScene
      title="KITCHEN"
      subtitle="NUTRIENT PREP"
      roomTag="FEED PROTOCOLS"
      ambient="Choose a fast nutrient burst or a full cycle meal for deeper recovery."
      sceneTint="rgba(80,48,20,0.18)"
      accent="#ffc36a"
      statusLine={status}
      timerLine={timerLine}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      onExit={() => router.replace('/(tabs)')}
      onShop={() => router.push('/(tabs)/shop')}
    />
  );
}
