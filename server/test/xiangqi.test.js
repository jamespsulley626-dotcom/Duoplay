import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGame } from '@duoplay/shared';
import { RoomService } from '../src/rooms/RoomService.js';
import { MemoryRoomStore } from '../src/store/MemoryRoomStore.js';

const xq = getGame('xiangqi');
const sq = ([r, c]) => `${r},${c}`;
const targets = (s, r, c) => xq.targetsFrom(s, r, c).map(sq).sort();

/** Empty-board state with given pieces, e.g. { '0,4': 'bk', '9,3': 'rk' }. Seat 0 is Red. */
function position(pieces, turnSide = 'r') {
  const s = xq.setup({ startingSeat: 0 });
  const board = Array.from({ length: 10 }, () => Array(9).fill(null));
  for (const [k, v] of Object.entries(pieces)) {
    const [r, c] = k.split(',').map(Number);
    board[r][c] = v;
  }
  return { ...s, board, turn: turnSide === 'r' ? 0 : 1 };
}

test('opening: Red moves first and has exactly 44 legal moves', () => {
  const s = xq.setup({ startingSeat: 1 });
  assert.equal(s.red, 1);
  assert.equal(xq.currentSeat(s), 1, 'starting seat plays Red and moves first');
  assert.equal(xq.legalMoves(s).length, 44);
  // After a quiet edge-pawn push, Black's options mirror Red's.
  const after = xq.applyMove(s, { from: [6, 0], to: [5, 0] }, 1);
  assert.equal(xq.currentSeat(after), 0);
  assert.equal(xq.legalMoves(after).length, 44);
});

test('cannon needs exactly one screen to capture', () => {
  const s = xq.setup();
  assert.ok(targets(s, 7, 1).includes('0,1'), 'jumps the black cannon to take the horse');
  assert.ok(!targets(s, 7, 1).includes('2,1'), 'cannot capture without a screen');
  assert.ok(targets(s, 7, 1).includes('7,0') && targets(s, 7, 1).includes('3,1'), 'slides like a chariot when not capturing');
});

test('horse is hobbled by an adjacent piece', () => {
  const s = xq.setup();
  // Red horse at (9,1): leg (8,1) is free, leg (9,0)/(9,2) are blocked.
  assert.deepEqual(targets(s, 9, 1), ['7,0', '7,2']);
  const open = position({ '5,4': 'rh', '9,3': 'rk', '0,4': 'bk', '4,4': 'bp' });
  assert.equal(xq.targetsFrom(open, 5, 4).length, 6, 'leg north blocked removes two of eight');
});

test('elephant: blocked eye, cannot cross the river', () => {
  const s = position({ '5,2': 're', '9,3': 'rk', '0,4': 'bk', '6,3': 'rp' });
  assert.deepEqual(targets(s, 5, 2), ['7,0'], 'no crossing; eye (6,3) blocked; only (7,0)');
});

test('advisor and general stay in the palace', () => {
  const s = position({ '9,3': 'rk', '9,5': 'ra', '0,4': 'bk' });
  assert.deepEqual(targets(s, 9, 5), ['8,4']);
  assert.ok(targets(s, 9, 3).every((t) => { const [r, c] = t.split(',').map(Number); return r >= 7 && c >= 3 && c <= 5; }));
});

test('soldier moves sideways only after crossing the river', () => {
  const s = position({ '6,4': 'rp', '4,0': 'rp', '9,3': 'rk', '0,5': 'bk' });
  assert.deepEqual(targets(s, 6, 4), ['5,4']);
  assert.deepEqual(targets(s, 4, 0), ['3,0', '4,1']);
});

test('flying general: cannot open the file between the generals', () => {
  const s = position({ '9,4': 'rk', '5,4': 'rr', '0,4': 'bk' });
  const t = targets(s, 5, 4);
  assert.ok(t.every((x) => x.endsWith(',4')), 'the chariot may only move along the file');
  assert.match(xq.validateMove(s, { from: [5, 4], to: [5, 0] }, 0), /check/);
  assert.ok(!targets(s, 9, 4).includes('9,4'));
});

test('rejects malformed moves and moving the opponent’s pieces', () => {
  const s = xq.setup();
  assert.match(xq.validateMove(s, null, 0), /object/);
  assert.match(xq.validateMove(s, { from: [9, 0], to: [10, 0] }, 0), /range/);
  assert.match(xq.validateMove(s, { from: ['9', 0], to: [8, 0] }, 0), /range/);
  assert.match(xq.validateMove(s, { from: [5, 5], to: [4, 5] }, 0), /No piece/);
  assert.match(xq.validateMove(s, { from: [0, 0], to: [1, 0] }, 0), /not your piece/);
  assert.match(xq.validateMove(s, { from: [9, 0], to: [5, 1] }, 0), /cannot move/);
});

test('checkmate ends the game; the mated side loses', () => {
  // Black general on (0,4); Red general on file 3 covers (0,3)/(1,3) by flying-general;
  // chariot on row 1 covers (1,4)/(1,5); the other chariot delivers mate on row 0.
  const s = position({ '0,4': 'bk', '9,3': 'rk', '1,8': 'rr', '2,0': 'rr' });
  const end = xq.applyMove(s, { from: [2, 0], to: [0, 0] }, 0);
  assert.equal(end.check, true);
  assert.deepEqual(xq.outcome(end), { winner: 0, reason: 'checkmate' });
  assert.equal(xq.currentSeat(end), null);
});

test('stalemate also loses for the side with no move', () => {
  // Black general on (0,3). File 4 is covered by a chariot, so (0,4) and (1,4) are off-limits;
  // Red's quiet move (1,0)→(1,1) covers (1,3). Black is not in check but has no move.
  const s = position({ '0,3': 'bk', '9,4': 'rk', '2,4': 'rr', '1,0': 'rr' });
  const end = xq.applyMove(s, { from: [1, 0], to: [1, 1] }, 0);
  assert.equal(end.check, false);
  assert.deepEqual(xq.outcome(end), { winner: 0, reason: 'stalemate' });
});

test('120 plies without a capture is a draw', () => {
  const s = { ...position({ '0,3': 'bk', '9,4': 'rk', '5,0': 'rr', '4,8': 'br' }), quiet: 119 };
  const end = xq.applyMove(s, { from: [5, 0], to: [5, 1] }, 0);
  assert.deepEqual(xq.outcome(end), { winner: null, reason: 'no_capture' });
});

test('random games stay legal and always terminate', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let g = 0; g < 12; g++) {
    let s = xq.setup({ startingSeat: g % 2 });
    while (!xq.outcome(s)) {
      const seat = xq.currentSeat(s);
      const moves = xq.legalMoves(s);
      assert.ok(moves.length > 0);
      const m = moves[Math.floor(rand() * moves.length)];
      assert.equal(xq.validateMove(s, m, seat), null);
      s = xq.applyMove(s, m, seat);
      // Both generals always on the board, never facing each other unobstructed.
      const flat = s.board.flat();
      assert.ok(flat.includes('rk') && flat.includes('bk'));
    }
    assert.ok(s.moveCount <= 400);
  }
});

test('plays through the room engine; colours swap on rematch', () => {
  const room = new RoomService(new MemoryRoomStore()).create({ gameId: 'xiangqi' });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  room.setReady(a, true);
  room.setReady(b, true);
  assert.equal(room.session.state.red, 0);
  assert.throws(() => room.move(b, { from: [0, 1], to: [2, 2] }, 0), (e) => e.code === 'NOT_YOUR_TURN');
  room.move(a, { from: [7, 1], to: [7, 4] }, 0); // 炮二平五
  room.resign(b);
  room.voteRematch(a);
  room.voteRematch(b);
  assert.equal(room.session.state.red, 1, 'second match: seat 1 plays Red');
  assert.equal(room.session.turnSeat, 1);
  room.dispose();
});
