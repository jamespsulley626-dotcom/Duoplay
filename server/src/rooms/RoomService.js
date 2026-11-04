import { ERR, LIMITS, getGame } from '@duoplay/shared';
import { assert } from '../errors.js';
import { makeRoomCode } from '../util.js';
import { Room } from './Room.js';

function parseSettings(raw = {}, plugin) {
  let clock = null;
  if (raw && raw.clock) {
    const initialMs = Number(raw.clock.initialMs);
    const incrementMs = Number(raw.clock.incrementMs ?? 0);
    assert(
      Number.isInteger(initialMs) && initialMs >= LIMITS.CLOCK_MIN_MS && initialMs <= LIMITS.CLOCK_MAX_MS,
      ERR.BAD_REQUEST,
      'Invalid clock time',
    );
    assert(
      Number.isInteger(incrementMs) && incrementMs >= 0 && incrementMs <= LIMITS.INCREMENT_MAX_MS,
      ERR.BAD_REQUEST,
      'Invalid clock increment',
    );
    clock = { initialMs, incrementMs };
  }
  const options = plugin.seatOptions ?? [plugin.seats];
  let players = options[0];
  if (raw && raw.players !== undefined) {
    players = Number(raw.players);
    assert(options.includes(players), ERR.BAD_REQUEST, `This game supports ${options.join(', ')} players`);
  }
  return { clock, allowSpectators: raw?.allowSpectators !== false, players };
}

export class RoomService {
  constructor(store, { forfeitAfterMs = 120_000, roomTtlMs = 30 * 60_000 } = {}) {
    this.store = store;
    this.forfeitAfterMs = forfeitAfterMs;
    this.roomTtlMs = roomTtlMs;
    this.onRoomChange = () => {};
  }

  create({ gameId, settings, now = Date.now() }) {
    const plugin = getGame(gameId);
    assert(plugin, ERR.UNKNOWN_GAME, 'That game is not available yet');
    const parsed = parseSettings(settings, plugin);
    let code;
    do code = makeRoomCode();
    while (this.store.has(code));
    const room = new Room({ code, gameId, settings: parsed, now, onChange: (r) => this.onRoomChange(r) });
    this.store.set(room);
    return room;
  }

  get(code) {
    return this.store.get(code);
  }

  delete(room) {
    room.dispose();
    this.store.delete(room.code);
  }

  /** Periodic housekeeping: forfeit long disconnects, delete idle rooms. */
  sweep(now = Date.now()) {
    for (const room of [...this.store.values()]) {
      if (room.checkAbandoned(now, this.forfeitAfterMs)) this.onRoomChange(room);
      if (room.isIdle(now, this.roomTtlMs)) this.delete(room);
    }
  }
}
