/**
 * ArcadeHangman — "DECODE" reskin. No hanging stick figure. Visual is a
 * corrupted file glyph that fills with corruption blocks on each wrong
 * guess. 6 wrong = file lost. Same math as classic hangman.
 *
 * Word source: helpers/hangmanWords.ts (24 starter entries). Keyboard is a
 * three-row layout below the file glyph + blanks display. Used letters are
 * disabled. Win = all letters guessed before max wrong. Lose = max wrong.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArcadeShell, ArcadeResultModalState } from './ArcadeShell';
import { arcadeReward } from '../../../services/api';
import { previewReward, ArcadeOutcome } from './helpers/arcadeRewards';
import { TUNABLES } from '../../../config/tunables';
import { playSfx } from '../../../services/sfx';
import { pickRandomWord } from './helpers/hangmanWords';

const KEYBOARD_ROWS: string[] = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const MAX_WRONG = TUNABLES.arcade.HANGMAN_MAX_WRONG;

function maskedWord(word: string, guessed: Set<string>): string {
  return word.split('').map((ch) => (guessed.has(ch) ? ch : '_')).join(' ');
}

export function ArcadeHangman() {
  const [word] = useState(() => pickRandomWord());
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set());
  const [wrong, setWrong] = useState(0);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState('Decode the file. Tap a letter to guess.');
  const [resultModal, setResultModal] = useState<ArcadeResultModalState | null>(null);
  const submittedRef = useRef(false);

  const submitOutcome = useCallback(async (outcome: ArcadeOutcome, message: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r: any = await arcadeReward(outcome, 'hangman');
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

  const onGuess = useCallback((letter: string) => {
    if (over) return;
    if (guessed.has(letter)) return;
    const nextGuessed = new Set(guessed);
    nextGuessed.add(letter);
    setGuessed(nextGuessed);

    if (word.includes(letter)) {
      playSfx('mg_tick', 0.55);
      const allGuessed = word.split('').every((ch) => nextGuessed.has(ch));
      if (allGuessed) {
        setOver(true);
        setStatus(`Decoded "${word}". File recovered.`);
        playSfx('mg_win', 0.9);
        submitOutcome('win', `Decoded "${word}" with ${wrong} wrong guess${wrong === 1 ? '' : 'es'}.`);
      } else {
        setStatus(`Hit. Decoding ${maskedWord(word, nextGuessed)}.`);
      }
    } else {
      const w = wrong + 1;
      setWrong(w);
      playSfx('mg_lose', 0.45);
      if (w >= MAX_WRONG) {
        setOver(true);
        setStatus(`File corrupted beyond recovery. Word was "${word}".`);
        playSfx('mg_lose', 0.9);
        submitOutcome('lose', `Maxed out corruption. The file was "${word}".`);
      } else {
        setStatus(`Miss. Corruption ${w} / ${MAX_WRONG}.`);
      }
    }
  }, [over, guessed, word, wrong, submitOutcome]);

  const corruption = useMemo(() => Math.min(1, wrong / MAX_WRONG), [wrong]);
  const maskedDisplay = maskedWord(word, guessed);

  return (
    <ArcadeShell
      title="DECODE"
      subtitle="RECOVER THE FILE"
      accent="#ffe08b"
      status={status}
      result={resultModal}
      onDismissResult={() => setResultModal(null)}
    >
      {/* Corrupted file glyph + corruption fill */}
      <View style={styles.fileWrap}>
        <View style={styles.fileGlyph}>
          <Text style={styles.fileEmoji}>📄</Text>
          <View
            pointerEvents="none"
            style={[
              styles.fileCorruption,
              { height: `${corruption * 100}%` },
            ]}
          />
          <Text style={styles.fileLabel}>{wrong} / {MAX_WRONG}</Text>
        </View>
      </View>

      <Text style={styles.wordDisplay}>{maskedDisplay}</Text>

      <View style={styles.keyboard}>
        {KEYBOARD_ROWS.map((row, i) => (
          <View key={i} style={styles.keyRow}>
            {row.split('').map((letter) => {
              const used = guessed.has(letter);
              const hit = used && word.includes(letter);
              return (
                <TouchableOpacity
                  key={letter}
                  style={[
                    styles.key,
                    used ? (hit ? styles.keyHit : styles.keyMiss) : styles.keyIdle,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => onGuess(letter)}
                  disabled={used || over}
                >
                  <Text style={[styles.keyLabel, used ? styles.keyLabelUsed : null]}>{letter}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </ArcadeShell>
  );
}

const KEY_W = 28;
const KEY_H = 36;

const styles = StyleSheet.create({
  fileWrap: { alignItems: 'center', marginVertical: 4 },
  fileGlyph: {
    width: 90, height: 110,
    borderRadius: 12,
    backgroundColor: 'rgba(15,28,72,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(255,224,139,0.45)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  fileEmoji: { fontSize: 56 },
  fileCorruption: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,107,107,0.45)',
  },
  fileLabel: {
    position: 'absolute', top: 6, right: 8,
    color: '#ffe08b', fontSize: 9, fontWeight: '900', letterSpacing: 1,
  },
  wordDisplay: {
    color: '#cbe1ff',
    fontSize: 22, fontWeight: '900', letterSpacing: 4,
    marginVertical: 14,
  },

  keyboard: { gap: 6, alignItems: 'center' },
  keyRow:   { flexDirection: 'row', gap: 4 },
  key: {
    width: KEY_W, height: KEY_H,
    borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  keyIdle: {
    backgroundColor: 'rgba(20,32,80,0.7)',
    borderColor: 'rgba(126,200,255,0.25)',
  },
  keyHit: {
    backgroundColor: 'rgba(125,255,192,0.22)',
    borderColor: 'rgba(125,255,192,0.5)',
  },
  keyMiss: {
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderColor: 'rgba(255,107,107,0.4)',
  },
  keyLabel:    { color: '#cbe1ff', fontSize: 13, fontWeight: '900' },
  keyLabelUsed:{ color: 'rgba(203,225,255,0.6)' },
});
