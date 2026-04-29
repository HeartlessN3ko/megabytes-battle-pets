import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, ImageBackground, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { careAction, earnCurrency, getByte, trainStat, syncByte } from '../../services/api';
import { markHomeClutterCleared } from '../../services/homeRuntimeState';
import { MiniGameDef, getMiniGameById } from '../../services/minigames';
import { MiniGameRoomId, recordTrainingUsage, setPendingMiniGameResult } from '../../services/minigameRuntime';
import { initSfx, playSfx, startLoopSfx, stopLoopSfx, type SfxKey } from '../../services/sfx';
import { PowerDrill } from '../../components/minigames/drills/PowerDrill';
import { AccuracyDrill } from '../../components/minigames/drills/AccuracyDrill';
import { StaminaDrill } from '../../components/minigames/drills/StaminaDrill';
import { SpeedDrill } from '../../components/minigames/drills/SpeedDrill';
import { AgilityDrill } from '../../components/minigames/drills/AgilityDrill';

type Grade = 'fail' | 'good' | 'perfect';
type Variant = 'quick' | 'long';

const EMOTES = ['HAPPY', 'SLEEP', 'ANGRY', 'JOY'];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const TOUCH_HIT_SLOP = { top: 18, bottom: 18, left: 18, right: 18 };
const LARGE_TOUCH_HIT_SLOP = { top: 28, bottom: 28, left: 28, right: 28 };
// Board sizing is now measured live via onLayout. Internal coords are normalized (0–1) and scaled at render/hit-test.
// CHOMP (feed-upload) tuning — v2: byte sweeps top L↔R with shifting speed, launcher fixed at bottom-center.
const CHOMP_ROUND_TOTAL = 12;
const CHOMP_BAD_FOOD_CHANCE = 0.25;
const CHOMP_THROW_DURATION_MS = 280;
const CHOMP_REACTION_MS = 380;
const CHOMP_LAUNCHER_X_NORM = 0.5;
const CHOMP_LAUNCHER_RELOAD_MS = 300;
const CHOMP_BYTE_SWEEP_BASE_MS_PER_SWEEP = 1800; // base time for one edge-to-edge pass
const CHOMP_BYTE_SWEEP_VARIANCE = 0.6; // speed modulation depth (0 = constant speed)
const CHOMP_BYTE_SWEEP_MOD_PERIOD_MS = 1800; // period of the speed-shifting sine
const CHOMP_BYTE_SCALE = 0.5; // byte sprite scale — smaller = more sweep room
const CHOMP_BYTE_HIT_TOLERANCE_PX = 36; // horizontal hit window at arrival (shrunk with byte)
const CHOMP_FOOD_SIZE_PX = 38; // food glyph box
const CHOMP_LAUNCHER_PAD_SIZE_PX = 56; // pad ring around launcher
// Emoji placeholders until PixelLab food + Byte chomp sprites ship.
const CHOMP_GOOD_FOOD = ['🍎', '🥦', '🍖'];
const CHOMP_BAD_FOOD = ['🧪', '☠️'];
// Byte reaction sprites for CHOMP (feed-upload, the long-form meal minigame).
// bigbite is the dedicated meal sprite per Skye 2026-04-26 (munch is reserved
// for the small/quick feed action).
const CHOMP_SPRITE_IDLE = require('../../assets/bytes/Circle/Circle-idle.gif');
const CHOMP_SPRITE_CHOMP_GOOD = require('../../assets/bytes/Circle/Circle-bigbite.gif');
const CHOMP_SPRITE_CHOMP_BAD = require('../../assets/bytes/Circle/Circle-x-eyes.gif');
const CHOMP_SPRITE_MISS = require('../../assets/bytes/Circle/Circle-looklowerleft-right.gif');
const NEED_RESULT_ORDER = ['Hunger', 'Bandwidth', 'Hygiene', 'Fun', 'Social', 'Mood'];

function familyLabelFor(game: MiniGameDef) {
  return game.id.startsWith('training-') ? 'TRAINING SIMULATION' : 'CARE SIMULATION';
}

function kindLabelFor(kind: MiniGameDef['kind']) {
  if (kind === 'tap-target') return 'REACTION';
  if (kind === 'scrub') return 'SCRUB';
  if (kind === 'trace') return 'TRACE';
  if (kind === 'match') return 'MATCH';
  if (kind === 'sequence') return 'SEQUENCE';
  if (kind === 'timing') return 'TIMING';
  if (kind === 'rapid-tap') return 'RAPID TAP';
  if (kind === 'ordered-sequence') return 'ORDER';
  return 'MODULE';
}

function gradeForQuality(q: number): Grade {
  if (q >= 0.85) return 'perfect';
  if (q >= 0.45) return 'good';
  return 'fail';
}

function variantDurationMs(v: Variant) {
  return v === 'long' ? 15000 : 5000;
}

function shuffledSymbols(variant: Variant) {
  const symbols = variant === 'long' ? ['A', 'A', 'B', 'B', 'C', 'C'] : ['A', 'A', 'B', 'B'];
  return symbols.sort(() => Math.random() - 0.5);
}

function resolveRoomPath(room: string | undefined) {
  if (room === 'kitchen') return '/rooms/kitchen';
  if (room === 'bathroom') return '/rooms/bathroom';
  if (room === 'play-room') return '/rooms/play-room';
  if (room === 'training-center') return '/rooms/training-center';
  return null;
}

function calcEconomy(def: MiniGameDef, grade: Grade, variant: Variant, quality: number) {
  const training = def.id.startsWith('training-');
  // Energy-costly games: training (Bandwidth -12 on backend) + play-room games (Bandwidth -4 via careAction('play')).
  const isPlayGame = def.id === 'engage-simulation' || def.id === 'sync-link' || def.id === 'emote-align';
  // 2026-04-17: payouts doubled — prev 3/18 care, 4/26 training felt punitive for the effort.
  const baseBits = training ? (variant === 'long' ? 55 : 10) : (variant === 'long' ? 40 : 8);
  const qualityScale = grade === 'perfect' ? 1.35 : grade === 'good' ? 1 : 0.35;
  const byteBits = Math.max(1, Math.round(baseBits * qualityScale * clamp(0.7 + quality * 0.4, 0.7, 1.2)));
  // No energy penalty for feed/clean/rest/recovery. Only play + training cost energy.
  const energyCost = training
    ? (variant === 'long' ? 18 : 11)
    : isPlayGame ? (variant === 'long' ? 10 : 6) : 0;
  // Display matches backend TRAINING_GAIN * ~1.0 avg dailyMult * ~0.9 needMult → +3/+2/+1.
  const statGain = training && def.stat ? `${def.stat} +${grade === 'perfect' ? 3 : grade === 'good' ? 2 : 1}` : null;
  return { byteBits, energyCost, statGain };
}

function processLabelFor(game: MiniGameDef) {
  if (game.id === 'feed-upload') return 'UPLOADING NUTRIENTS...';
  if (game.id === 'run-cleanup') return 'CLEANING...';
  if (game.id === 'stabilize-signal') return 'STABILIZING...';
  if (game.id === 'engage-simulation') return 'RUNNING PLAY PACKAGE...';
  if (game.id === 'sync-link') return 'SYNCING LINKS...';
  if (game.id === 'emote-align') return 'ALIGNING EMOTES...';
  return 'COMPILING RESULTS...';
}

function startCueFor(game: MiniGameDef): SfxKey {
  if (game.id === 'feed-upload') return 'minigame_feed_upload';
  if (game.id === 'run-cleanup') return 'minigame_cleanup_scrub';
  if (game.id === 'stabilize-signal') return 'minigame_signal_trace';
  if (game.id === 'sync-link') return 'minigame_sync_connect';
  if (game.id === 'emote-align') return 'minigame_emote_match';
  if (game.id === 'training-accuracy') return 'training_accuracy_lock';
  if (game.id === 'training-defense') return 'training_defense_merge';
  if (game.id === 'training-special') return 'training_special_charge';
  if (game.kind === 'tap-target' || game.kind === 'rapid-tap') return 'minigame_target_spawn';
  return 'minigame_score_tick';
}

function successCueFor(game: MiniGameDef): SfxKey {
  if (game.id === 'feed-upload') return 'minigame_feed_upload';
  if (game.id === 'run-cleanup') return 'minigame_cleanup_scrub';
  if (game.id === 'stabilize-signal') return 'minigame_signal_trace';
  if (game.id === 'sync-link') return 'minigame_sync_connect';
  if (game.id === 'emote-align') return 'minigame_emote_match';
  if (game.id === 'training-power') return 'training_power_hit';
  if (game.id === 'training-agility') return 'training_agility_ping';
  if (game.id === 'training-accuracy') return 'training_accuracy_lock';
  if (game.id === 'training-defense') return 'training_defense_merge';
  if (game.id === 'training-special') return 'training_special_charge';
  if (game.id === 'training-stamina') return 'training_stamina_mash';
  if (game.id === 'training-speed') return 'training_speed_step';
  return 'minigame_target_hit';
}

function resultCueFor(grade: Grade): SfxKey {
  if (grade === 'perfect') return 'minigame_score_perfect';
  if (grade === 'good') return 'minigame_score_good';
  return 'minigame_score_fail';
}

function gradeAccent(grade: Grade) {
  if (grade === 'perfect') return '#79f7d0';
  if (grade === 'good') return '#ffd978';
  return '#ff8f9f';
}

function diffNeedResults(before: any, after: any) {
  if (!before || !after) return [];
  return NEED_RESULT_ORDER
    .map((key) => {
      const delta = Math.round(Number(after?.[key] || 0) - Number(before?.[key] || 0));
      return delta > 0 ? `${key} +${delta}` : null;
    })
    .filter(Boolean) as string[];
}

// When a care action lands cleanly but its target need is already at cap,
// explain *what* is maxed rather than returning a blanket "no effect" line.
function capMessageForCareAction(gameId: string, beforeNeeds: any): string | null {
  if (!beforeNeeds) return null;
  const hygiene = Number(beforeNeeds.Hygiene || 0);
  const bandwidth = Number(beforeNeeds.Bandwidth || 0);
  const social = Number(beforeNeeds.Social || 0);
  const fun = Number(beforeNeeds.Fun || 0);
  if (gameId === 'run-cleanup' && hygiene >= 100) {
    return 'Byte is already spotless. Hygiene is full.';
  }
  if (gameId === 'stabilize-signal' && bandwidth >= 100) {
    return 'Byte is fully rested. Bandwidth is full.';
  }
  if ((gameId === 'engage-simulation' || gameId === 'sync-link' || gameId === 'emote-align')
      && social >= 100 && fun >= 100) {
    return 'Byte is thoroughly entertained. Social and Fun are full.';
  }
  return null;
}

function resultSummaryFor(game: MiniGameDef, grade: Grade, effectLines: string[]) {
  if (grade === 'fail') return 'Run failed. No room effect was applied.';
  if (effectLines.length > 0) return `${game.title} completed. Room effects are ready to apply when you return.`;
  return `${game.title} completed.`;
}

function targetGoalFor(game: MiniGameDef, variant: Variant) {
  if (game.kind === 'rapid-tap') return variant === 'long' ? 24 : 12;
  if (game.kind === 'tap-target') return variant === 'long' ? 12 : 6;
  return 0;
}

function randomRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// DEEP-CLEAN (run-cleanup) — v2: broad-swipe clearing (Fruit-Ninja family).
// Grime nodes spawn in clusters; the player swipes across them to clear.
// Combo within a single swipe grants bonuses. Per research doc: cleaning
// maps to broad-swipe verb, not trace-path / drag-endpoint.
const SCRUB_QUICK_TARGET = 14;
const SCRUB_LONG_TARGET = 28;
const SCRUB_QUICK_MAX_ACTIVE = 6;
const SCRUB_LONG_MAX_ACTIVE = 9;
const SCRUB_QUICK_SPAWN_MS = 620;
const SCRUB_LONG_SPAWN_MS = 440;
const SCRUB_CLUSTER_MIN = 2;
const SCRUB_CLUSTER_MAX = 4;
const SCRUB_NODE_SIZE_PX = 42;
const SCRUB_HIT_RADIUS_PX = 40;
const SCRUB_CLUSTER_RADIUS_PX = 48;
const SCRUB_BURST_TTL_MS = 480;
const SCRUB_BYTE_REACTION_MS = 420;
const SCRUB_SPRITE_IDLE = require('../../assets/bytes/Circle/Circle-idle.gif');
// 2026-04-26: clean is the dedicated bath/scrub reaction (Deep Clean minigame).
const SCRUB_SPRITE_HAPPY = require('../../assets/bytes/Circle/Circle-clean.gif');

type GrimeNode = { id: number; x: number; y: number; size: number };
type ScrubBurst = { id: number; x: number; y: number; born: number };

function buildTracePatterns(variant: Variant) {
  // amplitude/offset are normalized fractions of board height (centerline = 0.5).
  const configs = [
    { amplitude: variant === 'long' ? 0.14 : 0.12, phase: 0, offset: -0.06, goal: variant === 'long' ? 7 : 5 },
    { amplitude: variant === 'long' ? 0.19 : 0.15, phase: Math.PI / 3, offset: 0.04, goal: variant === 'long' ? 8 : 5 },
    { amplitude: variant === 'long' ? 0.16 : 0.14, phase: Math.PI / 1.7, offset: 0, goal: variant === 'long' ? 9 : 6 },
  ];
  return configs.map((pattern, index) => ({
    id: `trace-${index}`,
    ...pattern,
  }));
}

// New-architecture drills are fully self-contained components (own play
// surface, settle pipeline, result panel, routing). The dispatcher below
// hands them off by id and falls through to LegacyMiniGameRunner for
// everything else.
export default function MiniGameRunnerScreen() {
  const params = useLocalSearchParams<{ id?: string; variant?: string; room?: string }>();
  const rawId = typeof params.id === 'string' ? params.id : '';
  if (rawId === 'training-power') {
    const game = getMiniGameById(rawId);
    if (game) return <PowerDrill game={game} />;
  }
  if (rawId === 'training-accuracy') {
    const game = getMiniGameById(rawId);
    if (game) return <AccuracyDrill game={game} />;
  }
  if (rawId === 'training-stamina') {
    const game = getMiniGameById(rawId);
    if (game) return <StaminaDrill game={game} />;
  }
  if (rawId === 'training-speed') {
    const game = getMiniGameById(rawId);
    if (game) return <SpeedDrill game={game} />;
  }
  if (rawId === 'training-agility') {
    const game = getMiniGameById(rawId);
    if (game) return <AgilityDrill game={game} />;
  }
  return <LegacyMiniGameRunner />;
}

function LegacyMiniGameRunner() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; variant?: string; room?: string }>();
  const game = useMemo(() => getMiniGameById(typeof params.id === 'string' ? params.id : ''), [params.id]);
  const variant: Variant = params.variant === 'long' ? 'long' : 'quick';
  const durationMs = useMemo(() => variantDurationMs(variant), [variant]);
  const room = typeof params.room === 'string' ? params.room : undefined;
  const roomPath = resolveRoomPath(room);

  const [running, setRunning] = useState(false);
  const [scrubIntroShown, setScrubIntroShown] = useState(true);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [interactions, setInteractions] = useState(0);
  const [quality, setQuality] = useState(0);
  const [grade, setGrade] = useState<Grade>('fail');
  const [status, setStatus] = useState('Booting mini game process...');
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [resultSummary, setResultSummary] = useState('');
  const [resultEffects, setResultEffects] = useState<string[]>([]);
  const [resultMeta, setResultMeta] = useState<string[]>([]);
  const [resultBits, setResultBits] = useState(0);
  const [resultSkill, setResultSkill] = useState<string | null>(null);
  const [resultEnergyCost, setResultEnergyCost] = useState(0);
  const [postProcessing, setPostProcessing] = useState(false);
  const [postPercent, setPostPercent] = useState(0);

  const [tapCount, setTapCount] = useState(0);
  const [targetPos, setTargetPos] = useState({ x: 30, y: 30 });
  // CHOMP (feed-upload) state.
  type ChompFood = {
    id: number;
    kind: 'good' | 'bad';
    glyph: string;
    loadedAt: number; // when the food appeared in the launcher
    xNorm: number; // horizontal position (launcher X while waiting, fixed during flight)
    thrownAt: number | null;
    resolution: 'none' | 'good' | 'bad' | 'miss';
  };
  const [chompFoods, setChompFoods] = useState<ChompFood[]>([]);
  const [chompSpawnCount, setChompSpawnCount] = useState(0);
  const [chompGoodCaught, setChompGoodCaught] = useState(0);
  const [chompGoodMissed, setChompGoodMissed] = useState(0);
  const [chompBadEaten, setChompBadEaten] = useState(0);
  const [chompGoodSpawned, setChompGoodSpawned] = useState(0);
  const [chompReaction, setChompReaction] = useState<'none' | 'good' | 'bad' | 'miss'>('none');
  const [chompFlash, setChompFlash] = useState(false);
  const [chompTick, setChompTick] = useState(0); // forces re-render so drift/bob animates
  const chompFoodsRef = useRef<ChompFood[]>([]);
  const chompSpawnCountRef = useRef(0);
  const chompGoodCaughtRef = useRef(0);
  const chompGoodMissedRef = useRef(0);
  const chompBadEatenRef = useRef(0);
  const chompGoodSpawnedRef = useRef(0);
  const chompRoundStartRef = useRef(0);
  const chompRoundClosedRef = useRef(false);
  const chompNextIdRef = useRef(0);
  const chompReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chompFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pre-rolled food queue — lets us show a "next up" preview and makes the round deterministic once started.
  type ChompQueueEntry = { kind: 'good' | 'bad'; glyph: string };
  const chompQueueRef = useRef<ChompQueueEntry[]>([]);
  const [chompQueueTick, setChompQueueTick] = useState(0); // bump to re-render preview slot when queue shifts
  // Visual polish refs — purely cosmetic, mutate in-place and piggyback on chompTick for re-render.
  type ChompVFX =
    | { id: number; type: 'burst'; x: number; y: number; vx: number; vy: number; spawnedAt: number }
    | { id: number; type: 'ripple'; x: number; y: number; spawnedAt: number }
    | { id: number; type: 'check'; x: number; y: number; spawnedAt: number }
    | { id: number; type: 'float'; x: number; y: number; text: string; spawnedAt: number };
  const chompVFXRef = useRef<ChompVFX[]>([]);
  const chompVFXNextIdRef = useRef(0);
  const chompTrailRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const chompShakeUntilRef = useRef(0);
  // Live-measured play area size (pixels). Updated via onLayout on the active play board.
  const [boardSize, setBoardSize] = useState({ w: 260, h: 170 });
  const boardSizeRef = useRef(boardSize);
  useEffect(() => { boardSizeRef.current = boardSize; }, [boardSize]);

  const [grimeNodes, setGrimeNodes] = useState<GrimeNode[]>([]);
  const [grimeCleared, setGrimeCleared] = useState(0);
  const [grimeCombo, setGrimeCombo] = useState(0);
  const [grimeMaxCombo, setGrimeMaxCombo] = useState(0);
  const [scrubBursts, setScrubBursts] = useState<ScrubBurst[]>([]);
  const [scrubReaction, setScrubReaction] = useState<'idle' | 'good'>('idle');
  const grimeNodesRef = useRef<GrimeNode[]>([]);
  const grimeClearedRef = useRef(0);
  const grimeMaxComboRef = useRef(0);
  const swipeComboRef = useRef(0);
  const scrubNextIdRef = useRef(0);
  const scrubBurstIdRef = useRef(0);
  const scrubSpawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubSpawnsDoneRef = useRef(false);
  const scrubTotalSpawnedRef = useRef(0);
  const scrubStageRef = useRef<View | null>(null);
  const scrubStageOffsetRef = useRef({ x: 0, y: 0 });
  const scrubReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [traceSamples, setTraceSamples] = useState(0);
  const [traceAligned, setTraceAligned] = useState(0);
  const [traceCursor, setTraceCursor] = useState<{ x: number; y: number } | null>(null);
  const [tracePatterns, setTracePatterns] = useState<{ id: string; amplitude: number; phase: number; offset: number; goal: number }[]>([]);
  const [traceStage, setTraceStage] = useState(0);

  const [cards, setCards] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [matched, setMatched] = useState<boolean[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pairCount, setPairCount] = useState(0);

  const [seqPattern, setSeqPattern] = useState<number[]>([]);
  const [seqIndex, setSeqIndex] = useState(0);
  const [seqCorrect, setSeqCorrect] = useState(0);
  const [sequencePreviewing, setSequencePreviewing] = useState(false);

  const [orderedNext, setOrderedNext] = useState(1);

  const [cursor, setCursor] = useState(0);
  const [timingAttempts, setTimingAttempts] = useState(0);
  const [timingHits, setTimingHits] = useState(0);
  const zoneStart = variant === 'long' ? 42 : 38;
  const zoneWidth = variant === 'long' ? 22 : 30;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cursorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sequencePreviewRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStarted = useRef(false);
  const roundClosedRef = useRef(false);
  const traceStageRef = useRef(0);
  const tapGoal = useMemo(() => (game ? targetGoalFor(game, variant) : 0), [game, variant]);
  const pairGoal = variant === 'long' ? 3 : 2;
  const scrubTarget = variant === 'long' ? SCRUB_LONG_TARGET : SCRUB_QUICK_TARGET;
  const scrubMaxActive = variant === 'long' ? SCRUB_LONG_MAX_ACTIVE : SCRUB_QUICK_MAX_ACTIVE;
  const scrubSpawnMs = variant === 'long' ? SCRUB_LONG_SPAWN_MS : SCRUB_QUICK_SPAWN_MS;
  const activeTracePattern = tracePatterns[traceStage] ?? null;
  const traceGoal = activeTracePattern?.goal ?? 0;

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (cursorRef.current) {
      clearInterval(cursorRef.current);
      cursorRef.current = null;
    }
    if (sequencePreviewRef.current) {
      clearTimeout(sequencePreviewRef.current);
      sequencePreviewRef.current = null;
    }
    if (scrubSpawnTimerRef.current) {
      clearInterval(scrubSpawnTimerRef.current);
      scrubSpawnTimerRef.current = null;
    }
    if (scrubReactionTimerRef.current) {
      clearTimeout(scrubReactionTimerRef.current);
      scrubReactionTimerRef.current = null;
    }
  }, []);

  const sfxThrottleRef = useRef<Partial<Record<SfxKey, number>>>({});

  const playGameSfx = useCallback((key: SfxKey, volume = 0.9, minGapMs = 0) => {
    const now = Date.now();
    const last = sfxThrottleRef.current[key] ?? 0;
    if (minGapMs > 0 && now - last < minGapMs) return;
    sfxThrottleRef.current[key] = now;
    void playSfx(key, volume);
  }, []);

  const resetRoundState = useCallback((def: MiniGameDef) => {
    roundClosedRef.current = false;
    setRemainingMs(durationMs);
    setInteractions(0);
    setQuality(0);
    setGrade('fail');
    setSynced(false);
    setResultReady(false);
    setResultSummary('');
    setResultEffects([]);
    setResultMeta([]);
    setResultBits(0);
    setResultSkill(null);
    setResultEnergyCost(0);
    setPostProcessing(false);
    setPostPercent(0);
    setStatus(`Running ${def.title} (${variant.toUpperCase()})...`);

    setTapCount(0);
    setTargetPos({ x: 30 + Math.random() * 220, y: 30 + Math.random() * 120 });
    // CHOMP reset — clear food queue, counters, reaction overlay.
    setChompFoods([]);
    chompFoodsRef.current = [];
    setChompSpawnCount(0);
    chompSpawnCountRef.current = 0;
    setChompGoodCaught(0);
    chompGoodCaughtRef.current = 0;
    setChompGoodMissed(0);
    chompGoodMissedRef.current = 0;
    setChompBadEaten(0);
    chompBadEatenRef.current = 0;
    setChompGoodSpawned(0);
    chompGoodSpawnedRef.current = 0;
    setChompReaction('none');
    setChompFlash(false);
    setChompTick(0);
    chompNextIdRef.current = 0;
    chompRoundStartRef.current = Date.now();
    chompRoundClosedRef.current = false;
    // Clear VFX/trail between rounds.
    chompVFXRef.current = [];
    chompVFXNextIdRef.current = 0;
    chompTrailRef.current = [];
    chompShakeUntilRef.current = 0;
    // Pre-roll the full round's food queue so we can show "next up" previews.
    chompQueueRef.current = Array.from({ length: CHOMP_ROUND_TOTAL }, () => {
      const isBad = Math.random() < CHOMP_BAD_FOOD_CHANCE;
      const pool = isBad ? CHOMP_BAD_FOOD : CHOMP_GOOD_FOOD;
      return { kind: isBad ? 'bad' : 'good', glyph: pool[Math.floor(Math.random() * pool.length)] };
    });
    setChompQueueTick(0);
    if (chompReactionTimerRef.current) { clearTimeout(chompReactionTimerRef.current); chompReactionTimerRef.current = null; }
    if (chompFlashTimerRef.current) { clearTimeout(chompFlashTimerRef.current); chompFlashTimerRef.current = null; }

    // Deep-clean reset — clear grime field, bursts, byte reaction, combo tracking.
    setGrimeNodes([]);
    grimeNodesRef.current = [];
    setGrimeCleared(0);
    grimeClearedRef.current = 0;
    setGrimeCombo(0);
    setGrimeMaxCombo(0);
    grimeMaxComboRef.current = 0;
    swipeComboRef.current = 0;
    setScrubBursts([]);
    setScrubReaction('idle');
    scrubNextIdRef.current = 0;
    scrubBurstIdRef.current = 0;
    scrubSpawnsDoneRef.current = false;
    scrubTotalSpawnedRef.current = 0;
    lastPointRef.current = null;

    setTraceSamples(0);
    setTraceAligned(0);
    setTraceCursor(null);
    const nextTracePatterns = buildTracePatterns(variant);
    setTracePatterns(nextTracePatterns);
    setTraceStage(0);
    traceStageRef.current = 0;

    const nextCards = shuffledSymbols(variant);
    setCards(nextCards);
    setRevealed(nextCards.map(() => false));
    setMatched(nextCards.map(() => false));
    setSelected(null);
    setPairCount(0);

    const patternLength = variant === 'long' ? 4 : 3;
    const nextPattern = Array.from({ length: patternLength }, () => Math.floor(Math.random() * 4));
    setSeqPattern(nextPattern);
    setSeqIndex(0);
    setSeqCorrect(0);
    setSequencePreviewing(def.kind === 'sequence');

    setOrderedNext(1);

    setCursor(0);
    setTimingAttempts(0);
    setTimingHits(0);
    if (def.kind === 'sequence') {
      sequencePreviewRef.current = setTimeout(() => {
        setSequencePreviewing(false);
        setStatus(`Repeat pattern: ${nextPattern.map((idx) => EMOTES[idx]).join(' -> ')}`);
      }, variant === 'long' ? 2200 : 1500);
    }
  }, [durationMs, variant]);

  const finishRound = useCallback((override?: number) => {
    if (!game || roundClosedRef.current) return;
    roundClosedRef.current = true;
    cleanupTimers();
    setRunning(false);

    const q = typeof override === 'number' ? override : quality;
    const normalized = interactions <= 0 ? 0 : clamp(Math.max(0.55, q), 0, 1);
    const g = gradeForQuality(normalized);

    setQuality(normalized);
    setGrade(g);
    setStatus(`${game.title} complete: ${g.toUpperCase()}. Finalizing results...`);
  }, [cleanupTimers, game, interactions, quality]);

  // Keep a live ref to finishRound so timers/intervals started in startRound
  // always invoke the LATEST closure (with current quality/interactions),
  // not the stale one captured at setInterval time.
  const finishRoundRef = useRef(finishRound);
  useEffect(() => {
    finishRoundRef.current = finishRound;
  }, [finishRound]);

  useEffect(() => () => cleanupTimers(), [cleanupTimers]);

  useEffect(() => {
    void initSfx();
    playGameSfx('minigame_ui_open', 0.82, 250);
    return () => {
      stopLoopSfx('minigame_process_loop');
    };
  }, [playGameSfx]);

  const startRound = useCallback(() => {
    if (!game || running) return;
    resetRoundState(game);
    playGameSfx(startCueFor(game), 0.72, 100);
    setRunning(true);

    timerRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          // Use the live ref so this timer uses the CURRENT finishRound
          // closure (with up-to-date quality/interactions), not the stale
          // one captured when startRound first ran.
          setTimeout(() => finishRoundRef.current?.(), 0);
          return 0;
        }
        return next;
      });
    }, 100);

    if (game.kind === 'timing') {
      const started = Date.now();
      const period = variant === 'long' ? 1800 : 2400;
      cursorRef.current = setInterval(() => {
        const p = ((Date.now() - started) % period) / period;
        const wave = p < 0.5 ? p * 2 : (1 - p) * 2;
        setCursor(wave * 100);
      }, 40);
    }
  }, [game, playGameSfx, resetRoundState, running, variant]);

  useEffect(() => {
    if (!game || autoStarted.current) return;
    // Scrub waits for the player to dismiss the intro overlay.
    if (game.id === 'run-cleanup') return;
    autoStarted.current = true;
    setTimeout(() => startRound(), 100);
  }, [game, startRound]);

  const beginScrub = useCallback(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    setScrubIntroShown(false);
    setTimeout(() => startRound(), 40);
  }, [startRound]);

  const applyOutcome = useCallback(async () => {
    if (!game || syncing || synced) return;
    setSyncing(true);
    setPostProcessing(true);
    setPostPercent(0);
    void startLoopSfx('minigame_process_loop', 0.42);

    try {
      let effectLines: string[] = [];
      let feedBlockedMessage: string | null = null;
      const processDuration = variant === 'long' ? 950 : 650;
      await new Promise<void>((resolve) => {
        const started = Date.now();
        const ticker = setInterval(() => {
          const elapsed = Date.now() - started;
          const pct = Math.min(100, Math.round((elapsed / processDuration) * 100));
          setPostPercent(pct);
          if (pct >= 100) {
            clearInterval(ticker);
            resolve();
          }
        }, 32);
      });

      if (quality > 0 && grade !== 'fail') {
        // Long variants fire the CARE_RESTORE long-form action once (meal / perfect-clean /
        // sleep / deep_play) instead of double-calling the quick variant. This taps the
        // near-full restore values and avoids the spam-penalty second hit.
        // Every care call is defended with .catch(() => null) so a flaky/unreachable
        // backend can't hang the result popup — the player still gets a grade screen.
        if (game.id === 'feed-upload') {
          const beforeByte = await getByte().catch(() => null);
          const result = await (variant === 'long'
            ? careAction('meal', grade, { mealCycle: true })
            : careAction('feed', grade, { mealCycle: true })
          ).catch(() => null);
          if (result?.blocked) {
            const reason = result.reason === 'not_hungry'
              ? 'Byte isn\u2019t hungry right now.'
              : result.reason === 'limit_reached'
                ? 'Feed limit reached. Try again later.'
                : 'Feed blocked. No effect applied.';
            effectLines = [reason];
            feedBlockedMessage = reason;
          } else if (result) {
            effectLines = diffNeedResults(beforeByte?.byte?.needs, result?.needs);
          } else {
            effectLines = ['Sync offline — effect will apply on reconnect.'];
          }
        } else if (game.id === 'run-cleanup') {
          const beforeByte = await getByte().catch(() => null);
          const result = await (variant === 'long'
            ? careAction('perfect-clean', grade)
            : careAction('clean', grade)
          ).catch(() => null);
          if (result) {
            effectLines = diffNeedResults(beforeByte?.byte?.needs, result?.needs);
            if (effectLines.length === 0) {
              const capMsg = capMessageForCareAction(game.id, beforeByte?.byte?.needs);
              if (capMsg) effectLines = [capMsg];
            }
          } else {
            effectLines = ['Sync offline — effect will apply on reconnect.'];
          }
          markHomeClutterCleared();
        } else if (game.id === 'stabilize-signal') {
          const beforeByte = await getByte().catch(() => null);
          const result = await (variant === 'long'
            ? careAction('deep_rest', grade)
            : careAction('rest', grade)
          ).catch(() => null);
          if (result) {
            effectLines = diffNeedResults(beforeByte?.byte?.needs, result?.needs);
            if (effectLines.length === 0) {
              const capMsg = capMessageForCareAction(game.id, beforeByte?.byte?.needs);
              if (capMsg) effectLines = [capMsg];
            }
          } else {
            effectLines = ['Sync offline — effect will apply on reconnect.'];
          }
        } else if (game.id === 'engage-simulation' || game.id === 'sync-link' || game.id === 'emote-align') {
          // Route play minigames through careAction so CARE_RESTORE values apply.
          const beforeByte = await getByte().catch(() => null);
          const result = await (variant === 'long'
            ? careAction('deep_play', grade)
            : careAction('play', grade)
          ).catch(() => null);
          if (result) {
            effectLines = diffNeedResults(beforeByte?.byte?.needs, result?.needs);
            if (effectLines.length === 0) {
              const capMsg = capMessageForCareAction(game.id, beforeByte?.byte?.needs);
              if (capMsg) effectLines = [capMsg];
            }
          } else {
            effectLines = ['Sync offline — effect will apply on reconnect.'];
          }
        } else if (game.id.startsWith('training-') && game.stat) {
          const trainResult = await trainStat(game.stat, grade).catch((err: any) => {
            console.error(`trainStat failed for ${game.stat}:`, err?.message);
            return null;
          });
          if (trainResult) {
            const gain = Math.max(0, Number(trainResult?.gain || 0));
            effectLines = gain > 0 ? [`${game.stat} +${gain}`] : [`${game.stat} +0`];
            await syncByte().catch(() => null); // REFRESH byte data after training so stats persist
          } else {
            effectLines = ['Sync offline — training will apply on reconnect.'];
          }
        }
      }

      const economy = calcEconomy(game, grade, variant, quality);
      if (game.id.startsWith('training-')) {
        recordTrainingUsage(economy.energyCost, 10000);
      }
      if (economy.byteBits > 0) {
        await earnCurrency(economy.byteBits, `minigame:${game.id}`).catch(() => {});
      }

      stopLoopSfx('minigame_process_loop');
      playGameSfx('minigame_process_done', 0.84, 100);
      playGameSfx(resultCueFor(grade), 0.88, 100);
      setSynced(true);
      setResultReady(true);
      setResultEffects(effectLines.length > 0 ? effectLines : ['No room effect applied']);
      setResultMeta([
        economy.byteBits > 0 ? `ByteBits +${economy.byteBits}` : '',
        economy.energyCost > 0 ? `Energy -${economy.energyCost}` : '',
        game.id.startsWith('training-') ? 'Training cooldown 10s' : '',
      ].filter(Boolean));
      setResultBits(economy.byteBits);
      setResultSkill(economy.statGain);
      setResultEnergyCost(economy.energyCost);
      setResultSummary(feedBlockedMessage || resultSummaryFor(game, grade, effectLines));
      setStatus('Result ready. Return to room to continue.');

      // Set pending result for room UI
      if (game.id.startsWith('training-')) {
        setPendingMiniGameResult({
          room: 'training-center',
          gameId: game.id,
          title: game.title,
          grade,
          quality,
          byteBits: economy.byteBits,
          skillGain: economy.statGain,
          energyCost: economy.energyCost,
          cooldownSeconds: 10,
          summary: effectLines.length > 0 ? effectLines.join(' • ') : `${game.title} complete.`,
        });
      }
    } catch {
      stopLoopSfx('minigame_process_loop');
      setStatus('Sync failed right now. You can cancel and retry.');
    } finally {
      stopLoopSfx('minigame_process_loop');
      setPostProcessing(false);
      setSyncing(false);
    }
  }, [game, grade, playGameSfx, quality, synced, syncing, variant]);

  useEffect(() => {
    if (running) return;
    if (remainingMs === durationMs && interactions === 0) return;
    if (synced || syncing) return;
    applyOutcome().catch(() => {});
  }, [applyOutcome, durationMs, interactions, remainingMs, running, synced, syncing]);

  const onTapTarget = useCallback(() => {
    if (!running || !game) return;
    playGameSfx(successCueFor(game), 0.76, 65);
    playGameSfx('minigame_score_tick', 0.56, 90);
    playGameSfx('minigame_target_spawn', 0.44, 65);
    setInteractions((v) => v + 1);
    setTapCount((v) => {
      const next = v + 1;
      const scale = variant === 'long' ? 0.05 : 0.08;
      setQuality(clamp(0.45 + next * scale, 0, 1));
      if (tapGoal > 0 && next >= tapGoal) {
        setTimeout(() => finishRound(clamp(0.45 + next * scale, 0, 1)), 60);
      }
      return next;
    });
    setTargetPos({ x: 24 + Math.random() * 220, y: 24 + Math.random() * 130 });
  }, [finishRound, game, playGameSfx, running, tapGoal, variant]);

  // CHOMP helpers + game loop (feed-upload)
  // Byte sweeps top L↔R (ping-pong) with sine-modulated speed.
  // Closed-form phase: ∫ (1/base)(1 + v*sin(2π s/mod)) ds = t/base + (v*mod)/(2π base) * (1 - cos(2π t/mod))
  // One sweep = phase 1; triangle-wave folds phase → [0,1] → [1,0] → ...
  const chompByteXAt = useCallback((playW: number, elapsedMs: number, spriteW: number) => {
    if (playW <= 0) return 0;
    const base = CHOMP_BYTE_SWEEP_BASE_MS_PER_SWEEP;
    const mod = CHOMP_BYTE_SWEEP_MOD_PERIOD_MS;
    const v = CHOMP_BYTE_SWEEP_VARIANCE;
    const phase = elapsedMs / base + (v * mod) / (2 * Math.PI * base) * (1 - Math.cos((2 * Math.PI * elapsedMs) / mod));
    const folded = phase % 2; // 0..2
    const tri = folded < 1 ? folded : 2 - folded; // 0..1..0
    // Sprite has transparent inner padding — let visible body nearly kiss the edges.
    const marginX = spriteW * 0.4;
    const travelMin = marginX;
    const travelMax = playW - marginX;
    return travelMin + tri * (travelMax - travelMin);
  }, []);

  const triggerChompReaction = useCallback((kind: 'good' | 'bad' | 'miss') => {
    setChompReaction(kind);
    if (chompReactionTimerRef.current) clearTimeout(chompReactionTimerRef.current);
    chompReactionTimerRef.current = setTimeout(() => setChompReaction('none'), CHOMP_REACTION_MS);
  }, []);

  const triggerChompFlash = useCallback(() => {
    setChompFlash(true);
    if (chompFlashTimerRef.current) clearTimeout(chompFlashTimerRef.current);
    chompFlashTimerRef.current = setTimeout(() => setChompFlash(false), 260);
  }, []);

  // VFX spawn helpers — all refs, piggyback on chompTick re-render.
  const spawnChompBurst = useCallback((x: number, y: number) => {
    const now = Date.now();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 0.08 + Math.random() * 0.06; // px/ms
      chompVFXRef.current.push({
        id: chompVFXNextIdRef.current++,
        type: 'burst',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spawnedAt: now,
      });
    }
    chompVFXRef.current.push({
      id: chompVFXNextIdRef.current++,
      type: 'float',
      x,
      y,
      text: '+1',
      spawnedAt: now,
    });
  }, []);
  const spawnChompRipple = useCallback((x: number, y: number) => {
    chompVFXRef.current.push({
      id: chompVFXNextIdRef.current++,
      type: 'ripple',
      x,
      y,
      spawnedAt: Date.now(),
    });
  }, []);
  const spawnChompCheck = useCallback((x: number, y: number) => {
    chompVFXRef.current.push({
      id: chompVFXNextIdRef.current++,
      type: 'check',
      x,
      y,
      spawnedAt: Date.now(),
    });
  }, []);
  const triggerChompShake = useCallback(() => {
    chompShakeUntilRef.current = Date.now() + 180;
  }, []);

  const onChompFoodTap = useCallback((foodId: number) => {
    if (!running || game?.id !== 'feed-upload') return;
    const idx = chompFoodsRef.current.findIndex((f) => f.id === foodId);
    if (idx < 0) return;
    const food = chompFoodsRef.current[idx];
    if (food.resolution !== 'none' || food.thrownAt !== null) return;
    const now = Date.now();
    const updated: ChompFood = { ...food, thrownAt: now };
    const nextFoods = chompFoodsRef.current.slice();
    nextFoods[idx] = updated;
    chompFoodsRef.current = nextFoods;
    setChompFoods(nextFoods);
    setInteractions((v) => v + 1);
    // Ripple ring at launcher on tap.
    const w = boardSizeRef.current.w;
    const h = boardSizeRef.current.h;
    spawnChompRipple(CHOMP_LAUNCHER_X_NORM * w, h - 40);
  }, [running, game?.id, spawnChompRipple]);

  useEffect(() => {
    if (!running || game?.id !== 'feed-upload') return;
    const startAt = chompRoundStartRef.current || Date.now();
    chompRoundStartRef.current = startAt;
    let nextLoadAt = startAt + 400; // first food appears shortly after round start

    const loadNextFood = (now: number) => {
      const entry = chompQueueRef.current.shift();
      if (!entry) return; // queue drained — shouldn't happen until round end
      setChompQueueTick((t) => (t + 1) % 1_000_000);
      const food: ChompFood = {
        id: chompNextIdRef.current++,
        kind: entry.kind,
        glyph: entry.glyph,
        loadedAt: now,
        xNorm: CHOMP_LAUNCHER_X_NORM,
        thrownAt: null,
        resolution: 'none',
      };
      chompFoodsRef.current = [...chompFoodsRef.current, food];
      setChompFoods(chompFoodsRef.current);
      chompSpawnCountRef.current += 1;
      setChompSpawnCount(chompSpawnCountRef.current);
      if (entry.kind === 'good') {
        chompGoodSpawnedRef.current += 1;
        setChompGoodSpawned(chompGoodSpawnedRef.current);
      }
      playGameSfx('minigame_target_spawn', 0.38, 120);
    };

    const tick = setInterval(() => {
      const now = Date.now();
      const w = boardSizeRef.current.w;
      const h = boardSizeRef.current.h;

      // Launcher load: one food at a time, ROUND_TOTAL total. Only loads when no food is waiting OR in flight.
      const hasPending = chompFoodsRef.current.some((f) => f.resolution === 'none');
      if (!hasPending && chompSpawnCountRef.current < CHOMP_ROUND_TOTAL && now >= nextLoadAt) {
        loadNextFood(now);
      }

      // Resolve thrown foods (flight complete → hit-test byte X vs food X)
      let changed = false;
      for (const food of chompFoodsRef.current) {
        if (food.resolution !== 'none') continue;
        if (food.thrownAt !== null && now - food.thrownAt >= CHOMP_THROW_DURATION_MS) {
          const spriteW = Math.min(h * 0.55, 140) * CHOMP_BYTE_SCALE;
          const byteX = chompByteXAt(w, now - startAt, spriteW);
          const foodX = food.xNorm * w;
          const inBite = Math.abs(byteX - foodX) <= CHOMP_BYTE_HIT_TOLERANCE_PX;
          // Byte row Y for VFX spawn — approximate top strip.
          const byteRowY = h * 0.22;
          if (food.kind === 'good' && inBite) {
            food.resolution = 'good';
            chompGoodCaughtRef.current += 1;
            setChompGoodCaught(chompGoodCaughtRef.current);
            triggerChompReaction('good');
            playGameSfx('minigame_feed_upload', 0.82, 70);
            playGameSfx('minigame_score_good', 0.72, 80);
            spawnChompBurst(byteX, byteRowY);
          } else if (food.kind === 'bad' && inBite) {
            food.resolution = 'bad';
            chompBadEatenRef.current += 1;
            setChompBadEaten(chompBadEatenRef.current);
            triggerChompReaction('bad');
            triggerChompFlash();
            triggerChompShake();
            playGameSfx('minigame_feed_upload', 0.95, 50);
          } else {
            food.resolution = 'miss';
            if (food.kind === 'good') {
              chompGoodMissedRef.current += 1;
              setChompGoodMissed(chompGoodMissedRef.current);
              // Whiffed good food — fail cue.
              playGameSfx('minigame_score_fail', 0.58, 80);
            } else {
              // Bad food fired into the void — reward cue.
              playGameSfx('minigame_score_good', 0.62, 80);
              spawnChompCheck(w / 2, 28);
            }
            triggerChompReaction('miss');
          }
          // Live score update — only good catches drive the SCORE badge (monotonic).
          // Bad-eaten penalty still applies to the FINAL grade in finishRound; it doesn't erase mid-round progress.
          const expectedGood = CHOMP_ROUND_TOTAL * (1 - CHOMP_BAD_FOOD_CHANCE);
          setQuality(clamp(chompGoodCaughtRef.current / expectedGood, 0, 1));
          // Schedule next food load after this one resolves
          nextLoadAt = now + CHOMP_LAUNCHER_RELOAD_MS;
          changed = true;
        }
      }

      // Purge foods that have flown off the top of the stage.
      const beforeLen = chompFoodsRef.current.length;
      chompFoodsRef.current = chompFoodsRef.current.filter((f) => {
        if (f.thrownAt === null) return true;
        // Good/bad hits: fade then purge ~300ms after arrival at byte row.
        if (f.resolution === 'good' || f.resolution === 'bad') {
          return now < f.thrownAt + CHOMP_THROW_DURATION_MS + 300;
        }
        // Miss (and unresolved post-arrival): let it fly past byte and off the top.
        // At constant velocity, food exits top at ~throwDur * (launcherY / (launcherY - byteCenterY)).
        // Approx: remove ~750ms after throw start (covers tallest stage).
        return now < f.thrownAt + 750;
      });
      if (chompFoodsRef.current.length !== beforeLen) changed = true;
      if (changed) setChompFoods([...chompFoodsRef.current]);

      // Round-end check: all 12 loaded + every food resolved
      if (!chompRoundClosedRef.current &&
          chompSpawnCountRef.current >= CHOMP_ROUND_TOTAL &&
          chompFoodsRef.current.every((f) => f.resolution !== 'none')) {
        chompRoundClosedRef.current = true;
        const good = chompGoodCaughtRef.current;
        const bad = chompBadEatenRef.current;
        const goodSpawned = Math.max(chompGoodSpawnedRef.current, 1);
        const raw = (good - bad * 0.5) / goodSpawned;
        const q = clamp(raw, 0, 1);
        setTimeout(() => finishRound(q), 300);
      }

      // Byte trail: sample byte position each tick, keep last ~8 samples.
      {
        const spriteW = Math.min(h * 0.55, 140) * CHOMP_BYTE_SCALE;
        const byteX = chompByteXAt(w, now - startAt, spriteW);
        const byteCenterY = h * 0.22;
        chompTrailRef.current.push({ x: byteX, y: byteCenterY, t: now });
        if (chompTrailRef.current.length > 8) chompTrailRef.current.shift();
        // Prune stale trail (>400ms).
        while (chompTrailRef.current.length > 0 && now - chompTrailRef.current[0].t > 400) {
          chompTrailRef.current.shift();
        }
      }

      // Prune expired VFX.
      if (chompVFXRef.current.length > 0) {
        chompVFXRef.current = chompVFXRef.current.filter((v) => {
          const age = now - v.spawnedAt;
          if (v.type === 'burst') return age < 550;
          if (v.type === 'ripple') return age < 500;
          if (v.type === 'check') return age < 650;
          if (v.type === 'float') return age < 700;
          return false;
        });
      }

      setChompTick((t) => (t + 1) % 1_000_000);
    }, 33);

    return () => clearInterval(tick);
  }, [running, game?.id, chompByteXAt, finishRound, playGameSfx, triggerChompFlash, triggerChompReaction, spawnChompBurst, spawnChompCheck, triggerChompShake]);

  // Deep-clean helpers — burst particles, byte reaction flash, grime cluster spawner.
  const addScrubBurst = useCallback((x: number, y: number) => {
    const id = ++scrubBurstIdRef.current;
    const burst: ScrubBurst = { id, x, y, born: Date.now() };
    setScrubBursts((prev) => [...prev, burst]);
    setTimeout(() => {
      setScrubBursts((prev) => prev.filter((b) => b.id !== id));
    }, SCRUB_BURST_TTL_MS);
  }, []);

  const triggerScrubReaction = useCallback(() => {
    setScrubReaction('good');
    if (scrubReactionTimerRef.current) clearTimeout(scrubReactionTimerRef.current);
    scrubReactionTimerRef.current = setTimeout(() => setScrubReaction('idle'), SCRUB_BYTE_REACTION_MS);
  }, []);

  const spawnGrimeCluster = useCallback((bw: number, bh: number) => {
    if (bw <= 0 || bh <= 0) return;
    const cx = 40 + Math.random() * Math.max(1, bw - 80);
    const cy = 70 + Math.random() * Math.max(1, bh - 140);
    const count = SCRUB_CLUSTER_MIN + Math.floor(Math.random() * (SCRUB_CLUSTER_MAX - SCRUB_CLUSTER_MIN + 1));
    const newNodes: GrimeNode[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * SCRUB_CLUSTER_RADIUS_PX;
      const x = clamp(cx + Math.cos(angle) * r, 24, bw - 24);
      const y = clamp(cy + Math.sin(angle) * r, 24, bh - 24);
      const id = ++scrubNextIdRef.current;
      newNodes.push({ id, x, y, size: SCRUB_NODE_SIZE_PX * (0.85 + Math.random() * 0.3) });
    }
    grimeNodesRef.current = [...grimeNodesRef.current, ...newNodes];
    scrubTotalSpawnedRef.current += newNodes.length;
    setGrimeNodes(grimeNodesRef.current);
  }, []);

  // Deep-clean game loop — seeds the stage then spawns clusters on interval while running.
  useEffect(() => {
    if (!running || game?.id !== 'run-cleanup') return;
    const bw = boardSize.w;
    const bh = boardSize.h;
    if (bw <= 0 || bh <= 0) return;

    let spawnCount = 0;
    const spawnCap = Math.ceil((scrubTarget * 1.4) / SCRUB_CLUSTER_MAX);
    scrubSpawnsDoneRef.current = false;

    spawnGrimeCluster(bw, bh);
    spawnCount += 1;

    const tick = setInterval(() => {
      if (spawnCount >= spawnCap) {
        scrubSpawnsDoneRef.current = true;
        return;
      }
      if (grimeNodesRef.current.length >= scrubMaxActive) return;
      spawnGrimeCluster(bw, bh);
      spawnCount += 1;
      if (spawnCount >= spawnCap) scrubSpawnsDoneRef.current = true;
    }, scrubSpawnMs);

    scrubSpawnTimerRef.current = tick;
    return () => {
      clearInterval(tick);
      if (scrubSpawnTimerRef.current === tick) scrubSpawnTimerRef.current = null;
    };
  }, [running, game?.id, boardSize.w, boardSize.h, scrubTarget, scrubMaxActive, scrubSpawnMs, spawnGrimeCluster]);

  const scrubPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onMoveShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onPanResponderGrant: (_, g) => {
          // Cache the stage's screen offset so finger coords can be translated
          // into stage-local space for hit testing.
          scrubStageRef.current?.measureInWindow((px, py) => {
            scrubStageOffsetRef.current = { x: px, y: py };
          });
          const off = scrubStageOffsetRef.current;
          lastPointRef.current = { x: g.moveX - off.x, y: g.moveY - off.y };
          swipeComboRef.current = 0;
          setGrimeCombo(0);
        },
        onPanResponderMove: (_, g) => {
          if (!running || game?.kind !== 'scrub') return;
          setInteractions((v) => v + 1);
          const off = scrubStageOffsetRef.current;
          const p = { x: g.moveX - off.x, y: g.moveY - off.y };
          lastPointRef.current = p;

          // Hit-test finger against every active grime node (local coords).
          const hitIds: number[] = [];
          for (const node of grimeNodesRef.current) {
            const dx = p.x - node.x;
            const dy = p.y - node.y;
            const r = SCRUB_HIT_RADIUS_PX + node.size * 0.5;
            if (dx * dx + dy * dy <= r * r) hitIds.push(node.id);
          }
          if (hitIds.length === 0) return;

          const hitSet = new Set(hitIds);
          const cleared = grimeNodesRef.current.filter((n) => hitSet.has(n.id));
          grimeNodesRef.current = grimeNodesRef.current.filter((n) => !hitSet.has(n.id));
          setGrimeNodes(grimeNodesRef.current);
          for (const n of cleared) addScrubBurst(n.x, n.y);

          playGameSfx('minigame_cleanup_scrub', 0.55, 45);

          swipeComboRef.current += cleared.length;
          setGrimeCombo(swipeComboRef.current);
          if (swipeComboRef.current > grimeMaxComboRef.current) {
            grimeMaxComboRef.current = swipeComboRef.current;
            setGrimeMaxCombo(swipeComboRef.current);
          }
          // Any clear triggers the blush — keeps the byte reacting the whole
          // time the player is actively scrubbing.
          triggerScrubReaction();

          grimeClearedRef.current += cleared.length;
          setGrimeCleared(grimeClearedRef.current);

          // Quality: ratio of grime wiped vs what's been spawned, plus a small combo kicker.
          const totalSpawned = Math.max(1, scrubTotalSpawnedRef.current);
          const clearedRatio = Math.min(1, grimeClearedRef.current / totalSpawned);
          const comboBonus = Math.min(1, grimeMaxComboRef.current / 5);
          const q = clamp(clearedRatio * 0.85 + comboBonus * 0.15, 0, 1);
          setQuality(q);

          // Round ends only when the spawner has finished AND the board is clean.
          if (scrubSpawnsDoneRef.current && grimeNodesRef.current.length === 0) {
            playGameSfx('minigame_score_tick', 0.65, 80);
            setTimeout(() => finishRound(q), 80);
          }
        },
        onPanResponderRelease: () => {
          swipeComboRef.current = 0;
          setGrimeCombo(0);
          lastPointRef.current = null;
        },
        onPanResponderTerminate: () => {
          swipeComboRef.current = 0;
          setGrimeCombo(0);
          lastPointRef.current = null;
        },
      }),
    [addScrubBurst, finishRound, game?.kind, playGameSfx, running, scrubTarget, triggerScrubReaction]
  );

  const tracePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => running && game?.kind === 'trace',
        onMoveShouldSetPanResponder: () => running && game?.kind === 'trace',
        onPanResponderGrant: () => {
          playGameSfx('minigame_signal_trace', 0.64, 110);
        },
        onPanResponderMove: (evt) => {
          if (!running || game?.kind !== 'trace') return;
          const pattern = tracePatterns[traceStageRef.current];
          if (!pattern) return;
          const { w, h } = boardSizeRef.current;
          if (w <= 0 || h <= 0) return;
          setInteractions((v) => v + 1);

          const x = clamp(evt.nativeEvent.locationX, 0, w);
          const y = clamp(evt.nativeEvent.locationY, 0, h);
          // expected y in pixels: centerline + (offset + sine) * h
          const expected = (0.5 + pattern.offset + Math.sin((x / w) * Math.PI * 2 + pattern.phase) * pattern.amplitude) * h;
          const tol = variant === 'long' ? 34 : 44;
          const ok = Math.abs(y - expected) <= tol;

          setTraceCursor({ x: x / w, y: y / h });
          setTraceSamples((s) => s + 1);
          if (ok) setTraceAligned((a) => a + 1);
          const samples = traceSamples + 1;
          const aligned = traceAligned + (ok ? 1 : 0);
          const nextQuality = clamp(((traceStageRef.current + aligned / Math.max(1, pattern.goal)) / 3) * 0.9 + aligned / Math.max(1, samples) * 0.1, 0, 1);
          setQuality(nextQuality);
          if (aligned >= pattern.goal && nextQuality >= 0.45) {
            playGameSfx('minigame_signal_trace', 0.74, 110);
            playGameSfx('minigame_score_tick', 0.58, 90);
            if (traceStageRef.current >= 2) {
              setTimeout(() => finishRound(nextQuality), 60);
            } else {
              traceStageRef.current += 1;
              const nextStage = traceStageRef.current;
              setTraceStage(nextStage);
              setTraceSamples(0);
              setTraceAligned(0);
              setTraceCursor(null);
              setStatus(`Signal pattern ${nextStage + 1} engaged. Hold the line steady.`);
            }
          }
        },
      }),
    [finishRound, game?.kind, playGameSfx, running, traceAligned, tracePatterns, traceSamples, variant]
  );

  const onCardPress = useCallback((idx: number) => {
    if (!running || game?.kind !== 'match') return;
    if (matched[idx] || revealed[idx]) return;

    setInteractions((v) => v + 1);
    setRevealed((prev) => prev.map((v, i) => (i === idx ? true : v)));

    if (selected == null) {
      setSelected(idx);
      return;
    }

    const first = selected;
    const second = idx;
    if (first === second) return;

    if (cards[first] === cards[second]) {
      playGameSfx(successCueFor(game), 0.76, 90);
      playGameSfx('minigame_score_tick', 0.58, 90);
      setMatched((prev) => prev.map((v, i) => (i === first || i === second ? true : v)));
      setSelected(null);
      setPairCount((count) => {
        const next = count + 1;
        setQuality(clamp(0.5 + next * 0.18, 0, 1));
        if (next >= pairGoal) setTimeout(() => finishRound(clamp(0.5 + next * 0.18, 0, 1)), 100);
        return next;
      });
      return;
    }

    playGameSfx('minigame_target_miss', 0.72, 90);
    const a = first;
    const b = second;
    setTimeout(() => {
      setRevealed((prev) => prev.map((v, i) => (i === a || i === b ? false : v)));
      setSelected(null);
    }, 230);
  }, [cards, finishRound, game, matched, pairGoal, playGameSfx, revealed, running, selected]);

  const onSequencePress = useCallback((idx: number) => {
    if (!running || game?.kind !== 'sequence' || sequencePreviewing) return;
    setInteractions((v) => v + 1);
    const expected = seqPattern[seqIndex];
    if (idx === expected) {
      playGameSfx(successCueFor(game), 0.74, 90);
      playGameSfx('minigame_score_tick', 0.58, 90);
      const next = seqIndex + 1;
      setSeqIndex(next);
      setSeqCorrect((c) => c + 1);
      setQuality(clamp(0.45 + next * 0.18, 0, 1));
      if (next >= seqPattern.length) setTimeout(() => finishRound(clamp(0.45 + next * 0.18, 0, 1)), 100);
      return;
    }
    playGameSfx('minigame_target_miss', 0.72, 90);
    setSeqIndex(0);
    setStatus(`Pattern broke. Retry: ${seqPattern.map((value) => EMOTES[value]).join(' -> ')}`);
  }, [finishRound, game, playGameSfx, running, seqIndex, seqPattern, sequencePreviewing]);

  const onOrderedPress = useCallback((n: number) => {
    if (!running || game?.kind !== 'ordered-sequence') return;
    setInteractions((v) => v + 1);
    if (n === orderedNext) {
      playGameSfx(successCueFor(game), 0.76, 80);
      playGameSfx('minigame_score_tick', 0.58, 90);
      const next = n + 1;
      setOrderedNext(next);
      setQuality(clamp(0.45 + n * 0.1, 0, 1));
      if (n >= 6) setTimeout(() => finishRound(1), 80);
      return;
    }
    playGameSfx('minigame_target_miss', 0.72, 90);
  }, [finishRound, game, orderedNext, playGameSfx, running]);

  const onStopTiming = useCallback(() => {
    if (!running || game?.kind !== 'timing' || timingAttempts >= 3) return;
    setInteractions((v) => v + 1);

    const center = zoneStart + zoneWidth / 2;
    const dist = Math.abs(cursor - center);
    const shot = clamp(1 - dist / Math.max(zoneWidth * 0.7, 1), 0, 1);
    if (shot >= 0.35) {
      playGameSfx(successCueFor(game), 0.78, 100);
      playGameSfx('minigame_score_tick', 0.58, 100);
    } else {
      playGameSfx('minigame_target_miss', 0.72, 100);
    }
    setTimingAttempts((a) => a + 1);
    if (shot >= 0.35) setTimingHits((h) => h + 1);
    setQuality((q) => clamp(Math.max(q, shot, shot >= 0.35 ? 0.55 : q), 0, 1));

    if (timingAttempts + 1 >= 3) {
      const estimate = clamp(Math.max(quality, shot, (timingHits + (shot >= 0.35 ? 1 : 0)) / 3), 0, 1);
      setTimeout(() => finishRound(estimate), 100);
    }
  }, [cursor, finishRound, game, playGameSfx, quality, running, timingAttempts, timingHits, zoneStart, zoneWidth]);

  const goBackToRoom = useCallback(() => {
    stopLoopSfx('minigame_process_loop');
    playGameSfx('minigame_return_room', 0.8, 120);
    playGameSfx('minigame_ui_close', 0.7, 120);
    if (!game || !roomPath) {
      router.back();
      return;
    }
    const payloadRoom = room as MiniGameRoomId;
    if (!payloadRoom) {
      router.back();
      return;
    }
    const summary = resultEffects.length > 0 ? resultEffects.join(' • ') : (resultSummary || `${game.title} complete.`);
    setPendingMiniGameResult({
      room: payloadRoom,
      gameId: game.id,
      title: game.title,
      grade,
      quality,
      byteBits: resultBits,
      skillGain: resultSkill,
      energyCost: resultEnergyCost,
      cooldownSeconds: game.id.startsWith('training-') ? 10 : null,
      summary,
    });
    router.replace(roomPath as any);
  }, [game, grade, playGameSfx, quality, resultBits, resultEffects, resultEnergyCost, resultSkill, resultSummary, room, roomPath, router]);

  if (!game) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={styles.title}>Mini game not found.</Text></View>
      </SafeAreaView>
    );
  }

  const accent = game.accent;
  const gradeColor = gradeAccent(grade);
  const score = Math.round(quality * 100);
  // Exit remains enabled during sync/post-process so a slow/failed backend
  // can't trap the player on the results screen. Only the active round locks it out.
  const navigationLocked = running;

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.bgTint} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.eyebrow}>{familyLabelFor(game)}</Text>
            <Text style={styles.title}>{game.title}</Text>
            <Text style={styles.sub}>{game.subtitle}</Text>
          </View>
          <View style={[styles.scoreBadge, { borderColor: `${accent}88`, backgroundColor: `${accent}20` }]}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={[styles.scoreValue, { color: gradeColor }]}>{score}</Text>
          </View>
        </View>

        <View style={styles.playWrap}>
          <View style={[styles.play, { borderColor: `${accent}50` }]}>
          {game.id === 'feed-upload' ? (
            <View
              style={[
                styles.chompStage,
                { borderColor: `${accent}66` },
                (() => {
                  const left = chompShakeUntilRef.current - Date.now();
                  if (left <= 0) return null;
                  const mag = Math.min(left / 180, 1) * 4;
                  return {
                    transform: [
                      { translateX: (Math.random() - 0.5) * mag * 2 },
                      { translateY: (Math.random() - 0.5) * mag * 2 },
                    ],
                  };
                })(),
              ]}
              onLayout={(e) => setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
              <View style={styles.chompBg} pointerEvents="none" />
              {/* Grid atmosphere */}
              {(() => {
                const w = boardSize.w;
                const h = boardSize.h;
                const vLines = 8;
                const hLines = 6;
                const out: React.ReactNode[] = [];
                for (let i = 1; i < vLines; i += 1) {
                  out.push(
                    <View
                      key={`gv-${i}`}
                      pointerEvents="none"
                      style={[styles.chompGridLineV, { left: (w * i) / vLines }]}
                    />,
                  );
                }
                for (let i = 1; i < hLines; i += 1) {
                  out.push(
                    <View
                      key={`gh-${i}`}
                      pointerEvents="none"
                      style={[styles.chompGridLineH, { top: (h * i) / hLines }]}
                    />,
                  );
                }
                return out;
              })()}
              {/* Corner brackets */}
              <View pointerEvents="none" style={[styles.chompCorner, { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { top: 4, right: 4, borderTopWidth: 2, borderRightWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { bottom: 4, left: 4, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { bottom: 4, right: 4, borderBottomWidth: 2, borderRightWidth: 2 }]} />
              {/* Byte sweep trail */}
              {(() => {
                void chompTick;
                const now = Date.now();
                return chompTrailRef.current.map((p, i, arr) => {
                  const age = now - p.t;
                  const opacity = Math.max(0, 1 - age / 400) * 0.35 * ((i + 1) / arr.length);
                  const size = 10 + (i / arr.length) * 6;
                  return (
                    <View
                      key={`trail-${p.t}-${i}`}
                      pointerEvents="none"
                      style={[
                        styles.chompTrailDot,
                        { left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: size / 2, opacity },
                      ]}
                    />
                  );
                });
              })()}
              {(() => {
                // Byte sweeps the top of the board L↔R. chompTick forces re-render at 30fps.
                void chompTick;
                const w = boardSize.w;
                const h = boardSize.h;
                const byteSize = Math.min(h * 0.55, 140) * CHOMP_BYTE_SCALE;
                const byteTopPad = 18;
                const elapsed = Date.now() - (chompRoundStartRef.current || Date.now());
                const byteX = chompByteXAt(w, elapsed, byteSize);
                const sprite =
                  chompReaction === 'good'
                    ? CHOMP_SPRITE_CHOMP_GOOD
                    : chompReaction === 'bad'
                    ? CHOMP_SPRITE_CHOMP_BAD
                    : chompReaction === 'miss'
                    ? CHOMP_SPRITE_MISS
                    : CHOMP_SPRITE_IDLE;
                return (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.chompByte,
                      {
                        left: byteX - byteSize / 2,
                        top: byteTopPad,
                        width: byteSize,
                        height: byteSize,
                      },
                    ]}
                  >
                    <Image source={sprite} style={styles.chompByteSprite} resizeMode="contain" />
                  </View>
                );
              })()}

              {/* Launcher tray — framed strip at the bottom. Rendered BEFORE food so food paints on top. */}
              {(() => {
                void chompQueueTick;
                const w = boardSize.w;
                const h = boardSize.h;
                const slotSize = CHOMP_LAUNCHER_PAD_SIZE_PX;
                const previewSize = Math.round(slotSize * 0.65);
                const gap = 10;
                const framePadding = 8;
                const frameWidth = slotSize + gap + previewSize + framePadding * 2;
                const frameHeight = slotSize + framePadding * 2;
                const frameLeft = CHOMP_LAUNCHER_X_NORM * w - slotSize / 2 - framePadding;
                const frameTop = h - frameHeight - 12;
                const nextEntry = chompQueueRef.current[0];
                return (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.chompLauncherFrame,
                      { left: frameLeft, top: frameTop, width: frameWidth, height: frameHeight, padding: framePadding },
                    ]}
                  >
                    <View style={[styles.chompLauncherSlot, { width: slotSize, height: slotSize }]} />
                    <View
                      style={[
                        styles.chompLauncherPreview,
                        { width: previewSize, height: previewSize, marginLeft: gap },
                      ]}
                    >
                      {nextEntry ? (
                        <Text style={[styles.chompFoodGlyph, styles.chompPreviewGlyph, nextEntry.kind === 'bad' && styles.chompPreviewGlyphBad]}>
                          {nextEntry.glyph}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })()}

              {chompFoods.map((food) => {
                const w = boardSize.w;
                const h = boardSize.h;
                const now = Date.now();
                const foodSize = CHOMP_FOOD_SIZE_PX;
                const byteSize = Math.min(h * 0.55, 140) * CHOMP_BYTE_SCALE;
                const launcherY = h - foodSize * 0.5 - 24; // bottom-center launcher Y
                const byteCenterY = 18 + byteSize / 2;
                const x = food.xNorm * w;
                let y: number;
                if (food.thrownAt !== null) {
                  // Constant velocity from launcher → byte row (at CHOMP_THROW_DURATION_MS) → off top.
                  const speedPxPerMs = (launcherY - byteCenterY) / CHOMP_THROW_DURATION_MS;
                  y = launcherY - speedPxPerMs * (now - food.thrownAt);
                  // Good/bad hits: stop at byte row (swallowed). Miss: keep flying past off-screen.
                  if ((food.resolution === 'good' || food.resolution === 'bad') && y < byteCenterY) {
                    y = byteCenterY;
                  }
                } else {
                  y = launcherY;
                }
                const isThrown = food.thrownAt !== null;
                const isEaten = food.resolution === 'good' || food.resolution === 'bad';
                // Good/bad hits fade (swallowed). Missed food keeps visible until it exits top.
                const opacity = isEaten ? 0.15 : 1;
                const disabled = food.resolution !== 'none' || isThrown;
                return (
                  <TouchableOpacity
                    key={`chomp-food-${food.id}`}
                    style={[
                      styles.chompFood,
                      food.kind === 'bad' && styles.chompFoodBad,
                      { left: x - foodSize / 2, top: y - foodSize / 2, width: foodSize, height: foodSize, opacity },
                    ]}
                    onPress={() => onChompFoodTap(food.id)}
                    disabled={disabled}
                    hitSlop={LARGE_TOUCH_HIT_SLOP}
                  >
                    <Text style={styles.chompFoodGlyph}>{food.glyph}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* VFX layer */}
              {(() => {
                void chompTick;
                const now = Date.now();
                return chompVFXRef.current.map((v) => {
                  const age = now - v.spawnedAt;
                  if (v.type === 'burst') {
                    const t = age / 550;
                    const x = v.x + v.vx * age;
                    const y = v.y + v.vy * age + 0.0002 * age * age; // mild gravity
                    const opacity = Math.max(0, 1 - t);
                    return (
                      <View
                        key={`vfx-${v.id}`}
                        pointerEvents="none"
                        style={[styles.chompBurstDot, { left: x - 3, top: y - 3, opacity }]}
                      />
                    );
                  }
                  if (v.type === 'ripple') {
                    const t = age / 500;
                    const size = 20 + t * 60;
                    const opacity = Math.max(0, 1 - t);
                    return (
                      <View
                        key={`vfx-${v.id}`}
                        pointerEvents="none"
                        style={[
                          styles.chompRippleRing,
                          { left: v.x - size / 2, top: v.y - size / 2, width: size, height: size, borderRadius: size / 2, opacity },
                        ]}
                      />
                    );
                  }
                  if (v.type === 'check') {
                    const t = age / 650;
                    const scale = t < 0.3 ? t / 0.3 : 1 + (t - 0.3) * 0.3;
                    const opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
                    return (
                      <Text
                        key={`vfx-${v.id}`}
                        pointerEvents="none"
                        style={[styles.chompCheckPulse, { left: v.x - 20, top: v.y - 14, opacity, transform: [{ scale }] }]}
                      >
                        ✓
                      </Text>
                    );
                  }
                  if (v.type === 'float') {
                    const t = age / 700;
                    const y = v.y - t * 32;
                    const opacity = Math.max(0, 1 - t);
                    return (
                      <Text
                        key={`vfx-${v.id}`}
                        pointerEvents="none"
                        style={[styles.chompFloatText, { left: v.x - 14, top: y, opacity }]}
                      >
                        {v.text}
                      </Text>
                    );
                  }
                  return null;
                });
              })()}

              {chompFlash ? <View pointerEvents="none" style={styles.chompFlash} /> : null}

              <View pointerEvents="none" style={styles.chompHud}>
                <Text style={styles.chompHudText}>
                  {chompSpawnCount}/{CHOMP_ROUND_TOTAL}   ✓ {chompGoodCaught}   ✗ {chompBadEaten + chompGoodMissed}
                </Text>
              </View>
            </View>
          ) : null}

          {(game.kind === 'tap-target' || game.kind === 'rapid-tap') && game.id !== 'feed-upload' ? (
            <TouchableOpacity style={[styles.target, { left: targetPos.x, top: targetPos.y }]} onPress={onTapTarget} disabled={!running} hitSlop={LARGE_TOUCH_HIT_SLOP}>
              <Text style={styles.targetText}>{game.kind === 'rapid-tap' ? 'TAP' : 'GO'}</Text>
            </TouchableOpacity>
          ) : null}

          {game.kind === 'scrub' ? (
            <View
              ref={scrubStageRef}
              style={[styles.chompStage, { borderColor: `${accent}66` }]}
              onLayout={(e) => {
                setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
                scrubStageRef.current?.measureInWindow((px, py) => {
                  scrubStageOffsetRef.current = { x: px, y: py };
                });
              }}
              {...scrubPan.panHandlers}
            >
              <View style={styles.chompBg} pointerEvents="none" />

              {/* Close-up byte — fills the stage as the backdrop. Swaps to blush when scrubbing. */}
              {boardSize.w > 0 ? (() => {
                const size = Math.min(boardSize.w, boardSize.h) * 0.9;
                return (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: size,
                      height: size,
                      left: (boardSize.w - size) / 2,
                      top: (boardSize.h - size) / 2,
                    }}
                  >
                    <Image
                      source={scrubReaction === 'good' ? SCRUB_SPRITE_HAPPY : SCRUB_SPRITE_IDLE}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  </View>
                );
              })() : null}

              {/* Corner brackets — keep the sci-fi monitor frame */}
              <View pointerEvents="none" style={[styles.chompCorner, { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { top: 4, right: 4, borderTopWidth: 2, borderRightWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { bottom: 4, left: 4, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
              <View pointerEvents="none" style={[styles.chompCorner, { bottom: 4, right: 4, borderBottomWidth: 2, borderRightWidth: 2 }]} />

              {/* Grime nodes */}
              {grimeNodes.map((n) => (
                <View
                  key={`g-${n.id}`}
                  pointerEvents="none"
                  style={[styles.scrubGrime, {
                    width: n.size,
                    height: n.size,
                    left: n.x - n.size / 2,
                    top: n.y - n.size / 2,
                    borderRadius: n.size / 2,
                  }]}
                />
              ))}

              {/* Burst particles */}
              {scrubBursts.map((b) => {
                const age = Math.min(1, (Date.now() - b.born) / SCRUB_BURST_TTL_MS);
                const scale = 1 + age * 1.6;
                const opacity = 1 - age;
                return (
                  <View
                    key={`b-${b.id}`}
                    pointerEvents="none"
                    style={[styles.scrubBurstRing, {
                      left: b.x - 22,
                      top: b.y - 22,
                      transform: [{ scale }],
                      opacity,
                    }]}
                  />
                );
              })}

              {/* HUD */}
              <View pointerEvents="none" style={styles.chompHud}>
                <Text style={styles.chompHudText}>
                  CLEARED: {grimeCleared}   x{grimeCombo}
                </Text>
              </View>

              {/* Intro overlay — blocks play until the player taps START */}
              {scrubIntroShown ? (
                <View style={styles.scrubIntroOverlay}>
                  <View style={styles.scrubIntroCard}>
                    <Text style={styles.scrubIntroTitle}>DEEP CLEAN</Text>
                    <Text style={styles.scrubIntroGesture}>SWIPE</Text>
                    <Text style={styles.scrubIntroBody}>
                      Drag your finger across grime to wipe it clean.{"\n"}
                      Chain multiple in one swipe for combo bonus.{"\n"}
                      Clear every patch to finish.
                    </Text>
                    <TouchableOpacity
                      style={[styles.scrubIntroButton, { borderColor: accent }]}
                      onPress={beginScrub}
                      hitSlop={LARGE_TOUCH_HIT_SLOP}
                    >
                      <Text style={[styles.scrubIntroButtonText, { color: accent }]}>START</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {game.kind === 'trace' ? (
            <View
              style={[styles.traceBoardFill, { borderColor: `${accent}66` }]}
              onLayout={(e) => setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
              {...tracePan.panHandlers}
            >
              {Array.from({ length: 28 }).map((_, idx) => {
                const nx = idx / 27;
                const ny = 0.5 + (activeTracePattern?.offset ?? 0) + Math.sin(nx * Math.PI * 2 + (activeTracePattern?.phase ?? 0)) * (activeTracePattern?.amplitude ?? 0.15);
                return <View key={idx} style={[styles.traceDot, { left: nx * boardSize.w, top: ny * boardSize.h }]} pointerEvents="none" />;
              })}
              {traceCursor ? <View style={[styles.traceCursor, { left: traceCursor.x * boardSize.w, top: traceCursor.y * boardSize.h }]} pointerEvents="none" /> : null}
            </View>
          ) : null}

          {game.kind === 'match' ? (
            <View style={styles.grid}>
              {cards.map((c, idx) => (
                <TouchableOpacity key={`${c}-${idx}`} style={[styles.cell, matched[idx] && styles.cellOk]} onPress={() => onCardPress(idx)} disabled={!running || matched[idx]} hitSlop={TOUCH_HIT_SLOP}>
                  <Text style={styles.cellText}>{revealed[idx] || matched[idx] ? c : '?'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'sequence' ? (
            <View style={styles.seq}>
              {EMOTES.map((e, idx) => (
                <TouchableOpacity key={e} style={styles.seqBtn} onPress={() => onSequencePress(idx)} disabled={!running} hitSlop={TOUCH_HIT_SLOP}>
                  <Text style={styles.seqText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'ordered-sequence' ? (
            <View style={styles.grid}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity key={n} style={[styles.cell, n < orderedNext && styles.cellOk]} onPress={() => onOrderedPress(n)} disabled={!running || n < orderedNext} hitSlop={TOUCH_HIT_SLOP}>
                  <Text style={styles.cellText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'timing' ? (
            <View style={styles.timing}>
              <View style={[styles.zone, { left: `${zoneStart}%`, width: `${zoneWidth}%` }]} />
              <View style={[styles.cursor, { left: `${cursor}%` }]} />
              <TouchableOpacity style={[styles.stop, { borderColor: `${accent}88` }]} onPress={onStopTiming} disabled={!running || timingAttempts >= 3} hitSlop={LARGE_TOUCH_HIT_SLOP}>
                <Text style={styles.btnText}>STOP ({Math.max(0, 3 - timingAttempts)})</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.cornerBtnExit, navigationLocked && styles.btnDisabled]}
          onPress={goBackToRoom}
          disabled={navigationLocked}
          activeOpacity={0.85}
          hitSlop={TOUCH_HIT_SLOP}
        >
          <Ionicons name="arrow-back-outline" size={16} color="#fff" />
          <Text style={styles.cornerTextExit}>EXIT</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {resultReady ? (
        <View pointerEvents="auto" style={styles.overlayScrim}>
          <View style={[styles.centerPopup, { borderColor: `${accent}88` }]}>
            <Text style={styles.popupEyebrow}>PROCESS RESULT</Text>
            <Text style={styles.popupTitle}>RETURN TO ROOM</Text>
            <Text style={styles.popupScoreLabel}>END SCORE</Text>
            <Text style={[styles.popupScoreValue, { color: gradeColor }]}>{score}</Text>
            <View style={styles.effectStack}>
              {resultEffects.map((effect) => (
                <View key={effect} style={[styles.effectPill, { borderColor: `${accent}66` }]}>
                  <Text style={styles.effectText}>{effect}</Text>
                </View>
              ))}
            </View>
            {resultSummary ? <Text style={styles.popupBody}>{resultSummary}</Text> : null}
            {resultMeta.length > 0 ? (
              <View style={styles.metaList}>
                {resultMeta.map((meta) => (
                  <Text key={meta} style={styles.metaLine}>{meta}</Text>
                ))}
              </View>
            ) : null}
            <TouchableOpacity style={[styles.btn, { borderColor: `${accent}90` }]} onPress={goBackToRoom} activeOpacity={0.85} hitSlop={TOUCH_HIT_SLOP}>
              <Text style={styles.btnText}>RETURN TO ROOM</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  bgTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 9, 24, 0.72)',
  },
  safe: { flex: 1, paddingHorizontal: 14, paddingBottom: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 10, gap: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTextBlock: { flex: 1, gap: 3 },
  eyebrow: { color: '#8fdfff', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#f2f8ff', fontSize: 24, fontWeight: '900', letterSpacing: 1.2, lineHeight: 28 },
  sub: { color: 'rgba(199,225,255,0.92)', fontSize: 11.5, lineHeight: 16 },
  scoreBadge: {
    minWidth: 96,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: { color: '#9dd5ff', fontSize: 9.2, fontWeight: '900', letterSpacing: 1.3 },
  scoreValue: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  playWrap: { flex: 1, marginTop: 8, marginBottom: 10 },
  play: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(7,16,45,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  boardShell: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(14,33,73,0.82)',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  scrubGrime: {
    position: 'absolute',
    backgroundColor: 'rgba(78,42,20,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,186,120,0.4)',
    shadowColor: 'rgba(0,0,0,0.55)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  scrubBurstRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(140,220,255,0.9)',
    backgroundColor: 'rgba(140,220,255,0.18)',
  },
  scrubIntroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,14,30,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scrubIntroCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(140,220,255,0.45)',
    backgroundColor: 'rgba(10,24,52,0.95)',
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  scrubIntroTitle: {
    color: '#e8f6ff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
  },
  scrubIntroGesture: {
    color: '#8ce9ff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 6,
    marginBottom: 12,
  },
  scrubIntroBody: {
    color: 'rgba(220,238,255,0.88)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 10,
  },
  scrubIntroButton: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'rgba(140,220,255,0.08)',
  },
  scrubIntroButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
  },
  chompStage: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.82)',
    overflow: 'hidden',
  },
  chompBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,18,40,0.7)',
  },
  chompGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(120,190,255,0.06)',
  },
  chompGridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(120,190,255,0.06)',
  },
  chompCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: 'rgba(120,220,255,0.55)',
  },
  chompTrailDot: {
    position: 'absolute',
    backgroundColor: 'rgba(140,210,255,0.6)',
  },
  chompBurstDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffe28a',
  },
  chompRippleRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,230,140,0.85)',
  },
  chompCheckPulse: {
    position: 'absolute',
    width: 40,
    height: 28,
    fontSize: 24,
    fontWeight: '800',
    color: '#7dffb5',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chompFloatText: {
    position: 'absolute',
    width: 28,
    fontSize: 16,
    fontWeight: '800',
    color: '#ffe28a',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chompByte: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chompByteSprite: {
    width: '100%',
    height: '100%',
  },
  chompFood: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,221,120,0.45)',
  },
  chompFoodBad: {
    borderColor: 'rgba(255,120,120,0.7)',
    backgroundColor: 'rgba(80,18,18,0.3)',
  },
  chompFoodGlyph: {
    fontSize: 34,
    textAlign: 'center',
  },
  chompFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,70,70,0.35)',
  },
  chompHud: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.22)',
  },
  chompLauncherFrame: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(180,220,255,0.4)',
    backgroundColor: 'rgba(18,34,66,0.72)',
  },
  chompLauncherSlot: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(180,220,255,0.35)',
    backgroundColor: 'rgba(40,80,140,0.3)',
  },
  chompLauncherPreview: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(180,220,255,0.25)',
    backgroundColor: 'rgba(28,50,92,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chompPreviewGlyph: {
    fontSize: 22,
    opacity: 0.85,
  },
  chompPreviewGlyphBad: {
    color: '#ff9a9a',
  },
  chompHudText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  target: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: 'rgba(255,221,120,0.88)',
    backgroundColor: '#ffd47b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffd47b',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  targetText: { color: '#2a1a08', fontSize: 18, fontWeight: '900' },
  traceBoardFill: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.82)',
    overflow: 'hidden',
  },
  traceDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 4,
    marginLeft: -3,
    marginTop: -3,
    backgroundColor: 'rgba(133,217,255,0.86)',
  },
  traceCursor: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 10,
    marginLeft: -15,
    marginTop: -15,
    borderWidth: 2,
    borderColor: '#7ef0c2',
    backgroundColor: 'rgba(126,240,194,0.28)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  cell: { width: '31%', minWidth: 92, height: 82, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.92)', alignItems: 'center', justifyContent: 'center' },
  cellOk: { backgroundColor: 'rgba(46,139,90,0.94)' },
  cellText: { color: '#e9f4ff', fontSize: 26, fontWeight: '900' },
  seq: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  seqBtn: { width: '47%', minWidth: 114, minHeight: 86, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  seqText: { color: '#e9f4ff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  timing: { flex: 1, minHeight: 240, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.92)', overflow: 'hidden', justifyContent: 'center' },
  zone: { position: 'absolute', top: 42, height: 52, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(113,252,182,0.95)', backgroundColor: 'rgba(113,252,182,0.28)' },
  cursor: { position: 'absolute', top: 24, width: 18, height: 88, borderRadius: 10, marginLeft: -9, backgroundColor: '#ffd672' },
  stop: { position: 'absolute', bottom: 18, left: 14, right: 14, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(120,190,255,0.35)', backgroundColor: 'rgba(8,18,62,0.96)', paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(120,190,255,0.35)', backgroundColor: 'rgba(8,18,62,0.95)', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  btnText: { color: '#d9efff', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.2 },
  processTrack: { height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  processFill: { height: 12, borderRadius: 999, backgroundColor: '#2de6f6' },
  centerPopup: {
    alignSelf: 'center',
    width: '92%',
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(8,18,62,0.98)',
    padding: 16,
    gap: 10,
  },
  popupEyebrow: { color: '#8fdfff', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  popupTitle: { color: '#f2f8ff', fontSize: 18, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  popupScoreLabel: { color: 'rgba(157,213,255,0.82)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  popupScoreValue: { fontSize: 40, fontWeight: '900', textAlign: 'center', lineHeight: 46 },
  popupBody: { color: 'rgba(225,241,255,0.84)', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  effectStack: { gap: 8, marginTop: 2 },
  effectPill: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(18,34,86,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  effectText: { color: '#f3f8ff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  metaList: { gap: 4, marginTop: 2 },
  metaLine: { color: 'rgba(157,223,255,0.88)', fontSize: 10.3, fontWeight: '700', textAlign: 'center' },
  cornerBtnExit: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  cornerTextExit: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  btnDisabled: { opacity: 0.5 },
  overlayScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,18,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
});
