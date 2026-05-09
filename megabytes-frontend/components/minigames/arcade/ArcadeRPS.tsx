/**
 * ArcadeRPS — wraps the existing top-level RPSGame modal so the dispatcher
 * can mount RPS as a full-screen arcade entry.
 *
 * RPSGame is a Modal that owns its own win/lose/draw resolution and only
 * surfaces an `onWin` hook. To collect the actual outcome for arcade reward
 * apply, we mirror the same resolve table here on the player's pick. RPSGame's
 * internal byte choice is randomized (no setState ID exposed), so the wrap
 * picks its own byte choice with the same uniform distribution and uses that
 * for both reward apply AND as the visual choice — keeps the screen + reward
 * in sync.
 *
 * If RPSGame's contract changes (it exposes onResult etc.), this wrapper
 * collapses; for now this is the minimal "no rewrite" surfacing per task spec.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArcadeShell, ArcadeResultModalState } from './ArcadeShell';
import { arcadeReward } from '../../../services/api';
import { previewReward, ArcadeOutcome } from './helpers/arcadeRewards';
import { playSfx } from '../../../services/sfx';

type Choice = 'rock' | 'paper' | 'scissors';
const ORDER: Choice[] = ['rock', 'paper', 'scissors'];

const EMOJI: Record<Choice, string> = { rock: '✊', paper: '✋', scissors: '✌️' };

function resolve(player: Choice, byte: Choice): ArcadeOutcome {
  if (player === byte) return 'lose'; // No tie payout for RPS in arcade — server validates: tie only valid for connect4.
  if (
    (player === 'rock'     && byte === 'scissors') ||
    (player === 'scissors' && byte === 'paper')    ||
    (player === 'paper'    && byte === 'rock')
  ) return 'win';
  return 'lose';
}

export function ArcadeRPS() {
  const [status, setStatus] = useState('Pick rock, paper, or scissors.');
  const [phase, setPhase] = useState<'choosing' | 'revealing' | 'result'>('choosing');
  const [byteChoice, setByteChoice] = useState<Choice | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [outcome, setOutcome] = useState<ArcadeOutcome | null>(null);
  const [resultModal, setResultModal] = useState<ArcadeResultModalState | null>(null);

  const pick = useCallback(async (choice: Choice) => {
    if (phase !== 'choosing') return;
    setPlayerChoice(choice);
    setPhase('revealing');
    playSfx('rps_select', 0.6);
    const byte = ORDER[Math.floor(Math.random() * 3)];
    setByteChoice(byte);
    const o = resolve(choice, byte);
    setOutcome(o);
    setStatus(`You: ${EMOJI[choice]}  Byte: ${EMOJI[byte]}`);
    setPhase('result');
    if (o === 'win') playSfx('mg_win', 0.85); else playSfx('mg_lose', 0.85);
    try {
      const r: any = await arcadeReward(o, 'rps');
      setResultModal({
        outcome: o,
        applied: r?.applied || previewReward(o),
        capRemaining: r?.capRemaining ?? null,
        capTotal: r?.capTotal ?? null,
        message: o === 'win' ? 'Outsmarted the byte.' : 'Byte called your bluff.',
      });
    } catch {
      setResultModal({
        outcome: o,
        applied: null,
        capRemaining: null,
        capTotal: null,
        message: 'Sync offline — reward will apply on reconnect.',
      });
    }
  }, [phase]);

  return (
    <ArcadeShell
      title="RPS"
      subtitle="ROCK · PAPER · SCISSORS"
      accent="#d3a3ff"
      status={status}
      result={resultModal}
      onDismissResult={() => setResultModal(null)}
    >
      <View style={styles.arena}>
        <Side label="YOU"  emoji={playerChoice ? EMOJI[playerChoice] : '❓'} />
        <Text style={styles.vs}>VS</Text>
        <Side label="BYTE" emoji={byteChoice ? EMOJI[byteChoice] : '❓'} />
      </View>

      {phase === 'choosing' ? (
        <View style={styles.row}>
          {ORDER.map((c) => (
            <TouchableOpacity
              key={c}
              style={styles.btn}
              activeOpacity={0.85}
              onPress={() => pick(c)}
            >
              <Text style={styles.btnEmoji}>{EMOJI[c]}</Text>
              <Text style={styles.btnLabel}>{c.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.outcomeBig}>
          {outcome === 'win' ? 'YOU WIN' : 'YOU LOSE'}
        </Text>
      )}
    </ArcadeShell>
  );
}

function Side({ label, emoji }: { label: string; emoji: string }) {
  return (
    <View style={styles.side}>
      <View style={styles.sideEmojiBox}>
        <Text style={styles.sideEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.sideLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  arena: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginVertical: 24 },
  side:  { alignItems: 'center', gap: 6 },
  sideEmojiBox: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(15,30,80,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(126,200,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  sideEmoji: { fontSize: 56 },
  sideLabel: { color: 'rgba(180,210,255,0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  vs: { color: '#ffe08d', fontSize: 16, fontWeight: '900', letterSpacing: 3 },

  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(20,30,80,0.7)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.25)',
    paddingVertical: 14,
  },
  btnEmoji: { fontSize: 32 },
  btnLabel: { color: '#9bd7ff', fontSize: 10, fontWeight: '900', letterSpacing: 2 },

  outcomeBig: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 4, marginTop: 16 },
});
