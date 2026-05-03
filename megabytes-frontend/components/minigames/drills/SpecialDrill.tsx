/**
 * SpecialDrill
 *
 * Pattern-recall training drill (Simon-says style). Four colored cells
 * arranged in a 2x2 grid. Each round the drill flashes a sequence of
 * cells; the player echoes it by tapping in the same order. Three rounds,
 * sequence length growing each (3 / 4 / 5 cells). One wrong tap fails
 * the round but doesn't end the drill — partial credit possible.
 *
 * Trains the Special stat.
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
const ROUND_LENGTHS = [3, 4, 5];
const SHOW_FLASH_MS = 460;
const SHOW_GAP_MS   = 220;
const FLASH_TAP_MS  = 220; // visual flash on player tap
const FEEDBACK_MS   = 800;

const ACCENT = '#9fb0ff';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

// Four cell hues — distinct enough to be readable without a color label.
const CELL_COLORS = ['#ff7aa1', '#7fdcff', '#ffd86b', '#9df4a6'];

type RoundResult = {
  index: number;
  correct: number;
  total: number;
  grade: SweetSpotGrade;
};

type Phase = 'show' | 'echo' | 'feedback' | 'settling' | 'done';

function gradeRound(correct: number, total: number): SweetSpotGrade {
  if (correct >= total) return 'perfect';
  if (correct >= Math.ceil(total / 2)) return 'good';
  return 'fail';
}

function genSequence(length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    out.push(Math.floor(Math.random() * 4));
  }
  return out;
}

export function SpecialDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('show');
  const [sequence, setSequence] = useState<number[]>(() => genSequence(ROUND_LENGTHS[0]));
  const [showIdx, setShowIdx] = useState(-1);   // currently lit cell during 'show'
  const [echoIdx, setEchoIdx] = useState(0);    // next expected position during 'echo'
  const [tapFlash, setTapFlash] = useState<number | null>(null);
  const [correctSoFar, setCorrectSoFar] = useState(0);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const submittingRef = useRef(false);

  // Show phase — flash each cell in the sequence, then drop into echo mode.
  useEffect(() => {
    if (phase !== 'show') return;
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    sequence.forEach((cell, i) => {
      timeouts.push(
        setTimeout(() => {
          if (cancelled) return;
          setShowIdx(cell);
          timeouts.push(
            setTimeout(() => {
              if (cancelled) return;
              setShowIdx(-1);
            }, SHOW_FLASH_MS),
          );
        }, elapsed),
      );
      elapsed += SHOW_FLASH_MS + SHOW_GAP_MS;
    });
    timeouts.push(
      setTimeout(() => {
        if (cancelled) return;
        setShowIdx(-1);
        setEchoIdx(0);
        setCorrectSoFar(0);
        setPhase('echo');
      }, elapsed + 100),
    );
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [phase, sequence]);

  // Tap-flash auto-clear.
  useEffect(() => {
    if (tapFlash === null) return;
    const t = setTimeout(() => setTapFlash(null), FLASH_TAP_MS);
    return () => clearTimeout(t);
  }, [tapFlash]);

  const finalizeRound = useCallback(
    (correct: number) => {
      const grade = gradeRound(correct, sequence.length);
      const rr: RoundResult = {
        index: round,
        correct,
        total: sequence.length,
        grade,
      };
      setLastResult(rr);
      setResults((prev) => [...prev, rr]);
      setPhase('feedback');
    },
    [round, sequence.length],
  );

  const handleCellTap = useCallback(
    (cellIdx: number) => {
      if (phase !== 'echo') return;
      setTapFlash(cellIdx);
      const expected = sequence[echoIdx];
      if (cellIdx === expected) {
        const upcomingCorrect = correctSoFar + 1;
        setCorrectSoFar(upcomingCorrect);
        const upcomingIdx = echoIdx + 1;
        if (upcomingIdx >= sequence.length) {
          finalizeRound(upcomingCorrect);
        } else {
          setEchoIdx(upcomingIdx);
        }
      } else {
        // Wrong tap ends the echo phase early — credit only correct-so-far.
        finalizeRound(correctSoFar);
      }
    },
    [phase, echoIdx, sequence, correctSoFar, finalizeRound],
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
      setSequence(genSequence(ROUND_LENGTHS[Math.min(next, ROUND_LENGTHS.length - 1)]));
      setEchoIdx(0);
      setCorrectSoFar(0);
      setShowIdx(-1);
      setPhase('show');
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
    const skillLabel = `${stat ?? 'Special'} +${skillForGrade(finalGrade)}`;

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
    if (lastResult.grade === 'perfect') return { text: 'CLEAN ECHO', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'PARTIAL', color: ACCENT_GOOD };
    return { text: 'LOST IT', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  const phaseLabel =
    phase === 'show'   ? 'WATCH' :
    phase === 'echo'   ? 'REPEAT' :
    phase === 'feedback' ? 'RESULT' :
    phase === 'settling' ? 'SETTLING…' :
    '';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.surface}>
        <View style={styles.header}>
          <Text style={styles.title}>SPECIAL DRILL</Text>
          <Text style={styles.subtitle}>Watch the sequence, then repeat it.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS} — {sequence.length} steps
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>{phaseLabel}</Text>
          {phase === 'echo' && (
            <Text style={styles.echoCount}>
              {Math.min(echoIdx, sequence.length)} / {sequence.length}
            </Text>
          )}
        </View>

        <View style={styles.grid}>
          {[0, 1, 2, 3].map((cellIdx) => {
            const litShow = showIdx === cellIdx;
            const litTap  = tapFlash === cellIdx;
            const lit = litShow || litTap;
            return (
              <Pressable
                key={cellIdx}
                style={[
                  styles.cell,
                  { borderColor: CELL_COLORS[cellIdx] },
                  lit && { backgroundColor: CELL_COLORS[cellIdx] },
                ]}
                onPress={() => handleCellTap(cellIdx)}
                disabled={phase !== 'echo'}
              >
                <View
                  style={[
                    styles.cellCore,
                    { backgroundColor: CELL_COLORS[cellIdx] },
                    lit && styles.cellCoreLit,
                  ]}
                />
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
  const totalCorrect = results.reduce((a, r) => a + r.correct, 0);
  const totalSteps   = results.reduce((a, r) => a + r.total, 0);
  if (totalSteps <= 0) return 0;
  return Math.max(0, Math.min(1, totalCorrect / totalSteps));
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
  const totalCorrect = results.reduce((a, r) => a + r.correct, 0);
  const totalSteps   = results.reduce((a, r) => a + r.total, 0);
  const heading =
    finalGrade === 'perfect' ? 'TOTAL RECALL' : finalGrade === 'good' ? 'COMPLETE' : 'SCRAMBLED';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>Steps recalled: {totalCorrect} / {totalSteps}</Text>
      <Text style={styles.resultLine}>
        +{skillForGrade(finalGrade)} {game.stat ?? 'Special'}
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
    paddingVertical: 14,
    gap: 12,
  },
  statLabel: { color: ACCENT, fontSize: 18, letterSpacing: 2, fontWeight: '900' },
  echoCount: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 1 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  cell: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: '#161b29',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  cellCore: {
    width: '40%',
    aspectRatio: 1,
    borderRadius: 999,
    opacity: 0.55,
  },
  cellCoreLit: { opacity: 1 },

  footer: { minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 10 },
  feedbackText: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
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
