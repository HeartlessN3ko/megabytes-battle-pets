/**
 * connect4Engine — pure board logic for the v1 ARCADE Connect 4.
 *
 * Grid: 7 columns × 6 rows. Indexed grid[row][col]; row 0 is top, row 5 is
 * bottom. A "drop" lands at the lowest empty row in the chosen column.
 *
 * Cells are 'R' (red, player) | 'Y' (yellow, byte) | null (empty).
 *
 * Difficulty driven by a depth parameter:
 *   - 'easy'   → random legal column
 *   - 'medium' → minimax depth 3
 *   - 'hard'   → minimax depth 5
 *
 * The minimax evaluator scores 4-windows on the board: own pieces in a
 * window add weight, opponent pieces subtract, mixed windows are dead.
 *
 * No DOM. No animation. UI lives in Connect4.tsx.
 */

export type Cell = 'R' | 'Y' | null;
export type Grid = Cell[][];
export type Color = 'R' | 'Y';
export type Difficulty = 'easy' | 'medium' | 'hard';

export const COLS = 7;
export const ROWS = 6;

export function makeEmptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function lowestEmptyRow(grid: Grid, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r][col] === null) return r;
  }
  return -1;
}

export function isColumnFull(grid: Grid, col: number): boolean {
  return grid[0][col] !== null;
}

export function isBoardFull(grid: Grid): boolean {
  for (let c = 0; c < COLS; c++) if (!isColumnFull(grid, c)) return false;
  return true;
}

export function legalColumns(grid: Grid): number[] {
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) if (!isColumnFull(grid, c)) out.push(c);
  return out;
}

export function applyMove(grid: Grid, col: number, color: Color): { row: number; col: number } | null {
  const row = lowestEmptyRow(grid, col);
  if (row < 0) return null;
  grid[row][col] = color;
  return { row, col };
}

export function undoMove(grid: Grid, row: number, col: number) {
  grid[row][col] = null;
}

export type WinLine = [number, number][];

const DIRS: [number, number][] = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diag down-right
  [1, -1],  // diag down-left
];

/**
 * Find a winning line of 4 for the given color, if one exists. Scans every
 * cell as a potential start in every direction. Returns the 4 winning
 * coordinates, or null.
 */
export function findWin(grid: Grid, color: Color): WinLine | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== color) continue;
      for (const [dr, dc] of DIRS) {
        const cells: WinLine = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (grid[nr][nc] !== color) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

function opp(c: Color): Color {
  return c === 'R' ? 'Y' : 'R';
}

/**
 * Score a 4-cell window for the given color.
 * +100  4 own (terminal — caught by win check first, but kept for completeness)
 * + 10  3 own + 1 empty
 * +  3  2 own + 2 empty
 * - 80  3 opp + 1 empty (block urgency — slightly less than own to bias toward attack)
 */
function scoreWindow(window: Cell[], me: Color): number {
  const opponent = opp(me);
  let mine = 0, theirs = 0, empty = 0;
  for (const cell of window) {
    if (cell === me) mine++;
    else if (cell === opponent) theirs++;
    else empty++;
  }
  if (mine > 0 && theirs > 0) return 0; // mixed window can't win for either side
  if (mine === 4) return 1000;
  if (theirs === 4) return -1000;
  if (mine === 3 && empty === 1) return 10;
  if (mine === 2 && empty === 2) return 3;
  if (theirs === 3 && empty === 1) return -8;
  if (theirs === 2 && empty === 2) return -2;
  return 0;
}

export function evaluate(grid: Grid, me: Color): number {
  let total = 0;
  // Center column preference — classic Connect 4 heuristic.
  const center = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (grid[r][center] === me) total += 3;
    else if (grid[r][center] === opp(me)) total -= 3;
  }
  // Every 4-cell window in every direction.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of DIRS) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        const w: Cell[] = [];
        for (let k = 0; k < 4; k++) w.push(grid[r + dr * k][c + dc * k]);
        total += scoreWindow(w, me);
      }
    }
  }
  return total;
}

/**
 * Minimax with alpha-beta pruning. Returns { col, score }.
 * `me` is the side currently choosing; recursion alternates.
 * Terminal: depth 0 OR board full OR a side has won.
 */
function minimax(
  grid: Grid,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  me: Color,
): { col: number | null; score: number } {
  const ai = maximizing ? me : opp(me);
  // Check terminal: a winning position by either side already on the board.
  if (findWin(grid, me)) return { col: null, score: 100000 + depth };
  if (findWin(grid, opp(me))) return { col: null, score: -100000 - depth };
  if (depth === 0 || isBoardFull(grid)) return { col: null, score: evaluate(grid, me) };

  const cols = legalColumns(grid);
  // Center-out ordering improves pruning.
  cols.sort((a, b) => Math.abs(Math.floor(COLS / 2) - a) - Math.abs(Math.floor(COLS / 2) - b));

  let bestCol: number | null = cols[0] ?? null;
  if (maximizing) {
    let best = -Infinity;
    for (const c of cols) {
      const placed = applyMove(grid, c, ai);
      if (!placed) continue;
      const { score } = minimax(grid, depth - 1, alpha, beta, false, me);
      undoMove(grid, placed.row, placed.col);
      if (score > best) { best = score; bestCol = c; }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: best };
  } else {
    let worst = Infinity;
    for (const c of cols) {
      const placed = applyMove(grid, c, ai);
      if (!placed) continue;
      const { score } = minimax(grid, depth - 1, alpha, beta, true, me);
      undoMove(grid, placed.row, placed.col);
      if (score < worst) { worst = score; bestCol = c; }
      beta = Math.min(beta, score);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: worst };
  }
}

/**
 * Pick a column for the AI to play. `color` is the AI's piece color.
 * easy   → uniform random over legal columns
 * medium → minimax depth 3
 * hard   → minimax depth 5
 *
 * Always returns a legal column when one exists, or -1 on a full board.
 */
export function chooseAiMove(grid: Grid, color: Color, difficulty: Difficulty): number {
  const cols = legalColumns(grid);
  if (cols.length === 0) return -1;

  // Tactical short-circuit: take an immediate win, block an immediate loss.
  // Skipped on 'easy' to give the player a fighting chance against careless plays.
  if (difficulty !== 'easy') {
    for (const c of cols) {
      const placed = applyMove(grid, c, color);
      if (placed) {
        const won = findWin(grid, color);
        undoMove(grid, placed.row, placed.col);
        if (won) return c;
      }
    }
    const them = opp(color);
    for (const c of cols) {
      const placed = applyMove(grid, c, them);
      if (placed) {
        const lost = findWin(grid, them);
        undoMove(grid, placed.row, placed.col);
        if (lost) return c;
      }
    }
  }

  if (difficulty === 'easy') {
    return cols[Math.floor(Math.random() * cols.length)];
  }

  const depth = difficulty === 'hard' ? 5 : 3;
  // Make a deep copy so minimax mutations don't leak (though it does
  // restore via undoMove, defensive copy is cheap and avoids any reentrancy).
  const work = grid.map((row) => row.slice());
  const { col } = minimax(work, depth, -Infinity, Infinity, true, color);
  if (col != null && cols.includes(col)) return col;
  return cols[Math.floor(Math.random() * cols.length)];
}
