import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { enterRoom, getByte, trainStat } from '../../services/api';
import RoomScene, { RoomAction, RoomResultWindow } from '../../components/RoomScene';
import { consumePendingMiniGameResult, getTrainingCooldownRemainingMs, getTrainingFatigue, recordTrainingUsage } from '../../services/minigameRuntime';

// v1 lifespan-stage gate: training is only available to teen + adult.
// Baby and child are too young; elder bytes have stopped training.
type LifespanStage = 'baby' | 'child' | 'teen' | 'adult' | 'elder';
const TRAINING_AVAILABLE_STAGES: LifespanStage[] = ['teen', 'adult'];

export default function TrainingCenterRoom() {
  const router = useRouter();
  const [status, setStatus] = useState('Training center online. Drill systems ready.');
  const [statsMatrix, setStatsMatrix] = useState<{ label: string; value: number }[]>([]);
  const [resultWindow, setResultWindow] = useState<RoomResultWindow | null>(null);
  const [timerLine, setTimerLine] = useState<string | null>(null);
  const [bandwidth, setBandwidth] = useState(0);
  const [lifespanStage, setLifespanStage] = useState<LifespanStage>('adult');

  const loadStats = React.useCallback(async () => {
    try {
      const data = await getByte();
      const stats = data?.byte?.stats || {};
      const needs = data?.byte?.needs || {};
      setBandwidth(Math.max(0, Number(needs.Bandwidth || 0)));
      setLifespanStage(((data?.byte?.lifespanStage as LifespanStage) || 'adult'));
      setStatsMatrix([
        { label: 'POWER', value: Number(stats.Power || 0) },
        { label: 'SPEED', value: Number(stats.Speed || 0) },
        { label: 'ACCURACY', value: Number(stats.Accuracy || 0) },
        { label: 'DEFENSE', value: Number(stats.Defense || 0) },
        { label: 'SPECIAL', value: Number(stats.Special || 0) },
        { label: 'STAMINA', value: Number(stats.Stamina || 0) },
      ]);
    } catch {}
  }, []);

  useEffect(() => {
    enterRoom('Training_Center', 1).catch(() => {});
    loadStats().catch(() => {});
    const statsTicker = setInterval(() => {
      loadStats().catch(() => {});
    }, 15000);
    const cooldownTicker = setInterval(() => {
      const remainMs = getTrainingCooldownRemainingMs();
      const fatigue = getTrainingFatigue();
      const simulatedEnergy = Math.max(0, Math.round(Math.max(0, bandwidth - fatigue)));
      if (remainMs > 0) {
        const secondsLeft = Math.ceil(remainMs / 1000);
        setTimerLine(`Cooldown ${secondsLeft}s | Energy ${simulatedEnergy}%`);
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
      loadStats().catch(() => {});
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
    }, [loadStats])
  );

  const launchTrainingGame = React.useCallback(async (id: string, label: string) => {
    // Lifespan stage gate
    if (!TRAINING_AVAILABLE_STAGES.includes(lifespanStage)) {
      if (lifespanStage === 'baby' || lifespanStage === 'child') {
        setStatus('Byte is too young for training. Wait until it grows up a bit.');
      } else if (lifespanStage === 'elder') {
        setStatus('Byte is too old for training. Let it rest and enjoy its remaining time.');
      } else {
        setStatus('Training unavailable at this lifespan stage.');
      }
      return;
    }

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
      setStatus('Byte energy too low for training. Let it rest or use an energy item.');
      return;
    }
    setStatus(`Launching ${label.toUpperCase()} training protocol...`);
    router.push({ pathname: '/minigames/[id]', params: { id, variant: 'long', room: 'training-center' } });
  }, [bandwidth, lifespanStage, router]);

  const primaryActions: RoomAction[] = [
    {
      key: 'training-power',
      title: 'POWER',
      subtitle: 'Tap & impact training',
      icon: 'barbell-outline',
      color: '#d3a3ff',
      disabled: false,
      onPress: () => launchTrainingGame('training-power', 'power').catch(() => {}),
    },
    {
      key: 'training-agility',
      title: 'AGILITY',
      subtitle: 'Quick reaction training',
      icon: 'flash-outline',
      color: '#8ce6ff',
      disabled: false,
      onPress: () => launchTrainingGame('training-agility', 'agility').catch(() => {}),
    },
  ];

  const secondaryActions: RoomAction[] = [
    {
      key: 'training-accuracy',
      title: 'ACCURACY',
      subtitle: 'Timing precision',
      icon: 'locate-outline',
      color: '#ffe08b',
      disabled: false,
      onPress: () => launchTrainingGame('training-accuracy', 'accuracy').catch(() => {}),
    },
    {
      key: 'training-defense',
      title: 'DEFENSE',
      subtitle: 'Fragment merging',
      icon: 'shield-checkmark-outline',
      color: '#9df4a6',
      disabled: false,
      onPress: () => launchTrainingGame('training-defense', 'defense').catch(() => {}),
    },
    {
      key: 'training-special',
      title: 'SPECIAL',
      subtitle: 'Pattern solving',
      icon: 'sparkles-outline',
      color: '#9fb0ff',
      disabled: false,
      onPress: () => launchTrainingGame('training-special', 'special').catch(() => {}),
    },
    {
      key: 'training-stamina',
      title: 'STAMINA',
      subtitle: 'Rapid tap endurance',
      icon: 'heart-outline',
      color: '#ffb88a',
      disabled: false,
      onPress: () => launchTrainingGame('training-stamina', 'stamina').catch(() => {}),
    },
    // TRAINING BATTLE removed — routes to battle screen which is [EXPANSION 1].
  ];

  return (
    <RoomScene
      title="TRAINING CENTER"
      subtitle="STAT DEVELOPMENT"
      roomTag="GROWTH"
      ambient="Select a stat to begin training. Each drill shapes how your byte develops — physically and behaviorally."
      sceneTint="rgba(52,26,60,0.2)"
      accent="#d893ff"
      statusLine={status}
      timerLine={timerLine}
      statsMatrix={statsMatrix}
      primaryActions={[primaryActions[0], primaryActions[1]]}
      secondaryActions={secondaryActions}
      backgroundSource={require('../../assets/backgrounds/battleground.jpg')}
      uniformGrid={true}
      hidePet={true}
      compactHeader={true}
      resultWindow={resultWindow}
      onDismissResultWindow={() => setResultWindow(null)}
      onExit={() => router.replace('/(tabs)')}
    />
  );
}


