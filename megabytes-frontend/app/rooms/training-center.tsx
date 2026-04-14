import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { enterRoom, getByte, trainStat } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult, getTrainingCooldownRemainingMs, getTrainingFatigue, recordTrainingUsage } from '../../services/minigameRuntime';

export default function TrainingCenterRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Training center online. Drill systems ready.');
  const [statsMatrix, setStatsMatrix] = useState<{ label: string; value: number }[]>([]);
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [bandwidth, setBandwidth] = useState(0);

  useEffect(() => {
    enterRoom('Training_Center', 1).catch(() => {});
    const loadStats = async () => {
      try {
        const data = await getByte();
        const stats = data?.byte?.stats || {};
        const needs = data?.byte?.needs || {};
        const speed = Number(stats.Speed || 0);
        setBandwidth(Math.max(0, Number(needs.Bandwidth || 0)));
        setStatsMatrix([
          { label: 'POWER', value: Number(stats.Power || 0) },
          { label: 'AGILITY', value: speed },
          { label: 'ACCURACY', value: Number(stats.Accuracy || 0) },
          { label: 'DEFENSE', value: Number(stats.Defense || 0) },
          { label: 'SPECIAL', value: Number(stats.Special || 0) },
          { label: 'STAMINA', value: Number(stats.Stamina || 0) },
          { label: 'SPEED', value: speed },
        ]);
      } catch {}
    };
    loadStats().catch(() => {});
    const statsTicker = setInterval(() => {
      loadStats().catch(() => {});
    }, 15000);
    const cooldownTicker = setInterval(() => {
      const remainMs = getTrainingCooldownRemainingMs();
      const fatigue = getTrainingFatigue();
      const simulatedEnergy = Math.max(0, Math.round(Math.max(0, bandwidth - fatigue)));
      if (remainMs > 0) {
        setTimerLine(`Cooldown ${Math.max(0.1, remainMs / 1000).toFixed(1)}s | Energy ${simulatedEnergy}%`);
      } else {
        setTimerLine(`Energy ${simulatedEnergy}% | Training lane open`);
      }
    }, 150);
    return () => {
      clearInterval(statsTicker);
      clearInterval(cooldownTicker);
    };
  }, [bandwidth]);

  useFocusEffect(
    React.useCallback(() => {
      const result = consumePendingMiniGameResult('training-center');
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

  const launchTrainingGame = React.useCallback(async (id: string, variant: 'quick' | 'long') => {
    const remaining = getTrainingCooldownRemainingMs();
    if (remaining > 0) {
      setStatus(`Training cooldown active: ${Math.ceil(remaining / 1000)}s remaining.`);
      return;
    }
    let liveBandwidth = bandwidth;
    try {
      const data = await getByte();
      liveBandwidth = Math.max(0, Number(data?.byte?.needs?.Bandwidth || bandwidth));
      setBandwidth(liveBandwidth);
    } catch {}

    const fatigue = getTrainingFatigue();
    const usableEnergy = Math.max(0, Math.round(liveBandwidth - fatigue));
    if (usableEnergy < 12) {
      setStatus('Byte energy too low for training. Rest in bedroom or use an energy item.');
      return;
    }
    setStatus(`Running ${id.replace('training-', '').toUpperCase()} training program...`);
    router.push({ pathname: '/minigames/[id]', params: { id, variant, room: 'training-center' } });
  }, [bandwidth, router]);

  const executeQuickTraining = React.useCallback(async (stat: string, label: string) => {
    const remaining = getTrainingCooldownRemainingMs();
    if (remaining > 0) {
      setStatus(`Training cooldown active: ${Math.ceil(remaining / 1000)}s remaining.`);
      return;
    }
    try {
      const result = await trainStat(stat, 'fail');
      recordTrainingUsage(12, 10000);
      setBandwidth(Math.max(0, Number(result?.needs?.Bandwidth || bandwidth)));
      setStatus(`${label} quick program completed.`);
      setResultWindow({
        title: `${label.toUpperCase()} COMPLETE`,
        body: 'Quick drill executed successfully. This is a light pass compared with the full protocol.',
        skillGain: `${stat} +${Math.max(1, Number(result?.gain || 1))}`,
        energyCost: 12,
        cooldownSeconds: 10,
      });
    } catch (err: any) {
      setResultWindow({
        title: `${label.toUpperCase()} INCOMPLETE`,
        body: err?.message || 'Quick drill failed to sync. Rest and try again.',
      });
    }
  }, [bandwidth]);

  const primaryActions: [RoomAction, RoomAction] = [
    {
      key: 'drill-short',
      title: 'QUICK DRILL',
      subtitle: 'Fast low-yield program',
      icon: 'barbell-outline',
      color: '#d48fff',
      disabled: false,
      programLabel: 'Running power drill program...',
      programMs: 1200,
      onPress: () => {
        executeQuickTraining('Power', 'Power drill').catch(() => {});
      },
    },
    {
      key: 'drill-long',
      title: 'FULL PROTOCOL',
      subtitle: 'Launch training minigame',
      icon: 'fitness-outline',
      color: '#ff9be8',
      disabled: false,
      onPress: () => {
        launchTrainingGame('training-power', 'long').catch(() => {});
      },
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'training-agility',
      title: 'AGILITY',
      subtitle: 'Quick program',
      icon: 'flash-outline',
      color: '#8fe8ff',
      disabled: false,
      programLabel: 'Running agility drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Agility', 'Agility drill').catch(() => {}),
    },
    {
      key: 'training-accuracy',
      title: 'ACCURACY',
      subtitle: 'Quick program',
      icon: 'locate-outline',
      color: '#ffe294',
      disabled: false,
      programLabel: 'Running accuracy drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Accuracy', 'Accuracy drill').catch(() => {}),
    },
    {
      key: 'training-defense',
      title: 'DEFENSE',
      subtitle: 'Quick program',
      icon: 'shield-checkmark-outline',
      color: '#93f0a8',
      disabled: false,
      programLabel: 'Running defense drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Defense', 'Defense drill').catch(() => {}),
    },
    {
      key: 'training-special',
      title: 'SPECIAL',
      subtitle: 'Quick program',
      icon: 'sparkles-outline',
      color: '#9ab0ff',
      disabled: false,
      programLabel: 'Running special drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Special', 'Special drill').catch(() => {}),
    },
    {
      key: 'training-stamina',
      title: 'STAMINA',
      subtitle: 'Quick program',
      icon: 'heart-outline',
      color: '#ffbc8f',
      disabled: false,
      programLabel: 'Running stamina drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Stamina', 'Stamina drill').catch(() => {}),
    },
    {
      key: 'training-speed',
      title: 'SPEED',
      subtitle: 'Quick program',
      icon: 'speedometer-outline',
      color: '#8ed8ff',
      disabled: false,
      programLabel: 'Running speed drill program...',
      programMs: 1100,
      onPress: () => executeQuickTraining('Speed', 'Speed drill').catch(() => {}),
    },
    {
      key: 'training-battle',
      title: 'TRAINING BATTLE',
      subtitle: 'Run simulated combat test',
      icon: 'flash-outline',
      color: '#8fd8ff',
      disabled: false,
      onPress: () => {
        setStatus('Launching training battle simulation...');
        router.push('/(tabs)/battle');
      },
    },
  ];

  return (
    <RoomScene
      title="TRAINING CENTER"
      subtitle="COMBAT PREP"
      roomTag="STAT DEVELOPMENT"
      ambient="Short drills are fast and efficient. Full protocols produce stronger long-term gains."
      sceneTint="rgba(52,26,60,0.2)"
      accent="#d893ff"
      statusLine={status}
      timerLine={timerLine}
      statsMatrix={statsMatrix}
      primaryActions={primaryActions}
      secondaryActions={secondaryActions}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}


