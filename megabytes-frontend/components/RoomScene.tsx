import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, Dimensions, Image, ImageBackground, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEvolution } from '../context/EvolutionContext';
import { useActionGate } from '../hooks/useActionGate';
import { consumeItem, getByte, getInventory, getShopItems } from '../services/api';
import { initSfx, playSfx } from '../services/sfx';
import { resolveByteSprite } from '../services/byteSprites';

const { width } = Dimensions.get('window');

export interface RoomAction {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  programLabel?: string;
  programMs?: number;
}

export interface RoomResultWindow {
  title: string;
  body: string;
  byteBits?: number;
  skillGain?: string | null;
  energyCost?: number;
  cooldownSeconds?: number | null;
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
  statsMatrix?: { label: string; value: number }[];
  resultWindow?: RoomResultWindow | null;
  onDismissResultWindow?: () => void;
  backgroundSource?: any;
  primaryActions: [RoomAction, RoomAction];
  secondaryActions?: RoomAction[];
  onExit: () => void;
}

type RoomInventoryItem = {
  id: string;
  name: string;
  type: string;
  description: string;
  quantity: number;
};

export default function RoomScene({
  title,
  subtitle,
  ambient,
  roomTag,
  sceneTint,
  accent,
  statusLine,
  timerLine,
  statsMatrix = [],
  resultWindow = null,
  onDismissResultWindow,
  backgroundSource,
  primaryActions,
  secondaryActions = [],
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

  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [items, setItems] = useState<RoomInventoryItem[]>([]);
  const [byteName, setByteName] = useState('BYTE');
  const [selectedItem, setSelectedItem] = useState<RoomInventoryItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installText, setInstallText] = useState('Select a program package to execute.');
  const [runtimeStage, setRuntimeStage] = useState(stage);
  const [processOpen, setProcessOpen] = useState(false);
  const [processLabel, setProcessLabel] = useState('Running task...');
  const [processPercent, setProcessPercent] = useState(0);

  const recommendedTypes = useMemo(() => {
    if (title === 'KITCHEN') return ['recovery', 'clutch'];
    if (title === 'BATHROOM') return ['utility', 'recovery'];
    if (title === 'BEDROOM') return ['recovery', 'clutch'];
    return ['utility', 'recovery'];
  }, [title]);
  const recommendedTypeSet = useMemo(() => new Set(recommendedTypes), [recommendedTypes]);

  const petSprite = useMemo(() => resolveByteSprite(runtimeStage, { preferAnimatedIdle: true }), [runtimeStage]);

  useEffect(() => {
    setRuntimeStage(stage);
  }, [stage]);

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
    initSfx().catch(() => {});

    Animated.loop(
      Animated.sequence([
        Animated.timing(bobY, { toValue: -6, duration: 1600, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1700, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1700, useNativeDriver: true }),
      ])
    ).start();

    let active = true;
    const roam = () => {
      if (!active) return;
      const nextX = (Math.random() - 0.5) * (width * 0.36);
      const nextY = (Math.random() - 0.5) * 26;
      Animated.parallel([
        Animated.timing(driftX, { toValue: nextX, duration: 1700 + Math.random() * 1300, useNativeDriver: true }),
        Animated.timing(driftY, { toValue: nextY, duration: 1700 + Math.random() * 1300, useNativeDriver: true }),
      ]).start(() => {
        if (!active) return;
        setTimeout(roam, 500 + Math.random() * 900);
      });
    };
    roam();

    return () => {
      active = false;
    };
  }, [bobY, breathe, driftX, driftY]);

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
    playSfx('menu', 0.55);
    loadItems().catch(() => {});
  }, [loadItems]);

  const runProgramAction = useCallback(async (action: RoomAction) => {
    const label = action.programLabel;
    if (!label) {
      action.onPress();
      return;
    }

    setProcessLabel(label);
    processProgress.setValue(0);
    setProcessPercent(0);
    setProcessOpen(true);
    playSfx('menu', 0.45);

    const listenerId = processProgress.addListener(({ value }) => {
      setProcessPercent(Math.round(value * 100));
    });
    await new Promise<void>((resolve) => {
      Animated.timing(processProgress, {
        toValue: 1,
        duration: Math.max(420, Number(action.programMs || 900)),
        useNativeDriver: false,
      }).start(() => resolve());
    });
    processProgress.removeListener(listenerId);

    setProcessOpen(false);
    action.onPress();
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

  const executeItemInstall = useCallback(async () => {
    if (!selectedItem || installing) return;

    setInstalling(true);
    installProgress.setValue(0);
    setInstallText(`Executing ${itemVerbByType(selectedItem.type)} install task: ${selectedItem.name}...`);
    playSfx('menu', 0.45);

    const ticker = setInterval(() => {
      installProgress.stopAnimation((v) => {
        if (v < 0.88) {
          installProgress.setValue(Math.min(0.9, v + 0.12));
        }
      });
    }, 240);

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const result = await consumeItem(selectedItem.id);
      installProgress.setValue(1);
      playSfx(itemSfxByType(selectedItem.type) as any, 0.6);

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
      const summary = effects.length ? effects.join(', ') : 'no explicit effects reported';
      setInstallText(`${selectedItem.name} executed successfully on ${byteName}. Effects: ${summary}.`);
    } catch {
      playSfx('negative', 0.55);
      setInstallText(`Execution failed for ${selectedItem.name}. Re-run task and retry.`);
    } finally {
      clearInterval(ticker);
      setInstalling(false);
      setConfirmOpen(false);
      setSelectedItem(null);
    }
  }, [byteName, installProgress, installing, itemSfxByType, itemVerbByType, selectedItem]);

  return (
    <ImageBackground source={backgroundSource || require('../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.sceneTint, { backgroundColor: sceneTint }]} />

        <View style={styles.header}>
          <Text style={styles.roomTitle}>{title}</Text>
          <Text style={styles.roomSubtitle}>{subtitle}</Text>
        </View>

        <View style={styles.stage}>
          <View style={[styles.roomHalo, { borderColor: `${accent}66` }]} />
          <View style={styles.roomMetaWrap}>
            <View style={[styles.roomTag, { borderColor: `${accent}66` }]}>
              <Text style={[styles.roomTagText, { color: accent }]}>{roomTag}</Text>
            </View>
            <Text style={styles.ambientBody}>{ambient}</Text>
          </View>

          <Animated.View
            style={[
              styles.petWrap,
              { transform: [{ translateX: driftX }, { translateY: driftY }, { translateY: bobY }, { scale: breathe }] },
            ]}
          >
            <Image source={petSprite} style={styles.petSprite} resizeMode="contain" />
          </Animated.View>
        </View>

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

        <View style={styles.cornerNav}>
          <TouchableOpacity
            style={[styles.cornerBtn, isLocked('nav-exit') && styles.btnDisabled]}
            onPress={() => {
              runAction('nav-exit', onExit, 900);
            }}
            activeOpacity={0.85}
            disabled={isLocked('nav-exit')}
          >
            <Ionicons name="arrow-back-outline" size={16} color="#a9d8ff" />
            <Text style={styles.cornerText}>EXIT</Text>
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
              Use {selectedItem?.name || 'program'} on {byteName}?{' '}
              {'\n'}Execute install task now?
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

      <Modal visible={Boolean(resultWindow)} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>PROCESS RESULT</Text>
            <Text style={styles.confirmText}>{resultWindow?.title || 'Task complete.'}</Text>
            <Text style={styles.modalInfo}>{resultWindow?.body || ''}</Text>
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
            <TouchableOpacity style={styles.modalClose} onPress={onDismissResultWindow} activeOpacity={0.85}>
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
  roomTag: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(10,20,60,0.75)',
  },
  roomTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  ambientBody: {
    color: 'rgba(224,243,255,0.78)',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: width * 0.8,
  },
  petWrap: { position: 'absolute', bottom: 10 },
  petSprite: { width: width * 0.34, height: width * 0.34 },
  statusDock: {
    marginBottom: 8,
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
    marginBottom: 8,
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
  cornerText: { color: '#d9efff', fontSize: 10.2, fontWeight: '800', letterSpacing: 1.1 },
  btnDisabled: { opacity: 0.5 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,18,0.86)',
    justifyContent: 'flex-end',
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
