/**
 * AgilityDrill
 *
 * Reaction-target training drill. A pulse marker spawns at a random spot on
 * the play surface and stays visible for a shrinking window. Player taps it
 * before it vanishes. Three rounds of four targets each, with the tap
 * window narrowing every round (1200ms -> 950ms -> 700ms).
 *
 * Trains the Speed stat. No primitive needed — the spawn-and-tap loop is
 * lightweight enough to live inline.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { earnCurrency, syncByte, trainStat } from '../../../services/api';
import {
  recordTrainingUsage,
  setPendingMiniGameResult,
} from '../../../services/minigameRuntime';
import { MiniGameDef } from '../../../services/minigames';
import { SweetSpotGrade } from '../primitives/SweetSpotTimer';

const ROUNDS = 3;
const TARGETS_PER_ROUND = 4;
const ROUND_WINDOW_MS = [1200, 950, 700];
const SPAWN_DELAY_MIN_MS = 350;
const SPAWN_DELAY_MAX_MS = 750;
const FEEDBACK_MS = 700;

const TARGET_SIZE_PX = 84;
// Keep the spawn box from hugging the edges — leaves room for the marker
// to render without clipping and avoids the player having to reach into
// the corners on small phones.
const SPAWN_PADDING_PX = 20;

const ACCENT = '#8ce6ff';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

type TargetState = {
  x: number;
  y: number;
  spawnedAt: number;
  expiresAt: number;
} | null;

type RoundResult = {
  index: number;
  hits: number;
  averageReactionMs: number; // hits only
  grade: SweetSpotGrade;
};

type Phase = 'play' | 'feedback' | 'settling' | 'done';

function gradeRound(hits: number, total: number): SweetSpotGrade {
  if (hits >= total) return 'perfect';
  if (hits >= Math.ceil(total / 2)) return 'good';
  return 'fail';
}

export function AgilityDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('play');

  const [targetIndex, setTargetIndex] = useState(0);
  const [hits, setHits] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);
  const [target, setTarget] = useState<TargetState>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const submittingRef = useRef(false);

  const windowMs = ROUND_WINDOW_MS[Math.min(round, ROUND_WINDOW_MS.length - 1)];

  const handleBoardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setBoardSize({ w: width, h: height });
  }, []);

  // Resolve a round to feedback once all targets have been processed.
  const finalizeRound = useCallback(
    (finalHits: number, finalReactions: number[]) => {
      const avg = finalReactions.length > 0
        ? finalReactions.reduce((a, b) => a + b, 0) / finalReactions.length
        : 0;
      const grade = gradeRound(finalHits, TARGETS_PER_ROUND);
      const rr: RoundResult = {
        index: round,
        hits: finalHits,
        averageReactionMs: avg,
        grade,
      };
      setLastResult(rr);
      setResults((prev) => [...prev, rr]);
      setPhase('feedback');
    },
    [round],
  );

  // Spawn the next target after a short randomized delay. Idempotent per
  // (round, targetIndex) — the dependency on phase + targetIndex makes it
  // re-fire when the prior target resolves.
  useEffect(() => {
    if (phase !== 'play') return;
    if (boardSize.w <= 0 || boardSize.h <= 0) return;
    if (targetIndex >= TARGETS_PER_ROUND) return;

    const spawnDelay = SPAWN_DELAY_MIN_MS + Math.random() * (SPAWN_DELAY_MAX_MS - SPAWN_DELAY_MIN_MS);
    let expireTimer: ReturnType<typeof setTimeout> | null = null;

    const spawnTimer = setTimeout(() => {
      const maxX = Math.max(0, boardSize.w - TARGET_SIZE_PX - SPAWN_PADDING_PX * 2);
      const maxY = Math.max(0, boardSize.h - TARGET_SIZE_PX - SPAWN_PADDING_PX * 2);
      const x = SPAWN_PADDING_PX + Math.random() * maxX;
      const y = SPAWN_PADDING_PX + Math.random() * maxY;
      const now = Date.now();
      setTarget({ x, y, spawnedAt: now, expiresAt: now + windowMs });

      // Schedule the auto-expire (miss) on this target.
      expireTimer = setTimeout(() => {
        setTarget(null);
        setTargetIndex((prev) => prev + 1);
      }, windowMs);
    }, spawnDelay);

    return () => {
      clearTimeout(spawnTimer);
      if (expireTimer) clearTimeout(expireTimer);
    };
  }, [phase, targetIndex, boardSize, windowMs]);

  // When all targets in the round have resolved, finalize.
  useEffect(() => {
    if (phase !== 'play') return;
    if (targetIndex >= TARGETS_PER_ROUND) {
      finalizeRound(hits, reactionTimes);
    }
  }, [phase, targetIndex, hits, reactionTimes, finalizeRound]);

  const handleTargetTap = useCallback(() => {
    if (!target) return;
    const now = Date.now();
    if (now > target.expiresAt) return; // window-blown taps shouldn't credit
    const reaction = now - target.spawnedAt;
    setHits((prev) => prev + 1);
    setReactionTimes((prev) => [...prev, reaction]);
    setTarget(null);
    setTargetIndex((prev) => prev + 1);
  }, [target]);

  // Advance from feedback → next play / settle.
  useEffect(() => {
    if (phase !== 'feedback') return;
    const t = setTimeout(() => {
      const next = round + 1;
      if (next >= ROUNDS) {
        setPhase('settling');
        return;
      }
      setRound(next);
      setTargetIndex(0);
      setHits(0);
      setReactionTimes([]);
      setTarget(null);
      setPhase('play');
    }, FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [phase, round]);

  // Settle to backend on transition into 'settling'.
  useEffect(() => {
    if (phase !== 'settling' || submittingRef.current) return;
    submittingRef.current = true;
    const finalGrade = aggregateGrade(results);
    const stat = game.stat;
    const bits = bitsForGrade(finalGrade);
    const skillLabel = `${stat ?? 'Speed'} +${skillForGrade(finalGrade)}`;

    (async () => {
      try {
        if (stat) {
          await trainStat(stat, finalGrade).catch((err: unknown) => {
             
            console.error(`trainStat failed for ${stat}:`, err);
            return null;
          });
        }
        if (bits > 0) {
          await earnCurrency(bits, `minigame:${game.id}`).catch(() => {});
        }
        recordTrainingUsage(0, 10000);
        await syncByte().catch(() => null);
        setPendingMiniGameResult({
          room: 'training-center',
          gameId: game.id,
          title: game.title,
          grade: finalGrade,
          quality: averageReactionQuality(results),
          byteBits: bits,
          skillGain: skillLabel,
          energyCost: 0,
          cooldownSeconds: 10,
          summary: skillLabel,
        });
      } finally {
        setPhase('done');
      }
    })();
  }, [phase, results, game]);

  const feedbackText = useMemo(() => {
    if (phase !== 'feedback' || !lastResult) return null;
    if (lastResult.grade === 'perfect') return { text: 'SHARP', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'CAUGHT', color: ACCENT_GOOD };
    return { text: 'FADED', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.surface}>
        <View style={styles.header}>
          <Text style={styles.title}>AGILITY DRILL</Text>
          <Text style={styles.subtitle}>Tap each target before it fades.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS} — window {windowMs}ms
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>HIT</Text>
          <Text style={styles.hitCount}>{hits} / {TARGETS_PER_ROUND}</Text>
          <Text style={styles.statLabel}>SHOT</Text>
          <Text style={styles.shotCount}>{Math.min(targetIndex + (target ? 1 : 0), TARGETS_PER_ROUND)} / {TARGETS_PER_ROUND}</Text>
        </View>

        <View style={styles.board} onLayout={handleBoardLayout}>
          {target && phase === 'play' && (
            <Pressable
              style={[styles.target, { left: target.x, top: target.y }]}
              onPress={handleTargetTap}
              hitSlop={8}
            >
              <View style={styles.targetInner} />
            </Pressable>
          )}
          {phase !== 'play' && (
            <View style={styles.feedback}>
              {feedbackText && (
                <Text style={[styles.feedbackText, { color: feedbackText.color }]}>
                  {feedbackText.text}
                </Text>
              )}
              {phase === 'settling' && <Text style={styles.tapHint}>SETTLING…</Text>}
            </View>
          )}
        </View>

        <View style={styles.scoreRow}>
          {Array.from({ length: ROUNDS }).map((_, i) => {
            const r = results[i];
            const color = !r
              ? '#2a3145'
              : r.grade === 'perfect'
              ? ACCENT_PERFECT
              : r.grade === 'good'
              ? ACCENT_GOOD
              : ACCENT_FAIL;
            return <View key={i} style={[styles.pip, { backgroundColor: color }]} />;
          })}
        </View>

        {phase === 'done' && (
          <ResultPanel
            game={game}
            results={results}
            onExit={() => router.replace('/rooms/training-center')}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function aggregateGrade(results: RoundResult[]): SweetSpotGrade {
  if (results.length === 0) return 'fail';
  const score = results.reduce((acc, r) => {
    if (r.grade === 'perfect') return acc + 2;
    if (r.grade === 'good') return acc + 1;
    return acc;
  }, 0);
  const max = results.length * 2;
  const ratio = score / max;
  if (ratio >= 0.75) return 'perfect';
  if (ratio >= 0.4) return 'good';
  return 'fail';
}

function averageReactionQuality(results: RoundResult[]): number {
  if (results.length === 0) return 0;
  // Quality = 1 - (avg reaction / window ceiling). Floor at 0.
  const ceiling = ROUND_WINDOW_MS[0];
  const reactionAvg = results.reduce((a, r) => a + r.averageReactionMs, 0) / results.length;
  if (reactionAvg <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - reactionAvg / ceiling));
}

function bitsForGrade(grade: SweetSpotGrade): number {
  if (grade === 'perfect') return 16;
  if (grade === 'good') return 8;
  return 0;
}

function skillForGrade(grade: SweetSpotGrade): number {
  if (grade === 'perfect') return 3;
  if (grade === 'good') return 2;
  return 1;
}

function ResultPanel({
  game,
  results,
  onExit,
}: {
  game: MiniGameDef;
  results: RoundResult[];
  onExit: () => void;
}) {
  const finalGrade = aggregateGrade(results);
  const totalHits = results.reduce((a, r) => a + r.hits, 0);
  const totalShots = results.length * TARGETS_PER_ROUND;
  const allReactions = results.flatMap((r) =>
    r.hits > 0 ? [r.averageReactionMs] : [],
  );
  const avgReaction = allReactions.length > 0
    ? Math.round(allReactions.reduce((a, b) => a + b, 0) / allReactions.length)
    : null;
  const heading =
    finalGrade === 'perfect' ? 'WIRED' : finalGrade === 'good' ? 'COMPLETE' : 'GHOSTED';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>Hits: {totalHits} / {totalShots}</Text>
      {avgReaction !== null && (
        <Text style={styles.resultLine}>Avg reaction: {avgReaction}ms</Text>
      )}
      <Text style={styles.resultLine}>
        +{skillForGrade(finalGrade)} {game.stat ?? 'Speed'}
      </Text>
      <Pressable style={styles.exitBtn} onPress={onExit}>
        <Text style={styles.exitText}>RETURN TO TRAINING</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0e1a' },
  surface: { flex: 1, padding: 24, justifyContent: 'space-between' },
  header: { gap: 6 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  subtitle: { color: '#9aa3b8', fontSize: 14 },
  round: { color: ACCENT, fontSize: 12, marginTop: 4, letterSpacing: 1 },

  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  statLabel: { color: '#5a6378', fontSize: 11, letterSpacing: 1.5 },
  hitCount: { color: ACCENT, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  shotCount: { color: '#bcc4d8', fontSize: 24, fontWeight: '800' },

  board: {
    flex: 1,
    backgroundColor: '#161b29',
    borderRadius: 16,
    marginVertical: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  target: {
    position: 'absolute',
    width: TARGET_SIZE_PX,
    height: TARGET_SIZE_PX,
    borderRadius: TARGET_SIZE_PX / 2,
    backgroundColor: 'rgba(140, 230, 255, 0.18)',
    borderWidth: 3,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetInner: {
    width: TARGET_SIZE_PX / 2,
    height: TARGET_SIZE_PX / 2,
    borderRadius: TARGET_SIZE_PX / 4,
    backgroundColor: ACCENT,
  },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 36, fontWeight: '900', letterSpacing: 2 },
  tapHint: { color: '#5a6378', fontSize: 12, letterSpacing: 1, marginTop: 8 },

  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  pip: { width: 12, height: 12, borderRadius: 6 },

  resultPanel: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    padding: 20,
    backgroundColor: '#161b29',
    borderRadius: 12,
    gap: 8,
  },
  resultTitle: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  resultLine: { color: '#bcc4d8', fontSize: 14 },
  exitBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  exitText: { color: '#0a0e1a', fontWeight: '900', letterSpacing: 1 },
});
