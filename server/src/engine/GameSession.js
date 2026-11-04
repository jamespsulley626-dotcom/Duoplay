import { ERR } from '@duoplay/shared';
import { GameError } from '../errors.js';

/**
 * Game-agnostic match runner. Wraps a rules plugin and enforces:
 *  - turn order (plugin.currentSeat is the source of truth)
 *  - optimistic concurrency (`version` must match, so double taps / stale
 *    clients cannot apply a move twice)
 *  - full move validation before any state change
 *  - optional chess-style clocks with increment, flagged by a server timer
 *  - N-player games: resign / timeout / leaving eliminates one seat via the
 *    plugin's optional `eliminate(state, seat)`; the game goes on without them.
 *    Two-player games (or plugins without `eliminate`) end with the other seat winning.
 */
export class GameSession {
  constructor(plugin, { startingSeat = 0, seats = plugin.seats, clock = null, now = Date.now(), onTimeout } = {}) {
    this.plugin = plugin;
    this.seatCount = seats;
    this.state = plugin.setup({ startingSeat, seats });
    this.eliminated = []; // seats knocked out of an N-player game
    this.version = 0;
    this.result = null;
    this.startedAt = now;
    this.history = []; // [{ seat, move, at }] — enough to replay or persist a match
    this.onTimeout = onTimeout;
    this.timer = null;
    this.clock = clock
      ? {
          initialMs: clock.initialMs,
          incrementMs: clock.incrementMs,
          remaining: Array(seats).fill(clock.initialMs),
          turnStartedAt: now,
        }
      : null;
    this.#schedule(now);
  }

  get turnSeat() {
    return this.result ? null : this.plugin.currentSeat(this.state);
  }

  timeLeft(seat, now = Date.now()) {
    if (!this.clock) return null;
    const base = this.clock.remaining[seat];
    return seat === this.turnSeat ? base - (now - this.clock.turnStartedAt) : base;
  }

  move(seat, move, expectedVersion, now = Date.now()) {
    if (this.result) throw new GameError(ERR.GAME_NOT_ACTIVE, 'The game is over');
    if (expectedVersion !== undefined && expectedVersion !== this.version) {
      throw new GameError(ERR.STALE_STATE, 'Board changed — refreshing');
    }
    if (this.turnSeat !== seat) throw new GameError(ERR.NOT_YOUR_TURN, 'Not your turn');

    let left = null;
    if (this.clock) {
      left = this.timeLeft(seat, now);
      if (left <= 0) {
        this.resign(seat, 'timeout', now);
        throw new GameError(ERR.GAME_NOT_ACTIVE, 'Out of time');
      }
    }

    const problem = this.plugin.validateMove(this.state, move, seat);
    if (problem) throw new GameError(ERR.ILLEGAL_MOVE, problem);

    this.state = this.plugin.applyMove(this.state, move, seat);
    this.version += 1;
    this.history.push({ seat, move, at: now });

    if (this.clock) {
      this.clock.remaining[seat] = left + this.clock.incrementMs;
      this.clock.turnStartedAt = now;
    }

    const outcome = this.plugin.outcome(this.state);
    if (outcome) this.#finish(outcome, now);
    else this.#schedule(now);
  }

  /** Resign, flag on time, leave or abandon. Ends a 2-player game; eliminates one seat otherwise. */
  resign(seat, reason = 'resign', now = Date.now()) {
    if (this.result || this.eliminated.includes(seat)) return;
    if (this.seatCount <= 2 || typeof this.plugin.eliminate !== 'function') {
      this.#finish({ winner: this.#otherSeat(seat), reason, loser: seat }, now);
      return;
    }
    const turnBefore = this.turnSeat;
    if (this.clock && turnBefore !== null) {
      this.clock.remaining[turnBefore] = Math.max(0, this.timeLeft(turnBefore, now));
      this.clock.turnStartedAt = now;
    }
    this.eliminated.push(seat);
    this.state = this.plugin.eliminate(this.state, seat, reason);
    this.version += 1;
    this.history.push({ seat, eliminated: reason, at: now });
    const outcome = this.plugin.outcome(this.state);
    if (outcome) this.#finish(outcome, now);
    else this.#schedule(now);
  }

  snapshot(viewerSeat, now = Date.now()) {
    const turnSeat = this.turnSeat;
    return {
      version: this.version,
      state: this.plugin.view(this.state, viewerSeat),
      turnSeat,
      result: this.result,
      eliminated: this.eliminated,
      startedAt: this.startedAt,
      clock: this.clock && {
        initialMs: this.clock.initialMs,
        incrementMs: this.clock.incrementMs,
        remaining: this.clock.remaining.map((_, s) => Math.max(0, this.timeLeft(s, now))),
        running: turnSeat,
      },
    };
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  #otherSeat(seat) {
    return (seat + 1) % this.seatCount; // only used for 2-player endings
  }

  #finish(result, now) {
    if (this.clock && this.turnSeat !== null) {
      this.clock.remaining[this.turnSeat] = Math.max(0, this.timeLeft(this.turnSeat, now));
    }
    this.result = result;
    this.dispose();
  }

  #schedule(now) {
    this.dispose();
    if (!this.clock || this.turnSeat === null) return;
    const ms = Math.max(0, this.timeLeft(this.turnSeat, now));
    this.timer = setTimeout(() => {
      const t = Date.now();
      const seat = this.turnSeat;
      if (seat === null) return;
      if (this.timeLeft(seat, t) <= 0) {
        this.resign(seat, 'timeout', t);
        this.onTimeout?.();
      } else {
        this.#schedule(t);
      }
    }, ms + 25);
    this.timer.unref?.();
  }
}
