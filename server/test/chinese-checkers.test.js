import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGame } from '@duoplay/shared';
import { CELLS, POINT_CELLS, reachable } from '@duoplay/shared/games/chinese-checkers.js';
import { RoomService } from '../src/rooms/RoomService.js';
import { MemoryRoomStore } from '../src/store/MemoryRoomStore.js';

const cc = getGame('chinese-checkers');
const idx = (q, r) => CELLS.findIndex((c) => c.q === q && c.r === r);
const empty = () => Array(CELLS.length).fill(null);

test('star geometry: 121 holes, six 10-hole points, 61-hole centre', () => {
  assert.equal(CELLS.length, 121);
  assert.deepEqual(POINT_CELLS.map((p) => p.length), [10, 10, 10, 10, 10, 10]);
  assert.equal(CELLS.filter((c) => c.point === null).length, 61);
});

test('setup for 2–6 players uses the standard point layouts', () => {
  const homes = { 2: [0, 3], 3: [0, 2, 4], 4: [1, 2, 4, 5], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
  for (const [n, h] of Object.entries(homes)) {
    const s = cc.setup({ seats: Number(n) });
    assert.deepEqual(s.homes, h);
    assert.equal(s.board.filter((v) => v !== null).length, 10 * Number(n));
    for (let seat = 0; seat < Number(n); seat++) assert.ok(POINT_CELLS[h[seat]].every((i) => s.board[i] === seat));
  }
  assert.throws(() => cc.setup({ seats: 7 }));
});

test('opening: 8 steps + 6 hops = 14 moves', () => {
  const s = cc.setup({ seats: 2 });
  assert.equal(cc.legalMoves(s).length, 14);
});

test('hop chains: multiple hops in one turn, over any colour, path recorded', () => {
  const board = empty();
  const from = idx(0, 0);
  board[from] = 0;
  board[idx(1, 0)] = 1; // hop east over opponent → (2,0)
  board[idx(3, 0)] = 0; // hop east again over own → (4,0)
  const r = reachable(board, from);
  assert.deepEqual(r.get(idx(4, 0)), [from, idx(2, 0), idx(4, 0)]);
  assert.ok(r.has(idx(-1, 0)), 'single step west');
  assert.ok(!r.has(idx(3, 0)), 'cannot land on a marble');
});

test('validation rejects bad payloads, other colours and unreachable cells', () => {
  const s = cc.setup({ seats: 2 });
  const mine = POINT_CELLS[0][0];
  assert.match(cc.validateMove(s, null, 0), /object/);
  assert.match(cc.validateMove(s, { from: 999, to: 0 }, 0), /range/);
  assert.match(cc.validateMove(s, { from: '1', to: 2 }, 0), /range/);
  assert.match(cc.validateMove(s, { from: POINT_CELLS[3][0], to: idx(0, 0) }, 0), /not your marble/);
  assert.match(cc.validateMove(s, { from: mine, to: idx(0, 0) }, 0), /cannot reach/);
});

test('turns rotate through all players, skipping eliminated seats', () => {
  let s = cc.setup({ seats: 3, startingSeat: 1 });
  assert.equal(cc.currentSeat(s), 1);
  s = cc.applyMove(s, cc.legalMoves(s)[0], 1);
  assert.equal(s.turn, 2);
  s = cc.eliminate(s, 0);
  s = cc.applyMove(s, cc.legalMoves(s)[0], 2);
  assert.equal(s.turn, 1, 'seat 0 is out, so play returns to seat 1');
  const last = cc.eliminate(s, 2);
  assert.deepEqual(last.result, { winner: 1, reason: 'last_player' });
});

test('win: filling the target point (opponent marbles still at home count, a stranger does not)', () => {
  const s = cc.setup({ seats: 2 });
  const board = empty();
  const tgt = POINT_CELLS[3]; // seat 0's target = seat 1's home
  tgt.slice(1).forEach((i) => (board[i] = 0));
  const last = tgt[0];
  // Put seat 0's final marble next to the last empty target hole.
  const { q, r } = CELLS[last];
  const nb = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => idx(q + a, r + b)).find((i) => i !== -1 && board[i] === null && CELLS[i].point !== 3);
  board[nb] = 0;
  board[POINT_CELLS[0][0]] = 1; // seat 1 needs a marble somewhere
  const before = { ...s, board, turn: 0 };
  const won = cc.applyMove(before, { from: nb, to: last }, 0);
  assert.deepEqual(cc.outcome(won), { winner: 0, reason: 'filled_target' });

  // A blocker that is the target's home owner still counts toward a full target.
  const b2 = board.slice();
  b2[tgt[1]] = 1;
  const won2 = cc.applyMove({ ...s, board: b2, turn: 0 }, { from: nb, to: last }, 0);
  assert.equal(cc.outcome(won2)?.winner, 0, 'opponent who never left home cannot block');
});

test('random 2-, 3-, 4- and 6-player games stay legal and terminate', () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (const n of [2, 3, 4, 6]) {
    let s = cc.setup({ seats: n, startingSeat: n - 1 });
    while (!cc.outcome(s)) {
      const seat = cc.currentSeat(s);
      const moves = cc.legalMoves(s);
      assert.ok(moves.length > 0);
      const m = moves[Math.floor(rand() * moves.length)];
      assert.equal(cc.validateMove(s, m, seat), null);
      s = cc.applyMove(s, m, seat);
      assert.equal(s.board.filter((v) => v !== null).length, 10 * n, 'marble count never changes');
    }
  }
});

test('room engine: 4 players, no joining mid-game, resign eliminates, last player wins', () => {
  const service = new RoomService(new MemoryRoomStore());
  assert.throws(() => service.create({ gameId: 'chinese-checkers', settings: { players: 7 } }), (e) => e.code === 'BAD_REQUEST');
  assert.throws(() => service.create({ gameId: 'connect4', settings: { players: 3 } }), (e) => e.code === 'BAD_REQUEST');
  const room = service.create({ gameId: 'chinese-checkers', settings: { players: 4 } });
  const ps = ['A', 'B', 'C', 'D'].map((name) => room.addPlayer({ name }));
  assert.equal(room.status, 'ready_check');
  ps.forEach((p) => room.setReady(p, true));
  assert.equal(room.status, 'playing');
  assert.equal(room.addPlayer({ name: 'Late' }), null, 'late joiners become spectators');

  room.move(ps[0], cc.legalMoves(room.session.state)[0], 0);
  room.resign(ps[1]); // seat 1 out; game continues
  assert.equal(room.status, 'playing');
  assert.deepEqual(room.snapshotFor(ps[0]).game.eliminated, [1]);
  assert.equal(room.session.turnSeat, 2);
  assert.throws(() => room.move(ps[1], { from: 0, to: 1 }), (e) => e.code === 'NOT_YOUR_TURN');

  room.removeMember(ps[2]); // leaves → eliminated, seat empties, game continues
  assert.equal(room.status, 'playing');
  assert.equal(room.players?.[2] ?? room.seats[2], null);
  room.resign(ps[3]);
  assert.equal(room.status, 'finished');
  assert.equal(room.session.result.winner, 0);
  assert.equal(room.score[0], 1);
  room.dispose();
});

test('room engine: 2-player Chinese Checkers resign ends the game like other games', () => {
  const room = new RoomService(new MemoryRoomStore()).create({ gameId: 'chinese-checkers' });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  room.setReady(a, true);
  room.setReady(b, true);
  room.resign(a);
  assert.deepEqual(room.session.result, { winner: 1, reason: 'resign', loser: 0 });
});

test('greedy players race home and someone wins (2, 3, 4, 6 players)', () => {
  // Hex distance, and each point's tip (the cell furthest from the centre). Aiming at the tip,
  // rather than the middle of the point, stops marbles shuffling around inside it.
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const centre = { q: 0, r: 0 };
  const tip = (p) => POINT_CELLS[p].map((i) => CELLS[i]).reduce((a, c) => (dist(c, centre) > dist(a, centre) ? c : a));
  for (const n of [2, 3, 4, 6]) {
    let s = cc.setup({ seats: n });
    let seed = n;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    while (!cc.outcome(s)) {
      const seat = cc.currentSeat(s);
      const goal = tip((s.homes[seat] + 3) % 6);
      let best = null;
      let bestGain = -Infinity;
      for (const m of cc.legalMoves(s)) {
        const gain = dist(CELLS[m.from], goal) - dist(CELLS[m.to], goal) + rand() * 0.01;
        if (gain > bestGain) [best, bestGain] = [m, gain];
      }
      s = cc.applyMove(s, best, seat);
    }
    assert.equal(s.result.reason, 'filled_target', `${n} players: ${JSON.stringify(s.result)} after ${s.moveCount} moves`);
    const w = s.result.winner;
    assert.ok(POINT_CELLS[(s.homes[w] + 3) % 6].every((i) => s.board[i] === w), 'winner has all 10 marbles home');
  }
});
