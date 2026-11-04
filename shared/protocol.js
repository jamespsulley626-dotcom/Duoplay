/**
 * Wire protocol shared by client and server.
 *
 * Client -> server events are sent with a Socket.IO acknowledgement callback.
 * Every ack has the shape:
 *   { ok: true, ...data }  |  { ok: false, error: { code, message } }
 *
 * Server -> client pushes:
 *   room:state    full RoomSnapshot, personalised per recipient (`you` field)
 *   chat:message  one ChatMessage
 *   error         { code, message } for problems not tied to a request
 */

export const C2S = Object.freeze({
  ROOM_CREATE: 'room:create',   // { gameId, name, settings? }        -> { code, token, room, chat }
  ROOM_JOIN: 'room:join',       // { code, name, token?, asSpectator? } -> { code, token, room, chat }
  ROOM_LEAVE: 'room:leave',     // {}                                  -> {}
  PLAYER_READY: 'player:ready', // { ready: boolean }                  -> {}
  GAME_MOVE: 'game:move',       // { move, version }                   -> { version }
  GAME_RESIGN: 'game:resign',   // {}                                  -> {}
  GAME_REMATCH: 'game:rematch', // {}                                  -> {}
  CHAT_SEND: 'chat:send',       // { text }                            -> {}
});

export const S2C = Object.freeze({
  ROOM_STATE: 'room:state',
  CHAT_MESSAGE: 'chat:message',
  ERROR: 'error',
});

export const ROOM_STATUS = Object.freeze({
  WAITING: 'waiting',         // seats not all filled
  READY_CHECK: 'ready_check', // seats filled, waiting for everyone to press Ready
  PLAYING: 'playing',
  FINISHED: 'finished',       // result shown, rematch voting open
});

export const ERR = Object.freeze({
  BAD_REQUEST: 'BAD_REQUEST',
  UNKNOWN_GAME: 'UNKNOWN_GAME',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_A_PLAYER: 'NOT_A_PLAYER',
  GAME_NOT_ACTIVE: 'GAME_NOT_ACTIVE',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ILLEGAL_MOVE: 'ILLEGAL_MOVE',
  STALE_STATE: 'STALE_STATE',
  RATE_LIMITED: 'RATE_LIMITED',
  SESSION_REPLACED: 'SESSION_REPLACED',
  INTERNAL: 'INTERNAL',
});

export const LIMITS = Object.freeze({
  CODE_LENGTH: 5,
  NAME_MAX: 20,
  CHAT_MAX: 200,
  CHAT_HISTORY: 50,
  MAX_SPECTATORS: 20,
  CLOCK_MIN_MS: 30_000,
  CLOCK_MAX_MS: 60 * 60_000,
  INCREMENT_MAX_MS: 60_000,
});

/** Room codes avoid look-alike characters (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.CODE_LENGTH);
}
