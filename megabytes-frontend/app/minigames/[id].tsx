import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { careAction, earnCurrency, interactByte, trainStat } from '../../services/api';
import { markHomeClutterCleared } from '../../services/homeRuntimeState';
import { MiniGameDef, getMiniGameById } from '../../services/minigames';
import { MiniGameRoomId, recordTrainingUsage, setPendingMiniGameResult } from '../../services/minigameRuntime';

type Grade = 'fail' | 'good' | 'perfect';
type Variant = 'quick' | 'long';

const EMOTES = ['HAPPY', 'SLEEP', 'ANGRY', 'JOY'];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
          await careAction('feed', grade);
          if (variant === 'long') await careAction('feed', grade);
        } else if (game.id === 'run-cleanup') {
          await careAction('clean', grade);
          if (variant === 'long') await careAction('clean', grade);
          markHomeClutterCleared();
        } else if (game.id === 'stabilize-signal') {
          await careAction('rest', grade);
          if (variant === 'long') await careAction('rest', grade);
        } else if (game.id === 'engage-simulation' || game.id === 'sync-link' || game.id === 'emote-align') {
          await interactByte();
          if (variant === 'long') await interactByte();
        } else if (game.id.startsWith('training-') && game.stat) {
          try {
            await trainStat(game.stat, grade);
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
      setResultBits(economy.byteBits);
      setResultSkill(economy.statGain);
      setResultEnergyCost(economy.energyCost);
      setResultSummary(`Result synced. Grade ${grade.toUpperCase()}, quality ${Math.round(quality * 100)}%.`);
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
          summary: `${game.title} complete. ${economy.statGain || 'Gains applied'}. Grade: ${grade.toUpperCase()}.`,
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
          return Math.hypot(dx, dy) <= 24;
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
          const x = clamp(evt.nativeEvent.locationX, 0, 260);
          const y = clamp(evt.nativeEvent.locationY, 0, 170);
          setFeedCursor({ x, y });
          setInteractions((v) => v + 1);

          const dx = x - link.target.x;
          const dy = y - link.target.y;
          const reached = Math.hypot(dx, dy) <= 28;
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

          const x = clamp(evt.nativeEvent.locationX, 0, 260);
          const y = clamp(evt.nativeEvent.locationY, 0, 170);
          const expected = 85 + pattern.offset + Math.sin((x / 260) * Math.PI * 2 + pattern.phase) * pattern.amplitude;
          const tol = variant === 'long' ? 24 : 34;
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

  const progress = useMemo(() => {
    if (!game) return '0';
    if (game.id === 'feed-upload') return `Cycle ${Math.min(feedStage + 1, 3)}/3`;
    if (game.kind === 'scrub') return `Panel ${Math.min(cleanupStage + 1, 3)}/3 - ${cleanedCount}/${scrubGoal} clean`;
    if (game.kind === 'trace') return `Pattern ${Math.min(traceStage + 1, 3)}/3 - ${Math.min(traceAligned, traceGoal)}/${traceGoal}`;
    if (game.kind === 'match') return `${pairCount}/${pairGoal} pairs`;
    if (game.kind === 'sequence') return `${seqCorrect}/${seqPattern.length}`;
    if (game.kind === 'ordered-sequence') return `${Math.min(orderedNext - 1, 6)}/6`;
    if (game.kind === 'timing') return `${timingHits}/${timingAttempts}`;
    return `${tapCount} taps`;
  }, [cleanedCount, cleanupStage, feedStage, game, orderedNext, pairCount, pairGoal, scrubGoal, seqCorrect, seqPattern.length, tapCount, timingAttempts, timingHits, traceAligned, traceGoal, traceStage]);

  const instruction = useMemo(() => {
    if (!game) return '';
    if (game.id === 'feed-upload') return 'Route the nutrient link into BYTE. Complete 3 meal cycles.';
    if (game.kind === 'tap-target') return `Hit ${tapGoal} targets before time runs out.`;
    if (game.kind === 'rapid-tap') return `Mash to ${tapGoal} taps as fast as possible.`;
    if (game.kind === 'scrub') return `Scrub the nodes clean. Clear 3 panels of ${scrubGoal} bars.`;
    if (game.kind === 'trace') return `Stabilize 3 signal patterns. Lock ${traceGoal} aligned points on this pattern.`;
    if (game.kind === 'match') return `Match ${pairGoal} pairs.`;
    if (game.kind === 'sequence') return sequencePreviewing
      ? `Memorize: ${seqPattern.map((idx) => EMOTES[idx]).join(' -> ')}`
      : 'Repeat the pattern in the same order.';
    if (game.kind === 'ordered-sequence') return 'Tap the numbers in order from 1 to 6.';
    if (game.kind === 'timing') return 'Stop the cursor inside the green zone 3 times.';
    return '';
  }, [game, pairGoal, scrubGoal, seqPattern, sequencePreviewing, tapGoal, traceGoal]);

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
    const summary = resultSummary || `${game.title} complete.`;
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
  }, [game, grade, quality, resultBits, resultEnergyCost, resultSkill, resultSummary, room, roomPath, router]);

  if (!game) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={styles.title}>Mini game not found.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <ImageBackground source={require('../../assets/backgrounds/bg916.png')} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{game.title}</Text>
            <Text style={styles.sub}>{game.subtitle} - {variant.toUpperCase()}</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={goBackToRoom} activeOpacity={0.85}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hudRow}>
          <View style={styles.hudCard}><Text style={styles.hudLabel}>TIME</Text><Text style={styles.hudVal}>{(remainingMs / 1000).toFixed(1)}s</Text></View>
          <View style={styles.hudCard}><Text style={styles.hudLabel}>PROGRESS</Text><Text style={styles.hudVal}>{progress}</Text></View>
          <View style={styles.hudCard}><Text style={styles.hudLabel}>QUALITY</Text><Text style={styles.hudVal}>{Math.round(quality * 100)}%</Text></View>
        </View>

        <View style={styles.alertStack}>
          {postProcessing ? (
            <View style={styles.processCard}>
              <View style={styles.processHeader}>
                <Text style={styles.processTitle}>{processLabelFor(game)}</Text>
                <Text style={styles.processPercent}>{postPercent}%</Text>
              </View>
              <Text style={styles.processSub}>SYSTEM PROCESS</Text>
              <View style={styles.processTrack}>
                <View style={[styles.processFill, { width: `${postPercent}%` }]} />
              </View>
              <Text style={styles.processFooter}>Reward package and room sync in progress...</Text>
            </View>
          ) : null}

          <View style={styles.statusCard}>
            <Text style={styles.instruction}>{instruction}</Text>
            <Text style={styles.status}>{syncing ? 'Syncing result...' : status}</Text>
            <Text style={styles.grade}>Grade: {grade.toUpperCase()}</Text>
          </View>

          {resultReady ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>PROGRAM RESULT READY</Text>
              <Text style={styles.resultBody}>{resultSummary}</Text>
              <Text style={styles.resultMeta}>BYTEBITS +{resultBits} - Energy -{resultEnergyCost}</Text>
              {resultSkill ? <Text style={styles.resultMeta}>{resultSkill}</Text> : null}
              <TouchableOpacity style={styles.btn} onPress={goBackToRoom} activeOpacity={0.85}>
                <Text style={styles.btnText}>RETURN TO ROOM</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.play}>
          {game.id === 'feed-upload' ? (
            <View style={styles.fill} {...feedPan.panHandlers}>
              <Text style={styles.hint}>Connect the food line to BYTE</Text>
              <Text style={styles.stageText}>Meal cycle {Math.min(feedStage + 1, 3)} of 3</Text>
              <View style={styles.feedBoard}>
                {feedLinks.map((link, idx) => {
                  const isDone = idx < feedStage;
                  const isActive = idx === feedStage;
                  return (
                    <View key={`feed-${idx}`} style={[styles.feedLane, { top: 0 }]}>
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
            <TouchableOpacity style={[styles.target, { left: targetPos.x, top: targetPos.y }]} onPress={onTapTarget} disabled={!running} hitSlop={20}>
              <Text style={styles.targetText}>{game.kind === 'rapid-tap' ? 'TAP' : 'GO'}</Text>
            </TouchableOpacity>
          ) : null}

          {game.kind === 'scrub' ? (
            <View style={styles.fill} {...scrubPan.panHandlers}>
              <Text style={styles.hint}>Scrub the nodes clean</Text>
              <Text style={styles.stageText}>Panel {Math.min(cleanupStage + 1, 3)} of 3</Text>
              <View style={styles.scrubBoard}>
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
              <Text style={styles.stageText}>Pattern {Math.min(traceStage + 1, 3)} of 3</Text>
              <View style={styles.traceBoard}>
                {Array.from({ length: 28 }).map((_, idx) => {
                  const x = (idx / 27) * 260;
                  const y = 85 + (activeTracePattern?.offset ?? 0) + Math.sin((x / 260) * Math.PI * 2 + (activeTracePattern?.phase ?? 0)) * (activeTracePattern?.amplitude ?? 30);
                  return <View key={idx} style={[styles.traceDot, { left: x, top: y }]} />;
                })}
                {traceCursor ? <View style={[styles.traceCursor, { left: traceCursor.x, top: traceCursor.y }]} /> : null}
              </View>
              <Text style={styles.hint}>Drag the marker across each signal pattern</Text>
            </View>
          ) : null}

          {game.kind === 'match' ? (
            <View style={styles.grid}>
              {cards.map((c, idx) => (
                <TouchableOpacity key={`${c}-${idx}`} style={[styles.cell, matched[idx] && styles.cellOk]} onPress={() => onCardPress(idx)} disabled={!running || matched[idx]}>
                  <Text style={styles.cellText}>{revealed[idx] || matched[idx] ? c : '?'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'sequence' ? (
            <View style={styles.seq}>
              {EMOTES.map((e, idx) => (
                <TouchableOpacity key={e} style={styles.seqBtn} onPress={() => onSequencePress(idx)} disabled={!running}>
                  <Text style={styles.seqText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'ordered-sequence' ? (
            <View style={styles.grid}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity key={n} style={[styles.cell, n < orderedNext && styles.cellOk]} onPress={() => onOrderedPress(n)} disabled={!running || n < orderedNext}>
                  <Text style={styles.cellText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {game.kind === 'timing' ? (
            <View style={styles.timing}>
              <View style={[styles.zone, { left: `${zoneStart}%`, width: `${zoneWidth}%` }]} />
              <View style={[styles.cursor, { left: `${cursor}%` }]} />
              <TouchableOpacity style={styles.stop} onPress={onStopTiming} disabled={!running || timingAttempts >= 3}>
                <Text style={styles.btnText}>STOP ({Math.max(0, 3 - timingAttempts)})</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%' },
  safe: { flex: 1, paddingHorizontal: 14, paddingBottom: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 10, gap: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#e9f4ff', fontSize: 21, fontWeight: '900', letterSpacing: 1.2 },
  sub: { color: '#9dd5ff', fontSize: 10.5 },
  cancelBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(26,34,62,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: { color: '#d9efff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  hudRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  hudCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.8)',
    padding: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hudLabel: { color: '#9dd5ff', fontSize: 9.5, fontWeight: '800', letterSpacing: 1 },
  hudVal: { color: '#e9f4ff', fontSize: 10.8, fontWeight: '700' },
  alertStack: { marginTop: 10, gap: 8 },
  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.26)',
    backgroundColor: 'rgba(7,16,54,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  play: {
    marginTop: 10,
    minHeight: 240,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(8,18,62,0.8)',
    padding: 10,
    overflow: 'hidden',
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { color: '#d9efff', fontSize: 11, fontWeight: '700' },
  stageText: { color: '#8fdfff', fontSize: 10.2, fontWeight: '800', letterSpacing: 1 },
  scrubBoard: { width: '100%', gap: 10, alignItems: 'center', justifyContent: 'center' },
  feedBoard: {
    width: 260,
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.76)',
    overflow: 'hidden',
  },
  feedLane: {
    ...StyleSheet.absoluteFillObject,
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
    width: 70,
    height: 70,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: 'rgba(255,221,120,0.8)',
    backgroundColor: '#ffd47b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetText: { color: '#2a1a08', fontSize: 16, fontWeight: '900' },
  patch: {
    height: 18,
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
    width: 260,
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.28)',
    backgroundColor: 'rgba(14,36,76,0.76)',
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
    width: 24,
    height: 24,
    borderRadius: 8,
    marginLeft: -12,
    marginTop: -12,
    borderWidth: 2,
    borderColor: '#7ef0c2',
    backgroundColor: 'rgba(126,240,194,0.32)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cell: { width: '31%', minWidth: 86, height: 70, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.86)', alignItems: 'center', justifyContent: 'center' },
  cellOk: { backgroundColor: 'rgba(46,139,90,0.94)' },
  cellText: { color: '#e9f4ff', fontSize: 24, fontWeight: '900' },
  seq: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  seqBtn: { width: '47%', minWidth: 108, height: 76, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.86)', alignItems: 'center', justifyContent: 'center' },
  seqText: { color: '#e9f4ff', fontSize: 20, fontWeight: '800' },
  timing: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(120,190,255,0.25)', backgroundColor: 'rgba(17,47,84,0.86)', overflow: 'hidden', justifyContent: 'center' },
  zone: { position: 'absolute', top: 36, height: 40, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(113,252,182,0.95)', backgroundColor: 'rgba(113,252,182,0.28)' },
  cursor: { position: 'absolute', top: 22, width: 14, height: 68, borderRadius: 8, marginLeft: -7, backgroundColor: '#ffd672' },
  stop: { position: 'absolute', bottom: 16, left: 12, right: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(120,190,255,0.35)', backgroundColor: 'rgba(8,18,62,0.9)', paddingVertical: 10, alignItems: 'center' },
  btn: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(120,190,255,0.35)', backgroundColor: 'rgba(8,18,62,0.92)', paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#d9efff', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  processCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(95,182,255,0.28)',
    backgroundColor: 'rgba(7,16,54,0.98)',
    padding: 10,
    gap: 6,
  },
  processHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  processTitle: { color: '#dff6ff', fontSize: 11.8, fontWeight: '900', letterSpacing: 0.8 },
  processPercent: { color: '#8be9ff', fontSize: 11, fontWeight: '800' },
  processSub: { color: 'rgba(116,178,255,0.7)', fontSize: 9.4, fontWeight: '700', letterSpacing: 1.2 },
  processTrack: { height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  processFill: { height: 9, borderRadius: 5, backgroundColor: '#2de6f6' },
  processFooter: { color: 'rgba(132,177,255,0.74)', fontSize: 9.4, fontWeight: '700' },
  status: { marginTop: 6, color: '#9cdfff', fontSize: 10.5, textAlign: 'center' },
  grade: { marginTop: 2, color: '#d9efff', fontSize: 10.5, textAlign: 'center', fontWeight: '700' },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,190,255,0.3)',
    backgroundColor: 'rgba(8,18,62,0.9)',
    padding: 10,
  },
  resultTitle: { color: '#dff2ff', fontSize: 11.5, fontWeight: '900', letterSpacing: 1.1 },
  resultBody: { color: 'rgba(218,238,255,0.82)', fontSize: 10.5, marginTop: 4 },
  resultMeta: { color: '#9edfff', fontSize: 10.2, marginTop: 2, fontWeight: '700' },
});
