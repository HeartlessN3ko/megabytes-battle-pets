/**
 * ArcadeSimon — "ECHO" reskin of Simon Says.
 *
 * 3 rounds, sequence lengths from TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS
 * (default [3, 5, 7]). 6 emoji buttons in a 3×2 grid below a prompt area
 * that flashes the byte's playback. Wrong tap = lose. Complete all 3 = win.
 *
 * Per-round flow:
 *   - Generate sequence of N emojis from the pool.
 *   - PLAYBACK phase: flash each emoji in the prompt + highlight the matching
 *     button briefly, with a tick SFX per flash.
 *   - INPUT phase: enable taps, show "YOUR TURN", track player taps against
 *     the sequence. Wrong tap → lose. Complete the sequence → next round.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArcadeShell, ArcadeResultModalState } from './ArcadeShell';
import { arcadeReward } from '../../../services/api';
import { previewReward, ArcadeOutcome } from './helpers/arcadeRewards';
import { TUNABLES } from '../../../config/tunables';
import { playSfx } from '../../../services/sfx';

type Phase = 'playback' | 'input' | 'between' | 'over';

const POOL = TUNABLES.arcade.SIMON_EMOJI_POOL;

function generateSequence(length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(Math.floor(Math.random() * POOL.length));
  return out;
}

export function ArcadeSimon() {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('playback');
  const [sequence, setSequence] = useState<number[]>(() => generateSequence(TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS[0]));
  const [playbackIdx, setPlaybackIdx] = useState<number | null>(null);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [status, setStatus] = useState('Watch the byte.');
  const [resultModal, setResultModal] = useState<ArcadeResultModalState | null>(null);
  const promptScale = useRef(new Animated.Value(0.9)).current;
  const submittedRef = useRef(false);

  const submitOutcome = useCallback(async (outcome: ArcadeOutcome, message: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r: any = await arcadeReward(outcome, 'simon');
      setResultModal({
        outcome,
        applied: r?.applied || previewReward(outcome),
        capRemaining: r?.capRemaining ?? null,
        capTotal: r?.capTotal ?? null,
        message,
      });
    } catch {
      setResultModal({
        outcome,
        applied: null,
        capRemaining: null,
        capTotal: null,
        message: 'Sync offline — reward will apply on reconnect.',
      });
    }
  }, []);

  // Playback runner
  useEffect(() => {
    if (phase !== 'playback') return;
    let i = 0;
    setStatus(`Round ${round + 1} of ${TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length} — watch the byte.`);
    const flashDur = TUNABLES.arcade.SIMON_FLASH_DURATION_MS;
    const gap = TUNABLES.arcade.SIMON_FLASH_GAP_MS;
    const step = () => {
      if (i >= sequence.length) {
        setPlaybackIdx(null);
        setPhase('input');
        setPlayerIdx(0);
        setStatus('YOUR TURN. Repeat the sequence.');
        return;
      }
      const idx = sequence[i];
      setPlaybackIdx(idx);
      Animated.sequence([
        Animated.timing(promptScale, { toValue: 1.1, duration: 120, useNativeDriver: true }),
        Animated.timing(promptScale, { toValue: 0.9, duration: 200, useNativeDriver: true }),
      ]).start();
      playSfx('mg_tick', 0.45);
      setTimeout(() => {
        setPlaybackIdx(null);
        i++;
        setTimeout(step, gap);
      }, flashDur);
    };
    const t = setTimeout(step, 600);
    return () => clearTimeout(t);
  }, [phase, sequence, round, promptScale]);

  const onTapEmoji = useCallback((idx: number) => {
    if (phase !== 'input') return;
    const expected = sequence[playerIdx];
    if (idx !== expected) {
      setPhase('over');
      setStatus('Wrong note. Run terminated.');
      playSfx('mg_lose', 0.85);
      submitOutcome('lose', `Round ${round + 1}: wrong tap on step ${playerIdx + 1}.`);
      return;
    }
    playSfx('mg_tick', 0.55);
    const next = playerIdx + 1;
    if (next >= sequence.length) {
      // Round cleared.
      const lastRound = round + 1 >= TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length;
      if (lastRound) {
        setPhase('over');
        setStatus(`All ${TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length} rounds cleared. Win.`);
        playSfx('mg_win', 0.9);
        submitOutcome('win', `Cleared all ${TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length} rounds.`);
        return;
      }
      const nextRound = round + 1;
      const nextLen = TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS[nextRound];
      setStatus(`Round ${nextRound} cleared. Next sequence: ${nextLen}.`);
      setPhase('between');
      setTimeout(() => {
        setRound(nextRound);
        setSequence(generateSequence(nextLen));
        setPlayerIdx(0);
        setPhase('playback');
      }, 900);
      return;
    }
    setPlayerIdx(next);
  }, [phase, sequence, playerIdx, round, submitOutcome]);

  return (
    <ArcadeShell
      title="ECHO"
      subtitle="REPEAT THE BYTE"
      accent="#9fb0ff"
      status={status}
      result={resultModal}
      onDismissResult={() => setResultModal(null)}
    >
      <Animated.View style={[styles.prompt, { transform: [{ scale: promptScale }] }]}>
        <Text style={styles.promptEmoji}>
          {playbackIdx != null ? POOL[playbackIdx] : phase === 'input' ? '?' : '...'}
        </Text>
      </Animated.View>

      <View style={styles.grid}>
        {[0, 1].map((row) => (
          <View key={row} style={styles.row}>
            {[0, 1, 2].map((col) => {
              const idx = row * 3 + col;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.btn,
                    playbackIdx === idx ? styles.btnFlash : null,
                    phase !== 'input' ? styles.btnDim : null,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => onTapEmoji(idx)}
                  disabled={phase !== 'input'}
                >
                  <Text style={styles.btnEmoji}>{POOL[idx]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        Round {Math.min(round + 1, TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length)} of{' '}
        {TUNABLES.arcade.SIMON_SEQUENCE_LENGTHS.length}
        {phase === 'input' ? `   |   ${playerIdx} / ${sequence.length}` : ''}
      </Text>
    </ArcadeShell>
  );
}

const styles = StyleSheet.create({
  prompt: {
    width: 110, height: 110, borderRadius: 16,
    backgroundColor: 'rgba(15,28,72,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(159,176,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginVertical: 12,
  },
  promptEmoji: { fontSize: 48 },
  grid: { gap: 8, marginTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    width: 86, height: 76, borderRadius: 12,
    backgroundColor: 'rgba(20,32,80,0.7)',
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnFlash: {
    backgroundColor: 'rgba(159,176,255,0.4)',
    borderColor: '#9fb0ff',
  },
  btnDim: { opacity: 0.65 },
  btnEmoji: { fontSize: 32 },
  hint: { color: 'rgba(180,210,255,0.55)', fontSize: 11, marginTop: 14, letterSpacing: 1 },
});
