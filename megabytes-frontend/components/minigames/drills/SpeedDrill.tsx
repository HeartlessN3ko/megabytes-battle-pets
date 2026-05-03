/**
 * SpeedDrill
 *
 * Ordered-sequence training drill. Six numbered cells appear in a 3x2 grid;
 * the digits 1-6 are randomly assigned to the slots. The player taps them
 * in order, racing the clock. Three rounds, tightening time targets each.
 *
 * Trains the Speed stat. Wrong taps add a 1-second penalty to the round
 * time so the player can recover without restarting, but speed-runs come
 * from clean execution.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
const ROUND_PERFECT_MS = [4000, 3500, 3000];
const ROUND_GOOD_MS    = [6000, 5000, 4500];
const WRONG_TAP_PENALTY_MS = 1000;
const FEEDBACK_MS = 800;

const ACCENT = '#7fdcff';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

type RoundResult = {
  index: number;
  effectiveMs: number;
  wrongTaps: number;
  grade: SweetSpotGrade;
};

type Phase = 'play' | 'feedback' | 'settling' | 'done';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function gradeRound(effectiveMs: number, perfectMs: number, goodMs: number): SweetSpotGrade {
  if (effectiveMs <= perfectMs) return 'perfect';
  if (effectiveMs <= goodMs) return 'good';
  return 'fail';
}

export function SpeedDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('play');
  const [layout, setLayout] = useState<number[]>(() => shuffle([1, 2, 3, 4, 5, 6]));
  const [nextNumber, setNextNumber] = useState(1);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);

  const perfectMs = ROUND_PERFECT_MS[Math.min(round, ROUND_PERFECT_MS.length - 1)];
  const goodMs    = ROUND_GOOD_MS[Math.min(round, ROUND_GOOD_MS.length - 1)];

  // Reset round timer + state on (re)entering 'play'.
  useEffect(() => {
    if (phase !== 'play') return;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    const t = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 80);
    return () => clearInterval(t);
  }, [phase, round]);

  const handleCellTap = useCallback(
    (cellNumber: number) => {
      if (phase !== 'play') return;
      if (cellNumber === nextNumber) {
        const upcoming = nextNumber + 1;
        if (upcoming > 6) {
          // Round complete.
          const rawMs = Date.now() - startedAtRef.current;
          const effectiveMs = rawMs + wrongTaps * WRONG_TAP_PENALTY_MS;
          const grade = gradeRound(effectiveMs, perfectMs, goodMs);
          const rr: RoundResult = { index: round, effectiveMs, wrongTaps, grade };
          setLastResult(rr);
          setResults((prev) => [...prev, rr]);
          setPhase('feedback');
        } else {
          setNextNumber(upcoming);
        }
      } else {
        setWrongTaps((prev) => prev + 1);
      }
    },
    [phase, nextNumber, round, wrongTaps, perfectMs, goodMs],
  );

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
      setLayout(shuffle([1, 2, 3, 4, 5, 6]));
      setNextNumber(1);
      setWrongTaps(0);
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
          quality: averageQuality(results),
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
    if (lastResult.grade === 'perfect') return { text: 'BLAZED', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'CLEAN', color: ACCENT_GOOD };
    return { text: 'SLOW', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.surface}>
        <View style={styles.header}>
          <Text style={styles.title}>SPEED DRILL</Text>
          <Text style={styles.subtitle}>Tap 1 to 6 in order. Wrong taps add time.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS} — target {(perfectMs / 1000).toFixed(1)}s
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>NEXT</Text>
          <Text style={styles.nextNumber}>{Math.min(nextNumber, 6)}</Text>
          <Text style={styles.statLabel}>TIME</Text>
          <Text style={styles.timer}>{(elapsedMs / 1000).toFixed(1)}s</Text>
          <Text style={styles.statLabel}>MISS</Text>
          <Text style={styles.miss}>{wrongTaps}</Text>
        </View>

        <View style={styles.grid}>
          {layout.map((cellNumber, i) => {
            const used = cellNumber < nextNumber;
            const isNext = cellNumber === nextNumber;
            return (
              <Pressable
                key={`${cellNumber}-${i}`}
                style={[
                  styles.cell,
                  used && styles.cellUsed,
                  isNext && phase === 'play' && styles.cellNext,
                ]}
                onPress={() => handleCellTap(cellNumber)}
                disabled={phase !== 'play' || used}
              >
                <Text
                  style={[
                    styles.cellText,
                    used && styles.cellTextUsed,
                  ]}
                >
                  {cellNumber}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          {feedbackText && (
            <Text style={[styles.feedbackText, { color: feedbackText.color }]}>
              {feedbackText.text}
            </Text>
          )}
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
          {phase === 'settling' && <Text style={styles.tapHint}>SETTLING…</Text>}
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

function averageQuality(results: RoundResult[]): number {
  if (results.length === 0) return 0;
  // Quality = 1 - (avg effective time / fail ceiling). Floor at 0.
  const ceiling = ROUND_GOOD_MS[ROUND_GOOD_MS.length - 1] * 1.5;
  const avgMs = results.reduce((a, r) => a + r.effectiveMs, 0) / results.length;
  return Math.max(0, Math.min(1, 1 - avgMs / ceiling));
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
  const totalMisses = results.reduce((a, r) => a + r.wrongTaps, 0);
  const bestMs = results.length > 0
    ? Math.min(...results.map((r) => r.effectiveMs))
    : 0;
  const heading =
    finalGrade === 'perfect' ? 'BLISTERING' : finalGrade === 'good' ? 'COMPLETE' : 'OFF PACE';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>Best round: {(bestMs / 1000).toFixed(2)}s</Text>
      <Text style={styles.resultLine}>Total misses: {totalMisses}</Text>
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
    paddingVertical: 16,
  },
  statLabel: { color: '#5a6378', fontSize: 11, letterSpacing: 1.5 },
  nextNumber: { color: ACCENT, fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  timer: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  miss: { color: ACCENT_FAIL, fontSize: 24, fontWeight: '800' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  cell: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#161b29',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#202738',
  },
  cellNext: { borderColor: ACCENT },
  cellUsed: { backgroundColor: '#0e1320', borderColor: '#1a1f2e' },
  cellText: { color: '#fff', fontSize: 44, fontWeight: '900' },
  cellTextUsed: { color: '#3a4258' },

  footer: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 10 },
  feedbackText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pip: { width: 12, height: 12, borderRadius: 6 },
  tapHint: { color: '#5a6378', fontSize: 12, letterSpacing: 1 },

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
