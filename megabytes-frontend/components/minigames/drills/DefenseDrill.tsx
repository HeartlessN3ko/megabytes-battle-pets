/**
 * DefenseDrill
 *
 * Fragment-merge training drill. A 3x2 board of typed fragments. The player
 * taps two tiles; if they share a type they merge (both clear) and refill
 * with new random fragments — scoring a "patch." Mismatched taps just
 * unselect, no penalty. Three rounds of 8 seconds each, target patch count
 * climbing per round.
 *
 * Trains the Defense stat. Fantasy: the byte is shoring up its data shell —
 * merging matching fragments into stable blocks before time runs out.
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
const ROUND_DURATION_MS = 8000;
// (perfect, good) merge counts per round. Below `good` is fail.
const ROUND_TARGETS: { perfect: number; good: number }[] = [
  { perfect: 7, good: 5 },
  { perfect: 8, good: 6 },
  { perfect: 9, good: 7 },
];
const FEEDBACK_MS = 800;
const COUNTDOWN_TICK_MS = 60;
const BOARD_SIZE = 6; // 3x2

const ACCENT = '#9df4a6';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

// Four fragment types — distinct symbol + hue. Symbols read independent of
// color so the drill stays accessible if the player can't separate red/green.
const FRAGMENT_TYPES = [
  { glyph: '◆', color: '#ff7aa1' },
  { glyph: '▲', color: '#7fdcff' },
  { glyph: '●', color: '#ffd86b' },
  { glyph: '■', color: '#c3a3ff' },
];

type RoundResult = {
  index: number;
  merges: number;
  grade: SweetSpotGrade;
};

type Phase = 'play' | 'feedback' | 'settling' | 'done';

function randomTypeIdx(): number {
  return Math.floor(Math.random() * FRAGMENT_TYPES.length);
}

function freshBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, randomTypeIdx);
}

function gradeRound(merges: number, target: { perfect: number; good: number }): SweetSpotGrade {
  if (merges >= target.perfect) return 'perfect';
  if (merges >= target.good) return 'good';
  return 'fail';
}

export function DefenseDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('play');

  const [board, setBoard] = useState<number[]>(() => freshBoard());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [merges, setMerges] = useState(0);
  const [remainingMs, setRemainingMs] = useState(ROUND_DURATION_MS);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);

  const target = ROUND_TARGETS[Math.min(round, ROUND_TARGETS.length - 1)];

  // Round timer.
  useEffect(() => {
    if (phase !== 'play') return;
    startedAtRef.current = Date.now();
    setRemainingMs(ROUND_DURATION_MS);
    const t = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const left = Math.max(0, ROUND_DURATION_MS - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(t);
        setMerges((finalMerges) => {
          const grade = gradeRound(finalMerges, target);
          const rr: RoundResult = { index: round, merges: finalMerges, grade };
          setLastResult(rr);
          setResults((prev) => [...prev, rr]);
          setPhase('feedback');
          return finalMerges;
        });
      }
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(t);
  }, [phase, round, target]);

  const handleCellTap = useCallback(
    (idx: number) => {
      if (phase !== 'play') return;
      if (selectedIdx === null) {
        setSelectedIdx(idx);
        return;
      }
      if (selectedIdx === idx) {
        // Same tile tapped twice — deselect.
        setSelectedIdx(null);
        return;
      }
      const a = board[selectedIdx];
      const b = board[idx];
      if (a === b) {
        // Match — refill both with fresh random types.
        setBoard((prev) => {
          const out = [...prev];
          out[selectedIdx] = randomTypeIdx();
          out[idx] = randomTypeIdx();
          return out;
        });
        setMerges((prev) => prev + 1);
      }
      // Whether match or miss, clear the selection.
      setSelectedIdx(null);
    },
    [phase, selectedIdx, board],
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
      setBoard(freshBoard());
      setSelectedIdx(null);
      setMerges(0);
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
    const skillLabel = `${stat ?? 'Defense'} +${skillForGrade(finalGrade)}`;

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
    if (lastResult.grade === 'perfect') return { text: 'PATCHED', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'HOLDING', color: ACCENT_GOOD };
    return { text: 'BREACH', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  const progressFrac = remainingMs / ROUND_DURATION_MS;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.surface}>
        <View style={styles.header}>
          <Text style={styles.title}>DEFENSE DRILL</Text>
          <Text style={styles.subtitle}>Tap two matching fragments to patch them.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS} — target {target.perfect} patches
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>PATCHES</Text>
          <Text style={styles.mergeCount}>{merges}</Text>
          <Text style={styles.statLabel}>OF</Text>
          <Text style={styles.targetText}>{target.perfect}</Text>
        </View>

        <View style={styles.timerBar}>
          <View style={[styles.timerFill, { width: `${Math.round(progressFrac * 100)}%` }]} />
        </View>

        <View style={styles.grid}>
          {board.map((typeIdx, i) => {
            const t = FRAGMENT_TYPES[typeIdx];
            const sel = selectedIdx === i;
            return (
              <Pressable
                key={i}
                style={[
                  styles.cell,
                  { borderColor: t.color },
                  sel && { backgroundColor: t.color + '33' /* 20% alpha */ },
                ]}
                onPress={() => handleCellTap(i)}
                disabled={phase !== 'play'}
              >
                <Text style={[styles.cellGlyph, { color: t.color }]}>{t.glyph}</Text>
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
  const totalMerges = results.reduce((a, r) => a + r.merges, 0);
  const ceiling = ROUND_TARGETS.reduce((a, t) => a + t.perfect, 0);
  return Math.max(0, Math.min(1, totalMerges / ceiling));
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
  const totalMerges = results.reduce((a, r) => a + r.merges, 0);
  const heading =
    finalGrade === 'perfect' ? 'HARDENED' : finalGrade === 'good' ? 'COMPLETE' : 'EXPOSED';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>Total patches: {totalMerges}</Text>
      <Text style={styles.resultLine}>
        +{skillForGrade(finalGrade)} {game.stat ?? 'Defense'}
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
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  statLabel: { color: '#5a6378', fontSize: 11, letterSpacing: 1.5 },
  mergeCount: { color: ACCENT, fontSize: 36, fontWeight: '900', letterSpacing: 1 },
  targetText: { color: '#bcc4d8', fontSize: 18, fontWeight: '800' },

  timerBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#1a1f2e',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 8,
  },
  timerFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 4 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  cell: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#161b29',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  cellGlyph: { fontSize: 48, fontWeight: '900' },

  footer: { minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
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
