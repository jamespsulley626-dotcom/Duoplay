import { ERR, LIMITS, ROOM_STATUS, getGame } from '@duoplay/shared';
import { GameSession } from '../engine/GameSession.js';
import { GameError, assert } from '../errors.js';
import { cleanText, makeId, makeToken } from '../util.js';

/**
 * Member (server-side; `token` never leaves the server):
 * { id, token, name, role: 'player' | 'spectator', seat: number | null,
 *   ready, connected, socketId, joinedAt, disconnectedAt }
 */
function createMember({ name, role, seat, now }) {
  return {
    id: makeId(),
    token: makeToken(),
    name,
    role,
    seat,
    ready: false,
    connected: false,
    socketId: null,
    joinedAt: now,
    disconnectedAt: now,
  };
}

const publicMember = (m) => ({ id: m.id, name: m.name, role: m.role, seat: m.seat, ready: m.ready, connected: m.connected });

export class Room {
  constructor({ code, gameId, settings, now = Date.now(), onChange = () => {} }) {
    const plugin = getGame(gameId);
    assert(plugin, ERR.UNKNOWN_GAME, `Unknown game "${gameId}"`);
    this.code = code;
    this.gameId = gameId;
    this.plugin = plugin;
    this.settings = settings; // { clock: { initialMs, incrementMs } | null, allowSpectators, players }
    this.seatCount = settings.players ?? plugin.seats;
    this.seats = Array(this.seatCount).fill(null);
    this.spectators = new Map(); // id -> member
    this.session = null;
    this.status = ROOM_STATUS.WAITING;
    this.matchCount = 0;
    this.score = Array(this.seatCount).fill(0);
    this.rematchVotes = new Set();
    this.recordedResult = false;
    this.chat = [];
    this.createdAt = now;
    this.lastActiveAt = now;
    this.onChange = onChange;
  }

  members() {
    return [...this.seats.filter(Boolean), ...this.spectators.values()];
  }

  findByToken(token) {
    if (typeof token !== 'string' || !token) return null;
    return this.members().find((m) => m.token === token) ?? null;
  }

  addPlayer({ name, now = Date.now() }) {
    if (this.session && !this.session.result) return null; // no joining mid-game; watch instead
    const seat = this.seats.findIndex((s) => s === null);
    if (seat === -1) return null;
    const member = createMember({ name, role: 'player', seat, now });
    this.seats[seat] = member;
    this.score = Array(this.seatCount).fill(0); // new opponent, fresh scoreboard
    this.#touch(now);
    return member;
  }

  addSpectator({ name, now = Date.now() }) {
    assert(this.settings.allowSpectators, ERR.ROOM_FULL, 'Room is full');
    assert(this.spectators.size < LIMITS.MAX_SPECTATORS, ERR.ROOM_FULL, 'Too many spectators');
    const member = createMember({ name, role: 'spectator', seat: null, now });
    this.spectators.set(member.id, member);
    this.#touch(now);
    return member;
  }

  removeMember(member, now = Date.now()) {
    if (member.role === 'spectator') {
      this.spectators.delete(member.id);
    } else {
      if (this.session && !this.session.result) this.session.resign(member.seat, 'left', now);
      this.#recordResult();
      this.seats[member.seat] = null;
      if (this.session && !this.session.result) {
        // N-player game carries on without them; their seat stays empty until it ends.
        this.#refreshStatus();
      } else {
        this.#endSession();
        this.score = Array(this.seatCount).fill(0);
        for (const p of this.seats) if (p) p.ready = false;
      }
    }
    this.#touch(now);
  }

  markConnected(member, socketId, now = Date.now()) {
    member.connected = true;
    member.socketId = socketId;
    member.disconnectedAt = null;
    this.#touch(now);
  }

  markDisconnected(member, now = Date.now()) {
    member.connected = false;
    member.socketId = null;
    member.disconnectedAt = now;
    this.#touch(now);
  }

  setReady(member, ready, now = Date.now()) {
    this.#requirePlayer(member);
    assert(
      this.status === ROOM_STATUS.WAITING || this.status === ROOM_STATUS.READY_CHECK,
      ERR.GAME_NOT_ACTIVE,
      'Game already started',
    );
    member.ready = Boolean(ready);
    if (this.seats.every((p) => p && p.ready)) this.#startMatch(now);
    this.#touch(now);
  }

  move(member, move, version, now = Date.now()) {
    this.#requirePlayer(member);
    assert(this.session && this.status === ROOM_STATUS.PLAYING, ERR.GAME_NOT_ACTIVE, 'No game in progress');
    try {
      this.session.move(member.seat, move, version, now);
    } finally {
      this.#afterSessionChange(now); // a failed move can still end the game (flag fall)
    }
  }

  resign(member, now = Date.now()) {
    this.#requirePlayer(member);
    assert(this.session && this.status === ROOM_STATUS.PLAYING, ERR.GAME_NOT_ACTIVE, 'No game in progress');
    this.session.resign(member.seat, 'resign', now);
    this.#afterSessionChange(now);
  }

  voteRematch(member, now = Date.now()) {
    this.#requirePlayer(member);
    assert(this.status === ROOM_STATUS.FINISHED, ERR.GAME_NOT_ACTIVE, 'Game is not finished');
    this.rematchVotes.add(member.seat);
    if (this.seats.every((p) => p && this.rematchVotes.has(p.seat))) this.#startMatch(now);
    this.#touch(now);
  }

  addChat(member, rawText, now = Date.now()) {
    const text = cleanText(rawText, LIMITS.CHAT_MAX);
    assert(text, ERR.BAD_REQUEST, 'Message is empty');
    const msg = { id: makeId(), from: member.name, memberId: member.id, seat: member.seat, role: member.role, text, at: now };
    this.chat.push(msg);
    if (this.chat.length > LIMITS.CHAT_HISTORY) this.chat.shift();
    this.#touch(now);
    return msg;
  }

  /** Forfeit players who have been gone too long mid-game. Returns true if anything changed. */
  checkAbandoned(now, forfeitAfterMs) {
    if (this.status !== ROOM_STATUS.PLAYING) return false;
    const gone = this.seats.find(
      (p) => p && !p.connected && !this.session.eliminated.includes(p.seat) && now - p.disconnectedAt > forfeitAfterMs,
    );
    if (!gone) return false;
    this.session.resign(gone.seat, 'abandoned', now);
    this.#afterSessionChange(now);
    return true;
  }

  isIdle(now, ttlMs) {
    const members = this.members();
    if (members.length === 0) return true;
    return members.every((m) => !m.connected && now - m.disconnectedAt > ttlMs);
  }

  snapshotFor(viewer, now = Date.now()) {
    return {
      code: this.code,
      gameId: this.gameId,
      status: this.status,
      settings: this.settings,
      players: this.seats.map((p) => p && publicMember(p)),
      spectators: [...this.spectators.values()].map(publicMember),
      score: this.score,
      matchCount: this.matchCount,
      rematchVotes: [...this.rematchVotes],
      game: this.session ? this.session.snapshot(viewer?.seat ?? null, now) : null,
      you: viewer ? { id: viewer.id, role: viewer.role, seat: viewer.seat } : null,
      serverNow: now,
    };
  }

  dispose() {
    this.session?.dispose();
  }

  #requirePlayer(member) {
    if (member.role !== 'player') throw new GameError(ERR.NOT_A_PLAYER, 'Spectators cannot do that');
  }

  #startMatch(now) {
    this.session?.dispose();
    const startingSeat = this.matchCount % this.seatCount; // rotate who goes first
    this.session = new GameSession(this.plugin, {
      startingSeat,
      seats: this.seatCount,
      clock: this.settings.clock,
      now,
      onTimeout: () => {
        this.#afterSessionChange(Date.now());
        this.onChange(this);
      },
    });
    this.matchCount += 1;
    this.recordedResult = false;
    this.rematchVotes.clear();
    for (const p of this.seats) if (p) p.ready = false;
    this.status = ROOM_STATUS.PLAYING;
  }

  #endSession() {
    this.session?.dispose();
    this.session = null;
    this.rematchVotes.clear();
    this.#refreshStatus();
  }

  #afterSessionChange(now) {
    this.#recordResult();
    this.#refreshStatus();
    this.#touch(now);
  }

  #recordResult() {
    const result = this.session?.result;
    if (!result || this.recordedResult) return;
    this.recordedResult = true;
    if (result.winner !== null && result.winner !== undefined) this.score[result.winner] += 1;
  }

  #refreshStatus() {
    if (this.session) this.status = this.session.result ? ROOM_STATUS.FINISHED : ROOM_STATUS.PLAYING;
    else this.status = this.seats.every(Boolean) ? ROOM_STATUS.READY_CHECK : ROOM_STATUS.WAITING;
  }

  #touch(now) {
    this.lastActiveAt = now;
    if (!this.session) this.#refreshStatus();
  }
}
