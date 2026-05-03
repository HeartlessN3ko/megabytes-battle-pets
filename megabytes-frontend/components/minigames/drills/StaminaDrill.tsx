/**
 * StaminaDrill
 *
 * Rapid-tap endurance drill. The player taps a target as fast as possible
 * during a fixed window. Three rounds, escalating tap-count goals. No
 * primitive needed — this one's a counter + countdown.
 *
 * Trains the Stamina stat. Settles via trainStat() + earnCurrency() + the
 * room pending-result hook used by the rest of the minigame chrome.
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
const ROUND_DURATION_MS = 4000;
// Per-round tap targets. perfect = full grade, good = partial. Below `good`
// counts as fail. Curve scales up so each round demands a higher sustained
// rate (~8 taps/sec by round 3, which is brisk but not impossible).
const ROUND_TARGETS = [
  { perfect: 32, good: 22 },
  { perfect: 36, good: 25 },
  { perfect: 40, good: 28 },
];
const FEEDBACK_MS = 800;
const COUNTDOWN_TICK_MS = 50;

const ACCENT = '#ffb88a';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

type RoundResult = {
  index: number;
  taps: number;
  grade: SweetSpotGrade;
};

type Phase = 'play' | 'feedback' | 'settling' | 'done';

function gradeRound(taps: number, target: { perfect: number; good: number }): SweetSpotGrade {
  if (taps >= target.perfect) return 'perfect';
  if (taps >= target.good) return 'good';
  return 'fail';
}

export function StaminaDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('play');
  const [taps, setTaps] = useState(0);
  const [remainingMs, setRemainingMs] = useState(ROUND_DURATION_MS);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const submittingRef = useRef(false);
  const roundStartRef = useRef<number>(Date.now());

  const target = ROUND_TARGETS[Math.min(round, ROUND_TARGETS.length - 1)];

  const handleTap = useCallback(() => {
    if (phase !== 'play') return;
    setTaps((prev) => prev + 1);
  }, [phase]);

  // Round timer — counts down, finalizes on zero.
  useEffect(() => {
    if (phase !== 'play') return;
    roundStartRef.current = Date.now();
    setRemainingMs(ROUND_DURATION_MS);
    const t = setInterval(() => {
      const elapsed = Date.now() - roundStartRef.current;
      const left = Math.max(0, ROUND_DURATION_MS - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(t);
        // Use functional set to read the freshest tap count without re-creating
        // the timer effect every tap.
        setTaps((finalTaps) => {
          const grade = gradeRound(finalTaps, target);
          const rr: RoundResult = { index: round, taps: finalTaps, grade };
          setLastResult(rr);
          setResults((prev) => [...prev, rr]);
          setPhase('feedback');
          return finalTaps;
        });
      }
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(t);
  }, [phase, round, target]);

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
      setTaps(0);
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
    const skillLabel = `${stat ?? 'Stamina'} +${skillForGrade(finalGrade)}`;

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
          quality: averageRate(results),
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
    if (lastResult.grade === 'perfect') return { text: 'BURNED IT', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'HELD ON', color: ACCENT_GOOD };
    return { text: 'GASSED', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  const progressFrac = remainingMs / ROUND_DURATION_MS;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.surface}>
        <View style={styles.header}>
          <Text style={styles.title}>STAMINA DRILL</Text>
          <Text style={styles.subtitle}>Tap as fast as you can. Hit the target before time runs out.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS} — target {target.perfect} taps
          </Text>
        </View>

        <View style={styles.counterWrap}>
          <Text style={styles.tapCount}>{taps}</Text>
          <Text style={styles.tapCountLabel}>TAPS</Text>
          <View style={styles.timerBar}>
            <View style={[styles.timerFill, { width: `${Math.round(progressFrac * 100)}%` }]} />
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
        </View>

        <Pressable
          style={({ pressed }) => [styles.tapZone, pressed && phase === 'play' && styles.tapZonePressed]}
          onPress={handleTap}
          disabled={phase !== 'play'}
        >
          <View style={styles.feedback}>
            {feedbackText && (
              <Text style={[styles.feedbackText, { color: feedbackText.color }]}>
                {feedbackText.text}
              </Text>
            )}
            {phase === 'play' && <Text style={styles.tapHint}>TAP TAP TAP</Text>}
            {phase === 'settling' && <Text style={styles.tapHint}>SETTLING…</Text>}
          </View>
        </Pressable>

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

function averageRate(results: RoundResult[]): number {
  if (results.length === 0) return 0;
  const totalTaps = results.reduce((a, r) => a + r.taps, 0);
  // Normalize to a 0-1 quality signal — use highest target as the ceiling.
  const ceiling = ROUND_TARGETS[ROUND_TARGETS.length - 1].perfect * results.length;
  return Math.min(1, totalTaps / ceiling);
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
  const totalTaps = results.reduce((a, r) => a + r.taps, 0);
  const heading =
    finalGrade === 'perfect' ? 'IRON LUNGS' : finalGrade === 'good' ? 'COMPLETE' : 'WINDED';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>Total taps: {totalTaps}</Text>
      <Text style={styles.resultLine}>
        +{skillForGrade(finalGrade)} {game.stat ?? 'Stamina'}
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
  counterWrap: { paddingVertical: 16, gap: 12, alignItems: 'center' },
  tapCount: { color: '#fff', fontSize: 88, fontWeight: '900', letterSpacing: 2 },
  tapCountLabel: { color: '#5a6378', fontSize: 12, letterSpacing: 2, marginTop: -8 },
  timerBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#1a1f2e',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 8,
  },
  timerFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 5 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  pip: { width: 12, height: 12, borderRadius: 6 },
  tapZone: {
    flex: 1,
    backgroundColor: '#161b29',
    borderRadius: 16,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapZonePressed: { backgroundColor: '#202738' },
  feedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 36, fontWeight: '900', letterSpacing: 2 },
  tapHint: { color: '#5a6378', fontSize: 14, letterSpacing: 2 },
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
