/**
 * Connect 4 rules module. Pure functions only: no I/O, no timers, no
 * randomness, so the server can run it authoritatively and the client can
 * import the same code for previews and legal-move hints.
 *
 * State shape:
 * {
 *   rows: 6, cols: 7,
 *   board: (0 | 1 | null)[rows][cols]   // row 0 is the TOP row
 *   turn: 0 | 1,                         // seat to move
 *   moveCount: number,
 *   lastMove: { row, col, seat } | null,
 *   winner: 0 | 1 | null,
 *   winLine: [row, col][] | null,
 *   draw: boolean,
 * }
 * Move shape: { col: integer 0..6 }
 */

export const ROWS = 6;
export const COLS = 7;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function findWinLine(board, row, col, seat) {
  for (const [dr, dc] of DIRECTIONS) {
    const cells = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === seat) {
        cells.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function currentSeat(state) {
  return state.winner !== null || state.draw ? null : state.turn;
}

export const connect4 = Object.freeze({
  id: 'connect4',
  seats: 2,

  setup({ startingSeat = 0 } = {}) {
    return {
      rows: ROWS,
      cols: COLS,
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      turn: startingSeat,
      moveCount: 0,
      lastMove: null,
      winner: null,
      winLine: null,
      draw: false,
    };
  },

  currentSeat,

  legalMoves(state) {
    if (currentSeat(state) === null) return [];
    const moves = [];
    for (let col = 0; col < COLS; col++) if (state.board[0][col] === null) moves.push({ col });
    return moves;
  },

  /** Returns null when legal, otherwise a human-readable reason. Turn order is checked by the engine. */
  validateMove(state, move) {
    if (!move || typeof move !== 'object') return 'Move must be an object';
    const { col } = move;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return 'Column out of range';
    if (state.board[0][col] !== null) return 'Column is full';
    return null;
  },

  applyMove(state, { col }, seat) {
    const board = state.board.map((row) => row.slice());
    let row = ROWS - 1;
    while (board[row][col] !== null) row--;
    board[row][col] = seat;
    const winLine = findWinLine(board, row, col, seat);
    const moveCount = state.moveCount + 1;
    return {
      ...state,
      board,
      moveCount,
      lastMove: { row, col, seat },
      winner: winLine ? seat : null,
      winLine,
      draw: !winLine && moveCount === ROWS * COLS,
      turn: 1 - seat,
    };
  },

  outcome(state) {
    if (state.winner !== null) return { winner: state.winner, reason: 'four_in_a_row' };
    if (state.draw) return { winner: null, reason: 'board_full' };
    return null;
  },

  /** Connect 4 has no hidden information, so every viewer sees the full state. */
  view(state) {
    return state;
  },
});
