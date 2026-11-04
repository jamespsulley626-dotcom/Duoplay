import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { io as connect } from 'socket.io-client';
import { C2S, ERR, S2C } from '@duoplay/shared';
import { createGameServer } from '../src/app.js';

let server;
let url;
const sockets = [];

before(async () => {
  server = createGameServer({ serviceOptions: { forfeitAfterMs: 300, roomTtlMs: 60_000 }, sweepEveryMs: 100 });
  await new Promise((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${server.httpServer.address().port}`;
});

after(async () => {
  for (const s of sockets) s.disconnect();
  await server.close();
});

function client() {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  s.latest = null;
  s.on(S2C.ROOM_STATE, (snap) => (s.latest = snap));
  return new Promise((r) => s.on('connect', () => r(s)));
}

const send = (s, event, payload) => new Promise((r) => s.emit(event, payload, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await wait(10);
  }
  throw new Error('Timed out waiting for condition');
}

async function setupRoom(settings) {
  const a = await client();
  const b = await client();
  const created = await send(a, C2S.ROOM_CREATE, { gameId: 'connect4', name: 'Alice', settings });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.match(created.code, /^[A-Z2-9]{5}$/);
  const joined = await send(b, C2S.ROOM_JOIN, { code: created.code.toLowerCase(), name: 'Bob' });
  assert.equal(joined.ok, true);
  assert.equal(joined.room.you.seat, 1);
  assert.equal(joined.room.status, 'ready_check');
  return { a, b, code: created.code, tokens: [created.token, joined.token] };
}

test('full Connect 4 match: ready, moves, validation, win, rematch', async () => {
  const { a, b } = await setupRoom();

  assert.equal((await send(a, C2S.PLAYER_READY, { ready: true })).ok, true);
  await send(b, C2S.PLAYER_READY, { ready: true });
  await until(() => a.latest?.status === 'playing' && b.latest?.status === 'playing');
  assert.equal(a.latest.game.turnSeat, 0);

  // Tokens never leak into snapshots.
  assert.ok(!JSON.stringify(a.latest).includes('token'));

  // Anti-cheat: wrong turn, illegal payload, stale version.
  assert.equal((await send(b, C2S.GAME_MOVE, { move: { col: 0 }, version: 0 })).error.code, ERR.NOT_YOUR_TURN);
  assert.equal((await send(a, C2S.GAME_MOVE, { move: { col: 99 }, version: 0 })).error.code, ERR.ILLEGAL_MOVE);
  assert.equal((await send(a, C2S.GAME_MOVE, { move: { col: 0 }, version: 5 })).error.code, ERR.STALE_STATE);

  const cols = [0, 1, 0, 1, 0, 1, 0];
  for (let i = 0; i < cols.length; i++) {
    const s = i % 2 === 0 ? a : b;
    const res = await send(s, C2S.GAME_MOVE, { move: { col: cols[i] }, version: i });
    assert.equal(res.ok, true, JSON.stringify(res));
  }
  await until(() => b.latest?.status === 'finished');
  assert.equal(b.latest.game.result.winner, 0);
  assert.deepEqual(b.latest.score, [1, 0]);

  await send(a, C2S.GAME_REMATCH, {});
  assert.deepEqual(b.latest.rematchVotes ?? [], b.latest.rematchVotes); // shape check
  await send(b, C2S.GAME_REMATCH, {});
  await until(() => a.latest?.status === 'playing' && a.latest.matchCount === 2);
  assert.equal(a.latest.game.turnSeat, 1, 'second match alternates the starting player');
});

test('reconnect with token reclaims the seat; spectators cannot move', async () => {
  const { a, b, code, tokens } = await setupRoom();
  await send(a, C2S.PLAYER_READY, {});
  await send(b, C2S.PLAYER_READY, {});
  await send(a, C2S.GAME_MOVE, { move: { col: 3 }, version: 0 });

  b.disconnect();
  await until(() => a.latest?.players[1].connected === false);

  const b2 = await client();
  const back = await send(b2, C2S.ROOM_JOIN, { code, token: tokens[1] });
  assert.equal(back.ok, true);
  assert.equal(back.room.you.seat, 1);
  assert.equal(back.room.game.version, 1, 'board survived the reconnect');
  await until(() => a.latest?.players[1].connected === true);

  const spec = await client();
  const watched = await send(spec, C2S.ROOM_JOIN, { code, name: 'Carol' });
  assert.equal(watched.room.you.role, 'spectator');
  assert.equal((await send(spec, C2S.GAME_MOVE, { move: { col: 0 }, version: 1 })).error.code, ERR.NOT_A_PLAYER);

  const chat = new Promise((r) => a.once(S2C.CHAT_MESSAGE, r));
  await send(spec, C2S.CHAT_SEND, { text: '  nice move!  ' });
  assert.equal((await chat).text, 'nice move!');
});

test('abandoned player forfeits after grace period', async () => {
  const { a, b } = await setupRoom();
  await send(a, C2S.PLAYER_READY, {});
  await send(b, C2S.PLAYER_READY, {});
  b.disconnect();
  await until(() => a.latest?.status === 'finished', 3000);
  assert.equal(a.latest.game.result.reason, 'abandoned');
  assert.equal(a.latest.game.result.winner, 0);
});

test('clock flags the player who runs out of time', async () => {
  const { a, b } = await setupRoom({ clock: { initialMs: 30_000, incrementMs: 0 } });
  await send(a, C2S.PLAYER_READY, {});
  await send(b, C2S.PLAYER_READY, {});
  await until(() => a.latest?.status === 'playing');
  // Fast-forward: shrink seat 0's clock directly, then let the server timer fire.
  const room = server.service.get(a.latest.code);
  room.session.clock.remaining[0] = 50;
  room.session.clock.turnStartedAt = Date.now();
  // Re-arm the timer via a rejected move (resync path) isn't needed; the original timer is 30s,
  // so trigger the move-time check instead:
  await wait(80);
  const res = await send(a, C2S.GAME_MOVE, { move: { col: 0 }, version: 0 });
  assert.equal(res.error.code, ERR.GAME_NOT_ACTIVE);
  await until(() => b.latest?.status === 'finished');
  assert.equal(b.latest.game.result.reason, 'timeout');
  assert.equal(b.latest.game.result.winner, 1);
});

test('unknown room and unavailable game are rejected', async () => {
  const s = await client();
  assert.equal((await send(s, C2S.ROOM_JOIN, { code: 'ZZZZZ', name: 'X' })).error.code, ERR.ROOM_NOT_FOUND);
  assert.equal((await send(s, C2S.ROOM_CREATE, { gameId: 'jungle', name: 'X' })).error.code, ERR.UNKNOWN_GAME);
  assert.equal((await send(s, C2S.ROOM_CREATE, { gameId: '__proto__', name: 'X' })).error.code, ERR.UNKNOWN_GAME);
});
