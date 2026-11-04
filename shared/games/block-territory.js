/**
 * Block Territory (ブロック陣取り) rules module. Pure functions only. Two players.
 *
 * 14×14 board. Each player owns the same 21 pieces (polyominoes of 1–5
 * squares, 89 squares in total). Seat 0 starts on (4,4), seat 1 on (9,9).
 *  - Your first piece must cover your starting square.
 *  - Every later piece must touch one of your own pieces at a corner, and may
 *    never share an edge with your own pieces. Touching the opponent is fine.
 *  - Each piece is used once. A player who cannot place anything is skipped;
 *    the game ends when neither player can place.
 *  - Most squares covered wins.
 *
 * State shape:
 * {
 *   size: 14,
 *   board: (0 | 1 | null)[14][14],
 *   remaining: [pieceId[], pieceId[]],   // pieces each seat still holds
 *   placedFirst: [boolean, boolean],
 *   turn: 0 | 1,
 *   counts: [squares0, squares1],
 *   moveCount: number,
 *   lastMove: { seat, piece, cells: [r, c][] } | null,
 *   skipped: seat[],                     // seats skipped after the last move
 *   over: boolean,
 * }
 * Move shape: { piece: pieceId, cells: [r, c][] }
 *   Absolute board cells. The server checks they form that piece in one of its
 *   (up to 8) rotations/reflections, so clients can rotate however they like.
 */

export const SIZE = 14;
export const STARTS = Object.freeze([[4, 4], [9, 9]]);

/** The 21 standard pieces as [row, col] cells. */
export const PIECES = Object.freeze({
  1: [[0, 0]],
  2: [[0, 0], [0, 1]],
  I3: [[0, 0], [0, 1], [0, 2]],
  V3: [[0, 0], [1, 0], [1, 1]],
  I4: [[0, 0], [0, 1], [0, 2], [0, 3]],
  L4: [[0, 0], [1, 0], [2, 0], [2, 1]],
  T4: [[0, 0], [0, 1], [0, 2], [1, 1]],
  O4: [[0, 0], [0, 1], [1, 0], [1, 1]],
  S4: [[0, 1], [0, 2], [1, 0], [1, 1]],
  F: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
  I5: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  L5: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]],
  N: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]],
  P: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
  T5: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
  U: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]],
  V5: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  W: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
  X: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  Y: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]],
  Z5: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]],
});
export const PIECE_IDS = Object.freeze(Object.keys(PIECES));

/** Shift cells so the minimum row and column are 0, sorted, as a stable key. */
export function normalize(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const keyOf = (cells) => normalize(cells).map(([r, c]) => `${r}.${c}`).join('|');

/** Rotate 90° clockwise `k` times, optionally mirroring first. */
export function transform(cells, k = 0, flip = false) {
  let out = flip ? cells.map(([r, c]) => [r, -c]) : cells.map(([r, c]) => [r, c]);
  for (let i = 0; i < k; i++) out = out.map(([r, c]) => [c, -r]);
  return normalize(out);
}

/** Distinct orientations of every piece (91 in total). */
export const ORIENTATIONS = Object.freeze(
  Object.fromEntries(
    PIECE_IDS.map((id) => {
      const seen = new Map();
      for (const flip of [false, true]) for (let k = 0; k < 4; k++) {
        const t = transform(PIECES[id], k, flip);
        seen.set(keyOf(t), t);
      }
      return [id, [...seen.values()]];
    }),
  ),
);
const ORIENT_KEYS = Object.fromEntries(PIECE_IDS.map((id) => [id, new Set(ORIENTATIONS[id].map(keyOf))]));

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const EDGES = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const CORNERS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Why `cells` can't be placed by `seat` (geometry only), or null if fine. */
function placementProblem(state, seat, cells) {
  const { board } = state;
  for (const [r, c] of cells) {
    if (!inside(r, c)) return 'Off the board';
    if (board[r][c] !== null) return 'Square is taken';
    for (const [dr, dc] of EDGES) {
      if (inside(r + dr, c + dc) && board[r + dr][c + dc] === seat) return 'Your own pieces may only touch at corners';
    }
  }
  if (!state.placedFirst[seat]) {
    const [sr, sc] = STARTS[seat];
    return cells.some(([r, c]) => r === sr && c === sc) ? null : 'Your first piece must cover your starting square';
  }
  const touchesCorner = cells.some(([r, c]) =>
    CORNERS.some(([dr, dc]) => inside(r + dr, c + dc) && board[r + dr][c + dc] === seat),
  );
  return touchesCorner ? null : 'Must touch one of your pieces at a corner';
}

/** Empty cells a new piece of `seat` could build from (its "corner" spots). */
export function anchorCells(state, seat) {
  if (!state.placedFirst[seat]) {
    const [r, c] = STARTS[seat];
    return state.board[r][c] === null ? [[r, c]] : [];
  }
  const out = [];
  const { board } = state;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) continue;
      if (EDGES.some(([dr, dc]) => inside(r + dr, c + dc) && board[r + dr][c + dc] === seat)) continue;
      if (CORNERS.some(([dr, dc]) => inside(r + dr, c + dc) && board[r + dr][c + dc] === seat)) out.push([r, c]);
    }
  }
  return out;
}

/** Every legal placement for `seat`, or stop at the first one when `firstOnly`. */
function placements(state, seat, firstOnly = false) {
  const anchors = anchorCells(state, seat);
  const found = [];
  const seen = new Set();
  for (const id of state.remaining[seat]) {
    for (const shape of ORIENTATIONS[id]) {
      for (const [ar, ac] of anchors) {
        // Try every cell of the shape on the anchor square.
        for (const [pr, pc] of shape) {
          const cells = shape.map(([r, c]) => [r - pr + ar, c - pc + ac]);
          const key = `${id}:${cells.map(([r, c]) => r * SIZE + c).sort((a, b) => a - b).join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!placementProblem(state, seat, cells)) {
            found.push({ piece: id, cells });
            if (firstOnly) return found;
          }
        }
      }
    }
  }
  return found;
}

const canPlace = (state, seat) => placements(state, seat, true).length > 0;

function isCellList(cells) {
  return (
    Array.isArray(cells) &&
    cells.length >= 1 &&
    cells.length <= 5 &&
    cells.every((x) => Array.isArray(x) && x.length === 2 && Number.isInteger(x[0]) && Number.isInteger(x[1]))
  );
}

function validateMove(state, move, seat) {
  if (!move || typeof move !== 'object') return 'Move must be an object';
  const { piece, cells } = move;
  if (typeof piece !== 'string' || !Object.prototype.hasOwnProperty.call(PIECES, piece)) return 'Unknown piece';
  if (!state.remaining[seat].includes(piece)) return 'You have already used that piece';
  if (!isCellList(cells) || cells.length !== PIECES[piece].length) return 'Wrong number of squares for that piece';
  if (new Set(cells.map(([r, c]) => `${r},${c}`)).size !== cells.length) return 'Squares must be distinct';
  if (!ORIENT_KEYS[piece].has(keyOf(cells))) return 'Those squares do not form that piece';
  return placementProblem(state, seat, cells);
}

export const blockTerritory = Object.freeze({
  id: 'block-territory',
  seats: 2,

  setup({ startingSeat = 0 } = {}) {
    return {
      size: SIZE,
      board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
      remaining: [[...PIECE_IDS], [...PIECE_IDS]],
      placedFirst: [false, false],
      turn: startingSeat,
      counts: [0, 0],
      moveCount: 0,
      lastMove: null,
      skipped: [],
      over: false,
    };
  },

  currentSeat(state) {
    return state.over ? null : state.turn;
  },

  legalMoves(state) {
    return state.over ? [] : placements(state, state.turn);
  },

  /** Client hint: why this placement is illegal for the side to move, or null. */
  check(state, move) {
    return validateMove(state, move, state.turn);
  },

  validateMove,

  applyMove(state, { piece, cells }, seat) {
    const board = state.board.map((row) => row.slice());
    for (const [r, c] of cells) board[r][c] = seat;
    const remaining = state.remaining.map((list, s) => (s === seat ? list.filter((id) => id !== piece) : list));
    const placedFirst = state.placedFirst.map((v, s) => v || s === seat);
    const counts = state.counts.map((n, s) => (s === seat ? n + cells.length : n));
    const next = { ...state, board, remaining, placedFirst, counts, moveCount: state.moveCount + 1, lastMove: { seat, piece, cells }, skipped: [] };

    const other = 1 - seat;
    if (canPlace(next, other)) return { ...next, turn: other };
    if (canPlace(next, seat)) return { ...next, turn: seat, skipped: [other] };
    return { ...next, over: true, skipped: [] };
  },

  outcome(state) {
    if (!state.over) return null;
    const [a, b] = state.counts;
    if (a === b) return { winner: null, reason: 'equal_squares' };
    return { winner: a > b ? 0 : 1, reason: 'more_squares' };
  },

  view(state) {
    return state;
  },
});
