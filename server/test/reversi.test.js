import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGame } from '@duoplay/shared';
import { RoomService } from '../src/rooms/RoomService.js';
import { MemoryRoomStore } from '../src/store/MemoryRoomStore.js';

const rv = getGame('reversi');
const key = (m) => `${m.r},${m.c}`;

/** Build a state from an 8-line picture: B = seat 0, W = seat 1, . = empty. */
function fromPicture(rows, turn = 0) {
  const board = rows.map((line) => [...line].map((ch) => (ch === 'B' ? 0 : ch === 'W' ? 1 : null)));
  const s = rv.setup();
  return { ...s, board, turn, counts: [0, 0] };
}

test('opening: 2+2 discs, Black has the 4 standard moves', () => {
  const s = rv.setup();
  assert.deepEqual(s.counts, [2, 2]);
  assert.deepEqual(rv.legalMoves(s).map(key).sort(), ['2,3', '3,2', '4,5', '5,4']);
  assert.equal(rv.setup({ startingSeat: 1 }).turn, 1);
});

test('a move flips the bracketed disc and passes the turn', () => {
  const s = rv.applyMove(rv.setup(), { r: 2, c: 3 }, 0);
  assert.equal(s.board[3][3], 0, 'd4 flipped to black');
  assert.deepEqual(s.counts, [4, 1]);
  assert.deepEqual(s.lastMove.flipped, [[3, 3]]);
  assert.equal(s.turn, 1);
  assert.equal(s.passed, null);
});

test('flips in several directions at once', () => {
  const s = fromPicture([
    'B.B.....',
    '.W......',
    'BW......',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  // Black at (2,2) brackets west (2,1)→(2,0) and north-west (1,1)→(0,0).
  assert.equal(rv.validateMove(s, { r: 2, c: 2 }, 0), null);
  const next = rv.applyMove(s, { r: 2, c: 2 }, 0);
  assert.equal(next.board[2][1], 0);
  assert.equal(next.board[1][1], 0);
  assert.equal(next.lastMove.flipped.length, 2);
});

test('rejects bad payloads, taken squares and non-flipping moves', () => {
  const s = rv.setup();
  assert.match(rv.validateMove(s, null, 0), /object/);
  assert.match(rv.validateMove(s, { r: 8, c: 0 }, 0), /range/);
  assert.match(rv.validateMove(s, { r: '2', c: 3 }, 0), /range/);
  assert.match(rv.validateMove(s, { r: 3, c: 3 }, 0), /taken/);
  assert.match(rv.validateMove(s, { r: 0, c: 0 }, 0), /flips nothing/);
});

test('opponent with no moves passes; mover goes again; full board ends the game', () => {
  const s = fromPicture([
    'BBBBBBW.',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBW.',
  ]);
  const a = rv.applyMove(s, { r: 0, c: 7 }, 0);
  assert.equal(a.passed, 1, 'White had no move');
  assert.equal(a.turn, 0);
  assert.equal(rv.currentSeat(a), 0);
  assert.equal(rv.outcome(a), null);

  const b = rv.applyMove(a, { r: 7, c: 7 }, 0);
  assert.equal(b.over, true);
  assert.equal(rv.currentSeat(b), null);
  assert.deepEqual(b.counts, [64, 0]);
  assert.deepEqual(rv.outcome(b), { winner: 0, reason: 'more_discs' });
  assert.deepEqual(rv.legalMoves(b), []);
});

test('game ends early when neither side can move', () => {
  // Black plays the last move that removes every White disc.
  const s = fromPicture([
    'BW......',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
  ]);
  const end = rv.applyMove(s, { r: 0, c: 2 }, 0);
  assert.equal(end.over, true);
  assert.deepEqual(end.counts, [3, 0]);
});

test('300 random games always terminate legally with consistent counts', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let g = 0; g < 300; g++) {
    let s = rv.setup({ startingSeat: g % 2 });
    let plies = 0;
    while (!rv.outcome(s)) {
      const seat = rv.currentSeat(s);
      const moves = rv.legalMoves(s);
      assert.ok(moves.length > 0, 'side to move always has a move');
      const m = moves[Math.floor(rand() * moves.length)];
      assert.equal(rv.validateMove(s, m, seat), null);
      s = rv.applyMove(s, m, seat);
      assert.ok(++plies <= 60, 'at most 60 moves fit on the board');
    }
    const filled = s.board.flat().filter((v) => v !== null).length;
    assert.equal(s.counts[0] + s.counts[1], filled);
  }
});

test('plays through the room engine like any other game', () => {
  const service = new RoomService(new MemoryRoomStore());
  const room = service.create({ gameId: 'reversi' });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  room.setReady(a, true);
  room.setReady(b, true);
  assert.equal(room.status, 'playing');
  assert.throws(() => room.move(a, { r: 0, c: 0 }, 0), (e) => e.code === 'ILLEGAL_MOVE');
  room.move(a, { r: 2, c: 3 }, 0);
  assert.equal(room.session.turnSeat, 1);
  assert.equal(room.snapshotFor(b).game.state.counts[0], 4);
  room.dispose();
});
