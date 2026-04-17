import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  Modal,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { earnCurrency, evolveByte, getPlayer, praiseByte, scoldByte, syncByte, tapByte, wakeUpByte } from '../../services/api';
import { getHomeClutterClearedAt, loadHomeClutterCount, saveHomeClutterCount } from '../../services/homeRuntimeState';
import { initSfx, playSfx } from '../../services/sfx';
import { useEvolution } from '../../context/EvolutionContext';
import { useActionGate } from '../../hooks/useActionGate';
import { useDemoMode } from '../../hooks/useDemoMode';
import { getDemoSpeedLabel } from '../../services/demoSession';
import { generateByteThought } from '../../services/byteThoughts';
import { getByteMotionProfile } from '../../services/byteMotion';
import { resolveByteSprite } from '../../services/byteSprites';
import HomeRoomStage from '../../components/HomeRoomStage';

const { width, height } = Dimensions.get('window');

const CORRUPTION_TIER_COLOR: Record<string, string> = {
  none: '#888888', light: '#ffe666', medium: '#ff9c44', heavy: '#ff6060', critical: '#bf44ff',
};

const STAGE_NAMES = ['EGG', 'Stage 1 .PNG', 'Stage 2 .SVG', 'Stage 3 .GIF', 'Stage 4 .ANI', 'Stage 5 .MOV'];

const getStageName = (stage: number): string => STAGE_NAMES[Math.max(0, Math.min(5, stage))] || 'Unknown';

const HOME_ACTIONS = [
  { key: 'inventory', label: 'INVENTORY', icon: 'cube-outline', color: '#ffc84a' },
  { key: 'praise', label: 'PRAISE', icon: 'thumbs-up-outline', color: '#45d4ff' },
  { key: 'scold', label: 'SCOLD', icon: 'alert-circle-outline', color: '#bf6cff' },
  { key: 'stats', label: 'STATS', icon: 'stats-chart-outline', color: '#6c93ff' },
];

const TOP_MENU = [
  { key: 'profile', label: 'PROFILE', icon: 'person-circle-outline', route: '/(tabs)/profile' },
  { key: 'inbox', label: 'INBOX', icon: 'mail-open-outline', route: '/(tabs)/inbox' },
  { key: 'events', label: 'EVENTS', icon: 'sparkles-outline', route: '/(tabs)/events', color: '#ffd45a' },
  { key: 'achievements', label: 'DAILY CARE', icon: 'calendar-outline', route: '/(tabs)/daily-care' },
];

const CLUTTER_SPRITES = [
  require('../../assets/images/clutter1.png'),
  require('../../assets/images/clutter2.png'),
];

const CLUTTER_ZONES = [
  { leftMin: 10, leftMax: 22, bottomMin: 18, bottomMax: 54, frontChance: 0.65 },
  { leftMin: 24, leftMax: 36, bottomMin: 8, bottomMax: 36, frontChance: 1.0 },  // center-left — always front so byte doesn't block taps
  { leftMin: 64, leftMax: 76, bottomMin: 8, bottomMax: 36, frontChance: 1.0 },  // center-right — always front
  { leftMin: 78, leftMax: 90, bottomMin: 18, bottomMax: 54, frontChance: 0.65 },
];

function xpRequired(level: number) {
  if (level <= 50) return 50 * level;
  return 50 * Math.pow(level, 2);
}

const ROOM_MENU = [
  { key: 'kitchen', title: 'KITCHEN', subtitle: 'Feed and meals', icon: 'restaurant-outline', route: '/rooms/kitchen', color: '#ffcb58' },
  { key: 'bathroom', title: 'BATHROOM', subtitle: 'Clean and wash', icon: 'water-outline', route: '/rooms/bathroom', color: '#56d9ff' },
  { key: 'bedroom', title: 'BEDROOM', subtitle: 'Rest and calm', icon: 'bed-outline', route: '/rooms/bedroom', color: '#9d86ff' },
  { key: 'training', title: 'TRAINING', subtitle: 'Stat drills', icon: 'barbell-outline', route: '/rooms/training-center', color: '#d48fff' },
  { key: 'clinic', title: 'CLINIC', subtitle: 'Recovery support', icon: 'medkit-outline', route: '/rooms/clinic', color: '#8deac7' },
  { key: 'play', title: 'PLAY ROOM', subtitle: 'Mood support', icon: 'game-controller-outline', route: '/rooms/play-room', color: '#ff8dd2' },
  { key: 'market', title: 'MARKETPLACE', subtitle: 'Auctions and buy-now', icon: 'pricetags-outline', route: '/(tabs)/marketplace', color: '#5bdd7e' },
];

function NeedPips({ value, color }: { value: number; color: string }) {
  const active = Math.max(0, Math.min(5, Math.ceil(value / 20)));
  return (
    <View style={styles.pipRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={[styles.pip, { backgroundColor: i < active ? color : 'rgba(255,255,255,0.18)' }]} />
      ))}
    </View>
  );
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function FloatingReward({
  text,
  left,
  bottom,
  onDone,
}: {
  text: string;
  left: number;
  bottom: number;
  onDone: () => void;
}) {
  const rise = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(720),
        Animated.timing(opacity, { toValue: 0, duration: 950, useNativeDriver: true }),
      ]),
      Animated.timing(rise, { toValue: -92, duration: 1820, useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.05, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1220, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 420, useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0.6, duration: 340, useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, [onDone, opacity, rise, scale, sway]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.rewardPopup,
        {
          left,
          bottom,
          opacity,
          transform: [
            { translateY: rise },
            { translateX: sway.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
            { rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) },
            { scale },
          ],
        },
      ]}
    >
      <Text style={styles.rewardPopupText}>{text}</Text>
    </Animated.View>
  );
}

function ActionBurst({
  type,
  onDone,
}: {
  type: 'praise' | 'scold';
  onDone: () => void;
}) {
  const p0 = useRef(new Animated.Value(0)).current;
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const p3 = useRef(new Animated.Value(0)).current;
  const particles = [p0, p1, p2, p3];
  const glyph = type === 'praise' ? '💗' : '💢';

  useEffect(() => {
    const anims = [p0, p1, p2, p3].map((p) =>
      Animated.timing(p, { toValue: 1, duration: 760, useNativeDriver: true })
    );
    Animated.stagger(90, anims).start(() => onDone());
  }, [onDone, p0, p1, p2, p3]);

  return (
    <View pointerEvents="none" style={styles.burstLayer}>
      {particles.map((p, idx) => {
        const xOffset = idx % 2 === 0 ? -22 - idx * 8 : 20 + idx * 7;
        const yTravel = p.interpolate({ inputRange: [0, 1], outputRange: [0, -60 - idx * 12] });
        const op = p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
        const wiggle = p.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] });
        return (
          <Animated.Text
            key={`${type}-${idx}`}
            style={[
              styles.burstGlyph,
              { opacity: op, transform: [{ translateX: xOffset }, { translateY: yTravel }, { rotate: wiggle }] },
            ]}
          >
            {glyph}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function StatsModal({ visible, onClose, byteData, playerData, onEvolved }: { visible: boolean; onClose: () => void; byteData: any; playerData: any; onEvolved: () => void }) {
  const [evolving, setEvolving] = React.useState(false);
  const [evolveError, setEvolveError] = React.useState<string | null>(null);
  const byte = byteData?.byte;
  // Use computedStats (need-modified live values) over raw stored stats
  const stats = byteData?.computedStats || byte?.stats || {};
  const needs = byte?.needs || {};
  const statKeys = ['Power', 'Speed', 'Defense', 'Special', 'Stamina', 'Accuracy'];
  const needKeys = ['Hunger', 'Bandwidth', 'Mood', 'Hygiene', 'Social', 'Fun'];
  const moves = Array.isArray(byte?.equippedMoves) ? byte.equippedMoves : [];
  const wins = Number(playerData?.arenaRecord?.wins || 0);
  const losses = Number(playerData?.arenaRecord?.losses || 0);
  const bornAtMs = byte?.bornAt ? new Date(byte.bornAt).getTime() : Date.now();
  const age = formatAge(Date.now() - bornAtMs);
  const shape = byte?.shape || 'Pending';
  const animal = byte?.animal || 'Pending';
  const feature = byte?.feature || 'Pending';
  const element = byte?.element || 'Normal';
  const temperament = byte?.temperament || 'Pending';
  const branch = byte?.branch || 'Pending';
  const corruptionTier = (byteData?.corruptionTier || byte?.corruptionTier || 'none') as string;
  const corruptionColor = CORRUPTION_TIER_COLOR[corruptionTier] || '#888888';
  const passive = byte?.equippedPassive || 'None';
  const ult = byte?.equippedUlt || 'None';
  const gateLevel = 10;
  const levelReady = Number(byte?.level || 1) >= gateLevel;
  const avgNeed = Math.round((Number(needs.Hunger || 0) + Number(needs.Bandwidth || 0) + Number(needs.Hygiene || 0) + Number(needs.Social || 0) + Number(needs.Fun || 0) + Number(needs.Mood || 0)) / 6);
  const careReady = avgNeed >= 65;
  const evolutionReadiness = levelReady && careReady ? 'READY' : levelReady ? 'PARTIAL' : 'NOT READY';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalBg} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={styles.statsCard}>
          <Text style={styles.statsTitle}>SYSTEM REPORT</Text>
          <Text style={styles.statsName}>{byte?.name || 'Byte'} Lv.{byte?.level || 1}</Text>

          <ScrollView style={styles.statsScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.statsSection}>PROFILE</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>STAGE</Text><Text style={styles.kvVal}>{getStageName(byte?.evolutionStage || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>LEVEL / XP</Text><Text style={styles.kvVal}>{Number(byte?.level || 1)} / {Number(byte?.xp || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ELEMENT</Text><Text style={styles.kvVal}>{element}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>TEMPERAMENT</Text><Text style={styles.kvVal}>{temperament}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>BRANCH</Text><Text style={styles.kvVal}>{branch}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>SHAPE / ANIMAL</Text><Text style={styles.kvVal}>{shape} / {animal}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>FEATURE</Text><Text style={styles.kvVal}>{feature}</Text></View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>CORRUPTION</Text>
              <Text style={[styles.kvVal, { color: corruptionColor }]}>
                {Math.round(Number(byte?.corruption || 0))} — {corruptionTier.toUpperCase()}
              </Text>
            </View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>TIME ALIVE</Text><Text style={styles.kvVal}>{age}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>GENERATION</Text><Text style={styles.kvVal}>{Number(byte?.generation || 1)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>EVOLUTION READINESS</Text><Text style={[styles.kvVal, { color: evolutionReadiness === 'READY' ? '#7cffb2' : undefined }]}>{evolutionReadiness}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>LEVEL GATE</Text><Text style={styles.kvVal}>{Number(byte?.level || 1)} / {gateLevel}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>CARE READINESS</Text><Text style={styles.kvVal}>Avg Need {avgNeed}</Text></View>

            {evolutionReadiness === 'READY' && !byte?.isEgg && (
              <TouchableOpacity
                style={{ marginTop: 10, backgroundColor: 'rgba(124,255,178,0.15)', borderRadius: 10, borderWidth: 1, borderColor: '#7cffb2', padding: 12, alignItems: 'center' }}
                disabled={evolving}
                onPress={async () => {
                  setEvolving(true);
                  setEvolveError(null);
                  try {
                    await evolveByte();
                    onEvolved();
                    onClose();
                  } catch (e: any) {
                    setEvolveError(e?.message || 'Evolution failed. Check level and items.');
                  } finally {
                    setEvolving(false);
                  }
                }}
              >
                <Text style={{ color: '#7cffb2', fontSize: 13, fontWeight: '900', letterSpacing: 2 }}>
                  {evolving ? 'EVOLVING...' : '▲ EVOLVE'}
                </Text>
              </TouchableOpacity>
            )}
            {evolveError && <Text style={{ color: '#ff6060', fontSize: 11, marginTop: 6, textAlign: 'center' }}>{evolveError}</Text>}

            <Text style={styles.statsSection}>LOADOUT</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>MOVES</Text><Text style={styles.kvVal}>{moves.length ? moves.join(', ') : 'None'}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ULT</Text><Text style={styles.kvVal}>{ult}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PASSIVE</Text><Text style={styles.kvVal}>{passive}</Text></View>

            <Text style={styles.statsSection}>STATS</Text>
            {statKeys.map((k) => (
              <View key={k} style={styles.statsRow}>
                <Text style={styles.statsKey}>{k.toUpperCase()}</Text>
                <View style={styles.statsBarTrack}>
                  <View style={[styles.statsBarFill, { width: `${Math.min(100, stats[k] || 0)}%` }]} />
                </View>
                <Text style={styles.statsVal}>{Math.round(stats[k] || 0)}</Text>
              </View>
            ))}

            <Text style={styles.statsSection}>NEEDS</Text>
            {needKeys.map((k) => (
              <View key={k} style={styles.statsRow}>
                <Text style={styles.statsKey}>{k.toUpperCase()}</Text>
                <View style={styles.statsBarTrack}>
                  <View style={[styles.statsBarFill, { width: `${Math.min(100, needs[k] || 0)}%`, backgroundColor: '#8de2ff' }]} />
                </View>
                <Text style={styles.statsVal}>{Math.round(needs[k] || 0)}</Text>
              </View>
            ))}

            <Text style={styles.statsSection}>BEHAVIOR</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PRAISE / SCOLD</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.praiseCount || 0)} / {Number(byte?.behaviorMetrics?.scoldCount || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>TAP CHECKINS</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.tapFrequency || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>NON-REWARD CHECKINS</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.nonRewardCheckins || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PLAY/TRAIN RATIO</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.playVsTrainRatio || 0).toFixed(2)}</Text></View>

            <Text style={styles.statsSection}>PLAYER SUMMARY</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>BATTLES</Text><Text style={styles.kvVal}>{wins + losses}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ARENA W/L</Text><Text style={styles.kvVal}>{wins} / {losses}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ROOMS OWNED</Text><Text style={styles.kvVal}>{Array.isArray(playerData?.unlockedRooms) ? playerData.unlockedRooms.length : 0}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ITEM TYPES OWNED</Text><Text style={styles.kvVal}>{Array.isArray(playerData?.itemInventory) ? playerData.itemInventory.length : 0}</Text></View>
          </ScrollView>

          <TouchableOpacity style={styles.statsClose} onPress={onClose}>
            <Text style={styles.statsCloseText}>CLOSE</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { stage, reloadFromServer } = useEvolution();
  const { demoMode, hydrated: demoHydrated, enableDemoMode } = useDemoMode();
  const { isLocked, runAction } = useActionGate(700);

  const roamX = useRef(new Animated.Value(0)).current;
  const roamY = useRef(new Animated.Value(0)).current;
  const hoverY = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const stride = useRef(new Animated.Value(0)).current;
  const depthScale = useRef(new Animated.Value(1)).current;
  const tapScale = useRef(new Animated.Value(1)).current;
  const blinkOpacity = useRef(new Animated.Value(1)).current;
  const drawerAnim = useRef(new Animated.Value(height)).current;

  // Tap reaction animations
  const reactionBounce = useRef(new Animated.Value(0)).current;
  const reactionShake = useRef(new Animated.Value(0)).current;
  const reactionShrink = useRef(new Animated.Value(1)).current;
  const reactionRotate = useRef(new Animated.Value(0)).current;
  const reactionHeartOpacity = useRef(new Animated.Value(0)).current;
  const reactionBlinkOpacity = useRef(new Animated.Value(1)).current;

  const stickyUntilRef = useRef(0);
  const clutterSyncRef = useRef(0);
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thoughtRef = useRef<() => string>(() => 'BYTE is scanning the network.');

  const [byteData, setByteData] = useState<any>(null);
  const [playerData, setPlayerData] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statusText, setStatusText] = useState('BYTE is scanning the network.');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [clutter, setClutter] = useState(0);
  const [clutterNodes, setClutterNodes] = useState<{ id: string; sprite: any; left: number; bottom: number; size: number; front: boolean }[]>([]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [idleThoughtTicks, setIdleThoughtTicks] = useState(0);
  const [rewardPopups, setRewardPopups] = useState<{ id: string; text: string; left: number; bottom: number }[]>([]);
  const [actionBursts, setActionBursts] = useState<{ id: string; type: 'praise' | 'scold' }[]>([]);
  const [emotion, setEmotion] = useState<'praise' | 'scold' | null>(null);
  const [moveFacing, setMoveFacing] = useState<'left' | 'right' | 'idle'>('idle');
  const [motionState, setMotionState] = useState<'walking_slow' | 'walking_fast' | 'idle' | 'resting'>('walking_slow');
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepUntil, setSleepUntil] = useState<Date | null>(null);
  const [wakeUpTaps, setWakeUpTaps] = useState(0);
  const emotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needs = useMemo(
    () =>
      byteData?.byte?.needs || {
        Hunger: 80,
        Bandwidth: 80,
        Hygiene: 80,
        Social: 80,
        Fun: 80,
        Mood: 80,
      },
    [byteData?.byte?.needs]
  );
  let petSprite = resolveByteSprite(stage, {
    needs,
    preferAnimatedIdle: true,
    preferAnimatedWalk: moveFacing !== 'idle',
    facing: moveFacing,
  });

  // Override sprite with emotion GIF if emotion is active
  if (emotion === 'praise') {
    petSprite = require('../../assets/bytes/missingno-smile.gif');
  } else if (emotion === 'scold') {
    petSprite = require('../../assets/bytes/missingno-sad.gif');
  }

  const clutterPenalty = Math.min(24, clutter * 3);
  const effectiveMood = Math.max(0, (needs.Mood || 0) - clutterPenalty);
  const demoLabel = getDemoSpeedLabel();
  const motionProfile = useMemo(() => getByteMotionProfile(stage), [stage]);

  const clutterLabel = useMemo(() => {
    if (clutter >= 5) return 'Crowded';
    if (clutter >= 3) return 'Messy';
    if (clutter >= 1) return 'Minor clutter';
    return 'Clean';
  }, [clutter]);

  const createClutterNode = useCallback((index: number) => {
    const zone = CLUTTER_ZONES[Math.floor(Math.random() * CLUTTER_ZONES.length)];
    const size = 88 + Math.random() * 56;
    const leftPct = zone.leftMin + Math.random() * (zone.leftMax - zone.leftMin);
    const left = ((width - size) * leftPct) / 100;
    const bottom = zone.bottomMin + Math.random() * (zone.bottomMax - zone.bottomMin);
    return {
      id: `clutter-${Date.now()}-${index}-${Math.random()}`,
      sprite: CLUTTER_SPRITES[Math.floor(Math.random() * CLUTTER_SPRITES.length)],
      left,
      bottom,
      size,
      front: Math.random() < zone.frontChance,
    };
  }, []);

  const backClutterNodes = useMemo(() => clutterNodes.filter((node) => !node.front), [clutterNodes]);
  const frontClutterNodes = useMemo(() => clutterNodes.filter((node) => node.front), [clutterNodes]);

  useEffect(() => {
    setClutterNodes((prev) => {
      if (prev.length === clutter) return prev;
      if (prev.length < clutter) {
        const next = [...prev];
        for (let i = prev.length; i < clutter; i += 1) {
          next.push(createClutterNode(i));
        }
        return next;
      }
      return prev.slice(0, clutter);
    });
  }, [clutter, createClutterNode]);

  const refreshData = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([syncByte(), getPlayer()]);
      setByteData(b);
      setPlayerData(p);
      setIsSleeping(b?.byte?.isSleeping || false);
      setSleepUntil(b?.byte?.sleepUntil ? new Date(b.byte.sleepUntil) : null);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('waking up')) {
        setStatusText('Server is waking up... retrying shortly.');
      } else {
        setStatusText('Sync issue detected. Retrying on next refresh.');
      }
    }
  }, []);

  const setTransientStatus = useCallback((message: string, holdMs = 3400) => {
    stickyUntilRef.current = Date.now() + holdMs;
    setStatusText(message);
    if (statusResetTimerRef.current) clearTimeout(statusResetTimerRef.current);
    statusResetTimerRef.current = setTimeout(() => {
      if (Date.now() >= stickyUntilRef.current) {
        setStatusText(thoughtRef.current());
      }
    }, holdMs + 80);
  }, []);

  const randomThought = useCallback(() => {
    const thought = generateByteThought({
      byteName: byteData?.byte?.name || 'BYTE',
      needs,
      temperament: byteData?.byte?.temperament || null,
      trainingSessionsToday: Number(byteData?.byte?.trainingSessionsToday || 0),
      idleTicks: idleThoughtTicks,
    });
    if (clutter >= 3) return `${thought} Home is ${clutterLabel.toLowerCase()}.`;
    return thought;
  }, [byteData?.byte?.name, byteData?.byte?.temperament, byteData?.byte?.trainingSessionsToday, clutter, clutterLabel, idleThoughtTicks, needs]);

  useEffect(() => {
    thoughtRef.current = randomThought;
  }, [randomThought]);

  useEffect(() => {
    initSfx().catch(() => {});
    loadHomeClutterCount().then((count) => setClutter(Math.max(0, Math.min(8, count)))).catch(() => {});
    return () => {
      if (statusResetTimerRef.current) clearTimeout(statusResetTimerRef.current);
      if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    saveHomeClutterCount(clutter).catch(() => {});
  }, [clutter]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await refreshData();
        await reloadFromServer().catch(() => {});
        const clearedAt = getHomeClutterClearedAt();
        if (clearedAt > clutterSyncRef.current) {
          clutterSyncRef.current = clearedAt;
          setClutter(0);
        }
      })().catch(() => {});
    }, [refreshData, reloadFromServer])
  );

  // Redirect to egg screen if byte is an egg
  useEffect(() => {
    if (byteData?.byte?.isEgg) {
      router.replace('/egg');
    }
  }, [byteData?.byte?.isEgg, router]);

  useEffect(() => {
    const thoughtTicker = setInterval(() => {
      if (Date.now() >= stickyUntilRef.current) {
        setStatusText(randomThought());
        setIdleThoughtTicks((prev) => prev + 1);
      }
    }, 30000);

    return () => clearInterval(thoughtTicker);
  }, [randomThought]);

  useEffect(() => {
    const clutterTicker = setInterval(() => {
      const hygieneLow = (needs.Hygiene || 0) < 40;
      const spawnChance = hygieneLow ? 0.22 : 0.08;
      if (Math.random() < spawnChance) {
        setClutter((prev) => Math.min(8, prev + 1));
      }
    }, 30000);

    return () => clearInterval(clutterTicker);
  }, [needs.Hygiene]);

  // Auto-wake when sleep time expires
  useEffect(() => {
    if (!isSleeping || !sleepUntil) return;
    const now = Date.now();
    const sleepEndTime = new Date(sleepUntil).getTime();
    if (now >= sleepEndTime) {
      wakeUpByte().catch(() => {});
      setIsSleeping(false);
      setSleepUntil(null);
      setWakeUpTaps(0);
      setTransientStatus('BYTE woke up naturally.', 2000);
    } else {
      const timeUntilWake = sleepEndTime - now;
      const timer = setTimeout(() => {
        wakeUpByte().catch(() => {});
        setIsSleeping(false);
        setSleepUntil(null);
        setWakeUpTaps(0);
        setTransientStatus('BYTE woke up naturally.', 2000);
      }, timeUntilWake);
      return () => clearTimeout(timer);
    }
  }, [isSleeping, sleepUntil, setTransientStatus]);

  // Reset reaction animations after they complete
  useEffect(() => {
    const resetTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(reactionBounce, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionShake, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionShrink, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionRotate, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionHeartOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionBlinkOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]).start();
    }, 1200); // Reset after animations complete (most are < 1s, safety margin at 1.2s)

    return () => clearTimeout(resetTimer);
  }, [reactionBounce, reactionShake, reactionShrink, reactionRotate, reactionHeartOpacity, reactionBlinkOpacity]);

  useEffect(() => {
    let active = true;
    const profile = motionProfile.home;

    Animated.loop(
      Animated.sequence([
        Animated.timing(hoverY, { toValue: -profile.hoverDistance, duration: profile.hoverDuration, useNativeDriver: true }),
        Animated.timing(hoverY, { toValue: 0, duration: profile.hoverDuration, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: profile.breatheScale, duration: profile.breatheDuration, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: profile.breatheDuration, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        ...profile.strideValues.map((value, index) =>
          Animated.timing(stride, {
            toValue: value,
            duration: profile.strideDurations[index] || profile.strideDurations[profile.strideDurations.length - 1] || 240,
            useNativeDriver: true,
          })
        ),
      ])
    ).start();

    const roam = () => {
      if (!active) return;

      // Pick motion state: 60% walking_slow, 20% walking_fast, 15% idle, 5% resting
      const rand = Math.random();
      const nextMotionState: typeof motionState =
        rand < 0.60 ? 'walking_slow' : rand < 0.80 ? 'walking_fast' : rand < 0.95 ? 'idle' : 'resting';
      setMotionState(nextMotionState);

      // Resting: stay in place for a long time
      if (nextMotionState === 'resting') {
        setMoveFacing('idle');
        const restDuration = 3000 + Math.random() * 3000;
        setTimeout(roam, restDuration);
        return;
      }

      // Idle: just blink for a bit
      if (nextMotionState === 'idle') {
        setMoveFacing('idle');
        const blinkDuration = 1200 + Math.random() * 800;
        Animated.sequence([
          Animated.timing(blinkOpacity, { toValue: 0.3, duration: 150, useNativeDriver: true }),
          Animated.timing(blinkOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.delay(blinkDuration - 250),
        ]).start();
        setTimeout(roam, blinkDuration);
        return;
      }

      // Walking (slow or fast)
      const nextDepth = profile.depthMin + Math.random() * (profile.depthMax - profile.depthMin);
      const nextX = (Math.random() - 0.5) * width * profile.roamSpreadX;
      const nextY = (nextDepth - 1) * profile.depthYOffset + (Math.random() - 0.5) * profile.yJitter;

      // Adjust duration based on walk speed
      let baseMin = profile.roamDurationMin;
      let baseMax = profile.roamDurationMax;
      if (nextMotionState === 'walking_slow') {
        baseMin *= 1.4;
        baseMax *= 1.4;
      } else if (nextMotionState === 'walking_fast') {
        baseMin *= 0.6;
        baseMax *= 0.6;
      }
      const duration = Math.round(baseMin + Math.random() * Math.max(1, baseMax - baseMin));

      const facing = nextX > profile.facingThreshold ? 'right' : nextX < -profile.facingThreshold ? 'left' : 'idle';
      setMoveFacing(facing);

      Animated.parallel([
        Animated.timing(roamX, { toValue: nextX, duration, useNativeDriver: true }),
        Animated.timing(roamY, { toValue: nextY, duration, useNativeDriver: true }),
        Animated.timing(depthScale, { toValue: nextDepth, duration, useNativeDriver: true }),
      ]).start(() => {
        if (!active) return;
        setMoveFacing('idle');
        const pauseDuration = profile.pauseMin + Math.floor(Math.random() * Math.max(1, profile.pauseMax - profile.pauseMin));
        setTimeout(roam, pauseDuration);
      });
    };

    roam();
    return () => {
      active = false;
    };
  }, [breathe, depthScale, hoverY, motionProfile, roamX, roamY, stride, width]);

  const openDrawer = useCallback(() => {
    if (drawerOpen || transitionBusy) return;
    setDrawerOpen(true);
    playSfx('menu', 0.7);
    Animated.spring(drawerAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();
  }, [drawerAnim, drawerOpen, transitionBusy]);

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, { toValue: height, duration: 240, useNativeDriver: true }).start(() => setDrawerOpen(false));
  }, [drawerAnim]);

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 9 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -42) openDrawer();
        },
      }),
    [openDrawer]
  );

  const handleHomeAction = useCallback(async (key: string) => {
    if (transitionBusy) return;

    if (key === 'stats') {
      refreshData().catch(() => {});
      setStatsOpen(true);
      playSfx('menu', 0.7);
      return;
    }

    if (key === 'inventory') {
      playSfx('menu', 0.75);
      setTransientStatus('Opening inventory...', 1200);
      router.push('/(tabs)/inventory');
      return;
    }

    if (key === 'praise') {
      // Immediate feedback — don't await API
      playSfx('yes', 0.8);
      setEmotion('praise');
      if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current);
      emotionTimerRef.current = setTimeout(() => setEmotion(null), 2000);
      setActionBursts((prev) => [...prev, { id: `burst-${Date.now()}-${Math.random()}`, type: 'praise' }]);
      setTransientStatus('Praise logged. BYTE mood and social confidence increased.', 2800);
      praiseByte().catch(() => {});
      refreshData().catch(() => {});
      return;
    }

    if (key === 'scold') {
      // Immediate feedback — don't await API
      playSfx('no', 0.8);
      setEmotion('scold');
      if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current);
      emotionTimerRef.current = setTimeout(() => setEmotion(null), 2000);
      setActionBursts((prev) => [...prev, { id: `burst-${Date.now()}-${Math.random()}`, type: 'scold' }]);
      setTransientStatus('Scold logged. BYTE is re-evaluating behavior routines.', 2800);
      scoldByte().catch(() => {});
      refreshData().catch(() => {});
    }
  }, [refreshData, router, setTransientStatus, transitionBusy]);

  const handleTopMenuNav = useCallback((route: string | undefined, action?: string) => {
    if (transitionBusy) return;
    playSfx('menu', 0.6);
    if (route) {
      router.push(route as any);
    }
  }, [router, transitionBusy]);

  const handleClutterTap = useCallback(async (id: string) => {
    const tappedNode = clutterNodes.find((node) => node.id === id);
    setClutterNodes((prev) => prev.filter((node) => node.id !== id));
    setClutter((prev) => Math.max(0, prev - 1));
    playSfx('tap', 0.45);

    const award = 2 + Math.floor(Math.random() * 4);
    setRewardPopups((prev) => [
      ...prev,
      {
        id: `reward-${Date.now()}-${Math.random()}`,
        text: `+${award} BB`,
        left: Math.max(8, Math.min(width - 120, Number(tappedNode?.left || (width * 0.45)))),
        bottom: Math.max(72, Number(tappedNode?.bottom || 72) + 40),
      },
    ]);
    try {
      await earnCurrency(award, 'home_clutter');
      await refreshData();
      setIdleThoughtTicks(0);
    } catch {
      setPlayerData((prev: any) => ({ ...(prev || {}), byteBits: Number(prev?.byteBits || 0) + award }));
      setIdleThoughtTicks(0);
    }
  }, [clutterNodes, refreshData]);

  const handleRoomOpen = useCallback(
    (route: string) => {
      if (transitionBusy) return;
      if (isSleeping && route.includes('training')) {
        setTransientStatus('BYTE is sleeping... cannot access training room.', 2000);
        return;
      }
      setTransitionBusy(true);
      closeDrawer();
      setTransientStatus('Loading room interface...', 1200);
      setTimeout(() => {
        router.push(route as any);
        setTransitionBusy(false);
      }, 220);
    },
    [closeDrawer, isSleeping, router, setTransientStatus, transitionBusy]
  );

  const handleByteTap = useCallback(async () => {
    // Scale animation on tap
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(tapScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    if (isSleeping) {
      // Force-wake logic for sleeping byte
      const nextTaps = wakeUpTaps + 1;
      setWakeUpTaps(nextTaps);
      playSfx('tap', 0.5);
      setTransientStatus(`Tapping BYTE to wake it... (${nextTaps}/10)`, 1500);
      if (nextTaps >= 10) {
        try {
          await wakeUpByte();
          setIsSleeping(false);
          setSleepUntil(null);
          setWakeUpTaps(0);
          setTransientStatus('BYTE woke up!', 2000);
          await refreshData();
        } catch {
          setTransientStatus('Failed to wake BYTE.', 2000);
        }
      }
    } else {
      // Normal tap interaction — call tap endpoint
      try {
        const reaction = await tapByte();

        // Play audio
        if (reaction.audioId) {
          playSfx(reaction.audioId, 0.75);
        }

        // Trigger animation based on tier
        if (reaction.animationTier === 'positive') {
          // Happy bounce + hearts fade in/out
          Animated.parallel([
            Animated.sequence([
              Animated.timing(reactionBounce, { toValue: -30, duration: 200, useNativeDriver: true }),
              Animated.timing(reactionBounce, { toValue: 0, duration: 200, useNativeDriver: true }),
              Animated.timing(reactionBounce, { toValue: -20, duration: 150, useNativeDriver: true }),
              Animated.timing(reactionBounce, { toValue: 0, duration: 150, useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.timing(reactionHeartOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
              Animated.delay(800),
              Animated.timing(reactionHeartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
            ]),
          ]).start();
        } else if (reaction.animationTier === 'neutral') {
          // Gentle sway + eye blink
          Animated.parallel([
            Animated.sequence([
              Animated.timing(reactionRotate, { toValue: 3, duration: 400, useNativeDriver: true }),
              Animated.timing(reactionRotate, { toValue: -3, duration: 400, useNativeDriver: true }),
              Animated.timing(reactionRotate, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.delay(300),
              Animated.timing(reactionBlinkOpacity, { toValue: 0.3, duration: 100, useNativeDriver: true }),
              Animated.timing(reactionBlinkOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            ]),
          ]).start();
        } else if (reaction.animationTier === 'negative') {
          // Shrink + frown (rotate away)
          Animated.parallel([
            Animated.sequence([
              Animated.timing(reactionShrink, { toValue: 0.85, duration: 300, useNativeDriver: true }),
              Animated.timing(reactionShrink, { toValue: 1, duration: 400, useNativeDriver: true }),
            ]),
            Animated.timing(reactionRotate, { toValue: -15, duration: 300, useNativeDriver: true }),
          ]).start();
        } else if (reaction.animationTier === 'warning') {
          // Shake (side to side)
          Animated.sequence([
            Animated.timing(reactionShake, { toValue: 15, duration: 100, useNativeDriver: true }),
            Animated.timing(reactionShake, { toValue: -15, duration: 100, useNativeDriver: true }),
            Animated.timing(reactionShake, { toValue: 10, duration: 100, useNativeDriver: true }),
            Animated.timing(reactionShake, { toValue: -10, duration: 100, useNativeDriver: true }),
            Animated.timing(reactionShake, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]).start();
        } else if (reaction.animationTier === 'annoyed') {
          // Turn away + cross arms (rotate + scale)
          Animated.parallel([
            Animated.timing(reactionRotate, { toValue: -25, duration: 400, useNativeDriver: true }),
            Animated.timing(reactionShrink, { toValue: 0.9, duration: 400, useNativeDriver: true }),
          ]).start();
        } else if (reaction.animationTier === 'withdrawn') {
          // Face away + sulk (slow scale down)
          Animated.parallel([
            Animated.timing(reactionRotate, { toValue: 180, duration: 600, useNativeDriver: true }),
            Animated.timing(reactionShrink, { toValue: 0.75, duration: 800, useNativeDriver: true }),
          ]).start();
        }

        // Update displayed mood if changed
        if (reaction.moodDelta !== 0) {
          setTransientStatus(
            reaction.moodDelta > 0
              ? 'BYTE looks happy!'
              : `BYTE is getting annoyed... (Stage ${reaction.annoyanceStage})`,
            1500
          );
        }

        setIdleThoughtTicks(0);
      } catch (err) {
        // Fallback if tap endpoint fails
        playSfx('chirp1', 0.5);
      }
    }
  }, [
    isSleeping,
    wakeUpTaps,
    setTransientStatus,
    tapScale,
    refreshData,
    reactionBounce,
    reactionShake,
    reactionShrink,
    reactionRotate,
    reactionHeartOpacity,
    reactionBlinkOpacity,
  ]);

  const handleEnableDemoMode = useCallback(async () => {
    if (demoMode || demoBusy) return;
    setDemoBusy(true);
    setTransientStatus('Activating demo profile...', 1800);
    try {
      await enableDemoMode();
      await Promise.all([refreshData(), reloadFromServer().catch(() => {})]);
      playSfx('notify', 0.75);
      setTransientStatus('Demo mode enabled. Accelerated testing profile active.', 2600);
      setIdleThoughtTicks(0);
    } finally {
      setDemoBusy(false);
    }
  }, [demoBusy, demoMode, enableDemoMode, refreshData, reloadFromServer, setTransientStatus]);

  const currency = playerData?.byteBits ?? 0;
  const moodLabel = effectiveMood >= 75 ? 'Happy' : effectiveMood >= 40 ? 'Stable' : 'Needs care';
  const byteName = byteData?.byte?.name || 'BYTE';
  const byteLevel = Number(byteData?.byte?.level || 1);
  const currentXp = Number(byteData?.byte?.xp || 0);
  const nextLevelXp = xpRequired(byteLevel + 1);
  const prevLevelXp = xpRequired(Math.max(1, byteLevel));
  const xpIntoLevel = Math.max(0, currentXp - prevLevelXp);
  const xpSpan = Math.max(1, nextLevelXp - prevLevelXp);
  const xpPercent = Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpSpan) * 100)));
  const evolutionHint = byteLevel < 10 ? `Stage gate in ${10 - byteLevel} level(s)` : 'Stage evolution options unlocked';

  const NEED_SUMMARY = [
    { label: 'HEALTH', color: '#ff4f66', val: needs.Hunger || 0 },
    { label: 'ENERGY', color: '#52e58f', val: needs.Bandwidth || 0 },
    { label: 'MOOD', color: '#b87cff', val: effectiveMood },
    { label: 'HYGIENE', color: '#ffba47', val: needs.Hygiene || 0 },
  ];

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.utilityBar}>
          {TOP_MENU.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.utilityBtn}
              onPress={() => handleTopMenuNav((item as any).route, (item as any).action)}
              activeOpacity={0.85}
            >
              <Ionicons name={item.icon as any} size={14} color="#b1e2ff" />
              <Text style={styles.utilityText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.topBar}>
          <View style={styles.currencyBlock}>
            <View style={styles.currencyRow}>
              <Ionicons name="logo-bitcoin" size={14} color="#ffd45a" />
              <Text style={styles.currencyVal}>{currency.toLocaleString()}</Text>
            </View>
            <Text style={styles.currencyLabel}>BYTEBITS</Text>
          </View>

          <View style={styles.needSummary}>
            {NEED_SUMMARY.map((n) => (
              <View key={n.label} style={styles.needChip}>
                <Text style={styles.needChipLabel}>{n.label}</Text>
                <NeedPips value={n.val} color={n.color} />
              </View>
            ))}
            <View style={styles.xpBlock}>
              <View style={styles.xpRow}>
                <Text style={styles.xpLabel}>XP</Text>
                <Text style={styles.xpVal}>{xpIntoLevel}/{xpSpan}</Text>
              </View>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${xpPercent}%` }]} />
              </View>
              <Text style={styles.xpHint}>{evolutionHint}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusCardSolo}>
          <View style={styles.statusTopRow}>
            <View style={styles.statusIdentity}>
              <View style={styles.statusDot} />
              <Text style={styles.statusName}>{byteName}</Text>
            </View>
            <Text style={styles.statusChip}>Lv.{byteLevel}</Text>
            <Text style={styles.statusChip}>{moodLabel}</Text>
            <Text style={styles.statusChip}>{getStageName(stage)}</Text>
          </View>
          <Text style={styles.statusTextWrap}>{statusText}</Text>
        </View>

        <View style={styles.demoRow}>
          {demoMode && demoLabel ? (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>{demoLabel}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.demoBtn, (demoMode || demoBusy || !demoHydrated) && styles.demoBtnDisabled]}
            onPress={() => {
              runAction('demo-enable', handleEnableDemoMode, 900);
            }}
            disabled={demoMode || demoBusy || !demoHydrated}
            activeOpacity={0.86}
          >
            <Ionicons name="flash-outline" size={14} color={demoMode ? 'rgba(255,255,255,0.5)' : '#ffe18e'} />
            <Text style={[styles.demoBtnText, demoMode && styles.demoBtnTextDisabled]}>
              {demoMode ? 'DEMO ACTIVE':'ENABLE DEMO MODE'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <HomeRoomStage />

          <View style={styles.clutterLayer}>
            {backClutterNodes.map((node) => (
              <TouchableOpacity
                key={node.id}
                style={[styles.clutterTouch, { left: node.left, bottom: node.bottom, width: node.size, height: node.size }]}
                onPress={() => handleClutterTap(node.id)}
                activeOpacity={0.8}
              >
                <Image source={node.sprite} style={styles.clutterImg} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>

          <Animated.View
            style={[
              styles.byteStage,
              {
                opacity: blinkOpacity,
                transform: [
                  { translateX: roamX },
                  { translateX: reactionShake },
                  { translateY: roamY },
                  { translateY: hoverY },
                  { translateY: reactionBounce },
                  { rotate: stride.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
                  { rotate: reactionRotate.interpolate({ inputRange: [-180, 0, 180], outputRange: ['-180deg', '0deg', '180deg'] }) },
                  { scaleX: stride.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.94, 1.08, 0.94] }) },
                  { scaleY: stride.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.08, 0.92, 1.08] }) },
                  { scale: breathe },
                  { scale: depthScale },
                  { scale: tapScale },
                  { scale: reactionShrink },
                ],
              },
            ]}
          >
            <TouchableOpacity onPress={handleByteTap} activeOpacity={1}>
              <Image source={petSprite} style={styles.byteSprite} resizeMode="contain" />
            </TouchableOpacity>
          </Animated.View>

          {isSleeping && (
            <View style={{ position: 'absolute', right: width * 0.15, bottom: width * 0.25, pointerEvents: 'none' }}>
              <Text style={{ fontSize: 28, fontWeight: '900', color: 'rgba(150,180,255,0.6)' }}>Z</Text>
            </View>
          )}

          {/* Tap reaction hearts */}
          <Animated.View
            style={{
              position: 'absolute',
              top: '30%',
              left: '50%',
              marginLeft: -40,
              opacity: reactionHeartOpacity,
              pointerEvents: 'none',
            }}
          >
            <Text style={{ fontSize: 36, textAlign: 'center' }}>❤️💙💜</Text>
          </Animated.View>

          <View style={styles.clutterLayerFront}>
            {frontClutterNodes.map((node) => (
              <TouchableOpacity
                key={node.id}
                style={[styles.clutterTouch, { left: node.left, bottom: node.bottom, width: node.size, height: node.size }]}
                onPress={() => handleClutterTap(node.id)}
                activeOpacity={0.8}
              >
                <Image source={node.sprite} style={styles.clutterImgFront} resizeMode="contain" />
              </TouchableOpacity>
            ))}
          </View>

          {rewardPopups.map((popup) => (
            <FloatingReward
              key={popup.id}
              text={popup.text}
              left={popup.left}
              bottom={popup.bottom}
              onDone={() => setRewardPopups((prev) => prev.filter((entry) => entry.id !== popup.id))}
            />
          ))}

          {actionBursts.map((burst) => (
            <ActionBurst
              key={burst.id}
              type={burst.type}
              onDone={() => setActionBursts((prev) => prev.filter((entry) => entry.id !== burst.id))}
            />
          ))}
        </View>

        <View style={styles.careActionsRow}>
          {HOME_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.careBtn, (transitionBusy || isLocked(`home:${item.key}`)) && styles.careBtnDisabled]}
              onPress={() => {
                runAction(`home:${item.key}`, () => handleHomeAction(item.key));
              }}
              activeOpacity={0.86}
              disabled={transitionBusy || isLocked(`home:${item.key}`)}
            >
              <View style={[styles.careBtnIcon, { borderColor: `${item.color}99`, backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.careLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.swipeZone} {...swipeResponder.panHandlers}>
          <TouchableOpacity
            onPress={() => {
              runAction('drawer-open', openDrawer);
            }}
            activeOpacity={0.8}
            style={styles.swipePrompt}
            disabled={transitionBusy || isLocked('drawer-open')}
          >
            <Ionicons name="chevron-up" size={16} color="#72ceff" />
            <Text style={styles.swipeLabel}>SWIPE UP FOR ROOMS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {drawerOpen && (
        <TouchableOpacity style={styles.drawerOverlay} onPress={closeDrawer} activeOpacity={1}>
          <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>ROOM NAVIGATION</Text>
              <Text style={styles.drawerSub}>ROOMS AND SERVICES</Text>
              <View style={styles.roomGrid}>
                {ROOM_MENU.map((room) => (
                  <TouchableOpacity
                    key={room.key}
                    style={[styles.roomBtn, (transitionBusy || isLocked(`room:${room.key}`)) && styles.roomBtnDisabled]}
                    onPress={() => {
                      runAction(`room:${room.key}`, () => handleRoomOpen(room.route), 900);
                    }}
                    activeOpacity={0.82}
                    disabled={transitionBusy || isLocked(`room:${room.key}`)}
                  >
                    <View style={[styles.roomIcon, { borderColor: `${room.color}99`, backgroundColor: `${room.color}1e` }]}>
                      <Ionicons name={room.icon as any} size={18} color={room.color} />
                    </View>
                    <Text style={styles.roomTitle}>{room.title}</Text>
                    <Text style={styles.roomSub}>{room.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.drawerFooter}>
                <TouchableOpacity style={styles.drawerClose} onPress={closeDrawer} activeOpacity={0.85}>
                  <Text style={styles.drawerCloseText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      <StatsModal
        visible={statsOpen}
        onClose={() => setStatsOpen(false)}
        byteData={byteData}
        playerData={playerData}
        onEvolved={() => {
          (async () => {
            await refreshData();
            await reloadFromServer().catch(() => {});
          })().catch(() => {});
        }}
      />

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },
  utilityBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  utilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.25)',
    backgroundColor: 'rgba(9,14,52,0.74)',
    paddingVertical: 6,
  },
  utilityText: { color: '#b1e2ff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  topBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8, alignItems: 'stretch' },
  currencyBlock: {
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    minWidth: 96,
  },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  currencyVal: { color: '#fff', fontWeight: '800', fontSize: 15 },
  currencyLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, letterSpacing: 1.2, fontWeight: '700' },
  needSummary: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: 'rgba(9,14,52,0.75)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.26)',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  needChip: { width: '48%', gap: 2 },
  needChipLabel: { color: 'rgba(230,245,255,0.8)', fontSize: 8, letterSpacing: 1, fontWeight: '700' },
  xpBlock: { width: '100%', marginTop: 4, gap: 3 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel: { color: '#8fd9ff', fontSize: 8.8, fontWeight: '800', letterSpacing: 1 },
  xpVal: { color: 'rgba(235,246,255,0.88)', fontSize: 8.8, fontWeight: '700' },
  xpTrack: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  xpFill: { height: 6, borderRadius: 4, backgroundColor: '#77d4ff' },
  xpHint: { color: 'rgba(182,223,255,0.76)', fontSize: 8.5, fontWeight: '700' },
  pipRow: { flexDirection: 'row', gap: 2 },
  pip: { width: 8, height: 6, borderRadius: 2 },
  field: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', position: 'relative', paddingBottom: 16 },
  clutterLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
    zIndex: 1,
    overflow: 'visible',
  },
  clutterLayerFront: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
    zIndex: 4,
    overflow: 'visible',
  },
  clutterTouch: {
    position: 'absolute',
    zIndex: 3,
  },
  clutterImg: {
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  clutterImgFront: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  rewardPopup: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,212,90,0.7)',
    backgroundColor: 'rgba(56,40,12,0.84)',
    zIndex: 7,
  },
  rewardPopupText: {
    color: '#ffe08d',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  burstLayer: {
    position: 'absolute',
    bottom: 56,
    alignSelf: 'center',
    width: 140,
    height: 110,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 6,
  },
  burstGlyph: {
    position: 'absolute',
    bottom: 0,
    fontSize: 20,
  },
  byteStage: { position: 'absolute', bottom: 12, zIndex: 3, pointerEvents: 'box-none' },
  byteSprite: { width: width * 0.3, height: width * 0.3 },
  statusCardSolo: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: 'rgba(10,15,52,0.84)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(111,198,255,0.24)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 2,
  },
  statusDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: '#5dff93' },
  statusName: { color: '#e8f6ff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  statusChip: {
    color: '#7bd9ff',
    fontSize: 9.2,
    fontWeight: '700',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(123,217,255,0.28)',
    backgroundColor: 'rgba(20,54,88,0.56)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  statusTextWrap: { color: 'rgba(255,255,255,0.82)', fontSize: 10.2, fontWeight: '600', lineHeight: 15 },
  demoRow: {
    marginTop: 8,
    marginHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  demoBadge: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,225,142,0.45)',
    backgroundColor: 'rgba(78,58,18,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  demoBadgeText: {
    color: '#ffe08d',
    fontSize: 9.4,
    fontWeight: '800',
    letterSpacing: 1,
  },
  demoBtn: {
    minWidth: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,225,142,0.52)',
    backgroundColor: 'rgba(78,58,18,0.72)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  demoBtnDisabled: {
    opacity: 0.58,
  },
  demoBtnText: {
    color: '#ffe08d',
    fontSize: 9.6,
    fontWeight: '900',
    letterSpacing: 1,
  },
  demoBtnTextDisabled: {
    color: 'rgba(255,255,255,0.6)',
  },
  careActionsRow: { marginTop: 10, marginHorizontal: 10, flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  careBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(8,18,62,0.84)',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  careBtnDisabled: { opacity: 0.58 },
  careBtnIcon: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  careLabel: { color: 'rgba(220,236,255,0.84)', fontSize: 8, fontWeight: '800', letterSpacing: 0.7, textAlign: 'center' },
  swipeZone: { paddingTop: 6, paddingBottom: 8 },
  swipePrompt: { alignItems: 'center', gap: 2 },
  swipeLabel: { color: '#72ceff', fontSize: 9.5, fontWeight: '800', letterSpacing: 2 },
  drawerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  drawer: {
    backgroundColor: 'rgba(6,14,48,0.985)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(95,177,255,0.28)',
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 11,
  },
  drawerHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginBottom: 14 },
  drawerTitle: { color: '#fff', fontSize: 17, letterSpacing: 2, fontWeight: '900' },
  drawerSub: { color: 'rgba(255,255,255,0.42)', fontSize: 10, letterSpacing: 2, marginBottom: 14 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  roomBtn: {
    width: (width - 54) / 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108,187,255,0.2)',
    backgroundColor: 'rgba(11,22,70,0.8)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  roomBtnDisabled: { opacity: 0.56 },
  roomIcon: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  roomTitle: { color: '#dff1ff', fontSize: 11, letterSpacing: 1.1, fontWeight: '800' },
  roomSub: { color: 'rgba(255,255,255,0.55)', fontSize: 9.5 },
  drawerFooter: { marginTop: 14, flexDirection: 'row', gap: 10 },
  drawerClose: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  drawerCloseText: { color: 'rgba(255,255,255,0.56)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,20,0.88)', justifyContent: 'flex-end', alignItems: 'center' },
  statsCard: {
    backgroundColor: 'rgba(6,14,48,0.98)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.2)',
    padding: 24,
    gap: 8,
    width: '100%',
    maxHeight: '90%',
  },
  statsTitle: { color: '#7ec8ff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  statsName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  statsScroll: { flex: 1 },
  statsSection: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 5 },
  kvKey: { color: 'rgba(180,214,242,0.72)', fontSize: 9.6, fontWeight: '700', letterSpacing: 0.9, flex: 1 },
  kvVal: { color: '#e3f3ff', fontSize: 9.8, fontWeight: '700', flex: 1, textAlign: 'right' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statsKey: { color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: 1, width: 66, fontWeight: '700' },
  statsBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  statsBarFill: { height: 6, borderRadius: 3, backgroundColor: '#7ec8ff' },
  statsVal: { color: '#fff', fontSize: 11, fontWeight: '700', width: 26, textAlign: 'right' },
  statsClose: { marginTop: 12, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statsCloseText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
});
