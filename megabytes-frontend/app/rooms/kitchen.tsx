import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { careAction, enterRoom, getByte } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult } from '../../services/minigameRuntime';
import { THOUGHTS } from '../../services/byteThoughts';

const QUICK_FEED_LIMIT = 5;
const QUICK_FEED_WINDOW_MS = 2 * 60 * 60 * 1000;

// Hunger-aware kitchen thoughts pulled from the FT system
function getKitchenThought(byteName: string, hunger: number): string {
  const name = byteName || 'BYTE';
  const replace = (s: string) => s.replaceAll('[ByteName]', name);

  if (hunger >= 90) {
    const lines = [
      `${name} is full and refusing further nutrient uploads right now.`,
      `${name} does not want to eat. All nutrient queues are satisfied.`,
      `${name} is well-fed and declining the snack packet.`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  if (hunger >= 70) return replace(THOUGHTS.hunger[3]); // "just finished eating, optimized and happy"
  if (hunger >= 25) {
    const mid = [THOUGHTS.hunger[1], THOUGHTS.hunger[4]];
    return replace(mid[Math.floor(Math.random() * mid.length)]);
  }
  // Critical hunger
  const crit = [THOUGHTS.hunger[0], THOUGHTS.hunger[2]];
  return replace(crit[Math.floor(Math.random() * crit.length)]);
}

export default function KitchenRoom() {
  const router = useRouter();
  const [hunger, setHunger]               = useState(0);
  const [byteName, setByteName]           = useState('BYTE');
  const [thought, setThought]             = useState('');
  const [actionLog, setActionLog]         = useState<string[]>([]);
  const [resultWindow, setResultWindow]   = useState<RoomResultWindow | null>(null);
  const [quickFeedCount, setQuickFeedCount] = useState(0);
  const [quickFeedResetAt, setQuickFeedResetAt] = useState<Date | null>(null);

  const thoughtTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hungerRef = useRef(hunger);
  const nameRef = useRef(byteName);
  hungerRef.current = hunger;
  nameRef.current = byteName;

  const pushLog = useCallback((line: string) => {
    setActionLog(prev => [line, ...prev].slice(0, 5));
  }, []);

  const isQuickFeedLocked = useCallback(() => {
    if (quickFeedResetAt && Date.now() > quickFeedResetAt.getTime()) return false;
    return quickFeedCount >= QUICK_FEED_LIMIT;
  }, [quickFeedCount, quickFeedResetAt]);

  const quickFeedsLeft = useCallback(() => {
    if (quickFeedResetAt && Date.now() > quickFeedResetAt.getTime()) return QUICK_FEED_LIMIT;
    return Math.max(0, QUICK_FEED_LIMIT - quickFeedCount);
  }, [quickFeedCount, quickFeedResetAt]);

  const loadKitchenStatus = useCallback(async () => {
    try {
      const data = await getByte();
      const b = data?.byte;
      const nextHunger = Number(b?.needs?.Hunger ?? 0);
      const clamped = Number.isFinite(nextHunger) ? Math.max(0, Math.min(100, nextHunger)) : 0;
      const name = b?.name || 'BYTE';
      setHunger(clamped);
      setByteName(name);
      setThought(getKitchenThought(name, clamped));
      if (typeof b?.quickFeedCount === 'number') setQuickFeedCount(b.quickFeedCount);
      if (b?.quickFeedResetAt) setQuickFeedResetAt(new Date(b.quickFeedResetAt));
    } catch {
      setHunger(0);
    }
  }, []);

  // Rotate thought every 60s
  const startThoughtTimer = useCallback(() => {
    if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    thoughtTimerRef.current = setInterval(() => {
      setThought(getKitchenThought(nameRef.current, hungerRef.current));
    }, 60_000);
  }, []);

  useEffect(() => {
    enterRoom('Kitchen', 1).catch(() => {});
    loadKitchenStatus().catch(() => {});
    startThoughtTimer();
    return () => {
      if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    };
  }, [loadKitchenStatus, startThoughtTimer]);

  useFocusEffect(
    useCallback(() => {
      const result = consumePendingMiniGameResult('kitchen');
      loadKitchenStatus().catch(() => {});
      if (!result) return;

      // Meal cycle completed — apply the hunger gain with grade, bypassing quick feed limit
      careAction('feed', result.grade || 'good', { mealCycle: true })
        .then((res: any) => {
          const newHunger = Number(res?.needs?.Hunger ?? hungerRef.current);
          setHunger(newHunger);
          setThought(getKitchenThought(nameRef.current, newHunger));
          pushLog(`Meal cycle complete — ${result.grade?.toUpperCase() || 'GOOD'} grade`);
        })
        .catch(() => {
          pushLog('Meal cycle returned but sync failed');
        });

      setResultWindow({
        title: `MEAL CYCLE — ${(result.grade || 'good').toUpperCase()}`,
        body: result.summary || 'Full meal cycle complete. Nutrient levels updated.',
        byteBits: result.byteBits,
        skillGain: result.skillGain,
        energyCost: result.energyCost,
        cooldownSeconds: result.cooldownSeconds,
      });
    }, [loadKitchenStatus, pushLog])
  );

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'feed-short',
      title: 'QUICK FEED',
      subtitle: hunger >= 90
        ? 'Byte is full'
        : isQuickFeedLocked()
        ? 'Limit reached'
        : `${quickFeedsLeft()} use${quickFeedsLeft() === 1 ? '' : 's'} left`,
      icon: 'restaurant-outline',
      color: '#ffca58',
      disabled: hunger >= 90 || isQuickFeedLocked(),
      programLabel: 'Running nutrient upload...',
      programMs: 1350,
      onPress: () => {
        careAction('feed')
          .then((result: any) => {
            if (result?.blocked) {
              const msg = result.reason === 'not_hungry'
                ? 'Byte refused — not hungry right now.'
                : 'Quick feed limit reached. Try again later.';
              pushLog(msg);
              setThought(getKitchenThought(nameRef.current, hungerRef.current));
              return;
            }
            const newHunger = Number(result?.needs?.Hunger ?? hungerRef.current);
            setHunger(newHunger);
            if (typeof result?.quickFeedCount === 'number') setQuickFeedCount(result.quickFeedCount);
            if (result?.quickFeedResetAt) setQuickFeedResetAt(new Date(result.quickFeedResetAt));
            setThought(getKitchenThought(nameRef.current, newHunger));
            pushLog(`Nutrient upload complete — Hunger ${Math.round(newHunger)}%`);
            setResultWindow({
              title: 'NUTRIENT UPLOAD COMPLETE',
              body: 'Quick-feed applied. Lightweight hunger recovery registered.',
              byteBits: Number(result?.earned || 0),
            });
          })
          .catch(() => {
            pushLog('Nutrient upload failed. Retry in a moment.');
          });
      },
    },
    {
      key: 'meal-long',
      title: 'MEAL CYCLE',
      subtitle: 'Full meal minigame',
      icon: 'fast-food-outline',
      color: '#ffa24b',
      disabled: false,
      onPress: () => {
        pushLog('Meal cycle initiated...');
        router.push({ pathname: '/minigames/[id]', params: { id: 'feed-upload', variant: 'long', room: 'kitchen' } });
      },
    },
  ];

  const statusLine = thought || `${byteName} is checking the nutrient queue.`;

  return (
    <RoomScene
      title="KITCHEN"
      subtitle="NUTRIENT PREP"
      roomTag="FEED PROTOCOLS"
      ambient="Choose a fast nutrient burst or run a full meal cycle for deeper recovery."
      sceneTint="rgba(80,48,20,0.18)"
      accent="#ffc36a"
      backgroundSource={require('../../assets/backgrounds/kitchenroom.jpg')}
      compactHeader={true}
      statusLine={statusLine}
      actionLogLines={actionLog}
      metaProgress={{
        label: 'FULLNESS',
        value: hunger,
        max: 100,
        tint: hunger >= 70 ? '#7cffc0' : hunger >= 35 ? '#ffd86f' : '#ff9a72',
        detail: `${Math.round(hunger)}%`,
      }}
      primaryActions={primaryActions}
      secondaryActions={[]}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}
