import { C2S, ERR, LIMITS, S2C, normalizeCode } from '@duoplay/shared';
import { GameError, assert } from './errors.js';
import { cleanText, createRateLimiter } from './util.js';

const channel = (code) => `room:${code}`;
const fail = (code, message) => ({ ok: false, error: { code, message } });

export function attachSocketHandlers(io, service) {
  /** Every member gets their own snapshot so `you` (and any hidden info) is per-viewer. */
  function broadcast(room) {
    const now = Date.now();
    for (const m of room.members()) {
      if (m.connected && m.socketId) io.to(m.socketId).emit(S2C.ROOM_STATE, room.snapshotFor(m, now));
    }
  }
  service.onRoomChange = broadcast;

  io.on('connection', (socket) => {
    const allow = createRateLimiter({ capacity: 20, refillPerSec: 8 });

    /** Wraps a handler with rate limiting, error mapping and a guaranteed ack. */
    const on = (event, handler) =>
      socket.on(event, (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!allow()) return reply(fail(ERR.RATE_LIMITED, 'Slow down a little'));
        try {
          const data = handler(payload && typeof payload === 'object' ? payload : {});
          reply({ ok: true, ...(data ?? {}) });
        } catch (err) {
          if (err instanceof GameError) reply(fail(err.code, err.message));
          else {
            console.error(`[${event}]`, err);
            reply(fail(ERR.INTERNAL, 'Something went wrong'));
          }
        }
      });

    function current() {
      const { code, token } = socket.data;
      const room = code ? service.get(code) : null;
      const member = room?.findByToken(token);
      if (!room || !member || member.socketId !== socket.id) throw new GameError(ERR.NOT_IN_ROOM, 'You are not in a room');
      return { room, member };
    }

    function detach() {
      const { code, token } = socket.data;
      if (!code) return;
      socket.leave(channel(code));
      socket.data = {};
      const room = service.get(code);
      const member = room?.findByToken(token);
      if (room && member && member.socketId === socket.id) {
        room.markDisconnected(member);
        broadcast(room);
      }
    }

    function attach(room, member) {
      if (socket.data.code && (socket.data.code !== room.code || socket.data.token !== member.token)) detach();
      // Same seat opened in another tab/device: the newest connection wins.
      if (member.socketId && member.socketId !== socket.id) {
        const old = io.sockets.sockets.get(member.socketId);
        if (old) {
          old.emit(S2C.ERROR, { code: ERR.SESSION_REPLACED, message: 'This room was opened somewhere else' });
          old.leave(channel(room.code));
          old.data = {};
        }
      }
      room.markConnected(member, socket.id);
      socket.data = { code: room.code, token: member.token };
      socket.join(channel(room.code));
    }

    const joinResult = (room, member) => ({
      code: room.code,
      token: member.token,
      room: room.snapshotFor(member),
      chat: room.chat,
    });

    on(C2S.ROOM_CREATE, ({ gameId, name, settings }) => {
      const cleanName = cleanText(name, LIMITS.NAME_MAX);
      assert(cleanName, ERR.BAD_REQUEST, 'Please enter a name');
      const room = service.create({ gameId: String(gameId ?? ''), settings });
      const member = room.addPlayer({ name: cleanName });
      attach(room, member);
      broadcast(room);
      return joinResult(room, member);
    });

    on(C2S.ROOM_JOIN, ({ code, name, token, asSpectator }) => {
      const room = service.get(normalizeCode(code));
      assert(room, ERR.ROOM_NOT_FOUND, 'Room not found — check the code');
      let member = room.findByToken(token); // reconnect path
      if (!member) {
        const cleanName = cleanText(name, LIMITS.NAME_MAX);
        assert(cleanName, ERR.BAD_REQUEST, 'Please enter a name');
        if (!asSpectator) member = room.addPlayer({ name: cleanName });
        if (!member) member = room.addSpectator({ name: cleanName });
      }
      attach(room, member);
      broadcast(room);
      return joinResult(room, member);
    });

    on(C2S.ROOM_LEAVE, () => {
      const { room, member } = current();
      socket.leave(channel(room.code));
      socket.data = {};
      room.removeMember(member);
      if (room.members().length === 0) service.delete(room);
      else broadcast(room);
    });

    on(C2S.PLAYER_READY, ({ ready }) => {
      const { room, member } = current();
      room.setReady(member, ready !== false);
      broadcast(room);
    });

    on(C2S.GAME_MOVE, ({ move, version }) => {
      const { room, member } = current();
      assert(version === undefined || Number.isInteger(version), ERR.BAD_REQUEST, 'Bad version');
      try {
        room.move(member, move, version);
      } catch (err) {
        // Resync the caller so a stale or rejected client snaps back to truth.
        socket.emit(S2C.ROOM_STATE, room.snapshotFor(member));
        if (room.status !== 'playing') broadcast(room);
        throw err;
      }
      broadcast(room);
      return { version: room.session.version };
    });

    on(C2S.GAME_RESIGN, () => {
      const { room, member } = current();
      room.resign(member);
      broadcast(room);
    });

    on(C2S.GAME_REMATCH, () => {
      const { room, member } = current();
      room.voteRematch(member);
      broadcast(room);
    });

    on(C2S.CHAT_SEND, ({ text }) => {
      const { room, member } = current();
      const msg = room.addChat(member, text);
      io.to(channel(room.code)).emit(S2C.CHAT_MESSAGE, msg);
    });

    socket.on('disconnect', () => detach());
  });

  return { broadcast };
}
