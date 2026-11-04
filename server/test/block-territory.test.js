import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGame } from '@duoplay/shared';
import { ORIENTATIONS, PIECES, PIECE_IDS, STARTS, transform } from '@duoplay/shared/games/block-territory.js';
import { RoomService } from '../src/rooms/RoomService.js';
import { MemoryRoomStore } from '../src/store/MemoryRoomStore.js';

const bt = getGame('block-territory');
const at = (shape, r, c) => shape.map(([dr, dc]) => [r + dr, c + dc]);

test('21 pieces, 89 squares, 91 distinct orientations', () => {
  assert.equal(PIECE_IDS.length, 21);
  assert.equal(PIECE_IDS.reduce((n, id) => n + PIECES[id].length, 0), 89);
  assert.equal(PIECE_IDS.reduce((n, id) => n + ORIENTATIONS[id].length, 0), 91);
  assert.equal(ORIENTATIONS.X.length, 1);
  assert.equal(ORIENTATIONS.O4.length, 1);
  assert.equal(ORIENTATIONS.F.length, 8);
});

test('first piece must cover your own starting square', () => {
  const s = bt.setup();
  assert.match(bt.validateMove(s, { piece: '1', cells: [[0, 0]] }, 0), /starting square/);
  assert.match(bt.validateMove(s, { piece: '1', cells: [STARTS[1]] }, 0), /starting square/, "can't use the opponent's start");
  assert.equal(bt.validateMove(s, { piece: '1', cells: [STARTS[0]] }, 0), null);
});

test('own pieces join only at corners; touching the opponent is fine', () => {
  let s = bt.setup();
  s = bt.applyMove(s, { piece: 'O4', cells: at(PIECES.O4, 4, 4) }, 0); // covers (4,4)-(5,5)
  s = bt.applyMove(s, { piece: 'O4', cells: at(PIECES.O4, 8, 8) }, 1); // covers (9,9)
  assert.equal(s.turn, 0);
  assert.match(bt.validateMove(s, { piece: '1', cells: [[6, 4]] }, 0), /only touch at corners/, 'edge contact with own piece');
  assert.match(bt.validateMove(s, { piece: '1', cells: [[8, 4]] }, 0), /corner/, 'not connected at all');
  assert.equal(bt.validateMove(s, { piece: '1', cells: [[6, 6]] }, 0), null, 'diagonal corner contact');
  s = bt.applyMove(s, { piece: '1', cells: [[6, 6]] }, 0);
  // Seat 1 may place right next to seat 0's monomino (edge contact with the opponent is allowed).
  assert.equal(bt.validateMove(s, { piece: '2', cells: [[7, 6], [7, 7]] }, 1), null);
});

test('rejects malformed moves, wrong shapes and reused pieces', () => {
  let s = bt.setup();
  assert.match(bt.validateMove(s, null, 0), /object/);
  assert.match(bt.validateMove(s, { piece: 'nope', cells: [[4, 4]] }, 0), /Unknown/);
  assert.match(bt.validateMove(s, { piece: '__proto__', cells: [[4, 4]] }, 0), /Unknown/);
  assert.match(bt.validateMove(s, { piece: 'I3', cells: [[4, 4], [4, 5]] }, 0), /number of squares/);
  assert.match(bt.validateMove(s, { piece: 'I3', cells: [[4, 4], [4, 5], [5, 5]] }, 0), /do not form/);
  assert.match(bt.validateMove(s, { piece: '2', cells: [[4, 4], [4, 4]] }, 0), /distinct/);
  assert.match(bt.validateMove(s, { piece: '2', cells: [[4, 4], ['4', 5]] }, 0), /number of squares/);
  assert.match(bt.validateMove(s, { piece: 'I5', cells: at(PIECES.I5, 4, 11) }, 0), /Off the board/);
  s = bt.applyMove(s, { piece: '1', cells: [[4, 4]] }, 0);
  s = bt.applyMove(s, { piece: '1', cells: [[9, 9]] }, 1);
  assert.match(bt.validateMove(s, { piece: '1', cells: [[5, 5]] }, 0), /already used/);
});

test('every orientation the client can make is accepted', () => {
  const s = bt.setup();
  for (const id of PIECE_IDS) {
    for (const flip of [false, true]) for (let k = 0; k < 4; k++) {
      const shape = transform(PIECES[id], k, flip);
      // Put the shape so one of its cells lands on the start square.
      const [pr, pc] = shape[0];
      const cells = at(shape, STARTS[0][0] - pr, STARTS[0][1] - pc);
      assert.equal(bt.validateMove(s, { piece: id, cells }, 0), null, `${id} k=${k} flip=${flip}`);
    }
  }
});

test('a player with no legal placement is skipped; game ends when neither can place', () => {
  // Random play to the end exercises skipping and the end condition.
  let seed = 5;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let sawSkip = false;
  for (let g = 0; g < 6; g++) {
    let s = bt.setup({ startingSeat: g % 2 });
    while (!bt.outcome(s)) {
      const seat = bt.currentSeat(s);
      const moves = bt.legalMoves(s);
      assert.ok(moves.length > 0, 'side to move always has a placement');
      const m = moves[Math.floor(rand() * moves.length)];
      assert.equal(bt.validateMove(s, m, seat), null);
      s = bt.applyMove(s, m, seat);
      if (s.skipped.length) sawSkip = true;
    }
    const filled = s.board.flat().filter((v) => v !== null).length;
    assert.equal(s.counts[0] + s.counts[1], filled);
    assert.ok(s.counts.every((n) => n <= 89));
    assert.deepEqual(bt.legalMoves(s), []);
  }
  assert.ok(sawSkip, 'some game had a skipped turn');
});

test('most squares wins; equal is a draw', () => {
  const s = { ...bt.setup(), over: true, counts: [40, 37] };
  assert.deepEqual(bt.outcome(s), { winner: 0, reason: 'more_squares' });
  assert.deepEqual(bt.outcome({ ...s, counts: [30, 30] }), { winner: null, reason: 'equal_squares' });
});

test('plays through the room engine', () => {
  const room = new RoomService(new MemoryRoomStore()).create({ gameId: 'block-territory' });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  room.setReady(a, true);
  room.setReady(b, true);
  assert.throws(() => room.move(a, { piece: '1', cells: [[0, 0]] }, 0), (e) => e.code === 'ILLEGAL_MOVE');
  room.move(a, { piece: 'X', cells: at(PIECES.X, 3, 3) }, 0);
  assert.equal(room.session.turnSeat, 1);
  assert.deepEqual(room.snapshotFor(b).game.state.counts, [5, 0]);
  room.dispose();
});
