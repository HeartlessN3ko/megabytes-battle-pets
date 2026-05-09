/**
 * ArcadeMinesweeper — "BYTE HUNT" reskin of classic minesweeper.
 *
 * 6×6 grid, 6 viruses. First-tap safety: viruses are placed AFTER the first
 * tap, avoiding the tapped cell + its 8 neighbors so the player always gets
 * a flood-reveal start (avoids instant-loss frustration). Win = all
 * non-virus tiles revealed (the simpler win condition recommended by the
 * design doc — no flagging required).
 *
 * Visuals: viruses are 🦠, safe revealed tiles show the count of adjacent
 * viruses (0 → blank, fills via flood-reveal cascade). Hit a virus → lose.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArcadeShell, ArcadeResultModalState } from './ArcadeShell';
import { arcadeReward } from '../../../services/api';
import { previewReward, ArcadeOutcome } from './helpers/arcadeRewards';
import { TUNABLES } from '../../../config/tunables';
import { playSfx } from '../../../services/sfx';

type Cell = {
  isVirus: boolean;
  revealed: boolean;
  adjacent: number;
};

const COLS = TUNABLES.arcade.MINESWEEPER_COLS;
const ROWS = TUNABLES.arcade.MINESWEEPER_ROWS;
const VIRUSES = TUNABLES.arcade.MINESWEEPER_VIRUSES;

function makeEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ isVirus: false, revealed: false, adjacent: 0 }))
  );
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function neighborsOf(r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) out.push([nr, nc]);
    }
  }
  return out;
}

function placeVirusesAvoiding(board: Cell[][], avoidR: number, avoidC: number): void {
  const banned = new Set<string>();
  banned.add(`${avoidR},${avoidC}`);
  for (const [nr, nc] of neighborsOf(avoidR, avoidC)) banned.add(`${nr},${nc}`);

  let placed = 0;
  let safety = 1000;
  while (placed < VIRUSES && safety-- > 0) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    const key = `${r},${c}`;
    if (banned.has(key)) continue;
    if (board[r][c].isVirus) continue;
    board[r][c].isVirus = true;
    placed++;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].isVirus) continue;
      let count = 0;
      for (const [nr, nc] of neighborsOf(r, c)) if (board[nr][nc].isVirus) count++;
      board[r][c].adjacent = count;
    }
  }
}

function floodReveal(board: Cell[][], r: number, c: number): void {
  const stack: [number, number][] = [[r, c]];
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
    const cell = board[cr][cc];
    if (cell.revealed || cell.isVirus) continue;
    cell.revealed = true;
    if (cell.adjacent === 0) {
      for (const [nr, nc] of neighborsOf(cr, cc)) {
        if (!board[nr][nc].revealed && !board[nr][nc].isVirus) stack.push([nr, nc]);
      }
    }
  }
}

function allSafeRevealed(board: Cell[][]): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!board[r][c].isVirus && !board[r][c].revealed) return false;
    }
  }
  return true;
}

export function ArcadeMinesweeper() {
  const [board, setBoard] = useState<Cell[][]>(() => makeEmptyBoard());
  const [seeded, setSeeded] = useState(false);
  const [over, setOver] = useState(false);
  const [reveals, setReveals] = useState(0);
  const [status, setStatus] = useState(`Find all ${ROWS * COLS - VIRUSES} safe tiles. Avoid ${VIRUSES} viruses.`);
  const [resultModal, setResultModal] = useState<ArcadeResultModalState | null>(null);
  const submittedRef = useRef(false);

  const submitOutcome = useCallback(async (outcome: ArcadeOutcome, message: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r: any = await arcadeReward(outcome, 'minesweeper');
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

  const onTap = useCallback((r: number, c: number) => {
    if (over) return;
    setBoard((prev) => {
      const next = prev.map((row) => row.map((cell) => ({ ...cell })));
      // First-tap safety: place viruses avoiding (r,c) and neighbors.
      if (!seeded) {
        placeVirusesAvoiding(next, r, c);
      }
      const cell = next[r][c];
      if (cell.revealed) return prev;
      if (cell.isVirus) {
        cell.revealed = true;
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) if (next[rr][cc].isVirus) next[rr][cc].revealed = true;
        }
        setOver(true);
        setStatus('Virus hit. Run terminated.');
        playSfx('mg_lose', 0.85);
        submitOutcome('lose', 'You tapped a virus. Better luck next scan.');
        return next;
      }
      floodReveal(next, r, c);
      let n = 0;
      for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (next[rr][cc].revealed && !next[rr][cc].isVirus) n++;
      setReveals(n);
      playSfx('mg_tick', 0.4);
      if (allSafeRevealed(next)) {
        setOver(true);
        setStatus('All safe tiles cleared. Win.');
        playSfx('mg_win', 0.9);
        submitOutcome('win', `Cleared all ${ROWS * COLS - VIRUSES} safe tiles without hitting a virus.`);
      } else {
        setStatus(`Safe: ${n} / ${ROWS * COLS - VIRUSES}`);
      }
      return next;
    });
    if (!seeded) setSeeded(true);
  }, [over, seeded, submitOutcome]);

  const safeTotal = ROWS * COLS - VIRUSES;
  const progressLine = useMemo(() => `Safe: ${reveals} / ${safeTotal}`, [reveals, safeTotal]);

  return (
    <ArcadeShell
      title="BYTE HUNT"
      subtitle="FIND BYTES · DODGE VIRUSES"
      accent="#9df4a6"
      status={over ? status : progressLine}
      result={resultModal}
      onDismissResult={() => setResultModal(null)}
    >
      <View style={styles.board}>
        {board.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((cell, c) => (
              <TouchableOpacity
                key={c}
                onPress={() => onTap(r, c)}
                activeOpacity={0.85}
                style={[
                  styles.cell,
                  cell.revealed ? styles.cellRevealed : styles.cellHidden,
                  cell.revealed && cell.isVirus ? styles.cellVirus : null,
                ]}
                disabled={over}
              >
                {cell.revealed ? (
                  cell.isVirus ? (
                    <Text style={styles.cellGlyph}>🦠</Text>
                  ) : cell.adjacent > 0 ? (
                    <Text style={[styles.cellNumber, numColor(cell.adjacent)]}>{cell.adjacent}</Text>
                  ) : null
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </ArcadeShell>
  );
}

function numColor(n: number) {
  if (n >= 4) return { color: '#ff7a7a' };
  if (n === 3) return { color: '#ffe08b' };
  if (n === 2) return { color: '#9df4a6' };
  return { color: '#9bd7ff' };
}

const SIZE = 44;

const styles = StyleSheet.create({
  board: {
    backgroundColor: 'rgba(15,28,72,0.85)',
    padding: 6, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(126,200,255,0.3)',
  },
  row: { flexDirection: 'row' },
  cell: {
    width: SIZE, height: SIZE,
    margin: 2, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  cellHidden: {
    backgroundColor: '#26345f',
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.18)',
  },
  cellRevealed: {
    backgroundColor: 'rgba(8,16,52,0.85)',
    borderWidth: 1, borderColor: 'rgba(126,200,255,0.10)',
  },
  cellVirus: {
    backgroundColor: 'rgba(120,30,40,0.6)',
    borderColor: 'rgba(255,107,107,0.5)',
  },
  cellNumber: { fontSize: 14, fontWeight: '900' },
  cellGlyph:  { fontSize: 18 },
});
