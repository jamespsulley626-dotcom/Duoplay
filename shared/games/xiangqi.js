/**
 * Chinese Chess (Xiangqi) rules module. Pure functions only.
 *
 * Board: 10 rows × 9 files of intersections. Row 0 is Black's back rank (top),
 * row 9 is Red's back rank (bottom). Red always moves first; the seat that
 * starts the match (`startingSeat`, alternated by the engine) plays Red.
 *
 * Pieces are 2-char strings: side ('r' | 'b') + type:
 *   k general  a advisor  e elephant  h horse  r chariot  c cannon  p soldier
 *
 * State shape:
 * {
 *   rows: 10, cols: 9,
 *   board: (string | null)[10][9],
 *   red: 0 | 1,                     // seat playing Red
 *   turn: 0 | 1,                    // seat to move
 *   moveCount: number,
 *   quiet: number,                  // plies since the last capture
 *   lastMove: { from: [r,c], to: [r,c], piece, captured } | null,
 *   check: boolean,                 // side to move is in check
 *   result: { winner, reason } | null,
 * }
 * Move shape: { from: [r, c], to: [r, c] }
 *
 * Endings: checkmate or stalemate (no legal move) loses. Draw after 120 plies
 * without a capture, or 400 plies total. Perpetual-check/chase rulings are not
 * implemented (players can resign or agree via chat).
 */

export const ROWS = 10;
export const COLS = 9;
export const QUIET_LIMIT = 120;
export const MOVE_LIMIT = 400;

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
// Horse: [leg offset, destination offset]
const HORSE = [
  [[-1, 0], [-2, -1]], [[-1, 0], [-2, 1]],
  [[1, 0], [2, -1]], [[1, 0], [2, 1]],
  [[0, -1], [-1, -2]], [[0, -1], [1, -2]],
  [[0, 1], [-1, 2]], [[0, 1], [1, 2]],
];

const inside = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const inPalace = (side, r, c) => c >= 3 && c <= 5 && (side === 'r' ? r >= 7 : r <= 2);
const ownHalf = (side, r) => (side === 'r' ? r >= 5 : r <= 4);
const sideOf = (state, seat) => (seat === state.red ? 'r' : 'b');
const enemy = (side) => (side === 'r' ? 'b' : 'r');

export function initialBoard() {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const back = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'];
  back.forEach((t, c) => {
    b[0][c] = `b${t}`;
    b[9][c] = `r${t}`;
  });
  for (const c of [1, 7]) {
    b[2][c] = 'bc';
    b[7][c] = 'rc';
  }
  for (const c of [0, 2, 4, 6, 8]) {
    b[3][c] = 'bp';
    b[6][c] = 'rp';
  }
  return b;
}

/**
 * Destinations for the piece at (r, c) ignoring self-check. These double as
 * "attacked squares" for check detection (a cannon's captures included).
 */
function pseudoTargets(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const side = piece[0];
  const type = piece[1];
  const out = [];
  const canLand = (rr, cc) => inside(rr, cc) && board[rr][cc]?.[0] !== side;

  switch (type) {
    case 'k':
      for (const [dr, dc] of ORTHO) {
        const rr = r + dr;
        const cc = c + dc;
        if (inPalace(side, rr, cc) && canLand(rr, cc)) out.push([rr, cc]);
      }
      break;
    case 'a':
      for (const [dr, dc] of DIAG) {
        const rr = r + dr;
        const cc = c + dc;
        if (inPalace(side, rr, cc) && canLand(rr, cc)) out.push([rr, cc]);
      }
      break;
    case 'e':
      for (const [dr, dc] of DIAG) {
        const rr = r + 2 * dr;
        const cc = c + 2 * dc;
        if (inside(rr, cc) && ownHalf(side, rr) && board[r + dr][c + dc] === null && canLand(rr, cc)) out.push([rr, cc]);
      }
      break;
    case 'h':
      for (const [[lr, lc], [dr, dc]] of HORSE) {
        if (!inside(r + lr, c + lc) || board[r + lr][c + lc] !== null) continue; // hobbled
        const rr = r + dr;
        const cc = c + dc;
        if (canLand(rr, cc)) out.push([rr, cc]);
      }
      break;
    case 'r':
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc)) {
          if (board[rr][cc] === null) out.push([rr, cc]);
          else {
            if (board[rr][cc][0] !== side) out.push([rr, cc]);
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
      break;
    case 'c':
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc) && board[rr][cc] === null) {
          out.push([rr, cc]);
          rr += dr;
          cc += dc;
        }
        // Jump exactly one screen to capture.
        rr += dr;
        cc += dc;
        while (inside(rr, cc)) {
          if (board[rr][cc] !== null) {
            if (board[rr][cc][0] !== side) out.push([rr, cc]);
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
      break;
    case 'p': {
      const fwd = side === 'r' ? -1 : 1;
      if (canLand(r + fwd, c)) out.push([r + fwd, c]);
      if (!ownHalf(side, r)) {
        if (canLand(r, c - 1)) out.push([r, c - 1]);
        if (canLand(r, c + 1)) out.push([r, c + 1]);
      }
      break;
    }
    default:
      break;
  }
  return out;
}

function findGeneral(board, side) {
  for (let r = 0; r < ROWS; r++) for (let c = 3; c <= 5; c++) if (board[r][c] === `${side}k`) return [r, c];
  return null;
}

/** Is `side`'s general attacked (including the two generals facing each other)? */
export function inCheck(board, side) {
  const g = findGeneral(board, side);
  if (!g) return true;
  const [gr, gc] = g;
  // Flying general: nothing between the generals on the same file.
  const step = side === 'r' ? -1 : 1;
  for (let r = gr + step; r >= 0 && r < ROWS; r += step) {
    const p = board[r][gc];
    if (p === null) continue;
    if (p === `${enemy(side)}k`) return true;
    break;
  }
  const foe = enemy(side);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]?.[0] !== foe) continue;
      for (const [tr, tc] of pseudoTargets(board, r, c)) if (tr === gr && tc === gc) return true;
    }
  }
  return false;
}

function play(board, [fr, fc], [tr, tc]) {
  const next = board.map((row) => row.slice());
  next[tr][tc] = next[fr][fc];
  next[fr][fc] = null;
  return next;
}

/** Legal destinations for the piece at (r, c), if it belongs to `side`. */
function legalTargets(board, r, c, side) {
  if (board[r][c]?.[0] !== side) return [];
  return pseudoTargets(board, r, c).filter((to) => !inCheck(play(board, [r, c], to), side));
}

function hasLegalMove(board, side) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (board[r][c]?.[0] === side && legalTargets(board, r, c, side).length) return true;
  }
  return false;
}

const isSquare = (sq) => Array.isArray(sq) && sq.length === 2 && Number.isInteger(sq[0]) && Number.isInteger(sq[1]) && inside(sq[0], sq[1]);

export const xiangqi = Object.freeze({
  id: 'xiangqi',
  seats: 2,

  setup({ startingSeat = 0 } = {}) {
    return {
      rows: ROWS,
      cols: COLS,
      board: initialBoard(),
      red: startingSeat,
      turn: startingSeat,
      moveCount: 0,
      quiet: 0,
      lastMove: null,
      check: false,
      result: null,
    };
  },

  currentSeat(state) {
    return state.result ? null : state.turn;
  },

  /** Hint helper for the client: legal destinations from one square for the side to move. */
  targetsFrom(state, r, c) {
    if (state.result || !inside(r, c)) return [];
    return legalTargets(state.board, r, c, sideOf(state, state.turn));
  },

  legalMoves(state) {
    if (state.result) return [];
    const side = sideOf(state, state.turn);
    const moves = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (const to of legalTargets(state.board, r, c, side)) moves.push({ from: [r, c], to });
      }
    }
    return moves;
  },

  validateMove(state, move, seat) {
    if (!move || typeof move !== 'object') return 'Move must be an object';
    const { from, to } = move;
    if (!isSquare(from) || !isSquare(to)) return 'Square out of range';
    const side = sideOf(state, seat);
    const piece = state.board[from[0]][from[1]];
    if (!piece) return 'No piece there';
    if (piece[0] !== side) return 'That is not your piece';
    const pseudo = pseudoTargets(state.board, from[0], from[1]);
    if (!pseudo.some(([r, c]) => r === to[0] && c === to[1])) return 'That piece cannot move there';
    if (inCheck(play(state.board, from, to), side)) return 'That would leave your general in check';
    return null;
  },

  applyMove(state, { from, to }, seat) {
    const side = sideOf(state, seat);
    const piece = state.board[from[0]][from[1]];
    const captured = state.board[to[0]][to[1]];
    const board = play(state.board, from, to);
    const next = 1 - seat;
    const nextSide = enemy(side);
    const moveCount = state.moveCount + 1;
    const quiet = captured ? 0 : state.quiet + 1;
    const check = inCheck(board, nextSide);

    let result = null;
    if (!hasLegalMove(board, nextSide)) result = { winner: seat, reason: check ? 'checkmate' : 'stalemate' };
    else if (quiet >= QUIET_LIMIT) result = { winner: null, reason: 'no_capture' };
    else if (moveCount >= MOVE_LIMIT) result = { winner: null, reason: 'move_limit' };

    return {
      ...state,
      board,
      turn: next,
      moveCount,
      quiet,
      lastMove: { from, to, piece, captured },
      check,
      result,
    };
  },

  outcome(state) {
    return state.result;
  },

  view(state) {
    return state;
  },
});
