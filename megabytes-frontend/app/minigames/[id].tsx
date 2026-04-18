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

type Grade = 'fail' | 'good' | 'perfect';
type Variant = 'quick' | 'long';

const EMOTES = ['HAPPY', 'SLEEP', 'ANGRY', 'JOY'];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const TOUCH_HIT_SLOP = { top: 18, bottom: 18, left: 18, right: 18 };
const LARGE_TOUCH_HIT_SLOP = { top: 28, bottom: 28, left: 28, right: 28 };
// Board sizing is now measured live via onLayout. Internal coords are normalized (0–1) and scaled at render/hit-test.
const NUTRIENT_IMAGES = [
  require('../../assets/minigame/minigame-images/nutrient_alpha.png'),
  require('../../assets/minigame/minigame-images/nutrient_beta.png'),
  require('../../assets/minigame/minigame-images/nutrient_gamma.png'),
  require('../../assets/minigame/minigame-images/nutrient_delta.png'),
];
const FEED_TARGET_SPRITE = require('../../assets/bytes/Circle/Circle-blink-bounce.gif');
const FEED_SNAP_RADIUS_PX = 54; // pixel threshold for reaching a target node (center-to-finger)
const FEED_GRAB_RADIUS_PX = 48; // pixel threshold for starting a drag on a source node
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
  if (room === 'bedroom') return '/rooms/bedroom';
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

function buildCleanupPanels() {
  return Array.from({ length: 3 }, () => {
    const barCount = randomRange(1, 6);
    const bars = Array.from({ length: barCount }, () => ({
      width: randomRange(54, 130),
      need: randomRange(42, 92),
    }));
    return { barCount, bars };
  });
}

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

function buildFeedLinks() {
  // Normalized 0–1 coords. Sources pinned to the left column (x≈0.14), targets on the right (x 0.72–0.90).
  // Render scales these against the live measured board size.
  const baseTargets = [
    { x: 0.72 + Math.random() * 0.18, y: 0.14 + Math.random() * 0.18 }, // top band
    { x: 0.72 + Math.random() * 0.18, y: 0.42 + Math.random() * 0.18 }, // middle band
    { x: 0.72 + Math.random() * 0.18, y: 0.72 + Math.random() * 0.18 }, // bottom band
  ];
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  const shuffled = order.map((i) => baseTargets[i]);
  // Pick 3 random nutrient indices from [0,1,2,3] — one random nutrient is unused each round.
  const nutrientPool = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 3);
  return [
    { start: { x: 0.14, y: 0.22 }, target: shuffled[0], nutrient: nutrientPool[0] },
    { start: { x: 0.14, y: 0.52 }, target: shuffled[1], nutrient: nutrientPool[1] },
    { start: { x: 0.14, y: 0.82 }, target: shuffled[2], nutrient: nutrientPool[2] },
  ];
}

export default function MiniGameRunnerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; variant?: string; room?: string }>();
  const game = useMemo(() => getMiniGameById(typeof params.id === 'string' ? params.id : ''), [params.id]);
  const variant: Variant = params.variant === 'long' ? 'long' : 'quick';
  const durationMs = useMemo(() => variantDurationMs(variant), [variant]);
  const room = typeof params.room === 'string' ? params.room : undefined;
  const roomPath = resolveRoomPath(room);

  const [running, setRunning] = useState(false);
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
  const [feedLinks, setFeedLinks] = useState<{ start: { x: number; y: number }; target: { x: number; y: number }; nutrient: number }[]>([]);
  const [feedStage, setFeedStage] = useState(0);
  const [feedCursor, setFeedCursor] = useState<{ x: number; y: number } | null>(null); // normalized 0–1
  const [feedDragging, setFeedDragging] = useState(false);
  // Drag-active gate: true from source-grab to target-reach. Forces lift-and-re-grab between stages.
  const feedDragActiveRef = useRef(false);
  // Live-measured board size (pixels). Updated via onLayout on the active play board.
  const [boardSize, setBoardSize] = useState({ w: 260, h: 170 });
  const boardSizeRef = useRef(boardSize);
  useEffect(() => { boardSizeRef.current = boardSize; }, [boardSize]);

  const [cleanedCount, setCleanedCount] = useState(0);
  const [cleanupPanels, setCleanupPanels] = useState<{ barCount: number; bars: { width: number; need: number }[] }[]>([]);
  const [cleanupStage, setCleanupStage] = useState(0);
  const scrubDistanceRef = useRef(0);
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
  const feedStageRef = useRef(0);
  const cleanupStageRef = useRef(0);
  const traceStageRef = useRef(0);
  const tapGoal = useMemo(() => (game ? targetGoalFor(game, variant) : 0), [game, variant]);
  const pairGoal = variant === 'long' ? 3 : 2;
  const activeCleanupPanel = cleanupPanels[cleanupStage] ?? null;
  const scrubGoal = activeCleanupPanel?.barCount ?? 0;
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
  }, []);

  const cleanupStageLockRef = useRef(0);
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
    const nextFeedLinks = buildFeedLinks();
    setFeedLinks(nextFeedLinks);
    setFeedStage(0);
    feedStageRef.current = 0;
    setFeedCursor(null);
    setFeedDragging(false);

    setCleanedCount(0);
    const nextCleanupPanels = buildCleanupPanels();
    setCleanupPanels(nextCleanupPanels);
    setCleanupStage(0);
    cleanupStageRef.current = 0;
    scrubDistanceRef.current = 0;
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
          setTimeout(() => finishRound(), 0);
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
  }, [finishRound, game, playGameSfx, resetRoundState, running, variant]);

  useEffect(() => {
    if (!game || autoStarted.current) return;
    autoStarted.current = true;
    setTimeout(() => startRound(), 100);
  }, [game, startRound]);

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
        if (game.id === 'feed-upload') {
          const beforeByte = await getByte().catch(() => null);
          const first = await careAction('feed', grade, { mealCycle: true });
          const second = variant === 'long' ? await careAction('feed', grade, { mealCycle: true }) : null;
          const result = second || first;
          if (result?.blocked) {
            const reason = result.reason === 'not_hungry'
              ? 'Byte isn\u2019t hungry right now.'
              : result.reason === 'limit_reached'
                ? 'Feed limit reached. Try again later.'
                : 'Feed blocked. No effect applied.';
            effectLines = [reason];
            feedBlockedMessage = reason;
          } else {
            effectLines = diffNeedResults(beforeByte?.byte?.needs, result?.needs);
          }
        } else if (game.id === 'run-cleanup') {
          const beforeByte = await getByte().catch(() => null);
          const first = await careAction('clean', grade);
          const second = variant === 'long' ? await careAction('clean', grade) : null;
          effectLines = diffNeedResults(beforeByte?.byte?.needs, second?.needs || first?.needs);
          markHomeClutterCleared();
        } else if (game.id === 'stabilize-signal') {
          const beforeByte = await getByte().catch(() => null);
          const first = await careAction('rest', grade);
          const second = variant === 'long' ? await careAction('rest', grade) : null;
          effectLines = diffNeedResults(beforeByte?.byte?.needs, second?.needs || first?.needs);
        } else if (game.id === 'engage-simulation' || game.id === 'sync-link' || game.id === 'emote-align') {
          // Route play minigames through careAction('play') so Bandwidth -4 actually applies
          // and Fun/Social/Mood gains use CARE_RESTORE values (20/8/12) instead of interact's smaller 10/5/5.
          const beforeByte = await getByte().catch(() => null);
          const first = await careAction('play', grade);
          const second = variant === 'long' ? await careAction('play', grade) : null;
          effectLines = diffNeedResults(beforeByte?.byte?.needs, second?.needs || first?.needs);
        } else if (game.id.startsWith('training-') && game.stat) {
          try {
            const trainResult = await trainStat(game.stat, grade);
            const gain = Math.max(0, Number(trainResult?.gain || 0));
            effectLines = gain > 0 ? [`${game.stat} +${gain}`] : [`${game.stat} +0`];
            await syncByte(); // REFRESH byte data after training so stats persist
          } catch (err: any) {
            console.error(`trainStat failed for ${game.stat}:`, err?.message);
            throw err;
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

  const feedPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (!running || game?.id !== 'feed-upload') return false;
          const link = feedLinks[feedStageRef.current];
          if (!link) return false;
          const { w, h } = boardSizeRef.current;
          const sx = link.start.x * w;
          const sy = link.start.y * h;
          const dx = evt.nativeEvent.locationX - sx;
          const dy = evt.nativeEvent.locationY - sy;
          return Math.hypot(dx, dy) <= FEED_GRAB_RADIUS_PX;
        },
        onMoveShouldSetPanResponder: () => running && game?.id === 'feed-upload',
        onPanResponderGrant: () => {
          const link = feedLinks[feedStageRef.current];
          if (!link) return;
          playGameSfx('minigame_feed_upload', 0.66, 110);
          feedDragActiveRef.current = true;
          setFeedDragging(true);
          setFeedCursor(link.start);
        },
        onPanResponderMove: (evt) => {
          if (!running || game?.id !== 'feed-upload') return;
          if (!feedDragActiveRef.current) return;
          const link = feedLinks[feedStageRef.current];
          if (!link) return;
          const { w, h } = boardSizeRef.current;
          if (w <= 0 || h <= 0) return;
          const px = clamp(evt.nativeEvent.locationX, 0, w);
          const py = clamp(evt.nativeEvent.locationY, 0, h);
          setFeedCursor({ x: px / w, y: py / h });
          setInteractions((v) => v + 1);

          const tx = link.target.x * w;
          const ty = link.target.y * h;
          const dx = px - tx;
          const dy = py - ty;
          const reached = Math.hypot(dx, dy) <= FEED_SNAP_RADIUS_PX;
          if (!reached) return;

          const nextStage = feedStageRef.current + 1;
          const nextQuality = clamp(0.4 + (nextStage / 3) * 0.6, 0, 1);
          playGameSfx('minigame_feed_upload', 0.78, 110);
          playGameSfx('minigame_score_tick', 0.58, 90);
          setQuality(nextQuality);
          feedDragActiveRef.current = false;
          setFeedDragging(false);
          setFeedCursor(null);

          if (nextStage >= 3) {
            setInteractions((v) => v + 1);
            setTimeout(() => finishRound(nextQuality), 80);
            return;
          }

          feedStageRef.current = nextStage;
          setFeedStage(nextStage);
          setStatus(`Meal cycle ${nextStage + 1} loaded. Route the next nutrient line.`);
        },
        onPanResponderRelease: () => {
          feedDragActiveRef.current = false;
          setFeedDragging(false);
          setFeedCursor(null);
        },
        onPanResponderTerminate: () => {
          feedDragActiveRef.current = false;
          setFeedDragging(false);
          setFeedCursor(null);
        },
      }),
    [feedLinks, finishRound, game?.id, playGameSfx, running]
  );

  const scrubPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onMoveShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onPanResponderGrant: (_, g) => {
          playGameSfx('minigame_cleanup_scrub', 0.7, 120);
          lastPointRef.current = { x: g.moveX, y: g.moveY };
        },
        onPanResponderMove: (_, g) => {
          if (!running || game?.kind !== 'scrub') return;
          setInteractions((v) => v + 1);
          const p = { x: g.moveX, y: g.moveY };
          if (lastPointRef.current) {
            const dx = p.x - lastPointRef.current.x;
            const dy = p.y - lastPointRef.current.y;
            const delta = Math.hypot(dx, dy);
            const panel = cleanupPanels[cleanupStageRef.current];
            if (!panel) {
              lastPointRef.current = p;
              return;
            }
            const nextDistance = scrubDistanceRef.current + delta;
            scrubDistanceRef.current = nextDistance;
            let remaining = nextDistance;
            let nextClean = 0;
            for (const bar of panel.bars) {
              if (remaining >= bar.need) {
                nextClean += 1;
                remaining -= bar.need;
              } else {
                break;
              }
            }
            nextClean = Math.min(panel.barCount, nextClean);
            setCleanedCount(nextClean);
            const totalProgress = cleanupStageRef.current + nextClean / Math.max(panel.barCount, 1);
            const nextQuality = clamp(0.32 + (totalProgress / 3) * 0.68, 0, 1);
            setQuality(nextQuality);
            if (nextClean >= panel.barCount) {
              playGameSfx('minigame_score_tick', 0.58, 90);
              // Lock stage switch to prevent immediate progression if hand is still on screen
              const now = Date.now();
              if (cleanupStageLockRef.current > now) {
                return; // Still locked, don't advance yet
              }

              if (cleanupStageRef.current >= 2) {
                setTimeout(() => finishRound(nextQuality), 60);
              } else {
                cleanupStageRef.current += 1;
                cleanupStageLockRef.current = now + 200; // Lock for 200ms
                const nextStage = cleanupStageRef.current;
                setCleanupStage(nextStage);
                scrubDistanceRef.current = 0;
                setCleanedCount(0);
                setStatus(`Panel ${nextStage + 1} loaded. Scrub the nodes clean.`);
              }
            }
          }
          lastPointRef.current = p;
        },
        onPanResponderRelease: () => {
          lastPointRef.current = null;
        },
        onPanResponderTerminate: () => {
          lastPointRef.current = null;
        },
      }),
    [cleanupPanels, finishRound, game?.kind, playGameSfx, running]
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
  const navigationLocked = running || syncing || postProcessing;

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
              style={[styles.feedBoardFill, { borderColor: `${accent}66` }]}
              onLayout={(e) => setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
              {...feedPan.panHandlers}
            >
              {feedLinks.map((link, idx) => {
                const isDone = idx < feedStage;
                const isActive = idx === feedStage;
                const sx = link.start.x * boardSize.w;
                const sy = link.start.y * boardSize.h;
                const tx = link.target.x * boardSize.w;
                const ty = link.target.y * boardSize.h;
                const cx = feedCursor ? feedCursor.x * boardSize.w : sx;
                const cy = feedCursor ? feedCursor.y * boardSize.h : sy;
                return (
                  <View key={`feed-${idx}`} style={styles.feedLane} pointerEvents="none">
                    <View style={[styles.feedTouchAura, { left: sx - 28, top: sy - 28 }, isActive && styles.feedTouchAuraActive]} />
                    <View style={[styles.feedTargetAura, { left: tx - 30, top: ty - 30 }, isActive && styles.feedTargetAuraActive]} />
                    {isDone ? (() => {
                      const dx = tx - sx;
                      const dy = ty - sy;
                      const length = Math.hypot(dx, dy);
                      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                      const midX = (sx + tx) / 2;
                      const midY = (sy + ty) / 2;
                      return (
                        <View style={[styles.feedLineDone, {
                          left: midX - length / 2,
                          top: midY - 3,
                          width: length,
                          transform: [{ rotate: `${angle}deg` }],
                        }]} />
                      );
                    })() : null}
                    {isActive && feedDragging && feedCursor ? (() => {
                      const dxCur = cx - sx;
                      const dyCur = cy - sy;
                      const dxTgt = tx - sx;
                      const dyTgt = ty - sy;
                      const curLen = Math.hypot(dxCur, dyCur);
                      const tgtLen = Math.hypot(dxTgt, dyTgt);
                      if (curLen < 2) return null;
                      const length = Math.min(curLen, tgtLen);
                      const angle = (Math.atan2(dyCur, dxCur) * 180) / Math.PI;
                      const rad = (angle * Math.PI) / 180;
                      const endX = sx + Math.cos(rad) * length;
                      const endY = sy + Math.sin(rad) * length;
                      const midX = (sx + endX) / 2;
                      const midY = (sy + endY) / 2;
                      return (
                        <View style={[styles.feedLineActive, {
                          left: midX - length / 2,
                          top: midY - 3,
                          width: length,
                          transform: [{ rotate: `${angle}deg` }],
                        }]} />
                      );
                    })() : null}
                    <View style={[styles.feedNode, styles.feedSource, { left: sx - 28, top: sy - 28 }, isDone && styles.feedNodeDone, isActive && styles.feedNodeActive]}>
                      <Image source={NUTRIENT_IMAGES[link.nutrient] || NUTRIENT_IMAGES[0]} style={styles.feedNodeImage} resizeMode="contain" />
                    </View>
                    <View style={[styles.feedTargetNode, { left: tx - 30, top: ty - 30 }, isDone && styles.feedNodeDone, isActive && styles.feedTargetActive]}>
                      <Image source={FEED_TARGET_SPRITE} style={styles.feedTargetImage} resizeMode="contain" />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {(game.kind === 'tap-target' || game.kind === 'rapid-tap') && game.id !== 'feed-upload' ? (
            <TouchableOpacity style={[styles.target, { left: targetPos.x, top: targetPos.y }]} onPress={onTapTarget} disabled={!running} hitSlop={LARGE_TOUCH_HIT_SLOP}>
              <Text style={styles.targetText}>{game.kind === 'rapid-tap' ? 'TAP' : 'GO'}</Text>
            </TouchableOpacity>
          ) : null}

          {game.kind === 'scrub' ? (
            <View style={styles.fill} {...scrubPan.panHandlers}>
              <View style={[styles.scrubBoard, styles.boardShell, { borderColor: `${accent}66` }]}>
                {activeCleanupPanel?.bars.map((bar, idx) => (
                  <View
                    key={`${cleanupStage}-${idx}`}
                    style={[
                      styles.patch,
                      { width: bar.width },
                      idx < cleanedCount && styles.patchClean,
                    ]}
                  />
                ))}
              </View>
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
  scrubBoard: { width: '100%', gap: 14, alignItems: 'center', justifyContent: 'center' },
  feedBoardFill: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.82)',
    overflow: 'hidden',
  },
  feedLane: {
    ...StyleSheet.absoluteFillObject,
  },
  feedTouchAura: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 214, 117, 0.12)',
  },
  feedTouchAuraActive: {
    backgroundColor: 'rgba(255, 214, 117, 0.22)',
  },
  feedTargetAura: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: 'rgba(126, 240, 194, 0.12)',
  },
  feedTargetAuraActive: {
    backgroundColor: 'rgba(126, 240, 194, 0.2)',
  },
  feedNode: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,221,120,0.6)',
    backgroundColor: 'rgba(255,187,76,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedSource: {
    width: 56,
  },
  feedNodeImage: {
    width: 50,
    height: 50,
  },
  feedTargetNode: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(126,240,194,0.75)',
    backgroundColor: 'rgba(27,103,74,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedTargetImage: {
    width: 54,
    height: 54,
  },
  feedNodeActive: {
    backgroundColor: 'rgba(255,214,117,0.34)',
    borderColor: 'rgba(255,238,171,0.86)',
  },
  feedTargetActive: {
    backgroundColor: 'rgba(49,146,110,0.44)',
  },
  feedNodeDone: {
    borderColor: 'rgba(126,240,194,0.86)',
    backgroundColor: 'rgba(126,240,194,0.22)',
  },
  feedLineDone: {
    position: 'absolute',
    height: 6,
    borderRadius: 99,
    backgroundColor: '#68f4d4',
  },
  feedLineActive: {
    position: 'absolute',
    height: 6,
    borderRadius: 99,
    backgroundColor: '#ffd985',
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
  patch: {
    height: 22,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,207,138,0.34)',
    backgroundColor: 'rgba(72,41,16,0.98)',
  },
  patchClean: {
    borderColor: 'rgba(110,244,188,0.36)',
    backgroundColor: 'rgba(110,244,188,0.95)',
    opacity: 0.18,
  },
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
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 0,
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
