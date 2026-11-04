/**
 * Reversi (Othello) rules module. Pure functions only.
 *
 * Seat 0 plays Black, seat 1 plays White. Who moves first alternates each
 * match (the room engine passes `startingSeat`); the opening position is
 * symmetric, so either colour may start.
 *
 * State shape:
 * {
 *   size: 8,
 *   board: (0 | 1 | null)[8][8],      // row 0 is the top row
 *   turn: 0 | 1,                       // seat to move
 *   counts: [black, white],
 *   moveCount: number,
 *   lastMove: { r, c, seat, flipped: [r, c][] } | null,
 *   passed: 0 | 1 | null,              // seat that had to pass after the last move
 *   over: boolean,
 * }
 * Move shape: { r: 0..7, c: 0..7 }
 *
 * Passing is automatic: after a move, if the opponent has no legal move but the
 * mover does, the mover goes again and `passed` records who was skipped. If
 * neither side can move (or the board is full) the game ends.
 */

export const SIZE = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** Discs that `seat` would flip by playing (r, c). Empty array = illegal. */
export function flipsFor(board, r, c, seat) {
  if (board[r][c] !== null) return [];
  const other = 1 - seat;
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc) && board[rr][cc] === other) {
      line.push([rr, cc]);
      rr += dr;
      cc += dc;
    }
    if (line.length && inside(rr, cc) && board[rr][cc] === seat) flips.push(...line);
  }
  return flips;
}

function movesFor(board, seat) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (flipsFor(board, r, c, seat).length) moves.push({ r, c });
  }
  return moves;
}

function hasMove(board, seat) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (flipsFor(board, r, c, seat).length) return true;
  }
  return false;
}

function count(board) {
  const counts = [0, 0];
  for (const row of board) for (const v of row) if (v !== null) counts[v] += 1;
  return counts;
}

function currentSeat(state) {
  return state.over ? null : state.turn;
}

export const reversi = Object.freeze({
  id: 'reversi',
  seats: 2,

  setup({ startingSeat = 0 } = {}) {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    board[3][3] = 1;
    board[4][4] = 1;
    board[3][4] = 0;
    board[4][3] = 0;
    return { size: SIZE, board, turn: startingSeat, counts: [2, 2], moveCount: 0, lastMove: null, passed: null, over: false };
  },

  currentSeat,

  legalMoves(state) {
    const seat = currentSeat(state);
    return seat === null ? [] : movesFor(state.board, seat);
  },

  validateMove(state, move, seat) {
    if (!move || typeof move !== 'object') return 'Move must be an object';
    const { r, c } = move;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inside(r, c)) return 'Square out of range';
    if (state.board[r][c] !== null) return 'Square is taken';
    if (!flipsFor(state.board, r, c, seat).length) return 'That move flips nothing';
    return null;
  },

  applyMove(state, { r, c }, seat) {
    const flipped = flipsFor(state.board, r, c, seat);
    const board = state.board.map((row) => row.slice());
    board[r][c] = seat;
    for (const [fr, fc] of flipped) board[fr][fc] = seat;

    const other = 1 - seat;
    let turn = other;
    let passed = null;
    let over = false;
    if (!hasMove(board, other)) {
      if (hasMove(board, seat)) {
        turn = seat;
        passed = other;
      } else {
        over = true;
      }
    }

    return {
      ...state,
      board,
      turn,
      counts: count(board),
      moveCount: state.moveCount + 1,
      lastMove: { r, c, seat, flipped },
      passed,
      over,
    };
  },

  outcome(state) {
    if (!state.over) return null;
    const [black, white] = state.counts;
    if (black === white) return { winner: null, reason: 'equal_discs' };
    return { winner: black > white ? 0 : 1, reason: 'more_discs' };
  },

  view(state) {
    return state;
  },
});
