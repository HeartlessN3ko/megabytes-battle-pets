import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Dimensions, Image, ImageBackground, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvolution } from '../context/EvolutionContext';
import { useActionGate } from '../hooks/useActionGate';
import { consumeItem, getByte, getInventory, getShopItems } from '../services/api';
import { getByteMotionProfile } from '../services/byteMotion';
import { initSfx, playSfx } from '../services/sfx';
import { resolveByteSprite } from '../services/byteSprites';

const { width, height } = Dimensions.get('window');

export interface RoomAction {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  programLabel?: string;
  programMs?: number;
  sceneEffect?: 'stabilize' | 'purge' | 'default';
}

export interface RoomResultWindow {
  title: string;
  body: string;
  byteBits?: number;
  skillGain?: string | null;
  energyCost?: number;
  cooldownSeconds?: number | null;
}

export interface RoomMetaProgress {
  label: string;
  value: number;
  max?: number;
  tint?: string;
  detail?: string | null;
}

interface RoomSceneProps {
  title: string;
  subtitle: string;
  ambient: string;
  roomTag: string;
  sceneTint: string;
  accent: string;
  statusLine: string;
  timerLine?: string | null;
  metaProgress?: RoomMetaProgress | null;
  statsMatrix?: { label: string; value: number }[];
  resultWindow?: RoomResultWindow | null;
  onDismissResultWindow?: () => void;
  backgroundSource?: any;
  primaryActions: [RoomAction, RoomAction];
  secondaryActions?: RoomAction[];
  /** When true, renders all actions as a uniform 2-column grid instead of primary/secondary split */
  uniformGrid?: boolean;
  /** When true, hides the byte pet sprite (e.g. Training Center) */
  hidePet?: boolean;
  /** When true, hides the roomTag + ambient description block for cleaner layout */
  compactHeader?: boolean;
  onExit: () => void;
}

type RoomInventoryItem = {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
};

const DEBUG_LINES = Array.from({ length: 16 }, (_, idx) => idx);

export default function RoomScene({
  title,
  subtitle,
  ambient,
  roomTag,
  sceneTint,
  accent,
  statusLine,
  timerLine,
  metaProgress = null,
  statsMatrix = [],
  resultWindow = null,
  onDismissResultWindow,
  backgroundSource,
  primaryActions,
  secondaryActions = [],
  uniformGrid = false,
  hidePet = false,
  compactHeader = false,
  onExit
}: RoomSceneProps) {
  const { stage } = useEvolution();
  const { isLocked, runAction } = useActionGate(650);
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const bobY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const installProgress = useRef(new Animated.Value(0)).current;
  const processProgress = useRef(new Animated.Value(0)).current;
  const fxPulse = useRef(new Animated.Value(0.32)).current;
  const fxSweep = useRef(new Animated.Value(0)).current;
  const metaProgressAnim = useRef(new Animated.Value(0)).current;

  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<RoomInventoryItem[]>([]);
  const [byteName, setByteName] = useState('BYTE');
  const [selectedItem, setSelectedItem] = useState<RoomInventoryItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installText, setInstallText] = useState('Select a program package to execute.');
  const [installPercent, setInstallPercent] = useState(0);
  const [itemResultWindow, setItemResultWindow] = useState<RoomResultWindow | null>(null);
  const [runtimeStage, setRuntimeStage] = useState(stage);
  const [processOpen, setProcessOpen] = useState(false);
  const [processLabel, setProcessLabel] = useState('Running task...');
  const [processPercent, setProcessPercent] = useState(0);
  const [sceneEffect, setSceneEffect] = useState<RoomAction['sceneEffect']>(null);
  const [sceneEffectVisible, setSceneEffectVisible] = useState(false);

  const recommendedTypes = useMemo(() => {
    if (title === 'KITCHEN') return ['recovery', 'clutch'];
    if (title === 'BATHROOM') return ['utility', 'recovery'];
    if (title === 'BEDROOM') return ['recovery', 'clutch'];
    return ['utility', 'recovery'];
  }, [title]);
  const recommendedTypeSet = useMemo(() => new Set(recommendedTypes), [recommendedTypes]);

  const petSprite = useMemo(() => resolveByteSprite(runtimeStage, { preferAnimatedIdle: true }), [runtimeStage]);
  const motionProfile = useMemo(() => getByteMotionProfile(runtimeStage), [runtimeStage]);
  const sceneEffectPalette = useMemo(() => {
    if (sceneEffect === 'stabilize') {
      return {
        overlay: 'rgba(98,255,190,0.14)',
        edge: 'rgba(126,255,212,0.28)',
        sweep: 'rgba(126,255,212,0.2)',
        line: 'rgba(160,255,225,0.18)',
      };
    }
    if (sceneEffect === 'purge') {
      return {
        overlay: 'rgba(64,214,255,0.16)',
        edge: 'rgba(120,225,255,0.3)',
        sweep: 'rgba(80,226,255,0.22)',
        line: 'rgba(142,228,255,0.16)',
      };
    }
    return {
      overlay: 'rgba(116,180,255,0.12)',
      edge: 'rgba(120,190,255,0.24)',
      sweep: 'rgba(120,190,255,0.18)',
      line: 'rgba(160,214,255,0.12)',
    };
  }, [sceneEffect]);

  useEffect(() => {
    setRuntimeStage(stage);
  }, [stage]);

  useEffect(() => {
    fxPulse.stopAnimation();
    fxSweep.stopAnimation();

    if (!sceneEffectVisible) {
      fxPulse.setValue(0.32);
      fxSweep.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fxPulse, { toValue: 0.62, duration: 620, useNativeDriver: true }),
        Animated.timing(fxPulse, { toValue: 0.28, duration: 620, useNativeDriver: true }),
      ])
    );
    const sweepLoop = Animated.loop(
      Animated.timing(fxSweep, { toValue: 1, duration: 1280, useNativeDriver: true })
    );

    pulseLoop.start();
    sweepLoop.start();

    return () => {
      pulseLoop.stop();
      sweepLoop.stop();
      fxPulse.stopAnimation();
      fxSweep.stopAnimation();
    };
  }, [fxPulse, fxSweep, sceneEffectVisible]);

  const syncRuntimeStage = useCallback(async () => {
    try {
      const data = await getByte();
      const apiStage = Number(data?.byte?.evolutionStage ?? stage);
      if (Number.isFinite(apiStage)) {
        setRuntimeStage(Math.max(0, Math.min(2, Math.floor(apiStage))));
      } else {
        setRuntimeStage(stage);
      }
    } catch {
      setRuntimeStage(stage);
    }
  }, [stage]);

  useFocusEffect(
    useCallback(() => {
      syncRuntimeStage().catch(() => {});
    }, [syncRuntimeStage])
  );

  useEffect(() => {
    if (metaProgress) {
      const targetValue = (Number(metaProgress.value || 0) / Math.max(1, Number(metaProgress.max || 100))) * 100;
      Animated.timing(metaProgressAnim, {
        toValue: targetValue,
        duration: 1400,
        useNativeDriver: false,
      }).start();
    }
  }, [metaProgress?.value, metaProgress?.max, metaProgressAnim]);

  useEffect(() => {
    initSfx().catch(() => {});
    const profile = motionProfile.room;

    Animated.loop(
      Animated.sequence([
        Animated.timing(bobY, { toValue: -profile.bobDistance, duration: profile.bobDuration, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: profile.bobDuration, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: profile.breatheScale, duration: profile.breatheDuration, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: profile.breatheDuration, useNativeDriver: true }),
      ])
    ).start();

    let active = true;
    const roam = () => {
      if (!active) return;
      const nextX = (Math.random() - 0.5) * (width * profile.roamSpreadX);
      const nextY = (Math.random() - 0.5) * profile.roamSpreadY;
      const duration = profile.roamDurationMin + Math.random() * Math.max(1, profile.roamDurationMax - profile.roamDurationMin);
      Animated.parallel([
        Animated.timing(driftX, { toValue: nextX, duration, useNativeDriver: true }),
        Animated.timing(driftY, { toValue: nextY, duration, useNativeDriver: true }),
      ]).start(() => {
        if (!active) return;
        setTimeout(roam, profile.pauseMin + Math.random() * Math.max(1, profile.pauseMax - profile.pauseMin));
      });
    };
    roam();

    return () => {
      active = false;
    };
  }, [bobY, breathe, driftX, driftY, motionProfile]);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const [inventoryData, catalog, byteData] = await Promise.all([getInventory(), getShopItems(), getByte()]);
      const inventoryList = Array.isArray(inventoryData?.itemInventory) ? inventoryData.itemInventory : [];
      const legacyOwned = Array.isArray(inventoryData?.unlockedItems) ? inventoryData.unlockedItems : [];

      const qtyMap = new Map<string, number>();
      inventoryList.forEach((entry: any) => {
        qtyMap.set(entry.itemId, Number(entry.quantity || 0));
      });
      legacyOwned.forEach((id: string) => {
        if (!qtyMap.has(id)) qtyMap.set(id, 1);
      });

      const catalogMap = new Map((catalog || []).map((item: any) => [item.id, item]));
      const rows: RoomInventoryItem[] = [];

      qtyMap.forEach((qty, id) => {
        if (qty <= 0) return;
        const c = catalogMap.get(id) || {};
        rows.push({
          id,
          name: c.name || id,
          type: c.type || 'utility',
          description: c.description || 'Program package.',
          quantity: qty,
        });
      });

      rows.sort((a, b) => {
        const aRecommended = recommendedTypeSet.has(a.type) ? 0 : 1;
        const bRecommended = recommendedTypeSet.has(b.type) ? 0 : 1;
        if (aRecommended !== bRecommended) return aRecommended - bRecommended;
        return a.name.localeCompare(b.name);
      });
      setItems(rows);
      setByteName(byteData?.byte?.name || 'BYTE');
      setInstallText(rows.length ? 'Program cache synchronized.' : 'No packages in inventory cache.');
    } catch {
      setInstallText('Program cache sync failed. Retry in a moment.');
    } finally {
      setItemsLoading(false);
    }
  }, [recommendedTypeSet]);

  const openItems = useCallback(() => {
    setItemsOpen(true);
    setConfirmOpen(false);
    setSelectedItem(null);
    setItemResultWindow(null);
    installProgress.setValue(0);
    setInstallPercent(0);
    playSfx('menu', 0.55);
    loadItems().catch(() => {});
  }, [installProgress, loadItems]);

  const runProgramAction = useCallback(async (action: RoomAction) => {
    const label = action.programLabel;
    const usesSceneEffect = Boolean(action.sceneEffect);

    if (!label) {
      if (usesSceneEffect) {
        setSceneEffect(action.sceneEffect || 'default');
        setSceneEffectVisible(true);
      }
      try {
        await Promise.resolve(action.onPress());
      } finally {
        if (usesSceneEffect) {
          setSceneEffectVisible(false);
          setSceneEffect(null);
        }
      }
      return;
    }

    setProcessLabel(label);
    processProgress.setValue(0);
    setProcessPercent(0);
    setProcessOpen(true);
    if (usesSceneEffect) {
      setSceneEffect(action.sceneEffect || 'default');
      setSceneEffectVisible(true);
    }
    playSfx('menu', 0.45);

    const listenerId = processProgress.addListener(({ value }) => {
      setProcessPercent(Math.round(value * 100));
    });
    await new Promise<void>((resolve) => {
      Animated.timing(processProgress, {
        toValue: 1,
        duration: Math.max(1200, Number(action.programMs || 2000)),
        useNativeDriver: false,
      }).start(() => resolve());
    });
    processProgress.removeListener(listenerId);

    setProcessOpen(false);
    try {
      await Promise.resolve(action.onPress());
    } finally {
      if (usesSceneEffect) {
        setSceneEffectVisible(false);
        setSceneEffect(null);
      }
    }
  }, [processProgress]);

  const itemSfxByType = useCallback((type: string) => {
    if (type === 'recovery') return 'positive';
    if (type === 'clutch') return 'yes';
    if (type === 'utility') return 'notify';
    if (type === 'stat_boost') return 'move';
    if (type === 'evolution') return 'alt';
    return 'tap';
  }, []);

  const itemVerbByType = useCallback((type: string) => {
    if (type === 'recovery') return 'Patch';
    if (type === 'clutch') return 'Boost';
    if (type === 'utility') return 'Utility';
    if (type === 'stat_boost') return 'Optimizer';
    if (type === 'evolution') return 'Kernel';
    return 'Program';
  }, []);

  const formatItemEffects = useCallback((effects: string[]) => {
    const pretty = effects
      .map((effect) => {
        if (effect === 'needs_restored') return 'system needs restored';
        if (effect === 'move_learned') return 'move package installed';
        if (effect.startsWith('effect_applied:')) {
          return `effect loaded: ${effect.replace('effect_applied:', '')}`;
        }
        return effect.replace(/_/g, ' ').toLowerCase();
      })
      .filter(Boolean);
    return pretty.length > 0 ? pretty.join(', ') : 'program run completed with no explicit effects reported';
  }, []);

  const executeItemInstall = useCallback(async () => {
    if (!selectedItem || installing) return;

    const itemName = selectedItem.name;
    const itemType = selectedItem.type;
    setInstalling(true);
    installProgress.setValue(0);
    setInstallPercent(0);
    setInstallText(`Running ${itemVerbByType(itemType)} package ${itemName} on ${byteName}...`);
    playSfx('menu', 0.45);

    const listenerId = installProgress.addListener(({ value }) => {
      setInstallPercent(Math.round(value * 100));
    });
    const ticker = setInterval(() => {
      installProgress.stopAnimation((v) => {
        if (v < 0.88) {
          installProgress.setValue(Math.min(0.9, v + 0.08));
        }
      });
    }, 420);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const result = await consumeItem(selectedItem.id);
      installProgress.setValue(1);
      setInstallPercent(100);
      playSfx(itemSfxByType(itemType) as any, 0.6);

      setItems((prev) =>
        prev
          .map((row) =>
            row.id === selectedItem.id
              ? { ...row, quantity: Math.max(0, Number(result?.quantityRemaining ?? row.quantity - 1)) }
              : row
          )
          .filter((row) => row.quantity > 0)
      );
      const effects = Array.isArray(result?.effects) ? result.effects : [];
      const summary = formatItemEffects(effects);
      setInstallText(`${itemName} executed successfully on ${byteName}.`);
      setItemResultWindow({
        title: `${itemName.toUpperCase()} EXECUTED`,
        body: `${itemVerbByType(itemType)} package run completed on ${byteName}. Result: ${summary}.`,
      });
    } catch {
      playSfx('negative', 0.55);
      setInstallText(`Execution failed for ${itemName}. Re-run task and retry.`);
      setItemResultWindow({
        title: `${itemName.toUpperCase()} FAILED`,
        body: `Program run on ${byteName} did not complete. Retry the package after the current task settles.`,
      });
    } finally {
      clearInterval(ticker);
      installProgress.removeListener(listenerId);
      setInstalling(false);
      setConfirmOpen(false);
      setSelectedItem(null);
    }
  }, [byteName, formatItemEffects, installProgress, installing, itemSfxByType, itemVerbByType, selectedItem]);

  return (
    <ImageBackground source={backgroundSource || require('../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {sceneEffectVisible ? (
        <View pointerEvents="none" style={[styles.sceneFxOverlay, { backgroundColor: sceneEffectPalette.overlay, borderColor: sceneEffectPalette.edge }]}>
          <Animated.View style={[styles.sceneFxPulse, { opacity: fxPulse, borderColor: sceneEffectPalette.edge }]} />
          <Animated.View
            style={[
              styles.sceneFxSweep,
              {
                backgroundColor: sceneEffectPalette.sweep,
                transform: [
                  {
                    translateY: fxSweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-height * 0.4, height * 0.9],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={styles.sceneFxLines}>
            {DEBUG_LINES.map((line) => (
              <View key={`fx-line-${line}`} style={[styles.sceneFxLine, { backgroundColor: sceneEffectPalette.line }]} />
            ))}
          </View>
        </View>
      ) : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.sceneTint, { backgroundColor: sceneTint }]} />

        <View style={styles.header}>
          <Text style={styles.roomTitle}>{title}</Text>
          <Text style={styles.roomSubtitle}>{subtitle}</Text>
        </View>

        <View style={styles.stage}>
          <View style={[styles.roomHalo, { borderColor: `${accent}66` }]} />
          <View style={styles.roomMetaWrap}>
          {!compactHeader && (
            <>
              <View style={[styles.roomTag, { borderColor: `${accent}66` }]}>
                <Text style={[styles.roomTagText, { color: accent }]}>{roomTag}</Text>
              </View>
              <View style={styles.ambientCard}>
                <Text style={styles.ambientBody}>{ambient}</Text>
              </View>
            </>
          )}
            {metaProgress ? (
              <View style={styles.metaProgressCard}>
                <View style={styles.metaProgressHeader}>
                  <Text style={styles.metaProgressLabel}>{metaProgress.label}</Text>
                  <Text style={styles.metaProgressValue}>
                    {Math.round(Number(metaProgress.value || 0))}
                    {metaProgress.detail ? ` - ${metaProgress.detail}` : ''}
                  </Text>
                </View>
                <View style={styles.metaProgressTrack}>
                  <Animated.View
                    style={[
                      styles.metaProgressFill,
                      {
                        width: metaProgressAnim.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        }),
                        backgroundColor: metaProgress.tint || accent,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.stageHud}>
            <View style={styles.statusDock}>
              <View style={styles.statusDot} />
              <View style={styles.statusTextWrap}>
                <Text style={styles.statusText}>{statusLine}</Text>
                {timerLine ? <Text style={styles.timerText}>{timerLine}</Text> : null}
              </View>
            </View>

            {statsMatrix.length > 0 ? (
              <View style={styles.matrixDock}>
                <Text style={styles.matrixTitle}>STAT MATRIX</Text>
                <View style={styles.matrixGrid}>
                  {statsMatrix.map((row) => (
                    <View key={row.label} style={styles.matrixCell}>
                      <Text style={styles.matrixLabel}>{row.label}</Text>
                      <Text style={styles.matrixValue}>{Math.round(Number(row.value || 0))}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {!hidePet ? (
            <Animated.View
              style={[
                styles.petWrap,
                { transform: [{ translateX: driftX }, { translateY: driftY }, { translateY: bobY }, { scale: breathe }] },
              ]}
            >
              <Image source={petSprite} style={styles.petSprite} resizeMode="contain" />
            </Animated.View>
          ) : null}
        </View>

        {uniformGrid ? (
          <View style={styles.uniformGrid}>
            {[...primaryActions, ...secondaryActions].map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.uniformCell, (action.disabled || isLocked(action.key)) && styles.btnDisabled]}
                onPress={() => {
                  runAction(action.key, () => {
                    runProgramAction(action).catch(() => action.onPress());
                  });
                }}
                activeOpacity={0.85}
                disabled={action.disabled || isLocked(action.key)}
              >
                <View style={[styles.actionIcon, { borderColor: `${action.color}88`, backgroundColor: `${action.color}22` }]}>
                  <Ionicons name={action.icon as any} size={20} color={action.color} />
                </View>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionSub}>{action.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.primaryRow}>
              {primaryActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={[styles.primaryBtn, (action.disabled || isLocked(action.key)) && styles.btnDisabled]}
                  onPress={() => {
                    runAction(action.key, () => {
                      runProgramAction(action).catch(() => action.onPress());
                    });
                  }}
                  activeOpacity={0.85}
                  disabled={action.disabled || isLocked(action.key)}
                >
                  <View style={[styles.actionIcon, { borderColor: `${action.color}88`, backgroundColor: `${action.color}22` }]}>
                    <Ionicons name={action.icon as any} size={20} color={action.color} />
                  </View>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSub}>{action.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {secondaryActions.length > 0 ? (
              <View style={styles.secondaryRow}>
                {secondaryActions.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={[styles.secondaryBtn, (action.disabled || isLocked(action.key)) && styles.btnDisabled]}
                    onPress={() => {
                      runAction(action.key, () => {
                        runProgramAction(action).catch(() => action.onPress());
                      });
                    }}
                    activeOpacity={0.85}
                    disabled={action.disabled || isLocked(action.key)}
                  >
                    <Ionicons name={action.icon as any} size={14} color={action.color} />
                    <Text style={styles.secondaryLabel}>{action.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </>
        )}

        <View style={styles.cornerNav}>
          <TouchableOpacity
            style={[styles.cornerBtnExit, isLocked('nav-exit') && styles.btnDisabled]}
            onPress={() => {
              runAction('nav-exit', onExit, 900);
            }}
            activeOpacity={0.85}
            disabled={isLocked('nav-exit')}
          >
            <Ionicons name="arrow-back-outline" size={16} color="#fff" />
            <Text style={styles.cornerTextExit}>EXIT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cornerBtn, isLocked('room-items') && styles.btnDisabled]}
            onPress={() => {
              runAction('room-items', openItems, 700);
            }}
            activeOpacity={0.85}
            disabled={isLocked('room-items')}
          >
            <Ionicons name="terminal-outline" size={16} color="#ffe18e" />
            <Text style={styles.cornerText}>ITEMS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal visible={itemsOpen} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setItemsOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>PROGRAM EXECUTION PANEL</Text>
            <Text style={styles.modalSub}>Recommended in {title}: {recommendedTypes.join(', ')}</Text>
            <Text style={styles.modalSub}>All package types are runnable in demo mode.</Text>
            <Text style={styles.modalInfo}>{installText}</Text>
            {installing ? <Text style={styles.modalSub}>Install progress: {installPercent}%</Text> : null}

            <View style={styles.installTrack}>
              <Animated.View
                style={[
                  styles.installFill,
                  {
                    width: installProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>

            <ScrollView style={styles.itemList}>
              {itemsLoading ? (
                <Text style={styles.itemEmpty}>Syncing item cache...</Text>
              ) : null}
              {!itemsLoading && items.length === 0 ? (
                <Text style={styles.itemEmpty}>No packages available.</Text>
              ) : null}
              {items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemName}>{item.name} x{item.quantity}</Text>
                    <Text style={styles.itemMeta}>
                      {item.id} - {item.type} {recommendedTypeSet.has(item.type) ? '(recommended)' : ''}
                    </Text>
                    <Text style={styles.itemDesc}>{item.description}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.itemRunBtn}
                    onPress={() => {
                      if (installing) return;
                      setSelectedItem(item);
                      setConfirmOpen(true);
                      playSfx('tap', 0.45);
                    }}
                    disabled={installing}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.itemRunText}>RUN</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalClose} onPress={() => setItemsOpen(false)} activeOpacity={0.85}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => !installing && setConfirmOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.confirmCard}>
            <Text style={styles.confirmText}>
              Use {selectedItem?.name || 'program'} on {byteName}?
              {'\n'}Run this program package now?
            </Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmNo]}
                onPress={() => setConfirmOpen(false)}
                disabled={installing}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>NO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmYes, installing && styles.btnDisabled]}
                onPress={executeItemInstall}
                disabled={installing}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>{installing ? 'RUNNING...' : 'YES'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={processOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.processCard}>
            <View style={styles.processHeader}>
              <Text style={styles.processHeaderTitle}>{processLabel.toUpperCase()}</Text>
              <Text style={styles.processPercent}>{processPercent}%</Text>
            </View>
            <Text style={styles.processSub}>SYSTEM PROCESS</Text>
            <View style={styles.installTrack}>
              <Animated.View
                style={[
                  styles.installFill,
                  {
                    width: processProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
            <Text style={styles.processFooter}>Executing runtime package...</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(resultWindow || itemResultWindow)} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>PROCESS RESULT</Text>
            <Text style={styles.confirmText}>{resultWindow?.title || itemResultWindow?.title || 'Task complete.'}</Text>
            <Text style={styles.modalInfo}>{resultWindow?.body || itemResultWindow?.body || ''}</Text>
            {typeof resultWindow?.byteBits === 'number' ? (
              <Text style={styles.modalSub}>BYTEBITS +{Math.max(0, Math.round(Number(resultWindow?.byteBits || 0)))}</Text>
            ) : null}
            {resultWindow?.skillGain ? <Text style={styles.modalSub}>{resultWindow.skillGain}</Text> : null}
            {typeof resultWindow?.energyCost === 'number' ? (
              <Text style={styles.modalSub}>Energy drain: -{Math.max(0, Math.round(Number(resultWindow.energyCost || 0)))}</Text>
            ) : null}
            {typeof resultWindow?.cooldownSeconds === 'number' && resultWindow.cooldownSeconds > 0 ? (
              <Text style={styles.modalSub}>Training cooldown: {Math.max(1, Math.round(resultWindow.cooldownSeconds))}s</Text>
            ) : null}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                if (itemResultWindow) setItemResultWindow(null);
                onDismissResultWindow?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1, paddingHorizontal: 14 },
  sceneTint: { ...StyleSheet.absoluteFillObject },
  sceneFxOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    zIndex: 3,
  },
  sceneFxPulse: {
    position: 'absolute',
    top: '18%',
    left: '10%',
    right: '10%',
    height: height * 0.42,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  sceneFxSweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: height * 0.22,
  },
  sceneFxLines: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-evenly',
  },
  sceneFxLine: {
    height: 1,
    width: '100%',
  },
  header: { paddingTop: 14, alignItems: 'center', gap: 4 },
  roomTitle: { color: '#e1f1ff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  roomSubtitle: { color: 'rgba(152,218,255,0.86)', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  roomHalo: {
    position: 'absolute',
    bottom: 26,
    width: width * 0.56,
    height: width * 0.22,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(20,60,140,0.2)',
  },
  roomMetaWrap: {
    position: 'absolute',
    top: 32,
    left: 8,
    right: 8,
    alignItems: 'center',
    gap: 8,
  },
  stageHud: {
    position: 'absolute',
    top: 160,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    gap: 8,
  },
  roomTag: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(10,20,60,0.75)',
  },
  roomTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  ambientBody: {
    color: '#e4f5ff',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: width * 0.8,
  },
  ambientCard: {
    maxWidth: width * 0.82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.2)',
    backgroundColor: 'rgba(8,18,62,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metaProgressCard: {
    width: Math.min(width * 0.72, 320),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.2)',
    backgroundColor: 'rgba(8,18,62,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    marginBottom: 12,
  },
  metaProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  metaProgressLabel: {
    color: '#a7ddff',
    fontSize: 9.8,
    fontWeight: '800',
    letterSpacing: 1,
    flex: 1,
  },
  metaProgressValue: {
    color: '#e4f5ff',
    fontSize: 10.2,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  metaProgressTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  metaProgressFill: {
    height: 8,
    borderRadius: 99,
  },
  petWrap: { position: 'absolute', bottom: 10 },
  petSprite: { width: width * 0.34, height: width * 0.34 },
  statusDock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100,192,255,0.23)',
    backgroundColor: 'rgba(8,18,64,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#59ff90', marginTop: 2 },
  statusTextWrap: { flex: 1 },
  statusText: { color: 'rgba(230,244,255,0.88)', fontSize: 11.5, fontWeight: '600' },
  timerText: { color: '#8ee0ff', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  uniformGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  uniformCell: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(98,188,255,0.22)',
    backgroundColor: 'rgba(8,18,62,0.88)',
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 5,
  },
  primaryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(98,188,255,0.22)',
    backgroundColor: 'rgba(8,18,62,0.88)',
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: '#dff2ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  actionSub: { color: 'rgba(210,232,255,0.58)', fontSize: 9.5, textAlign: 'center' },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 10 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.25)',
    backgroundColor: 'rgba(8,18,62,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryLabel: { color: '#d6ecff', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  matrixDock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(136,210,255,0.22)',
    backgroundColor: 'rgba(8,18,62,0.76)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  matrixTitle: { color: '#9bdfff', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1 },
  matrixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  matrixCell: {
    minWidth: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(126,194,255,0.2)',
    backgroundColor: 'rgba(9,28,78,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  matrixLabel: { color: 'rgba(198,229,255,0.78)', fontSize: 8.8, fontWeight: '700', letterSpacing: 0.8 },
  matrixValue: { color: '#ddf2ff', fontSize: 11.2, fontWeight: '900', marginTop: 1 },
  cornerNav: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  cornerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cornerBtnExit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cornerText: { color: '#d9efff', fontSize: 10.2, fontWeight: '800', letterSpacing: 1.1 },
  cornerTextExit: { color: '#fff', fontSize: 10.2, fontWeight: '800', letterSpacing: 1.1 },
  btnDisabled: { opacity: 0.5 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,18,0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.25)',
    backgroundColor: 'rgba(8,18,62,0.96)',
    padding: 12,
    maxHeight: '75%',
    gap: 8,
  },
  modalTitle: { color: '#d9efff', fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  modalSub: { color: 'rgba(188,220,255,0.74)', fontSize: 10 },
  modalInfo: { color: '#9fe0ff', fontSize: 10.5, minHeight: 16 },
  installTrack: {
    height: 7,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  installFill: {
    height: 7,
    borderRadius: 5,
    backgroundColor: '#6bc7ff',
  },
  itemList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.2)',
    backgroundColor: 'rgba(10,22,70,0.75)',
    padding: 8,
    maxHeight: 280,
  },
  itemEmpty: { color: 'rgba(220,240,255,0.62)', fontSize: 10.5, textAlign: 'center', paddingVertical: 10 },
  itemRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.2)',
    backgroundColor: 'rgba(8,18,60,0.85)',
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  itemTextWrap: { flex: 1, gap: 2 },
  itemName: { color: '#fff', fontSize: 11, fontWeight: '800' },
  itemMeta: { color: 'rgba(170,214,255,0.7)', fontSize: 9.5 },
  itemDesc: { color: 'rgba(220,240,255,0.78)', fontSize: 9.8 },
  itemRunBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120,235,170,0.5)',
    backgroundColor: 'rgba(20,72,44,0.62)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemRunText: { color: '#bfffd9', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  modalClose: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    backgroundColor: 'rgba(30,36,62,0.68)',
    marginTop: 6,
  },
  modalCloseText: { color: 'rgba(255,255,255,0.68)', fontSize: 10.8, fontWeight: '800', letterSpacing: 1.2 },
  confirmCard: {
    alignSelf: 'center',
    width: '92%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.26)',
    backgroundColor: 'rgba(8,18,62,0.97)',
    padding: 14,
    gap: 10,
  },
  confirmText: { color: '#dff2ff', fontSize: 12, lineHeight: 18 },
  confirmRow: { flexDirection: 'row', gap: 8 },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 9,
  },
  confirmNo: {
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(36,42,68,0.78)',
  },
  confirmYes: {
    borderColor: 'rgba(116,219,255,0.46)',
    backgroundColor: 'rgba(28,66,98,0.78)',
  },
  confirmBtnText: { color: '#dff2ff', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
  processCard: {
    alignSelf: 'center',
    width: '92%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(95,182,255,0.28)',
    backgroundColor: 'rgba(7,16,54,0.98)',
    padding: 14,
    gap: 8,
  },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  processHeaderTitle: { color: '#dff6ff', fontSize: 12, fontWeight: '900', letterSpacing: 0.9 },
  processPercent: { color: '#9ce7ff', fontSize: 11, fontWeight: '800' },
  processSub: { color: 'rgba(111,175,255,0.7)', fontSize: 9.6, fontWeight: '700', letterSpacing: 1.2 },
  processFooter: { color: 'rgba(140,178,255,0.74)', fontSize: 9.4, fontWeight: '700' },
});
