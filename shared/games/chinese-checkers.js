/**
 * Chinese Checkers (跳棋 / 波子棋, Sternhalma) rules module. Pure functions only.
 * Supports 2–6 players.
 *
 * Geometry: cube coordinates (q, r, s) with q + r + s = 0. A cell is on the
 * star when at least two of its coordinates lie in [-4, 4]: the 61-cell
 * hexagon plus six 10-cell points = 121 cells. Cells are indexed 0..120.
 *
 * Points (triangles), clockwise from the top in a pointy-top layout:
 *   0 top (r < -4)   1 upper-right (q > 4)   2 lower-right (s < -4)
 *   3 bottom (r > 4) 4 lower-left (q < -4)   5 upper-left (s > 4)
 * Each player starts in a home point and races to fill the opposite one.
 *
 * State shape:
 * {
 *   players: 2..6,
 *   homes: point[],                // homes[seat]
 *   board: (seat | null)[121],
 *   turn: seat,
 *   out: seat[],                   // eliminated (resigned / timed out / left); marbles stay
 *   moveCount: number,
 *   lastMove: { seat, from, to, path: cell[] } | null,
 *   skipped: seat[],               // seats with no legal move, skipped after the last move
 *   result: { winner, reason } | null,
 * }
 * Move shape: { from: cell, to: cell } — the server finds the step or hop chain.
 *
 * Win: every cell of your target point is occupied, each by your marble or by
 * a marble of the player whose home it is (so an opponent who never leaves
 * home can't block you). First to finish wins.
 */

export const LAYOUTS = Object.freeze({
  2: [0, 3],
  3: [0, 2, 4],
  4: [1, 2, 4, 5],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
});
export const MOVES_PER_PLAYER_LIMIT = 200;

const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function pointOf(q, r) {
  const s = -q - r;
  if (r < -4) return 0;
  if (q > 4) return 1;
  if (s < -4) return 2;
  if (r > 4) return 3;
  if (q < -4) return 4;
  if (s > 4) return 5;
  return null;
}

/** All 121 cells as { q, r, point }, sorted top-to-bottom, left-to-right. */
export const CELLS = (() => {
  const cells = [];
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const s = -q - r;
      const inRange = [q, r, s].filter((v) => Math.abs(v) <= 4).length;
      if (Math.abs(s) <= 8 && inRange >= 2) cells.push({ q, r, point: pointOf(q, r) });
    }
  }
  return Object.freeze(cells);
})();

const INDEX = new Map(CELLS.map((c, i) => [`${c.q},${c.r}`, i]));
const at = (q, r) => INDEX.get(`${q},${r}`) ?? -1;
export const POINT_CELLS = Object.freeze([0, 1, 2, 3, 4, 5].map((p) => CELLS.flatMap((c, i) => (c.point === p ? [i] : []))));

// Precomputed neighbours: NEIGHBOR[i][d] = adjacent cell, JUMP[i][d] = landing two steps away.
const NEIGHBOR = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => at(q + dq, r + dr)));
const JUMP = CELLS.map(({ q, r }) => DIRS.map(([dq, dr]) => at(q + 2 * dq, r + 2 * dr)));

const target = (state, seat) => (state.homes[seat] + 3) % 6;

/**
 * Every destination reachable from `from` this turn, mapped to its path.
 * Either one step to an adjacent empty cell, or any chain of hops over a single
 * adjacent marble (any colour) into the empty cell directly beyond.
 */
export function reachable(board, from) {
  const paths = new Map();
  const b = board.slice();
  b[from] = null; // the moving marble has left its cell
  for (let d = 0; d < 6; d++) {
    const n = NEIGHBOR[from][d];
    if (n !== -1 && b[n] === null) paths.set(n, [from, n]);
  }
  const queue = [[from, [from]]];
  const seen = new Set([from]);
  while (queue.length) {
    const [cell, path] = queue.shift();
    for (let d = 0; d < 6; d++) {
      const over = NEIGHBOR[cell][d];
      const land = JUMP[cell][d];
      if (over === -1 || land === -1 || b[over] === null || b[land] !== null || seen.has(land)) continue;
      seen.add(land);
      const p = [...path, land];
      if (!paths.has(land)) paths.set(land, p); // a hop chain can end next to `from`; keep the simple step

      queue.push([land, p]);
    }
  }
  paths.delete(from);
  return paths;
}

function hasMove(board, seat) {
  for (let i = 0; i < board.length; i++) if (board[i] === seat && reachable(board, i).size) return true;
  return false;
}

function hasFinished(state, board, seat) {
  const t = target(state, seat);
  const owner = state.homes.indexOf(t); // seat whose home is my target, or -1
  let mine = 0;
  for (const i of POINT_CELLS[t]) {
    const v = board[i];
    if (v === null) return false;
    if (v === seat) mine += 1;
    else if (v !== owner) return false;
  }
  return mine > 0;
}

/** Next seat that is still in and can move; returns { turn, skipped } or null if nobody can move. */
function nextTurn(state, board, fromSeat) {
  const skipped = [];
  for (let k = 1; k <= state.players; k++) {
    const seat = (fromSeat + k) % state.players;
    if (state.out.includes(seat)) continue;
    if (hasMove(board, seat)) return { turn: seat, skipped };
    skipped.push(seat);
  }
  return null;
}

const isCell = (v) => Number.isInteger(v) && v >= 0 && v < CELLS.length;

export const chineseCheckers = Object.freeze({
  id: 'chinese-checkers',
  seats: 2, // default
  seatOptions: [2, 3, 4, 5, 6],

  setup({ startingSeat = 0, seats = 2 } = {}) {
    const homes = LAYOUTS[seats];
    if (!homes) throw new Error(`Chinese Checkers supports 2–6 players, not ${seats}`);
    const board = Array(CELLS.length).fill(null);
    homes.forEach((p, seat) => {
      for (const i of POINT_CELLS[p]) board[i] = seat;
    });
    return { players: seats, homes, board, turn: startingSeat % seats, out: [], moveCount: 0, lastMove: null, skipped: [], result: null };
  },

  currentSeat(state) {
    return state.result ? null : state.turn;
  },

  /** Hint helper for the client: destinations (with paths) from one cell. */
  reachableFrom(state, cell) {
    if (state.result || !isCell(cell) || state.board[cell] !== state.turn) return new Map();
    return reachable(state.board, cell);
  },

  legalMoves(state) {
    if (state.result) return [];
    const moves = [];
    state.board.forEach((v, from) => {
      if (v === state.turn) for (const to of reachable(state.board, from).keys()) moves.push({ from, to });
    });
    return moves;
  },

  validateMove(state, move, seat) {
    if (!move || typeof move !== 'object') return 'Move must be an object';
    const { from, to } = move;
    if (!isCell(from) || !isCell(to)) return 'Cell out of range';
    if (state.board[from] !== seat) return 'That is not your marble';
    if (!reachable(state.board, from).has(to)) return 'That marble cannot reach there';
    return null;
  },

  applyMove(state, { from, to }, seat) {
    const path = reachable(state.board, from).get(to);
    const board = state.board.slice();
    board[from] = null;
    board[to] = seat;
    const moveCount = state.moveCount + 1;
    const base = { ...state, board, moveCount, lastMove: { seat, from, to, path }, skipped: [] };

    if (hasFinished(state, board, seat)) return { ...base, result: { winner: seat, reason: 'filled_target' } };
    if (moveCount >= MOVES_PER_PLAYER_LIMIT * state.players) return { ...base, result: { winner: null, reason: 'move_limit' } };
    const next = nextTurn(state, board, seat);
    if (!next) return { ...base, result: { winner: null, reason: 'no_moves' } };
    return { ...base, turn: next.turn, skipped: next.skipped };
  },

  /** A player leaves the race (resign / timeout / left). Their marbles stay as obstacles. */
  eliminate(state, seat) {
    if (state.result || state.out.includes(seat)) return state;
    const out = [...state.out, seat];
    const active = [...Array(state.players).keys()].filter((s) => !out.includes(s));
    if (active.length === 1) return { ...state, out, result: { winner: active[0], reason: 'last_player' } };
    let { turn, skipped } = state;
    if (turn === seat) {
      const next = nextTurn({ ...state, out }, state.board, seat);
      if (!next) return { ...state, out, result: { winner: null, reason: 'no_moves' } };
      ({ turn, skipped } = next);
    }
    return { ...state, out, turn, skipped };
  },

  outcome(state) {
    return state.result;
  },

  view(state) {
    return state;
  },
});
