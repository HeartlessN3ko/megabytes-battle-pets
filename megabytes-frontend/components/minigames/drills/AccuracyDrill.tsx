/**
 * AccuracyDrill
 *
 * Lock-on training drill. The player taps to stop a moving cursor inside an
 * off-center target zone. Five rounds, tightening tolerance + faster sweep
 * + a randomized zone position so the player can't just memorize "tap when
 * marker hits the middle." Trains the Accuracy stat.
 *
 * Reuses SweetSpotTimer — same primitive PowerDrill uses, different fantasy.
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
import {
  SweetSpotGrade,
  SweetSpotTimer,
  SweetSpotTimerHandle,
} from '../primitives/SweetSpotTimer';

const ROUNDS = 5;
const ROUND_TOLERANCES = [0.09, 0.075, 0.06, 0.045, 0.035];
const ROUND_SWEEP_MS = [1200, 1100, 1000, 900, 820];
const FEEDBACK_MS = 700;

// Accuracy is about hitting an off-center mark — randomizing the zone
// position per round prevents pure-rhythm tapping. Bounded so the zone
// never sits flush against the edge.
const ZONE_MIN = 0.25;
const ZONE_MAX = 0.75;

const ACCENT = '#ffe08b';
const ACCENT_PERFECT = '#fff7d6';
const ACCENT_GOOD = '#9df4a6';
const ACCENT_FAIL = '#ff7a7a';

type RoundResult = {
  index: number;
  precision: number;
  grade: SweetSpotGrade;
};

type Phase = 'play' | 'feedback' | 'settling' | 'done';

function pickWindowCenter(): number {
  return ZONE_MIN + Math.random() * (ZONE_MAX - ZONE_MIN);
}

export function AccuracyDrill({ game }: { game: MiniGameDef }) {
  const router = useRouter();
  const timerRef = useRef<SweetSpotTimerHandle>(null);

  const [round, setRound] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [phase, setPhase] = useState<Phase>('play');
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const [windowCenter, setWindowCenter] = useState(() => pickWindowCenter());
  const submittingRef = useRef(false);

  const handleTap = useCallback(() => {
    if (phase !== 'play') return;
    const r = timerRef.current?.commit();
    if (!r) return;
    const rr: RoundResult = { index: round, precision: r.precision, grade: r.grade };
    setLastResult(rr);
    setResults((prev) => [...prev, rr]);
    setPhase('feedback');
  }, [phase, round]);

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
      setWindowCenter(pickWindowCenter());
      timerRef.current?.reset();
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
    const skillLabel = `${stat ?? 'Accuracy'} +${skillForGrade(finalGrade)}`;

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
          quality: averagePrecision(results),
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

  const tolerance = ROUND_TOLERANCES[Math.min(round, ROUND_TOLERANCES.length - 1)];
  const sweepMs = ROUND_SWEEP_MS[Math.min(round, ROUND_SWEEP_MS.length - 1)];

  const feedbackText = useMemo(() => {
    if (phase !== 'feedback' || !lastResult) return null;
    if (lastResult.grade === 'perfect') return { text: 'LOCKED', color: ACCENT_PERFECT };
    if (lastResult.grade === 'good') return { text: 'CLOSE', color: ACCENT_GOOD };
    return { text: 'MISS', color: ACCENT_FAIL };
  }, [phase, lastResult]);

  return (
    <SafeAreaView style={styles.root}>
      <Pressable
        style={styles.surface}
        onPress={handleTap}
        disabled={phase !== 'play'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>ACCURACY DRILL</Text>
          <Text style={styles.subtitle}>Tap to stop the cursor inside the target.</Text>
          <Text style={styles.round}>
            Round {Math.min(round + 1, ROUNDS)} / {ROUNDS}
          </Text>
        </View>

        <View style={styles.timerWrap}>
          <SweetSpotTimer
            ref={timerRef}
            windowCenter={windowCenter}
            tolerance={tolerance}
            sweepMs={sweepMs}
            paused={phase !== 'play'}
            accent={ACCENT}
          />
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

        <View style={styles.feedback}>
          {feedbackText && (
            <Text style={[styles.feedbackText, { color: feedbackText.color }]}>
              {feedbackText.text}
            </Text>
          )}
          {phase === 'play' && <Text style={styles.tapHint}>TAP TO STOP</Text>}
          {phase === 'settling' && <Text style={styles.tapHint}>SETTLING…</Text>}
        </View>

        {phase === 'done' && (
          <ResultPanel
            game={game}
            results={results}
            onExit={() => router.replace('/rooms/training-center')}
          />
        )}
      </Pressable>
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

function averagePrecision(results: RoundResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((a, r) => a + r.precision, 0) / results.length;
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
  const perfects = results.filter((r) => r.grade === 'perfect').length;
  const goods = results.filter((r) => r.grade === 'good').length;
  const misses = results.length - perfects - goods;
  const heading =
    finalGrade === 'perfect' ? 'DEAD ON' : finalGrade === 'good' ? 'COMPLETE' : 'OFF MARK';
  return (
    <View style={styles.resultPanel}>
      <Text style={styles.resultTitle}>{heading}</Text>
      <Text style={styles.resultLine}>
        Locked / Close / Miss: {perfects} / {goods} / {misses}
      </Text>
      <Text style={styles.resultLine}>
        +{skillForGrade(finalGrade)} {game.stat ?? 'Accuracy'}
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
  timerWrap: { paddingVertical: 24, gap: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pip: { width: 12, height: 12, borderRadius: 6 },
  feedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 36, fontWeight: '900', letterSpacing: 2 },
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
