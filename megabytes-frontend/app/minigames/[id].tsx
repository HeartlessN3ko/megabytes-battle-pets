import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ImageBackground, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { careAction, earnCurrency, getByte, interactByte, trainStat, syncByte } from '../../services/api';
import { markHomeClutterCleared } from '../../services/homeRuntimeState';
import { MiniGameDef, getMiniGameById } from '../../services/minigames';
import { MiniGameRoomId, recordTrainingUsage, setPendingMiniGameResult } from '../../services/minigameRuntime';

type Grade = 'fail' | 'good' | 'perfect';
type Variant = 'quick' | 'long';

const EMOTES = ['HAPPY', 'SLEEP', 'ANGRY', 'JOY'];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const TOUCH_HIT_SLOP = { top: 18, bottom: 18, left: 18, right: 18 };
const LARGE_TOUCH_HIT_SLOP = { top: 28, bottom: 28, left: 28, right: 28 };
const BOARD_WIDTH = 260;
const BOARD_HEIGHT = 170;
const BOARD_CENTER_Y = 85;
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
  const baseBits = training ? (variant === 'long' ? 26 : 4) : (variant === 'long' ? 18 : 3);
  const qualityScale = grade === 'perfect' ? 1.35 : grade === 'good' ? 1 : 0.35;
  const byteBits = Math.max(1, Math.round(baseBits * qualityScale * clamp(0.7 + quality * 0.4, 0.7, 1.2)));
  const energyCost = training ? (variant === 'long' ? 18 : 11) : (variant === 'long' ? 10 : 6);
  const statGain = training && def.stat ? `${def.stat} +${grade === 'perfect' ? 2 : grade === 'good' ? 1 : 0}` : null;
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
  const configs = [
    { amplitude: variant === 'long' ? 24 : 20, phase: 0, offset: -10, goal: variant === 'long' ? 7 : 5 },
    { amplitude: variant === 'long' ? 32 : 26, phase: Math.PI / 3, offset: 6, goal: variant === 'long' ? 8 : 5 },
    { amplitude: variant === 'long' ? 28 : 24, phase: Math.PI / 1.7, offset: 0, goal: variant === 'long' ? 9 : 6 },
  ];
  return configs.map((pattern, index) => ({
    id: `trace-${index}`,
    ...pattern,
  }));
}

function buildFeedLinks() {
  // Shuffle positions for difficulty — start always left, targets randomized
  const baseTargets = [
    { x: randomRange(180, 230), y: randomRange(30, 55) },
    { x: randomRange(180, 230), y: randomRange(75, 105) },
    { x: randomRange(180, 230), y: randomRange(120, 150) },
  ];
  // Randomize order to vary difficulty
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  const shuffled = order.map(i => baseTargets[i]);

  return [
    { start: { x: 48, y: 40 }, target: shuffled[0] },
    { start: { x: 48, y: 88 }, target: shuffled[1] },
    { start: { x: 48, y: 136 }, target: shuffled[2] },
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
  const [feedLinks, setFeedLinks] = useState<{ start: { x: number; y: number }; target: { x: number; y: number } }[]>([]);
  const [feedStage, setFeedStage] = useState(0);
  const [feedCursor, setFeedCursor] = useState<{ x: number; y: number } | null>(null);
  const [feedDragging, setFeedDragging] = useState(false);

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

  const startRound = useCallback(() => {
    if (!game || running) return;
    resetRoundState(game);
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
  }, [finishRound, game, resetRoundState, running, variant]);

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

    try {
      let effectLines: string[] = [];
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
          const first = await careAction('feed', grade);
          const second = variant === 'long' ? await careAction('feed', grade) : null;
          effectLines = diffNeedResults(beforeByte?.byte?.needs, second?.needs || first?.needs);
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
          const beforeByte = await getByte().catch(() => null);
          const first = await interactByte();
          const second = variant === 'long' ? await interactByte() : null;
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
      setResultSummary(resultSummaryFor(game, grade, effectLines));
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
      setStatus('Sync failed right now. You can cancel and retry.');
    } finally {
      setPostProcessing(false);
      setSyncing(false);
    }
  }, [game, grade, quality, synced, syncing, variant]);

  useEffect(() => {
    if (running) return;
    if (remainingMs === durationMs && interactions === 0) return;
    if (synced || syncing) return;
    applyOutcome().catch(() => {});
  }, [applyOutcome, durationMs, interactions, remainingMs, running, synced, syncing]);

  const onTapTarget = useCallback(() => {
    if (!running) return;
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
  }, [finishRound, running, tapGoal, variant]);

  const feedPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (!running || game?.id !== 'feed-upload') return false;
          const link = feedLinks[feedStageRef.current];
          if (!link) return false;
          const dx = evt.nativeEvent.locationX - link.start.x;
          const dy = evt.nativeEvent.locationY - link.start.y;
          return Math.hypot(dx, dy) <= 40;
        },
        onMoveShouldSetPanResponder: () => running && game?.id === 'feed-upload',
        onPanResponderGrant: () => {
          const link = feedLinks[feedStageRef.current];
          if (!link) return;
          setFeedDragging(true);
          setFeedCursor(link.start);
        },
        onPanResponderMove: (evt) => {
          if (!running || game?.id !== 'feed-upload') return;
          const link = feedLinks[feedStageRef.current];
          if (!link) return;
          const x = clamp(evt.nativeEvent.locationX, 0, BOARD_WIDTH);
          const y = clamp(evt.nativeEvent.locationY, 0, BOARD_HEIGHT);
          setFeedCursor({ x, y });
          setInteractions((v) => v + 1);

          const dx = x - link.target.x;
          const dy = y - link.target.y;
          const reached = Math.hypot(dx, dy) <= 42;
          if (!reached) return;

          const nextStage = feedStageRef.current + 1;
          const nextQuality = clamp(0.4 + (nextStage / 3) * 0.6, 0, 1);
          setQuality(nextQuality);
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
          setFeedDragging(false);
          setFeedCursor(null);
        },
        onPanResponderTerminate: () => {
          setFeedDragging(false);
          setFeedCursor(null);
        },
      }),
    [feedLinks, finishRound, game?.id, running]
  );

  const scrubPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onMoveShouldSetPanResponder: () => running && game?.kind === 'scrub',
        onPanResponderGrant: (_, g) => {
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
    [cleanupPanels, finishRound, game?.kind, running]
  );

  const tracePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => running && game?.kind === 'trace',
        onMoveShouldSetPanResponder: () => running && game?.kind === 'trace',
        onPanResponderMove: (evt) => {
          if (!running || game?.kind !== 'trace') return;
          const pattern = tracePatterns[traceStageRef.current];
          if (!pattern) return;
          setInteractions((v) => v + 1);

          const x = clamp(evt.nativeEvent.locationX, 0, BOARD_WIDTH);
          const y = clamp(evt.nativeEvent.locationY, 0, BOARD_HEIGHT);
          const expected = BOARD_CENTER_Y + pattern.offset + Math.sin((x / BOARD_WIDTH) * Math.PI * 2 + pattern.phase) * pattern.amplitude;
          const tol = variant === 'long' ? 34 : 44;
          const ok = Math.abs(y - expected) <= tol;

          setTraceCursor({ x, y });
          setTraceSamples((s) => s + 1);
          if (ok) setTraceAligned((a) => a + 1);
          const samples = traceSamples + 1;
          const aligned = traceAligned + (ok ? 1 : 0);
          const nextQuality = clamp(((traceStageRef.current + aligned / Math.max(1, pattern.goal)) / 3) * 0.9 + aligned / Math.max(1, samples) * 0.1, 0, 1);
          setQuality(nextQuality);
          if (aligned >= pattern.goal && nextQuality >= 0.45) {
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
    [finishRound, game?.kind, running, traceAligned, tracePatterns, traceSamples, variant]
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

    const a = first;
    const b = second;
    setTimeout(() => {
      setRevealed((prev) => prev.map((v, i) => (i === a || i === b ? false : v)));
      setSelected(null);
    }, 230);
  }, [cards, finishRound, game?.kind, matched, pairGoal, revealed, running, selected]);

  const onSequencePress = useCallback((idx: number) => {
    if (!running || game?.kind !== 'sequence' || sequencePreviewing) return;
    setInteractions((v) => v + 1);
    const expected = seqPattern[seqIndex];
    if (idx === expected) {
      const next = seqIndex + 1;
      setSeqIndex(next);
      setSeqCorrect((c) => c + 1);
      setQuality(clamp(0.45 + next * 0.18, 0, 1));
      if (next >= seqPattern.length) setTimeout(() => finishRound(clamp(0.45 + next * 0.18, 0, 1)), 100);
      return;
    }
    setSeqIndex(0);
    setStatus(`Pattern broke. Retry: ${seqPattern.map((value) => EMOTES[value]).join(' -> ')}`);
  }, [finishRound, game?.kind, running, seqIndex, seqPattern, sequencePreviewing]);

  const onOrderedPress = useCallback((n: number) => {
    if (!running || game?.kind !== 'ordered-sequence') return;
    setInteractions((v) => v + 1);
    if (n === orderedNext) {
      const next = n + 1;
      setOrderedNext(next);
      setQuality(clamp(0.45 + n * 0.1, 0, 1));
      if (n >= 6) setTimeout(() => finishRound(1), 80);
    }
  }, [finishRound, game?.kind, orderedNext, running]);

  const onStopTiming = useCallback(() => {
    if (!running || game?.kind !== 'timing' || timingAttempts >= 3) return;
    setInteractions((v) => v + 1);

    const center = zoneStart + zoneWidth / 2;
    const dist = Math.abs(cursor - center);
    const shot = clamp(1 - dist / Math.max(zoneWidth * 0.7, 1), 0, 1);
    setTimingAttempts((a) => a + 1);
    if (shot >= 0.35) setTimingHits((h) => h + 1);
    setQuality((q) => clamp(Math.max(q, shot, shot >= 0.35 ? 0.55 : q), 0, 1));

    if (timingAttempts + 1 >= 3) {
      const estimate = clamp(Math.max(quality, shot, (timingHits + (shot >= 0.35 ? 1 : 0)) / 3), 0, 1);
      setTimeout(() => finishRound(estimate), 100);
    }
  }, [cursor, finishRound, game?.kind, quality, running, timingAttempts, timingHits, zoneStart, zoneWidth]);

  const goBackToRoom = useCallback(() => {
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
  }, [game, grade, quality, resultBits, resultEffects, resultEnergyCost, resultSkill, resultSummary, room, roomPath, router]);

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
            <View style={styles.fill} {...feedPan.panHandlers}>
              <View style={[styles.feedBoard, { borderColor: `${accent}66` }]}>
                {feedLinks.map((link, idx) => {
                  const isDone = idx < feedStage;
                  const isActive = idx === feedStage;
                  return (
                    <View key={`feed-${idx}`} style={[styles.feedLane, { top: 0 }]}>
                      <View style={[styles.feedTouchAura, { left: link.start.x - 28, top: link.start.y - 28 }, isActive && styles.feedTouchAuraActive]} />
                      <View style={[styles.feedTargetAura, { left: link.target.x - 30, top: link.target.y - 30 }, isActive && styles.feedTargetAuraActive]} />
                      <View style={[styles.feedNode, styles.feedSource, { left: link.start.x - 15, top: link.start.y - 15 }, isDone && styles.feedNodeDone, isActive && styles.feedNodeActive]}>
                        <Text style={styles.feedNodeText}>FOOD</Text>
                      </View>
                      <View style={[styles.feedTargetNode, { left: link.target.x - 18, top: link.target.y - 18 }, isDone && styles.feedNodeDone, isActive && styles.feedTargetActive]}>
                        <Text style={styles.feedTargetText}>BYTE</Text>
                      </View>
                      {isDone ? (
                        <View style={[styles.feedLineDone, {
                          left: link.start.x + 8,
                          top: link.start.y - 3,
                          width: Math.max(20, link.target.x - link.start.x - 10),
                        }]} />
                      ) : null}
                      {isActive && feedDragging && feedCursor ? (
                        <View style={[styles.feedLineActive, {
                          left: link.start.x + 8,
                          top: link.start.y - 3,
                          width: Math.max(12, feedCursor.x - link.start.x),
                        }]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
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
            <View style={styles.fill} {...tracePan.panHandlers}>
              <View style={[styles.traceBoard, { borderColor: `${accent}66` }]}>
                {Array.from({ length: 28 }).map((_, idx) => {
                  const x = (idx / 27) * BOARD_WIDTH;
                  const y = BOARD_CENTER_Y + (activeTracePattern?.offset ?? 0) + Math.sin((x / BOARD_WIDTH) * Math.PI * 2 + (activeTracePattern?.phase ?? 0)) * (activeTracePattern?.amplitude ?? 30);
                  return <View key={idx} style={[styles.traceDot, { left: x, top: y }]} />;
                })}
                {traceCursor ? <View style={[styles.traceCursor, { left: traceCursor.x, top: traceCursor.y }]} /> : null}
              </View>
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

        <Text style={styles.lockNotice}>
          {navigationLocked ? 'ROOM SWITCHING IS LOCKED WHILE THE MINIGAME IS ACTIVE' : 'ROOM NAVIGATION READY'}
        </Text>

        <View style={styles.footerStack}>
          <TouchableOpacity
            style={styles.cornerBtnExit}
            onPress={goBackToRoom}
            activeOpacity={0.85}
            hitSlop={TOUCH_HIT_SLOP}
          >
            <Ionicons name="arrow-back-outline" size={16} color="#fff" />
            <Text style={styles.cornerTextExit}>EXIT</Text>
          </TouchableOpacity>

          <View style={styles.persistentTabBar}>
            <TouchableOpacity style={[styles.tabItem, navigationLocked && styles.btnDisabled]} disabled={navigationLocked} activeOpacity={0.85}>
              <Ionicons name="home-outline" size={18} color={navigationLocked ? 'rgba(255,255,255,0.35)' : '#7ec8ff'} />
              <Text style={[styles.tabLabel, navigationLocked && styles.tabLabelDisabled, styles.tabLabelActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, navigationLocked && styles.btnDisabled]} disabled={navigationLocked} activeOpacity={0.85}>
              <Ionicons name="map-outline" size={18} color={navigationLocked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.45)'} />
              <Text style={[styles.tabLabel, navigationLocked && styles.tabLabelDisabled]}>Story</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, navigationLocked && styles.btnDisabled]} disabled={navigationLocked} activeOpacity={0.85}>
              <Ionicons name="flash-outline" size={18} color={navigationLocked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.45)'} />
              <Text style={[styles.tabLabel, navigationLocked && styles.tabLabelDisabled]}>Arena</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, navigationLocked && styles.btnDisabled]} disabled={navigationLocked} activeOpacity={0.85}>
              <Ionicons name="settings-outline" size={18} color={navigationLocked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.45)'} />
              <Text style={[styles.tabLabel, navigationLocked && styles.tabLabelDisabled]}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabItem, navigationLocked && styles.btnDisabled]} disabled={navigationLocked} activeOpacity={0.85}>
              <Ionicons name="ribbon-outline" size={18} color={navigationLocked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.45)'} />
              <Text style={[styles.tabLabel, navigationLocked && styles.tabLabelDisabled]}>Achievements</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {postProcessing ? (
        <View pointerEvents="auto" style={styles.overlayScrim}>
          <View style={[styles.centerPopup, { borderColor: `${accent}66` }]}>
            <Text style={styles.popupEyebrow}>PROCESSING RESULT</Text>
            <Text style={styles.popupTitle}>{processLabelFor(game)}</Text>
            <Text style={styles.popupScoreLabel}>FINAL SCORE</Text>
            <Text style={[styles.popupScoreValue, { color: gradeColor }]}>{score}</Text>
            <View style={styles.processTrack}>
              <View style={[styles.processFill, { width: `${postPercent}%` }]} />
            </View>
            <Text style={styles.popupBody}>Applying room effects and syncing the result package...</Text>
          </View>
        </View>
      ) : null}

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
  feedBoard: {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
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
    width: 44,
    height: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,221,120,0.6)',
    backgroundColor: 'rgba(255,187,76,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedSource: {
    width: 48,
  },
  feedTargetNode: {
    position: 'absolute',
    width: 52,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(126,240,194,0.75)',
    backgroundColor: 'rgba(27,103,74,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
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
  feedNodeText: {
    color: '#fff2c2',
    fontSize: 8.8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  feedTargetText: {
    color: '#d9fff1',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
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
  traceBoard: {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.82)',
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
  lockNotice: { color: 'rgba(157,213,255,0.78)', fontSize: 9.8, fontWeight: '800', textAlign: 'center', letterSpacing: 1.05, marginBottom: 8 },
  footerStack: { gap: 8 },
  processCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(95,182,255,0.28)',
    backgroundColor: 'rgba(8,16,44,0.98)',
    padding: 12,
    gap: 8,
  },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  processTitle: { color: '#dff6ff', fontSize: 12.5, fontWeight: '900', letterSpacing: 0.8 },
  processPercent: { color: '#8be9ff', fontSize: 11.5, fontWeight: '800' },
  processSub: { color: 'rgba(116,178,255,0.7)', fontSize: 9.4, fontWeight: '700', letterSpacing: 1.2 },
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
  persistentTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(5,12,40,0.97)',
    borderTopColor: 'rgba(80,160,255,0.2)',
    borderTopWidth: 1,
    borderRadius: 14,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: '#7ec8ff',
  },
  tabLabelDisabled: {
    color: 'rgba(255,255,255,0.35)',
  },
  overlayScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 112,
    backgroundColor: 'rgba(0,0,18,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  });
