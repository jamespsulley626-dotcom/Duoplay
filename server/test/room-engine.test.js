// Exercises Room + GameSession directly (no network), covering the same flow
// the socket layer drives: join, ready, moves, anti-cheat, rematch, leave,
// reconnect, spectators, clocks, abandonment.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ERR } from '@duoplay/shared';
import { RoomService } from '../src/rooms/RoomService.js';
import { MemoryRoomStore } from '../src/store/MemoryRoomStore.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `expected ${code}`);

function setup(settings) {
  const service = new RoomService(new MemoryRoomStore(), { forfeitAfterMs: 1000, roomTtlMs: 5000 });
  const room = service.create({ gameId: 'connect4', settings, now: 0 });
  const a = room.addPlayer({ name: 'Alice', now: 0 });
  room.markConnected(a, 'sa', 0);
  const b = room.addPlayer({ name: 'Bob', now: 0 });
  room.markConnected(b, 'sb', 0);
  return { service, room, a, b };
}

test('lobby → ready → play → win → rematch alternates first player', () => {
  const { room, a, b } = setup();
  assert.equal(room.status, 'ready_check');
  room.setReady(a, true, 1);
  assert.equal(room.status, 'ready_check');
  room.setReady(b, true, 2);
  assert.equal(room.status, 'playing');
  assert.equal(room.session.turnSeat, 0);

  throwsCode(() => room.move(b, { col: 0 }, 0, 3), ERR.NOT_YOUR_TURN);
  throwsCode(() => room.move(a, { col: 9 }, 0, 3), ERR.ILLEGAL_MOVE);
  throwsCode(() => room.move(a, { col: 0 }, 4, 3), ERR.STALE_STATE);
  throwsCode(() => room.move(a, { col: '0' }, 0, 3), ERR.ILLEGAL_MOVE);

  [0, 1, 0, 1, 0, 1, 0].forEach((col, i) => room.move(i % 2 ? b : a, { col }, i, 10 + i));
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.score, [1, 0]);
  throwsCode(() => room.move(b, { col: 2 }, 7, 30), ERR.GAME_NOT_ACTIVE);

  room.voteRematch(a, 40);
  assert.equal(room.status, 'finished');
  room.voteRematch(b, 41);
  assert.equal(room.status, 'playing');
  assert.equal(room.session.turnSeat, 1);
  room.dispose();
});

test('snapshots never expose tokens and personalise `you`', () => {
  const { room, a, b } = setup();
  const snap = room.snapshotFor(b, 1);
  assert.equal(snap.you.seat, 1);
  assert.ok(!JSON.stringify(snap).includes(a.token));
  assert.ok(!JSON.stringify(snap).includes(b.token));
  assert.equal(room.findByToken(b.token), b);
  assert.equal(room.findByToken('nope'), null);
});

test('spectators join when full and cannot act', () => {
  const { room, a, b } = setup();
  assert.equal(room.addPlayer({ name: 'Carol', now: 1 }), null);
  const c = room.addSpectator({ name: 'Carol', now: 1 });
  room.setReady(a, true, 2);
  room.setReady(b, true, 2);
  throwsCode(() => room.move(c, { col: 0 }, 0, 3), ERR.NOT_A_PLAYER);
  throwsCode(() => room.setReady(c, true, 3), ERR.NOT_A_PLAYER);
  assert.equal(room.addChat(c, '  gg  \n', 4).text, 'gg');
  throwsCode(() => room.addChat(c, '   ', 4), ERR.BAD_REQUEST);
  room.dispose();
});

test('leaving mid-game forfeits and reopens the seat', () => {
  const { room, a, b } = setup();
  room.setReady(a, true, 1);
  room.setReady(b, true, 1);
  room.removeMember(b, 5);
  assert.equal(room.status, 'waiting');
  assert.equal(room.session, null);
  const d = room.addPlayer({ name: 'Dan', now: 6 });
  assert.equal(d.seat, 1);
  assert.equal(room.status, 'ready_check');
});

test('disconnect keeps the seat; long absence forfeits; idle rooms are swept', () => {
  const { service, room, a, b } = setup();
  room.setReady(a, true, 1);
  room.setReady(b, true, 1);
  room.markDisconnected(b, 100);
  assert.equal(room.checkAbandoned(500, 1000), false);
  room.markConnected(b, 'sb2', 600); // reconnect in time
  room.markDisconnected(b, 700);
  assert.equal(room.checkAbandoned(2000, 1000), true);
  assert.equal(room.session.result.reason, 'abandoned');
  assert.equal(room.session.result.winner, 0);

  room.markDisconnected(a, 2000);
  service.sweep(4000);
  assert.ok(service.get(room.code), 'kept within TTL');
  service.sweep(9000);
  assert.equal(service.get(room.code), null, 'deleted after TTL');
});

test('clock: increment applied, flag on move after time runs out', () => {
  const { room, a, b } = setup({ clock: { initialMs: 30_000, incrementMs: 2_000 } });
  room.setReady(a, true, 0);
  room.setReady(b, true, 1000);
  room.move(a, { col: 3 }, 0, 6000); // used 5s, +2s
  assert.equal(room.session.clock.remaining[0], 27_000);
  const snap = room.snapshotFor(a, 16_000);
  assert.equal(snap.game.clock.remaining[1], 20_000);
  throwsCode(() => room.move(b, { col: 3 }, 1, 40_000), ERR.GAME_NOT_ACTIVE);
  assert.equal(room.status, 'finished');
  assert.deepEqual(room.session.result.winner, 0);
  assert.equal(room.session.result.reason, 'timeout');
  assert.deepEqual(room.score, [1, 0]);
});

test('settings and game ids are validated', () => {
  const service = new RoomService(new MemoryRoomStore());
  throwsCode(() => service.create({ gameId: 'jungle' }), ERR.UNKNOWN_GAME);
  throwsCode(() => service.create({ gameId: 'toString' }), ERR.UNKNOWN_GAME);
  throwsCode(() => service.create({ gameId: 'connect4', settings: { clock: { initialMs: 5 } } }), ERR.BAD_REQUEST);
  const room = service.create({ gameId: 'connect4', settings: { allowSpectators: false } });
  room.addPlayer({ name: 'A' });
  room.addPlayer({ name: 'B' });
  throwsCode(() => room.addSpectator({ name: 'C' }), ERR.ROOM_FULL);
});
