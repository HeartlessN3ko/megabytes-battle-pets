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
import {
  careAction,
  earnCurrency,
  evolveByte,
  getPlayer,
  praiseByte,
  scoldByte,
  setByteLights,
  syncByte,
  tapByte,
  wakeUpByte,
} from '../../services/api';
import {
  clearPendingPoop,
  getHomeClutterClearedAt,
  getLastSeenLevel,
  getLightsOn,
  getPendingPoopAt,
  loadHomeClutterCount,
  saveHomeClutterCount,
  saveLightsOn,
  setLastSeenLevel,
  setPendingPoopAt,
} from '../../services/homeRuntimeState';
import { initSfx, playSfx } from '../../services/sfx';
import { useEvolution } from '../../context/EvolutionContext';
import { useActionGate } from '../../hooks/useActionGate';
import { useByteRoaming } from '../../hooks/useByteRoaming';
import { generateByteThought } from '../../services/byteThoughts';
import { getByteMotionProfile } from '../../services/byteMotion';
import { getStageSprite, type LifespanStage } from '../../services/byteSprites';
import {
  clutterSpawnProbability,
  clutterSpawnProbabilityDirty,
  poopDigestMs,
} from '../../config/gameBalance';
import HomeRoomStage from '../../components/HomeRoomStage';
import RPSGame from '../../components/RPSGame';
import SleepZsOverlay from '../../components/SleepZsOverlay';
import NeedRequestBubble, { NeedRequest } from '../../components/NeedRequestBubble';
import CorruptionAura from '../../components/CorruptionAura';

const { width, height } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

const CORRUPTION_TIER_COLOR: Record<string, string> = {
  none: '#888888', light: '#ffe666', medium: '#ff9c44', heavy: '#ff6060', critical: '#bf44ff',
};

// Idle flavor pool — random one-shots during default rest state.
// Fires every 8–15s, plays for IDLE_VARIANT_HOLD_MS, returns to blink-bounce.
// Map points at SpriteKeys in byteSprites; resolved per-stage at render time.
const IDLE_VARIANT_TO_SPRITE_KEY: Record<string, import('../../services/byteSprites').SpriteKey> = {
  squish:       'squish',
  'low-bounce': 'lowBounce',
  lookdown:     'lookDown',
  'look-left':  'lookLeft',
  eyeroll:      'eyeroll',
  wink:         'wink',
  smile:        'smile',
  blush:        'blush',
};
const IDLE_VARIANT_KEYS = Object.keys(IDLE_VARIANT_TO_SPRITE_KEY);
const IDLE_VARIANT_MIN_DELAY_MS = 8000;
const IDLE_VARIANT_MAX_DELAY_MS = 15000;
const IDLE_VARIANT_HOLD_MS      = 2500;

// Glance lookup — maps useByteRoaming's glance state to a SpriteKey, resolved
// per-stage at render time. `lookUp` currently falls back to blinkBounce inside
// byteSprites until Circle-look-up.gif ships.
const GLANCE_TO_SPRITE_KEY: Record<string, import('../../services/byteSprites').SpriteKey> = {
  'look-left':  'lookLeft',
  'look-right': 'lookRight',
  'look-down':  'lookDown',
  'look-up':    'lookUp',
};

const STAGE_NAMES = ['EGG', 'Stage 1 .PNG', 'Stage 2 .SVG', 'Stage 3 .GIF', 'Stage 4 .ANI', 'Stage 5 .MOV'];
const getStageName = (stage: number) => STAGE_NAMES[Math.max(0, Math.min(5, stage))] || 'Unknown';

const CLUTTER_SPRITES = [
  require('../../assets/images/clutter1.png'),
  require('../../assets/images/clutter2.png'),
];

// bottomMin/Max are % of the field height, matching the byte's `bottom: '20%'`
// floor plane. Keeping a tight band so clutter sits on the same line as the byte.
const CLUTTER_ZONES = [
  { leftMin: 10, leftMax: 22, bottomMin: 19, bottomMax: 21, frontChance: 0.65 },
  { leftMin: 24, leftMax: 36, bottomMin: 19, bottomMax: 21, frontChance: 1.0 },
  { leftMin: 64, leftMax: 76, bottomMin: 19, bottomMax: 21, frontChance: 1.0 },
  { leftMin: 78, leftMax: 90, bottomMin: 19, bottomMax: 21, frontChance: 0.65 },
];

const UTILITY_BAR = [
  { key: 'profile',    label: 'PROFILE',    icon: 'person-circle-outline', route: '/(tabs)/profile' },
  { key: 'inbox',      label: 'INBOX',      icon: 'mail-open-outline',     route: '/(tabs)/inbox' },
  { key: 'daily-care', label: 'TASKS',      icon: 'calendar-outline',      route: '/(tabs)/daily-care' },
  { key: 'events',     label: 'EVENTS',     icon: 'sparkles-outline',      route: '/(tabs)/events' },
];

const ROOM_MENU = [
  { key: 'kitchen',   title: 'KITCHEN',      subtitle: 'Feed and meals',        icon: 'restaurant-outline',      route: '/rooms/kitchen',          color: '#ffcb58' },
  { key: 'bathroom',  title: 'BATHROOM',     subtitle: 'Clean and wash',        icon: 'water-outline',           route: '/rooms/bathroom',         color: '#56d9ff' },
  { key: 'training',  title: 'TRAINING',     subtitle: 'Stat drills',           icon: 'barbell-outline',         route: '/rooms/training-center',  color: '#d48fff' },
  { key: 'clinic',    title: 'CLINIC',       subtitle: 'Recovery support',      icon: 'medkit-outline',          route: '/rooms/clinic',           color: '#8deac7' },
  { key: 'play',      title: 'PLAY ROOM',    subtitle: 'Mood support',          icon: 'game-controller-outline', route: '/rooms/play-room',        color: '#ff8dd2' },
  { key: 'market',    title: 'MARKETPLACE',  subtitle: 'Auctions and buy-now',  icon: 'pricetags-outline',       route: '/(tabs)/marketplace',     color: '#5bdd7e' },
];

// Mirrors backend xpEngine.xpRequiredForLevel — XP to clear THIS level.
// `byte.xp` from the API is XP-into-current-level (resets on level-up), not cumulative.
const LEVEL_CAP = 50;
function xpRequired(level: number) {
  return Math.round(450 * Math.sqrt(Math.max(1, level)));
}

// Mirrors backend evolutionEngine.getLevelForStage — gate to enter the NEXT stage.
const EVOLUTION_GATES = [5, 10, 20, 35, 50, 75];
function levelGateForNextStage(currentStage: number) {
  return EVOLUTION_GATES[Math.max(0, Math.min(EVOLUTION_GATES.length - 1, currentStage))] || 5;
}

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days  = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins  = totalMinutes % 60;
  if (days  > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function FloatingReward({ text, left, bottom, onDone }: { text: string; left: number; bottom: number; onDone: () => void }) {
  const rise    = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const sway    = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(720),
        Animated.timing(opacity, { toValue: 0, duration: 950, useNativeDriver: true }),
      ]),
      Animated.timing(rise,  { toValue: -92, duration: 1820, useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.05, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 1220, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(sway, { toValue:  1,   duration: 320, useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1,   duration: 420, useNativeDriver: true }),
        Animated.timing(sway, { toValue:  0.6, duration: 340, useNativeDriver: true }),
        Animated.timing(sway, { toValue:  0,   duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, [onDone, opacity, rise, scale, sway]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.rewardPopup, {
        left, bottom, opacity,
        transform: [
          { translateY: rise },
          { translateX: sway.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
          { rotate:     sway.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) },
          { scale },
        ],
      }]}
    >
      <Text style={styles.rewardPopupText}>{text}</Text>
    </Animated.View>
  );
}

function LevelUpBanner({ onDone }: { onDone: () => void }) {
  const rise    = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const sway    = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(1100),
        Animated.timing(opacity, { toValue: 0, duration: 950, useNativeDriver: true }),
      ]),
      Animated.timing(rise, { toValue: -64, duration: 2230, useNativeDriver: true }),
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, friction: 5, tension: 70, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 1600, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(sway, { toValue:  1,   duration: 340, useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1,   duration: 440, useNativeDriver: true }),
        Animated.timing(sway, { toValue:  0.6, duration: 360, useNativeDriver: true }),
        Animated.timing(sway, { toValue:  0,   duration: 320, useNativeDriver: true }),
      ]),
    ]).start(() => onDone());
  }, [onDone, opacity, rise, scale, sway]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.levelUpBanner, {
        opacity,
        transform: [
          { translateY: rise },
          { translateX: sway.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) },
          { rotate:     sway.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
          { scale },
        ],
      }]}
    >
      <Text style={styles.levelUpText}>LEVEL UP</Text>
    </Animated.View>
  );
}

function ActionBurst({ type, onDone, roamX }: { type: 'praise' | 'scold'; onDone: () => void; roamX: Animated.Value }) {
  const p0 = useRef(new Animated.Value(0)).current;
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const p3 = useRef(new Animated.Value(0)).current;
  const glyph = type === 'praise' ? '💗' : '💢';

  useEffect(() => {
    Animated.stagger(90, [p0, p1, p2, p3].map((p) =>
      Animated.timing(p, { toValue: 1, duration: 760, useNativeDriver: true })
    )).start(() => onDone());
  }, [onDone, p0, p1, p2, p3]);

  return (
    <Animated.View pointerEvents="none" style={[styles.burstLayer, { transform: [{ translateX: roamX }] }]}>
      {[p0, p1, p2, p3].map((p, idx) => {
        const xOff   = idx % 2 === 0 ? -22 - idx * 8 : 20 + idx * 7;
        const yTravel = p.interpolate({ inputRange: [0, 1], outputRange: [0, -60 - idx * 12] });
        const op      = p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
        const wiggle  = p.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '10deg'] });
        return (
          <Animated.Text key={`${type}-${idx}`}
            style={[styles.burstGlyph, { opacity: op, transform: [{ translateX: xOff }, { translateY: yTravel }, { rotate: wiggle }] }]}
          >
            {glyph}
          </Animated.Text>
        );
      })}
    </Animated.View>
  );
}

function NeedBar({ label, value, color }: { label: string; value: number; color: string }) {
  const filled = Math.max(0, Math.min(6, Math.round((value / 100) * 6)));
  return (
    <View style={styles.needBarRow}>
      <Text style={styles.needBarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.pipRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={[styles.pip, { backgroundColor: i < filled ? color : 'rgba(255,255,255,0.12)' }]}
          />
        ))}
      </View>
      <Text style={styles.needBarVal}>{Math.round(value)}</Text>
    </View>
  );
}

function StatsModal({ visible, onClose, byteData, playerData, onEvolved }: {
  visible: boolean; onClose: () => void; byteData: any; playerData: any; onEvolved: () => void;
}) {
  const [evolving,    setEvolving]    = React.useState(false);
  const [evolveError, setEvolveError] = React.useState<string | null>(null);

  const byte   = byteData?.byte;
  // Base stats = byte's true progression values. computedStats = battle-time (needs × biases).
  // Report shows base for transparency + computed side-by-side when they diverge.
  const baseStats = byte?.stats || {};
  const liveStats = byteData?.computedStats || baseStats;
  const needs  = byte?.needs || {};
  const statKeys = ['Power', 'Speed', 'Defense', 'Special', 'Stamina', 'Accuracy'];
  const moves  = Array.isArray(byte?.equippedMoves) ? byte.equippedMoves : [];
  const wins   = Number(playerData?.arenaRecord?.wins   || 0);
  const losses = Number(playerData?.arenaRecord?.losses || 0);
  const bornAtMs = byte?.bornAt ? new Date(byte.bornAt).getTime() : Date.now();
  const corruptionTier  = (byteData?.corruptionTier || byte?.corruptionTier || 'none') as string;
  const corruptionColor = CORRUPTION_TIER_COLOR[corruptionTier] || '#888888';
  const passive  = byte?.equippedPassive || 'None';
  const ult      = byte?.equippedUlt     || 'None';
  const currentStage = Number(byte?.evolutionStage || 0);
  const gateLevel = levelGateForNextStage(currentStage);
  const byteLevel = Number(byte?.level || 1);
  const avgNeed   = Math.round(
    (Number(needs.Hunger || 0) + Number(needs.Bandwidth || 0) + Number(needs.Hygiene || 0) +
     Number(needs.Social  || 0) + Number(needs.Fun     || 0) + Number(needs.Mood     || 0)) / 6
  );
  const atCap = currentStage >= 5 || byteLevel >= LEVEL_CAP;
  const levelReady = byteLevel >= gateLevel;
  const careReady  = avgNeed >= 65;
  const evolutionReadiness = atCap ? 'MAX' : levelReady && careReady ? 'READY' : levelReady ? 'PARTIAL' : 'NOT READY';

  // byte.xp is XP INTO current level (backend xpEngine.applyXPGain resets on level-up).
  const xpIntoLevel = Number(byte?.xp || 0);
  const xpSpan      = Math.max(1, xpRequired(byteLevel));
  const xpPercent   = atCap ? 100 : Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpSpan) * 100)));
  const evolutionHint = atCap
    ? 'Level cap reached'
    : byteLevel < gateLevel
      ? `Stage gate in ${gateLevel - byteLevel} level(s)`
      : 'Evolution unlocked';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalBg} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={styles.statsCard}>
          <Text style={styles.statsTitle}>SYSTEM REPORT</Text>
          <Text style={styles.statsName}>{byte?.name || 'Byte'} Lv.{byteLevel}</Text>

          <ScrollView style={styles.statsScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.statsSection}>STATS</Text>
            {statKeys.map((k) => {
              const base = Math.round(Number(baseStats[k] || 0));
              const live = Math.round(Number(liveStats[k] || base));
              const diff = live - base;
              const barPct = Math.max(base > 0 ? 4 : 0, Math.min(100, base));
              const diffColor = diff > 0 ? '#7cffb2' : diff < 0 ? '#ff9090' : 'rgba(182,223,255,0.55)';
              return (
                <View key={k} style={styles.statsRow}>
                  <Text style={styles.statsKey}>{k.toUpperCase()}</Text>
                  <View style={styles.statsBarTrack}>
                    <View style={[styles.statsBarFill, { width: `${barPct}%` }]} />
                  </View>
                  <Text style={styles.statsVal}>{base}</Text>
                  {diff !== 0 && (
                    <Text style={{ color: diffColor, fontSize: 8.5, fontWeight: '800', marginLeft: 4, minWidth: 28, textAlign: 'right' }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </Text>
                  )}
                </View>
              );
            })}
            <Text style={{ color: 'rgba(182,223,255,0.55)', fontSize: 8, marginTop: 2, marginBottom: 4 }}>
              Base stats. +/- shown is live modifier from needs &amp; biases.
            </Text>

            <Text style={styles.statsSection}>XP PROGRESS</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>LEVEL / XP</Text>
              <Text style={styles.kvVal}>{byteLevel}{atCap ? ' (CAP)' : ''} · {atCap ? '—' : `${xpIntoLevel}/${xpSpan}`}</Text>
            </View>
            <View style={styles.statsBarTrack}>
              <View style={[styles.statsBarFill, { width: `${xpPercent}%`, backgroundColor: '#77d4ff' }]} />
            </View>
            <Text style={{ color: 'rgba(182,223,255,0.7)', fontSize: 8.5, fontWeight: '700', marginTop: 3, marginBottom: 4 }}>{evolutionHint}</Text>

            {evolutionReadiness === 'READY' && !byte?.isEgg && !atCap && (
              <TouchableOpacity
                style={{ marginTop: 6, marginBottom: 4, backgroundColor: 'rgba(124,255,178,0.15)', borderRadius: 10, borderWidth: 1, borderColor: '#7cffb2', padding: 12, alignItems: 'center' }}
                disabled={evolving}
                onPress={async () => {
                  setEvolving(true); setEvolveError(null);
                  try { await evolveByte(); onEvolved(); onClose(); }
                  catch (e: any) { setEvolveError(e?.message || 'Evolution failed.'); }
                  finally { setEvolving(false); }
                }}
              >
                <Text style={{ color: '#7cffb2', fontSize: 13, fontWeight: '900', letterSpacing: 2 }}>
                  {evolving ? 'EVOLVING...' : '▲ EVOLVE'}
                </Text>
              </TouchableOpacity>
            )}
            {evolveError && <Text style={{ color: '#ff6060', fontSize: 11, marginTop: 4, textAlign: 'center' }}>{evolveError}</Text>}

            <Text style={styles.statsSection}>LOADOUT</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>MOVES</Text><Text style={styles.kvVal}>{moves.length ? moves.join(', ') : 'None'}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>ULT</Text><Text style={styles.kvVal}>{ult}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PASSIVE</Text><Text style={styles.kvVal}>{passive}</Text></View>

            <Text style={styles.statsSection}>PROFILE</Text>
            {[
              ['LIFE STAGE',          String(byte?.lifespanStage || 'baby').toUpperCase()],
              ['SHAPE',               byte?.shape       || 'Circle'],
              ['TIME ALIVE',          formatAge(Date.now() - bornAtMs)],
              ['GENERATION',          String(Number(byte?.generation || 1))],
              ['CARE READINESS',      `Avg Need ${avgNeed}`],
            ].map(([k, v]) => (
              <View key={k} style={styles.kvRow}>
                <Text style={styles.kvKey}>{k}</Text>
                <Text style={[styles.kvVal, k === 'EVOLUTION READINESS' && v === 'READY' ? { color: '#7cffb2' } : null]}>{v}</Text>
              </View>
            ))}
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>CORRUPTION</Text>
              <Text style={[styles.kvVal, { color: corruptionColor }]}>
                {Math.round(Number(byte?.corruption || 0))} — {corruptionTier.toUpperCase()}
              </Text>
            </View>

            <Text style={styles.statsSection}>BEHAVIOR</Text>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PRAISE / SCOLD</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.praiseCount || 0)} / {Number(byte?.behaviorMetrics?.scoldCount || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>TAP CHECKINS</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.tapFrequency || 0)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvKey}>PLAY/TRAIN RATIO</Text><Text style={styles.kvVal}>{Number(byte?.behaviorMetrics?.playVsTrainRatio || 0).toFixed(2)}</Text></View>

            <Text style={styles.statsSection}>PLAYER SUMMARY</Text>
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

// ─── Main screen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { stage, reloadFromServer } = useEvolution();
  const { isLocked, runAction } = useActionGate(700);

  // Motion animations
  // roamX/roamY/depthScale/hoverY/breathe/stride all removed 2026-04-23 — roaming is
  // owned by useByteRoaming, and hover/breathe/stride bobs were causing the "wobble on
  // every screen" regression. Byte is floor-anchored (Y=0); vertical motion lives in GIFs.
  const tapScale   = useRef(new Animated.Value(1)).current;

  // Tap reaction animations
  const reactionBounce       = useRef(new Animated.Value(0)).current;
  const reactionShake        = useRef(new Animated.Value(0)).current;
  const reactionShrink       = useRef(new Animated.Value(1)).current;
  const reactionRotate       = useRef(new Animated.Value(0)).current;
  const reactionHeartOpacity = useRef(new Animated.Value(0)).current;
  const reactionBlinkOpacity = useRef(new Animated.Value(1)).current;

  // Rooms drawer animation (restored — slides up from bottom)
  const drawerAnim = useRef(new Animated.Value(height)).current;

  const stickyUntilRef    = useRef(0);
  const clutterSyncRef    = useRef(0);
  const syncBusyRef       = useRef(false);
  // Last observed Hunger value — used to detect a feed event (Hunger jump ≥ FEED_DETECT_MIN).
  const prevHungerRef     = useRef<number | null>(null);
  // boredomRef removed 2026-04-23 — boredom is now passed directly into useByteRoaming.
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thoughtRef        = useRef<() => string>(() => 'BYTE is scanning the network.');
  const emotionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleVariantTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [byteData,      setByteData]      = useState<any>(null);
  const [playerData,    setPlayerData]    = useState<any>(null);
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [statsOpen,     setStatsOpen]     = useState(false);
  const [statusText,    setStatusText]    = useState('BYTE is scanning the network.');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [clutter,       setClutter]       = useState(0);
  const [clutterNodes,  setClutterNodes]  = useState<{ id: string; sprite: any; left: number; bottom: string; size: number; front: boolean; kind: 'trash' | 'poop' }[]>([]);
  const [idleThoughtTicks, setIdleThoughtTicks] = useState(0);
  const [rewardPopups,  setRewardPopups]  = useState<{ id: string; text: string; left: number; bottom: number }[]>([]);
  const [actionBursts,  setActionBursts]  = useState<{ id: string; type: 'praise' | 'scold' }[]>([]);
  const [levelUpBanners, setLevelUpBanners] = useState<{ id: string }[]>([]);
  const [emotion,       setEmotion]       = useState<'praise' | 'scold' | null>(null);
  const [idleVariant,   setIdleVariant]   = useState<string | null>(null);
  // moveFacing / motionState removed 2026-04-23 — driven by useByteRoaming.
  const [isSleeping,    setIsSleeping]    = useState(false);
  const [rpsOpen,       setRpsOpen]       = useState(false);
  const [sleepUntil,    setSleepUntil]    = useState<Date | null>(null);
  const [wakeUpTaps,    setWakeUpTaps]    = useState(0);
  const [lightsOn,      setLightsOn]      = useState(true);

  // ─── Derived data ────────────────────────────────────────────────────────────

  const needs = useMemo(
    () => byteData?.byte?.needs || { Hunger: 80, Bandwidth: 80, Hygiene: 80, Social: 80, Fun: 80, Mood: 80 },
    [byteData?.byte?.needs]
  );

  const clutterPenalty = Math.min(24, clutter * 3);
  const effectiveMood  = Math.max(0, (needs.Mood || 0) - clutterPenalty);
  const motionProfile  = useMemo(() => getByteMotionProfile(stage), [stage]);

  // Roaming — single source of truth for horizontal motion, facing, and glances.
  // Y stays at 0; vertical hops are baked into the GIFs themselves.
  const {
    translateX: roamX,
    facing:     moveFacing,
    glance:     roamGlance,
  } = useByteRoaming({
    halfSpreadX: (width * motionProfile.home.roamSpreadX) / 2,
    enabled:     !isSleeping && !emotion,
    boredom:     (needs.Fun ?? 100) < 30 || (needs.Mood ?? 100) < 35,
    // Speed stat tunes pace. Faster Speed = shorter travel + pause windows.
    // mult = 1 + (Speed - 10) * 0.02, clamped to [0.7, 1.4] (v1 stat range).
    travelDurationMin: 2800 / Math.max(0.7, Math.min(1.4, 1 + ((Number(byteData?.byte?.stats?.Speed ?? 10) - 10) * 0.02))),
    travelDurationMax: 4600 / Math.max(0.7, Math.min(1.4, 1 + ((Number(byteData?.byte?.stats?.Speed ?? 10) - 10) * 0.02))),
  });

  // Pick the most urgent unmet need to surface as a request emote above the byte.
  // Priority order tracks survival impact: hunger > hygiene > bandwidth > fun.
  // Returns null if nothing under the request threshold (or while sleeping — Z's cover that).
  const requestedNeed: NeedRequest = useMemo(() => {
    if (isSleeping) return null;
    const REQUEST_THRESHOLD = 30;
    const candidates: { key: NeedRequest; value: number; priority: number }[] = [
      { key: 'hunger',    value: Number(needs.Hunger    ?? 100), priority: 4 },
      { key: 'hygiene',   value: Number(needs.Hygiene   ?? 100), priority: 3 },
      { key: 'bandwidth', value: Number(needs.Bandwidth ?? 100), priority: 2 },
      { key: 'fun',       value: Math.min(Number(needs.Fun ?? 100), Number(needs.Social ?? 100)), priority: 1 },
    ];
    const unmet = candidates.filter((c) => c.value < REQUEST_THRESHOLD);
    if (unmet.length === 0) return null;
    // Sort by lowest value, breaking ties with priority weight.
    unmet.sort((a, b) => (a.value - b.value) || (b.priority - a.priority));
    return unmet[0].key;
  }, [isSleeping, needs.Hunger, needs.Hygiene, needs.Bandwidth, needs.Fun, needs.Social]);

  const clutterLabel = useMemo(() => {
    if (clutter >= 5) return 'Crowded';
    if (clutter >= 3) return 'Messy';
    if (clutter >= 1) return 'Minor clutter';
    return 'Clean';
  }, [clutter]);

  // Treat items in inventory
  const treatCount = useMemo(() => {
    const inv = playerData?.itemInventory;
    if (!Array.isArray(inv)) return 0;
    return inv
      .filter((item: any) => item?.type === 'treat' || item?.category === 'treat' || String(item?.name || '').toLowerCase().includes('treat'))
      .reduce((sum: number, item: any) => sum + (Number(item?.quantity) || 1), 0);
  }, [playerData?.itemInventory]);

  const corruptionTier  = (byteData?.corruptionTier || byteData?.byte?.corruptionTier || 'none') as string;
  const corruptionColor = CORRUPTION_TIER_COLOR[corruptionTier] || '#888888';
  const affection       = Number(byteData?.byte?.affection ?? 50);
  const affectionTier   = (byteData?.affectionTier || 'normal') as string;

  const byteName  = byteData?.byte?.name  || 'BYTE';
  const byteLevel = Number(byteData?.byte?.level || 1);
  const moodLabel = effectiveMood >= 75 ? 'Happy' : effectiveMood >= 40 ? 'Stable' : 'Needs care';
  const stageName = getStageName(stage);

  // Level-up banner detection — compares byte.level to the last value we
  // acknowledged on this screen (stored per-byte in AsyncStorage). Catches:
  //  • Level-ups that happen while on the home screen (byteLevel changes live).
  //  • Level-ups that happened on other screens (banner fires on next home load).
  // First observation per byte is silent — we seed the stored value.
  const byteIdForLevel = String(byteData?.byte?._id || '');
  const lastSeenLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!byteIdForLevel) return;
    if (!Number.isFinite(byteLevel) || byteLevel < 1) return;

    // First observation this mount — read stored baseline.
    if (lastSeenLevelRef.current === null) {
      getLastSeenLevel(byteIdForLevel).then((stored) => {
        if (stored == null) {
          // Brand new byte — seed silently, no banner.
          lastSeenLevelRef.current = byteLevel;
          setLastSeenLevel(byteIdForLevel, byteLevel).catch(() => {});
          return;
        }
        if (byteLevel > stored) {
          // Level(s) gained while off-screen. Fire one banner.
          setLevelUpBanners((prev) => [...prev, { id: `lvl-${Date.now()}-${Math.random()}` }]);
          lastSeenLevelRef.current = byteLevel;
          setLastSeenLevel(byteIdForLevel, byteLevel).catch(() => {});
        } else {
          lastSeenLevelRef.current = stored;
        }
      }).catch(() => {
        lastSeenLevelRef.current = byteLevel;
      });
      return;
    }

    // Subsequent observations — live level-up while on home.
    if (byteLevel > lastSeenLevelRef.current) {
      setLevelUpBanners((prev) => [...prev, { id: `lvl-${Date.now()}-${Math.random()}` }]);
      lastSeenLevelRef.current = byteLevel;
      setLastSeenLevel(byteIdForLevel, byteLevel).catch(() => {});
    }
  }, [byteIdForLevel, byteLevel]);

  // Daily care chip
  const activeTasks    = byteData?.byte?.activeDailyTasks || [];
  const completedTasks = activeTasks.filter((t: any) => t.completed || (t.target === true && !t.failed)).length;
  const totalTasks     = activeTasks.length;

  // Home needs display: Hunger, Bandwidth, Hygiene, Social, Corruption, Affection
  const HOME_NEEDS = [
    { label: 'HUNGER',    val: needs.Hunger    || 0, color: '#ff6b87' },
    { label: 'ENERGY',    val: needs.Bandwidth || 0, color: '#52e58f' },
    { label: 'HYGIENE',   val: needs.Hygiene   || 0, color: '#56d9ff' },
    { label: 'SOCIAL',    val: needs.Social    || 0, color: '#ffba47' },
    { label: 'CORRUPT',   val: Number(byteData?.byte?.corruption || 0), color: corruptionColor },
    { label: 'LOVE',      val: affection,              color: '#dd9aff' },
  ];

  // Sprite state machine — evaluated in priority order.
  // Higher-priority branches win; the default idle path may swap in a random
  // flavor variant from IDLE_VARIANT_TO_SPRITE_KEY (see effect above).
  //
  // Corruption no longer drives the sick sprite — it's now shown as a glitch
  // aura via <CorruptionAura/>. The sick sprite fires only when every primary
  // need is critical ("the byte has completely fallen apart").
  const corruptionValue = Number(byteData?.byte?.corruption || 0);
  const allNeedsCritical =
    (needs.Hunger    ?? 100) < 10 &&
    (needs.Bandwidth ?? 100) < 10 &&
    (needs.Hygiene   ?? 100) < 10 &&
    (needs.Social    ?? 100) < 10 &&
    (needs.Mood      ?? 100) < 10;
  const allNeedsHappy =
    (needs.Hunger    ?? 100) >= 70 &&
    (needs.Bandwidth ?? 100) >= 70 &&
    (needs.Hygiene   ?? 100) >= 70 &&
    (needs.Social    ?? 100) >= 70 &&
    (needs.Fun       ?? 100) >= 70 &&
    (needs.Mood      ?? 100) >= 70;

  // v1 lifespan-stage-aware sprite resolution. Adult sprites are the
  // current shipped set; other stages fall back to adult until art ships.
  const lifespanStage: LifespanStage = (byteData?.byte?.lifespanStage as LifespanStage) || 'adult';

  // Stat-driven render scale: stage base × Strength modifier. Mirror of
  // backend lifespanEngine.STAGE_BASE_SCALE. v1 stat cap is 25 → max 1.225x.
  const STAGE_BASE_SCALE: Record<LifespanStage, number> = {
    baby: 0.70, child: 0.85, teen: 0.95, adult: 1.00, elder: 1.00,
  };
  const strengthStat = Number(byteData?.byte?.stats?.Power ?? byteData?.byte?.stats?.Strength ?? 10);
  const strengthMult = Math.max(0.7, Math.min(1.4, 1 + (strengthStat - 10) * 0.015));
  const byteFootprint = width * 0.3 * STAGE_BASE_SCALE[lifespanStage] * strengthMult;
  let petSprite: any;
  if (emotion === 'praise') {
    petSprite = getStageSprite(lifespanStage, 'happyblush');
  } else if (emotion === 'scold') {
    petSprite = getStageSprite(lifespanStage, 'cry');
  } else if (isSleeping || (needs.Bandwidth ?? 100) < 12) {
    petSprite = getStageSprite(lifespanStage, 'sleeping');
  } else if (allNeedsCritical) {
    petSprite = getStageSprite(lifespanStage, 'sick');
  } else if ((needs.Bandwidth ?? 100) < 20) {
    petSprite = getStageSprite(lifespanStage, 'tired');
  } else if ((needs.Bandwidth ?? 100) < 35) {
    petSprite = getStageSprite(lifespanStage, 'sleepy');
  } else if ((needs.Mood ?? 100) < 20) {
    petSprite = getStageSprite(lifespanStage, 'angry');
  } else if ((needs.Mood ?? 100) < 35) {
    petSprite = getStageSprite(lifespanStage, 'confused');
  } else if (moveFacing === 'left') {
    petSprite = getStageSprite(lifespanStage, 'walkLeft');
  } else if (moveFacing === 'right') {
    petSprite = getStageSprite(lifespanStage, 'walkRight');
  } else if (roamGlance && GLANCE_TO_SPRITE_KEY[roamGlance]) {
    petSprite = getStageSprite(lifespanStage, GLANCE_TO_SPRITE_KEY[roamGlance]);
  } else if (idleVariant && IDLE_VARIANT_TO_SPRITE_KEY[idleVariant]) {
    petSprite = getStageSprite(lifespanStage, IDLE_VARIANT_TO_SPRITE_KEY[idleVariant]);
  } else if (allNeedsHappy) {
    petSprite = getStageSprite(lifespanStage, 'idleHappy');
  } else {
    petSprite = getStageSprite(lifespanStage, 'blinkBounce');
  }

  // ─── Clutter nodes ───────────────────────────────────────────────────────────

  const createClutterNode = useCallback((index: number, kind: 'trash' | 'poop' = 'trash') => {
    const zone    = CLUTTER_ZONES[Math.floor(Math.random() * CLUTTER_ZONES.length)];
    // Poop reads cleaner a touch smaller; trash scales as before.
    const size    = kind === 'poop' ? 40 + Math.random() * 16 : 88 + Math.random() * 56;
    const leftPct = zone.leftMin + Math.random() * (zone.leftMax - zone.leftMin);
    const left    = ((width - size) * leftPct) / 100;
    // Percentage so clutter stays on the byte's floor plane (byte is `bottom: '20%'`).
    const bottom: string = `${zone.bottomMin + Math.random() * (zone.bottomMax - zone.bottomMin)}%`;
    return {
      id: `clutter-${Date.now()}-${index}-${Math.random()}`,
      // Poop nodes render as an emoji and skip the sprite image entirely.
      sprite: kind === 'poop' ? null : CLUTTER_SPRITES[Math.floor(Math.random() * CLUTTER_SPRITES.length)],
      left, bottom, size,
      front: Math.random() < zone.frontChance,
      kind,
    };
  }, []);

  const backClutterNodes  = useMemo(() => clutterNodes.filter((n) => !n.front), [clutterNodes]);
  const frontClutterNodes = useMemo(() => clutterNodes.filter((n) =>  n.front), [clutterNodes]);

  useEffect(() => {
    setClutterNodes((prev) => {
      if (prev.length === clutter) return prev;
      if (prev.length < clutter) {
        const next = [...prev];
        for (let i = prev.length; i < clutter; i++) next.push(createClutterNode(i));
        return next;
      }
      return prev.slice(0, clutter);
    });
  }, [clutter, createClutterNode]);

  // ─── Data ────────────────────────────────────────────────────────────────────

  const refreshData = useCallback(async () => {
    if (syncBusyRef.current) return;
    syncBusyRef.current = true;
    try {
      const [b, p] = await Promise.all([syncByte(), getPlayer()]);
      setByteData(b);
      setPlayerData(p);
      setIsSleeping(b?.byte?.isSleeping || false);
      setSleepUntil(b?.byte?.sleepUntil ? new Date(b.byte.sleepUntil) : null);
    } catch (err: any) {
      const msg = err?.message || '';
      setStatusText(msg.toLowerCase().includes('waking up')
        ? 'Server is waking up... retrying shortly.'
        : 'Sync issue detected. Retrying on next refresh.'
      );
    } finally {
      syncBusyRef.current = false;
    }
  }, []);

  const setTransientStatus = useCallback((message: string, holdMs = 3400) => {
    stickyUntilRef.current = Date.now() + holdMs;
    setStatusText(message);
    if (statusResetTimerRef.current) clearTimeout(statusResetTimerRef.current);
    statusResetTimerRef.current = setTimeout(() => {
      if (Date.now() >= stickyUntilRef.current) setStatusText(thoughtRef.current());
    }, holdMs + 80);
  }, []);

  const randomThought = useCallback(() => {
    // Sleep takes priority over any normal thought — brain feed should
    // clearly read "Sleeping..." while the byte is asleep so the user knows
    // why interactions are no-op or require a wake.
    if (isSleeping) {
      const name = byteData?.byte?.name || 'BYTE';
      return `${name} is sleeping... tap to wake, or praise/scold to force wake.`;
    }
    const thought = generateByteThought({
      byteName: byteData?.byte?.name || 'BYTE',
      needs,
      temperament: byteData?.byte?.temperament || null,
      trainingSessionsToday: Number(byteData?.byte?.trainingSessionsToday || 0),
      idleTicks: idleThoughtTicks,
    });
    if (clutter >= 3) return `${thought} Home is ${clutterLabel.toLowerCase()}.`;
    return thought;
  }, [byteData?.byte?.name, byteData?.byte?.temperament, byteData?.byte?.trainingSessionsToday, clutter, clutterLabel, idleThoughtTicks, isSleeping, needs]);

  useEffect(() => { thoughtRef.current = randomThought; }, [randomThought]);

  // Force an immediate feed refresh when isSleeping flips. Without this,
  // entering sleep leaves the last non-sleep thought on screen until the
  // 30-second idle interval fires. Bypasses sticky — the sleep state is
  // load-bearing info and should override any stale toast.
  useEffect(() => {
    stickyUntilRef.current = 0;
    setStatusText(randomThought());
  }, [isSleeping, randomThought]);

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    initSfx().catch(() => {});
    loadHomeClutterCount().then((count) => setClutter(Math.max(0, Math.min(8, count)))).catch(() => {});
    getLightsOn().then((on) => setLightsOn(on)).catch(() => {});
    return () => {
      if (statusResetTimerRef.current)  clearTimeout(statusResetTimerRef.current);
      if (emotionTimerRef.current)      clearTimeout(emotionTimerRef.current);
      if (idleVariantTimerRef.current)  clearTimeout(idleVariantTimerRef.current);
    };
  }, []);

  // Idle flavor: while byte is at rest with no overrides, pick a random variant
  // every 8–15s, play it briefly, then return to default idle (blink-bounce).
  useEffect(() => {
    const canFlavor = !isSleeping && !emotion && moveFacing === 'idle';
    if (!canFlavor) {
      if (idleVariantTimerRef.current) clearTimeout(idleVariantTimerRef.current);
      setIdleVariant(null);
      return;
    }
    let cancelled = false;
    const schedule = () => {
      const delay = IDLE_VARIANT_MIN_DELAY_MS +
        Math.random() * (IDLE_VARIANT_MAX_DELAY_MS - IDLE_VARIANT_MIN_DELAY_MS);
      idleVariantTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        const pick = IDLE_VARIANT_KEYS[Math.floor(Math.random() * IDLE_VARIANT_KEYS.length)];
        setIdleVariant(pick);
        idleVariantTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          setIdleVariant(null);
          schedule();
        }, IDLE_VARIANT_HOLD_MS);
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (idleVariantTimerRef.current) clearTimeout(idleVariantTimerRef.current);
    };
  }, [isSleeping, emotion, moveFacing]);

  useEffect(() => { saveHomeClutterCount(clutter).catch(() => {}); }, [clutter]);

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

  useEffect(() => {
    // Only redirect to egg if isEgg AND evolutionStage is 0 — guards against stale isEgg flag after failed hatch
    if (byteData?.byte?.isEgg && (byteData?.byte?.evolutionStage ?? 0) === 0) router.replace('/egg');
  }, [byteData?.byte?.isEgg, byteData?.byte?.evolutionStage, router]);

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() >= stickyUntilRef.current) {
        setStatusText(randomThought());
        setIdleThoughtTicks((prev) => prev + 1);
      }
    }, 30000);
    return () => clearInterval(t);
  }, [randomThought]);

  // Periodic background sync — persists level/corruption/needs every 60s
  useEffect(() => {
    const t = setInterval(() => {
      refreshData().catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [refreshData]);

  useEffect(() => {
    const POLL_SECONDS = 30;
    const t = setInterval(() => {
      const hygieneLow = (needs.Hygiene || 0) < 40;
      const p = hygieneLow
        ? clutterSpawnProbabilityDirty(POLL_SECONDS)
        : clutterSpawnProbability(POLL_SECONDS);
      if (Math.random() < p) setClutter((prev) => Math.min(8, prev + 1));
    }, POLL_SECONDS * 1000);
    return () => clearInterval(t);
  }, [needs.Hygiene]);

  // Feed → digestion → poop pipeline.
  // Detects a feed by watching Hunger for an upward jump (≥ FEED_DETECT_MIN).
  // Schedules a pending poop timer in AsyncStorage so the spawn survives
  // screen unmount (e.g., a feed minigame in the kitchen triggering a poop
  // after the player returns home).
  useEffect(() => {
    const FEED_DETECT_MIN = 10;
    const DIGEST_DELAY_MS = poopDigestMs();
    const current = Number(needs.Hunger ?? 0);
    const prev    = prevHungerRef.current;
    prevHungerRef.current = current;
    if (prev === null) return; // first observation — no jump to detect yet
    if (current - prev < FEED_DETECT_MIN) return;
    // Only one pending poop at a time. If already scheduled, skip.
    getPendingPoopAt().then((existing) => {
      if (existing > 0) return;
      setPendingPoopAt(Date.now() + DIGEST_DELAY_MS).catch(() => {});
    }).catch(() => {});
  }, [needs.Hunger]);

  // Poop timer poll — every 10s check if digestion finished.
  // On expiry, spawn a single poop clutter node and clear the timer.
  useEffect(() => {
    const t = setInterval(() => {
      getPendingPoopAt().then((dueAt) => {
        if (!dueAt || Date.now() < dueAt) return;
        clearPendingPoop().catch(() => {});
        setClutter((prev) => Math.min(8, prev + 1));
        setClutterNodes((prev) => [...prev, createClutterNode(prev.length, 'poop')]);
      }).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [createClutterNode]);

  useEffect(() => {
    if (!isSleeping || !sleepUntil) return;
    const sleepEndTime = new Date(sleepUntil).getTime();

    // Only flip local sleep state after the wake-up API confirms success.
    // Previously this set isSleeping=false even on API failure, causing the
    // "byte wakes for one frame then goes back to sleep" flicker when sync()
    // re-read the DB and found isSleeping still true.
    const performNaturalWake = async () => {
      playSfx('byte_wake', 0.8);
      try {
        await wakeUpByte();
        setIsSleeping(false);
        setSleepUntil(null);
        setWakeUpTaps(0);
        setTransientStatus('BYTE woke up naturally.', 2000);
        refreshData().catch(() => {});
      } catch {
        // API failed — don't lie to local state. Re-sync so UI matches DB,
        // and the user can retry via tap-to-wake or praise/scold.
        setTransientStatus('BYTE is still resting...', 2000);
        refreshData().catch(() => {});
      }
    };

    if (Date.now() >= sleepEndTime) {
      performNaturalWake();
    } else {
      const t = setTimeout(performNaturalWake, sleepEndTime - Date.now());
      return () => clearTimeout(t);
    }
  }, [isSleeping, sleepUntil, refreshData, setTransientStatus]);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(reactionBounce,       { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionShake,        { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionShrink,       { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionRotate,       { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionHeartOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(reactionBlinkOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]).start();
    }, 1200);
    return () => clearTimeout(t);
  }, [reactionBounce, reactionShake, reactionShrink, reactionRotate, reactionHeartOpacity, reactionBlinkOpacity]);

  // ─── Motion loop ─────────────────────────────────────────────────────────────
  //
  // LOCKED CONTRACT (2026-04-23). DO NOT REINTRODUCE HOVER / BREATHE / STRIDE / DEPTH LOOPS HERE.
  // Horizontal travel, facing, and glances are owned by useByteRoaming at the top of this
  // component. Vertical motion (hops, squishes) is authored into the GIFs themselves; the
  // byte is anchored to Y=0. This block previously ran four competing loops — reintroducing
  // any of them caused the "side-to-side wobble on every screen" regression flagged 2026-04-23.
  //
  // If a reaction needs a one-shot (tap hop, praise bounce), layer it into the existing
  // reaction* refs below — do not start a new always-on Animated.loop here.

  // ─── Drawer ───────────────────────────────────────────────────────────────────

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
    () => PanResponder.create({
      // Higher threshold + stricter dominant-axis check so finger jitter
      // during a clutter/poop tap doesn't hand the touch to the pan
      // responder and cancel the press.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 18 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => { if (g.dy < -42) openDrawer(); },
    }),
    [openDrawer]
  );

  const drawerSwipeResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 9 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => { if (g.dy > 42) closeDrawer(); },
    }),
    [closeDrawer]
  );

  // ─── Action handlers ──────────────────────────────────────────────────────────

  const handleUtilityNav = useCallback((route: string) => {
    if (transitionBusy) return;
    playSfx('menu', 0.6);
    router.push(route as any);
  }, [router, transitionBusy]);

  const handleRoomOpen = useCallback((route: string) => {
    if (transitionBusy) return;
    if (isSleeping) {
      setTransientStatus('BYTE is sleeping... tap to wake first.', 2000);
      return;
    }
    setTransitionBusy(true);
    closeDrawer();
    setTransientStatus('Loading room interface...', 1200);
    setTimeout(() => { router.push(route as any); setTransitionBusy(false); }, 220);
  }, [closeDrawer, isSleeping, router, setTransientStatus, transitionBusy]);

  const handleTreat = useCallback(() => {
    if (treatCount <= 0) {
      setTransientStatus('No treats in inventory. Buy some at the marketplace.', 2400);
      return;
    }
    playSfx('yes', 0.8);
    setTransientStatus('Treat given! Buff active.', 2400);
    // TODO: wire to treat API endpoint when item use system is built
  }, [treatCount, setTransientStatus]);

  const handlePraise = useCallback(async () => {
    playSfx('praise', 0.8);
    setEmotion('praise');
    if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current);
    emotionTimerRef.current = setTimeout(() => setEmotion(null), 2000);
    setActionBursts((prev) => [...prev, { id: `burst-${Date.now()}-${Math.random()}`, type: 'praise' }]);
    const wasSleeping = isSleeping;
    setTransientStatus(
      wasSleeping
        ? 'Waking BYTE with praise...'
        : 'Praise logged. BYTE mood and social confidence increased.',
      2800,
    );
    try {
      const res = await praiseByte();
      if (res?.wokenFromSleep) {
        playSfx('byte_wake', 0.8);
        setIsSleeping(false);
        setSleepUntil(null);
        setWakeUpTaps(0);
        setTransientStatus(`Woke BYTE with praise. Mood -${res.moodPenalty ?? 5}, then praised.`, 2800);
      }
    } catch {
      setTransientStatus('Praise failed — try again.', 2000);
    }
    refreshData().catch(() => {});
  }, [isSleeping, refreshData, setTransientStatus]);

  const handleScold = useCallback(async () => {
    playSfx('scold', 0.8);
    setEmotion('scold');
    if (emotionTimerRef.current) clearTimeout(emotionTimerRef.current);
    emotionTimerRef.current = setTimeout(() => setEmotion(null), 2000);
    setActionBursts((prev) => [...prev, { id: `burst-${Date.now()}-${Math.random()}`, type: 'scold' }]);
    const wasSleeping = isSleeping;
    setTransientStatus(
      wasSleeping
        ? 'Waking BYTE with scold...'
        : 'Scold logged. BYTE is re-evaluating behavior routines.',
      2800,
    );
    try {
      const res = await scoldByte();
      if (res?.wokenFromSleep) {
        playSfx('byte_wake', 0.8);
        setIsSleeping(false);
        setSleepUntil(null);
        setWakeUpTaps(0);
        setTransientStatus(`Scolded BYTE awake. Mood -${(res.moodPenalty ?? 10) + 10}.`, 2800);
      }
    } catch {
      setTransientStatus('Scold failed — try again.', 2000);
    }
    refreshData().catch(() => {});
  }, [isSleeping, refreshData, setTransientStatus]);

  const handlePlay = useCallback(() => {
    playSfx('menu', 0.75);
    setRpsOpen(true);
  }, []);

  const handleClutterTap = useCallback(async (id: string) => {
    const tappedNode = clutterNodes.find((n) => n.id === id);
    setClutterNodes((prev) => prev.filter((n) => n.id !== id));
    setClutter((prev) => Math.max(0, prev - 1));
    playSfx('tap', 0.45);
    const award = 2 + Math.floor(Math.random() * 4);
    setRewardPopups((prev) => [...prev, {
      id: `reward-${Date.now()}-${Math.random()}`,
      text: `+${award} BB`,
      left:   Math.max(8, Math.min(width - 120, Number(tappedNode?.left   || width * 0.45))),
      bottom: Math.max(72, Number(tappedNode?.bottom || 72) + 40),
    }]);
    try {
      await earnCurrency(award, 'home_clutter');
      await refreshData();
      setIdleThoughtTicks(0);
    } catch {
      setPlayerData((prev: any) => ({ ...(prev || {}), byteBits: Number(prev?.byteBits || 0) + award }));
      setIdleThoughtTicks(0);
    }
  }, [clutterNodes, refreshData]);

  const handleToggleLights = useCallback(() => {
    setLightsOn((prev) => {
      const next = !prev;
      saveLightsOn(next).catch(() => {});
      // Fire-and-forget server sync. Server reads lightsOn on snapshot
      // to decide whether to apply lights-on Mood annoyance.
      setByteLights(next).catch(() => {});
      playSfx('tap', 0.5);
      return next;
    });
  }, []);

  const handleByteTap = useCallback(async () => {
    Animated.sequence([
      Animated.timing(tapScale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(tapScale,  { toValue: 1, friction: 4,    useNativeDriver: true }),
    ]).start();

    if (isSleeping) {
      const nextTaps = wakeUpTaps + 1;
      setWakeUpTaps(nextTaps);
      playSfx('tap', 0.5);
      setTransientStatus(`Tapping BYTE to wake it... (${nextTaps}/10)`, 1500);
      if (nextTaps >= 10) {
        try {
          playSfx('byte_wake', 0.9);
          await wakeUpByte(); setIsSleeping(false); setSleepUntil(null); setWakeUpTaps(0);
          setTransientStatus('BYTE woke up!', 2000);
          await refreshData();
        } catch {
          setTransientStatus('Could not wake BYTE. Try praise or scold instead.', 2800);
          refreshData().catch(() => {});
        }
      }
      return;
    }

    try {
      const reaction = await tapByte();
      if (reaction.audioId) playSfx(reaction.audioId, 0.75);

      if (reaction.animationTier === 'positive') {
        Animated.parallel([
          Animated.sequence([
            Animated.timing(reactionBounce, { toValue: -30, duration: 200, useNativeDriver: true }),
            Animated.timing(reactionBounce, { toValue:   0, duration: 200, useNativeDriver: true }),
            Animated.timing(reactionBounce, { toValue: -20, duration: 150, useNativeDriver: true }),
            Animated.timing(reactionBounce, { toValue:   0, duration: 150, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(reactionHeartOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.delay(800),
            Animated.timing(reactionHeartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ]).start();
      } else if (reaction.animationTier === 'neutral') {
        Animated.parallel([
          Animated.sequence([
            Animated.timing(reactionRotate, { toValue:  3, duration: 400, useNativeDriver: true }),
            Animated.timing(reactionRotate, { toValue: -3, duration: 400, useNativeDriver: true }),
            Animated.timing(reactionRotate, { toValue:  0, duration: 200, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(reactionBlinkOpacity, { toValue: 0.3, duration: 100, useNativeDriver: true }),
            Animated.timing(reactionBlinkOpacity, { toValue: 1,   duration: 100, useNativeDriver: true }),
          ]),
        ]).start();
      } else if (reaction.animationTier === 'negative') {
        Animated.parallel([
          Animated.sequence([
            Animated.timing(reactionShrink, { toValue: 0.85, duration: 300, useNativeDriver: true }),
            Animated.timing(reactionShrink, { toValue: 1,    duration: 400, useNativeDriver: true }),
          ]),
          Animated.timing(reactionRotate, { toValue: -15, duration: 300, useNativeDriver: true }),
        ]).start();
      } else if (reaction.animationTier === 'warning') {
        Animated.sequence([
          Animated.timing(reactionShake, { toValue:  15, duration: 100, useNativeDriver: true }),
          Animated.timing(reactionShake, { toValue: -15, duration: 100, useNativeDriver: true }),
          Animated.timing(reactionShake, { toValue:  10, duration: 100, useNativeDriver: true }),
          Animated.timing(reactionShake, { toValue: -10, duration: 100, useNativeDriver: true }),
          Animated.timing(reactionShake, { toValue:   0, duration: 100, useNativeDriver: true }),
        ]).start();
      } else if (reaction.animationTier === 'annoyed') {
        Animated.parallel([
          Animated.timing(reactionRotate, { toValue: -25, duration: 400, useNativeDriver: true }),
          Animated.timing(reactionShrink, { toValue: 0.9, duration: 400, useNativeDriver: true }),
        ]).start();
      } else if (reaction.animationTier === 'withdrawn') {
        Animated.parallel([
          Animated.timing(reactionRotate, { toValue: 180,  duration: 600, useNativeDriver: true }),
          Animated.timing(reactionShrink, { toValue: 0.75, duration: 800, useNativeDriver: true }),
        ]).start();
      }

      if (reaction.moodDelta !== 0) {
        setTransientStatus(
          reaction.moodDelta > 0 ? 'BYTE looks happy!'
            : `BYTE is getting annoyed... (Stage ${reaction.annoyanceStage})`,
          1500
        );
      }
      setIdleThoughtTicks(0);
    } catch { playSfx('chirp1', 0.5); }
  }, [isSleeping, wakeUpTaps, setTransientStatus, tapScale, refreshData,
      reactionBounce, reactionShake, reactionShrink, reactionRotate,
      reactionHeartOpacity, reactionBlinkOpacity]);

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── 1. Utility bar: Profile / Inbox / Tasks / Events ── */}
        <View style={styles.utilityBar}>
          {UTILITY_BAR.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.utilityBtn}
              onPress={() => handleUtilityNav(item.route)}
              activeOpacity={0.85}
            >
              <Ionicons name={item.icon as any} size={14} color="#b1e2ff" />
              <Text style={styles.utilityText}>{item.label}</Text>
              {item.key === 'daily-care' && totalTasks > 0 && (
                <View style={styles.tasksBadge}>
                  <Text style={styles.tasksBadgeText}>{completedTasks}/{totalTasks}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 2. Needs grid: 2 columns × 3 rows ── */}
        <View style={styles.needsGrid}>
          <View style={styles.needsCol}>
            <NeedBar label="HUNGER"    value={needs.Hunger    || 0} color="#ff6b87" />
            <NeedBar label="HYGIENE"   value={needs.Hygiene   || 0} color="#56d9ff" />
            <NeedBar label="CORRUPT"   value={Number(byteData?.byte?.corruption || 0)} color={corruptionColor} />
          </View>
          <View style={styles.needsCol}>
            <NeedBar label="ENERGY"    value={needs.Bandwidth || 0} color="#52e58f" />
            <NeedBar label="SOCIAL"    value={needs.Social    || 0} color="#ffba47" />
            <NeedBar label="LOVE"      value={affection}              color="#dd9aff" />
          </View>
        </View>

        {/* ── 3. Field: room + byte + name label ── */}
        <View style={styles.field} {...swipeResponder.panHandlers}>
          <HomeRoomStage />

          {/* Back clutter */}
          <View style={styles.clutterLayer}>
            {backClutterNodes.map((node) => (
              <TouchableOpacity key={node.id}
                style={[styles.clutterTouch, { left: node.left, bottom: node.bottom, width: node.size, height: node.size }]}
                onPress={() => handleClutterTap(node.id)} activeOpacity={0.8}
              >
                {node.kind === 'poop' ? (
                  <Text style={[styles.clutterEmoji, { fontSize: node.size * 0.7 }]}>💩</Text>
                ) : (
                  <Image source={node.sprite} style={styles.clutterImg} resizeMode="contain" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Byte sprite — floor-anchored (Y=0). All roaming comes from useByteRoaming. */}
          <Animated.View style={[styles.byteStage, {
            transform: [
              { translateX: roamX },
              { translateX: reactionShake },
              { translateY: reactionBounce },
              { rotate: reactionRotate.interpolate({ inputRange: [-180, 0, 180], outputRange: ['-180deg', '0deg', '180deg'] }) },
              { scale: tapScale },
              { scale: reactionShrink },
            ],
          }]}>
            <TouchableOpacity onPress={handleByteTap} activeOpacity={1}>
              <Image source={petSprite} style={[styles.byteSprite, { width: byteFootprint, height: byteFootprint }]} resizeMode="contain" />
            </TouchableOpacity>
            <CorruptionAura corruption={corruptionValue} size={byteFootprint * 0.5} containerSize={byteFootprint} />
            <SleepZsOverlay visible={isSleeping} />
            <NeedRequestBubble need={requestedNeed} />
          </Animated.View>

          {/* Byte name / level / status — floats above the sprite */}
          <View style={styles.byteLabel} pointerEvents="none">
            <View style={styles.byteLabelDot} />
            <Text style={styles.byteLabelName}>{byteName}</Text>
            <Text style={styles.byteLabelSep}>·</Text>
            <Text style={styles.byteLabelLevel}>Lv.{byteLevel}</Text>
            <Text style={styles.byteLabelSep}>·</Text>
            <Text style={styles.byteLabelStatus}>{moodLabel}</Text>
          </View>

          {/* Tap hearts */}
          <Animated.View style={{ position: 'absolute', top: '30%', left: '50%', marginLeft: -40, opacity: reactionHeartOpacity, pointerEvents: 'none' }}>
            <Text style={{ fontSize: 36, textAlign: 'center' }}>❤️💙💜</Text>
          </Animated.View>

          {/* Front clutter */}
          <View style={styles.clutterLayerFront}>
            {frontClutterNodes.map((node) => (
              <TouchableOpacity key={node.id}
                style={[styles.clutterTouch, { left: node.left, bottom: node.bottom, width: node.size, height: node.size }]}
                onPress={() => handleClutterTap(node.id)} activeOpacity={0.8}
              >
                {node.kind === 'poop' ? (
                  <Text style={[styles.clutterEmoji, { fontSize: node.size * 0.7 }]}>💩</Text>
                ) : (
                  <Image source={node.sprite} style={styles.clutterImgFront} resizeMode="contain" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Floating reward popups */}
          {rewardPopups.map((popup) => (
            <FloatingReward key={popup.id} text={popup.text} left={popup.left} bottom={popup.bottom}
              onDone={() => setRewardPopups((prev) => prev.filter((e) => e.id !== popup.id))} />
          ))}

          {/* Action bursts (praise/scold particles) — translate with byte's roamX so they spawn above the sprite, not stage center. */}
          {actionBursts.map((burst) => (
            <ActionBurst key={burst.id} type={burst.type} roamX={roamX}
              onDone={() => setActionBursts((prev) => prev.filter((e) => e.id !== burst.id))} />
          ))}

          {/* Level-up banner — fades up with wiggle, gold text w/ drop shadow. */}
          {levelUpBanners.map((b) => (
            <LevelUpBanner key={b.id}
              onDone={() => setLevelUpBanners((prev) => prev.filter((e) => e.id !== b.id))} />
          ))}

          {/* Lights-off dimmer. Scoped to field (not needs/nav). pointerEvents='none'
              so taps still reach the byte and clutter under the dim. */}
          {!lightsOn && (
            <>
              <View pointerEvents="none" style={styles.lightsDim} />
              <View pointerEvents="none" style={styles.lightsVignette} />
            </>
          )}

          {/* Lights toggle — top-right of field, above everything else. */}
          <TouchableOpacity
            style={styles.lightsToggle}
            onPress={handleToggleLights}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={lightsOn ? 'bulb' : 'bulb-outline'}
              size={18}
              color={lightsOn ? '#ffdc6b' : '#6b7a90'}
            />
          </TouchableOpacity>
        </View>

        {/* ── 4. Brain widget / thought feed ── */}
        <View style={styles.brainWidget}>
          <Text style={styles.brainLabel}>BYTE FEED:</Text>
          <Text style={styles.brainText} numberOfLines={2}>{statusText}</Text>
        </View>

        {/* ── 5. Primary actions: Treat / Praise / Scold / Play ── */}
        <View style={styles.primaryRow}>
          {/* TREAT */}
          <TouchableOpacity
            style={[styles.primaryBtn, (treatCount === 0 || isLocked('home:treat')) && styles.primaryBtnDim]}
            onPress={() => runAction('home:treat', handleTreat)}
            activeOpacity={0.86}
            disabled={isLocked('home:treat')}
          >
            <View style={[styles.primaryIcon, { borderColor: '#ffcb5899', backgroundColor: '#ffcb5822' }]}>
              <Ionicons name="gift-outline" size={18} color="#ffcb58" />
            </View>
            <Text style={styles.primaryLabel}>TREAT</Text>
            <View style={[styles.primaryBadge, treatCount === 0 && styles.primaryBadgeEmpty]}>
              <Text style={styles.primaryBadgeText}>{treatCount}</Text>
            </View>
          </TouchableOpacity>

          {/* PRAISE */}
          <TouchableOpacity
            style={[styles.primaryBtn, isLocked('home:praise') && styles.primaryBtnDim]}
            onPress={() => runAction('home:praise', handlePraise)}
            activeOpacity={0.86}
          >
            <View style={[styles.primaryIcon, { borderColor: '#45d4ff99', backgroundColor: '#45d4ff22' }]}>
              <Ionicons name="thumbs-up-outline" size={18} color="#45d4ff" />
            </View>
            <Text style={styles.primaryLabel}>PRAISE</Text>
          </TouchableOpacity>

          {/* SCOLD */}
          <TouchableOpacity
            style={[styles.primaryBtn, isLocked('home:scold') && styles.primaryBtnDim]}
            onPress={() => runAction('home:scold', handleScold)}
            activeOpacity={0.86}
          >
            <View style={[styles.primaryIcon, { borderColor: '#bf6cff99', backgroundColor: '#bf6cff22' }]}>
              <Ionicons name="alert-circle-outline" size={18} color="#bf6cff" />
            </View>
            <Text style={styles.primaryLabel}>SCOLD</Text>
          </TouchableOpacity>

          {/* PLAY */}
          <TouchableOpacity
            style={[styles.primaryBtn, (transitionBusy || isLocked('home:play')) && styles.primaryBtnDim]}
            onPress={() => runAction('home:play', handlePlay)}
            activeOpacity={0.86}
            disabled={transitionBusy || isLocked('home:play')}
          >
            <View style={[styles.primaryIcon, { borderColor: '#ff8dd299', backgroundColor: '#ff8dd222' }]}>
              <Ionicons name="game-controller-outline" size={18} color="#ff8dd2" />
            </View>
            <Text style={styles.primaryLabel}>PLAY</Text>
          </TouchableOpacity>
        </View>

        {/* ── 6. Secondary row: Stats (left) · · · Item (right) ── */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => { refreshData().catch(() => {}); setStatsOpen(true); playSfx('menu', 0.7); }}
            activeOpacity={0.86}
          >
            <Ionicons name="stats-chart-outline" size={15} color="#6c93ff" />
            <Text style={[styles.secondaryLabel, { color: '#6c93ff' }]}>STATS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.swipeHint}
            onPress={() => runAction('drawer-open', openDrawer)}
            activeOpacity={0.7}
            disabled={transitionBusy || isLocked('drawer-open')}
          >
            <Ionicons name="chevron-up" size={13} color="rgba(114,206,255,0.55)" />
            <Text style={styles.swipeHintText}>SWIPE UP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => { playSfx('menu', 0.75); router.push('/(tabs)/inventory' as any); }}
            activeOpacity={0.86}
          >
            <Ionicons name="cube-outline" size={15} color="#ffc84a" />
            <Text style={[styles.secondaryLabel, { color: '#ffc84a' }]}>ITEM</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      {/* ── Rooms drawer (swipe-up, restored) ── */}
      {drawerOpen && (
        <TouchableOpacity style={styles.drawerOverlay} onPress={closeDrawer} activeOpacity={1}>
          <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerAnim }] }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} {...drawerSwipeResponder.panHandlers}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>ROOM NAVIGATION</Text>
              <Text style={styles.drawerSub}>ROOMS AND SERVICES</Text>
              <View style={styles.roomGrid}>
                {ROOM_MENU.map((room) => (
                  <TouchableOpacity
                    key={room.key}
                    style={[styles.roomBtn, (transitionBusy || isLocked(`room:${room.key}`)) && styles.roomBtnDisabled]}
                    onPress={() => runAction(`room:${room.key}`, () => handleRoomOpen(room.route), 900)}
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

      {/* ── RPS Game overlay ── */}
      <RPSGame
        visible={rpsOpen}
        byteName={byteData?.byte?.name || 'BYTE'}
        onClose={() => { playSfx('mg_close', 0.7); setRpsOpen(false); }}
        onWin={() => { careAction('rps', 'good').catch(() => {}); }}
      />

      {/* ── Stats modal ── */}
      <StatsModal
        visible={statsOpen}
        onClose={() => setStatsOpen(false)}
        byteData={byteData}
        playerData={playerData}
        onEvolved={() => {
          (async () => { await refreshData(); await reloadFromServer().catch(() => {}); })().catch(() => {});
        }}
      />

    </ImageBackground>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg:   { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1 },

  // ── Utility bar ──
  utilityBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
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
    paddingVertical: 7,
  },
  utilityText: { color: '#b1e2ff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  tasksBadge: {
    backgroundColor: '#7ec8ff',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 2,
  },
  tasksBadgeText: { color: '#050d30', fontSize: 7.5, fontWeight: '900' },

  // ── Needs grid ──
  needsGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  needsCol: { flex: 1, gap: 5 },
  needBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(9,14,52,0.62)',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.14)',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  needBarLabel: {
    color: 'rgba(180,214,242,0.8)',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    width: 54,
  },
  pipRow: { flex: 1, flexDirection: 'row', gap: 2, alignItems: 'center' },
  pip:    { flex: 1, height: 12, borderRadius: 3 },
  needBarVal: { color: '#e3f3ff', fontSize: 9, fontWeight: '700', width: 28, textAlign: 'right' },

  // ── Field ──
  field: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
    paddingBottom: 8,
  },
  // Full-height layers so clutter `bottom: '20%'` resolves against the field,
  // aligning with the byte's floor plane (byteStage is also `bottom: '20%'`).
  clutterLayer:      { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1, overflow: 'visible' },
  clutterLayerFront: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 4, overflow: 'visible' },
  clutterTouch:      { position: 'absolute', zIndex: 3, alignItems: 'center', justifyContent: 'flex-end' },
  clutterImg:        { width: '100%', height: '100%', opacity: 0.9 },
  clutterImgFront:   { width: '100%', height: '100%', opacity: 1 },
  clutterEmoji:      { textAlign: 'center' },
  byteStage:         { position: 'absolute', bottom: '20%', zIndex: 3, pointerEvents: 'box-none' },
  byteSprite:        { width: width * 0.3, height: width * 0.3 },

  // Lights-off dim. Two layers approximate a soft vignette: an outer darker
  // wash plus an inset slightly-lighter pane so the center feels less crushed.
  lightsDim: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(3,6,20,0.62)',
    zIndex: 8,
  },
  lightsVignette: {
    position: 'absolute',
    left: '6%', right: '6%', top: '6%', bottom: '6%',
    backgroundColor: 'rgba(3,6,20,0.22)',
    borderRadius: 60,
    zIndex: 9,
  },
  lightsToggle: {
    position: 'absolute',
    top: 6,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(9,14,52,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },

  // Byte name label (floats at top of field)
  byteLabel: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(9,14,52,0.7)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(109,190,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 6,
  },
  byteLabelDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5dff93' },
  byteLabelName:   { color: '#e8f6ff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  byteLabelSep:    { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  byteLabelLevel:  { color: '#7bd9ff', fontSize: 10, fontWeight: '700' },
  byteLabelStatus: { color: 'rgba(200,230,255,0.8)', fontSize: 10, fontWeight: '600' },

  // Reward / burst
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
  rewardPopupText: { color: '#ffe08d', fontSize: 10.5, fontWeight: '900', letterSpacing: 0.7 },
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
  burstGlyph: { position: 'absolute', bottom: 0, fontSize: 20 },

  // Level-up banner — gold text, centered horizontally above the byte.
  levelUpBanner: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 9,
  },
  levelUpText: {
    color: '#ffd24a',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },

  // ── Brain widget ──
  brainWidget: {
    marginHorizontal: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(6,12,44,0.82)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(80,160,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  brainLabel: {
    color: 'rgba(114,206,255,0.55)',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 1,
    flexShrink: 0,
  },
  brainText: {
    flex: 1,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10.2,
    fontWeight: '600',
    lineHeight: 15,
  },

  // ── Primary actions ──
  primaryRow: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 10,
    marginBottom: 5,
  },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(8,18,62,0.84)',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 3,
  },
  primaryBtnDim:  { opacity: 0.52 },
  primaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: 'rgba(220,236,255,0.84)', fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  primaryBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#7ec8ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  primaryBadgeEmpty: { backgroundColor: 'rgba(255,255,255,0.18)' },
  primaryBadgeText:  { color: '#050d30', fontSize: 8, fontWeight: '900' },

  // ── Secondary row ──
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginBottom: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(8,18,62,0.76)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,195,255,0.18)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  secondaryLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  swipeHint: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    opacity: 0.7,
  },
  swipeHintText: { color: 'rgba(114,206,255,0.55)', fontSize: 8.5, fontWeight: '800', letterSpacing: 1.5 },

  // ── Rooms drawer ──
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
  drawerHandle:    { width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginBottom: 14 },
  drawerTitle:     { color: '#fff', fontSize: 17, letterSpacing: 2, fontWeight: '900' },
  drawerSub:       { color: 'rgba(255,255,255,0.42)', fontSize: 10, letterSpacing: 2, marginBottom: 14 },
  roomGrid:        { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
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
  roomIcon:  { width: 42, height: 42, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  roomTitle: { color: '#dff1ff', fontSize: 11, letterSpacing: 1.1, fontWeight: '800' },
  roomSub:   { color: 'rgba(255,255,255,0.55)', fontSize: 9.5 },
  drawerFooter:    { marginTop: 14, flexDirection: 'row', gap: 10 },
  drawerClose:     { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  drawerCloseText: { color: 'rgba(255,255,255,0.56)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },

  // ── Stats modal ──
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
    height: '85%',
  },
  statsTitle:   { color: '#7ec8ff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  statsName:    { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 },
  statsScroll:  { flex: 1 },
  statsSection: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8 },
  kvRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 5 },
  kvKey:    { color: 'rgba(180,214,242,0.72)', fontSize: 9.6, fontWeight: '700', letterSpacing: 0.9, flex: 1 },
  kvVal:    { color: '#e3f3ff', fontSize: 9.8, fontWeight: '700', flex: 1, textAlign: 'right' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statsKey: { color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: 1, width: 80, fontWeight: '700' },
  statsBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  statsBarFill:  { height: 6, borderRadius: 3, backgroundColor: '#7ec8ff' },
  statsVal:      { color: '#fff', fontSize: 11, fontWeight: '700', width: 26, textAlign: 'right' },
  statsClose:     { marginTop: 12, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  statsCloseText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
});
