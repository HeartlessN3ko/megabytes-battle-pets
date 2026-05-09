/**
 * ArcadeConnect4 — RN port of Connect 4 with the byte as opponent.
 *
 * Difficulty is byte-driven (no UI toggle): we read byte.personality.raw and
 * pick easy/medium/hard via TUNABLES.arcade thresholds. This recycles existing
 * personality data and gives the byte a "play style" the player can feel
 * without a settings menu.
 *
 * Engine logic lives in helpers/connect4Engine.ts (pure). This component is
 * just board render + tap routing + reward apply.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArcadeShell, ArcadeResultModalState } from './ArcadeShell';
import { arcadeReward, getByte } from '../../../services/api';
import { previewReward, ArcadeOutcome } from './helpers/arcadeRewards';
import { TUNABLES } from '../../../config/tunables';
import { playSfx } from '../../../services/sfx';
import {
  Cell, Color, Difficulty, Grid,
  COLS, ROWS,
  applyMove, chooseAiMove, findWin, isBoardFull, lowestEmptyRow, makeEmptyGrid,
} from './helpers/connect4Engine';

const PLAYER: Color = 'R';
const BYTE: Color = 'Y';

function difficultyForByte(personality: any): Difficulty {
  const raw = personality?.raw || personality || {};
  const curiosity = Number(raw.curiosity ?? 50);
  const impulse   = Number(raw.impulse ?? 50);
  if (curiosity >= TUNABLES.arcade.C4_HARD_THRESHOLD) return 'hard';
  if (impulse   >= TUNABLES.arcade.C4_EASY_THRESHOLD) return 'easy';
  return 'medium';
}

function difficultyLabel(d: Difficulty): string {
  if (d === 'hard') return 'Curious — playing carefully';
  if (d === 'easy') return 'Impulsive — playing fast';
  return 'Steady — playing balanced';
}

export function ArcadeConnect4() {
  const [grid, setGrid] = useState<Grid>(() => makeEmptyGrid());
  const [turn, setTurn] = useState<Color>(PLAYER);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [status, setStatus] = useState('Loading byte...');
  const [winLine, setWinLine] = useState<[number, number][]>([]);
  const [over, setOver] = useState(false);
  const [resultModal, setResultModal] = useState<ArcadeResultModalState | null>(null);
  const winPulse = useRef(new Animated.Value(0.4)).current;
  const submittedRef = useRef(false);

  // Load byte once on mount to read personality.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: any = await getByte();
        if (cancelled) return;
        const d = difficultyForByte(data?.personalityModifiers || data?.byte?.personality);
        setDifficulty(d);
        setStatus(`Your turn. ${difficultyLabel(d)}.`);
      } catch {
        setStatus('Your turn. Steady — playing balanced.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Win-line pulse animation.
  useEffect(() => {
    if (winLine.length === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(winPulse, { toValue: 1.0, duration: 480, useNativeDriver: true }),
        Animated.timing(winPulse, { toValue: 0.4, duration: 480, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [winLine, winPulse]);

  const submitOutcome = useCallback(async (outcome: ArcadeOutcome, message: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r: any = await arcadeReward(outcome, 'connect4');
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

  const checkAndResolve = useCallback((g: Grid, justMoved: Color): boolean => {
    const win = findWin(g, justMoved);
    if (win) {
      setWinLine(win);
      setOver(true);
      if (justMoved === PLAYER) {
        setStatus('You connected four. Win.');
        playSfx('mg_win', 0.9);
        submitOutcome('win', 'You connected four before the byte.');
      } else {
        setStatus('Byte connected four. Loss.');
        playSfx('mg_lose', 0.9);
        submitOutcome('lose', 'Byte connected four. Better luck next round.');
      }
      return true;
    }
    if (isBoardFull(g)) {
      setOver(true);
      setStatus('Board full. Tie.');
      playSfx('mg_draw', 0.85);
      submitOutcome('tie', 'Board full — clean draw.');
      return true;
    }
    return false;
  }, [submitOutcome]);

  // After player moves, byte plays.
  useEffect(() => {
    if (over) return;
    if (turn !== BYTE) return;
    setStatus('Byte is thinking...');
    const t = setTimeout(() => {
      // Snapshot grid so AI sees the latest board.
      setGrid((prev) => {
        const next = prev.map((r) => r.slice());
        const c = chooseAiMove(next, BYTE, difficulty);
        if (c < 0) return prev;
        const placed = applyMove(next, c, BYTE);
        if (!placed) return prev;
        playSfx('mg_tick', 0.45);
        const ended = checkAndResolve(next, BYTE);
        if (!ended) {
          setStatus(`Your turn. ${difficultyLabel(difficulty)}.`);
          setTurn(PLAYER);
        }
        return next;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [turn, over, difficulty, checkAndResolve]);

  const handleColumnTap = useCallback((col: number) => {
    if (over || turn !== PLAYER) return;
    if (lowestEmptyRow(grid, col) < 0) return;
    setGrid((prev) => {
      const next = prev.map((r) => r.slice());
      const placed = applyMove(next, col, PLAYER);
      if (!placed) return prev;
      playSfx('mg_tick', 0.55);
      const ended = checkAndResolve(next, PLAYER);
      if (!ended) {
        setStatus('Byte is thinking...');
        setTurn(BYTE);
      }
      return next;
    });
  }, [over, turn, grid, checkAndResolve]);

  const winSet = useMemo(() => new Set(winLine.map(([r, c]) => `${r},${c}`)), [winLine]);

  return (
    <ArcadeShell
      title="CONNECT 4"
      subtitle="DROP DISCS · WIN THE LINE"
      accent="#ff7a7a"
      status={status}
      result={resultModal}
      onDismissResult={() => setResultModal(null)}
    >
      <View style={styles.boardWrap}>
        <View style={styles.board}>
          {Array.from({ length: ROWS }).map((_, r) => (
            <View key={r} style={styles.row}>
              {Array.from({ length: COLS }).map((_, c) => {
                const cell: Cell = grid[r][c];
                const isWin = winSet.has(`${r},${c}`);
                return (
                  <TouchableOpacity
                    key={c}
                    style={styles.cell}
                    activeOpacity={0.85}
                    onPress={() => handleColumnTap(c)}
                    disabled={over || turn !== PLAYER}
                  >
                    {cell ? (
                      <Animated.View
                        style={[
                          styles.disc,
                          cell === PLAYER ? styles.discPlayer : styles.discByte,
                          isWin ? { opacity: winPulse, shadowOpacity: 0.9 } : null,
                        ]}
                      />
                    ) : (
                      <View style={styles.discEmpty} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.discMini, styles.discPlayer]} />
            <Text style={styles.legendText}>YOU</Text>
            <View style={{ width: 16 }} />
            <View style={[styles.discMini, styles.discByte]} />
            <Text style={styles.legendText}>BYTE</Text>
          </View>
        </View>
      </View>
    </ArcadeShell>
  );
}

const CELL = 42;
const DISC = 34;

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  board: {
    backgroundColor: 'rgba(15,28,72,0.85)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(126,200,255,0.35)',
    padding: 8,
  },
  row:  { flexDirection: 'row' },
  cell: {
    width: CELL, height: CELL,
    alignItems: 'center', justifyContent: 'center',
  },
  disc: {
    width: DISC, height: DISC, borderRadius: DISC / 2,
    shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowRadius: 6,
  },
  discMini: {
    width: 14, height: 14, borderRadius: 7,
  },
  discPlayer: { backgroundColor: '#ff5f6d' },
  discByte:   { backgroundColor: '#ffd84a' },
  discEmpty: {
    width: DISC, height: DISC, borderRadius: DISC / 2,
    backgroundColor: 'rgba(2,8,30,0.7)',
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.15)',
  },
  legend: { marginTop: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  legendText: { color: 'rgba(180,210,255,0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginLeft: 6 },
});
