# Duoplay

Mobile-first real-time board games for two friends. Create a room, share a
5-letter code or link, both press Ready, play. Server-authoritative rules,
reconnection, optional chess clocks, chat and spectators.

**Games:** Connect 4, Reversi, Chinese Chess, Block Territory, Chinese Checkers (2–6 players) · Jungle (plugin slot ready)

```
duoplay/
├── shared/                 # imported by BOTH server and client
│   ├── protocol.js         # event names, error codes, limits
│   ├── catalog.js          # game registry + lobby metadata
│   └── games/              # pure rules modules ("plugins"): connect4.js, reversi.js, xiangqi.js, chinese-checkers.js, block-territory.js
├── server/                 # Node + Express + Socket.IO
│   ├── src/engine/GameSession.js   # turn order, versioning, clocks (game-agnostic)
│   ├── src/rooms/Room.js           # seats, ready check, rematch, score, chat
│   ├── src/rooms/RoomService.js    # create/lookup, settings validation, sweeper
│   ├── src/store/MemoryRoomStore.js# swap for Redis later
│   ├── src/socket.js               # event handlers, rate limit, ack/error mapping
│   └── test/                       # rules, engine, and two-client socket tests
└── client/                 # React 19 + Tailwind v4 + Vite
    └── src/
        ├── hooks/useRoom.js        # join/rejoin, live snapshot, actions
        ├── pages/Lobby.jsx, Room.jsx
        ├── components/             # PlayerStrip (clocks), Chat, ui
        └── games/                  # board renderers, keyed by game id
```

## Run it

```bash
npm install
npm run dev          # server :3001 + Vite :5173 (proxied), open on your phone via your LAN IP
npm test             # rules + engine + socket integration tests
npm run build && npm start   # production: server also serves client/dist on :3001
```

Requires Node 20+. Deploy as one process anywhere that supports WebSockets
(Fly.io, Render, Railway). Set `PORT`; set `CORS_ORIGIN` only if the client is
hosted on a different origin.

## How a match flows

```
Alice: Create Room ──room:create──▶ server: new Room(code), Alice = seat 0, returns {code, token}
Alice shares /r/K7Q2M
Bob:  opens link → name gate ──room:join{code,name}──▶ seat 1, returns {token}
both: ──player:ready──▶ when all seats ready → GameSession starts (first player alternates per match)
turn: ──game:move{move:{col:3}, version:6}──▶ validate → apply → version 7 → room:state to everyone
end:  result shown, score updated ──game:rematch── (both) → new match
```

The client never changes game state itself; it renders whatever the latest
`room:state` says. That's what makes reconnection trivial: rejoin, get a
snapshot, done.

## Data models

```ts
type Seat = number; // 0..seats-1

interface Room {                       // server/src/rooms/Room.js
  code: string;                        // 5 chars, no 0/O/1/I/L
  gameId: string;
  settings: { clock: { initialMs: number; incrementMs: number } | null; allowSpectators: boolean };
  status: 'waiting' | 'ready_check' | 'playing' | 'finished';
  seats: (Member | null)[];
  spectators: Map<string, Member>;
  session: GameSession | null;
  matchCount: number;
  score: number[];                     // wins per seat, reset when a seat changes hands
  rematchVotes: Set<Seat>;
  chat: ChatMessage[];                 // last 50
  createdAt: number; lastActiveAt: number;
}

interface Member {
  id: string;                          // public
  token: string;                       // SECRET: 128-bit, proves seat ownership, never broadcast
  name: string;
  role: 'player' | 'spectator';
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  disconnectedAt: number | null;
}

interface GameSession {                // server/src/engine/GameSession.js
  state: unknown;                      // plugin-defined, JSON-serialisable
  version: number;                     // +1 per applied move (optimistic concurrency)
  result: { winner: Seat | null; reason: string } | null;
  history: { seat: Seat; move: unknown; at: number }[];
  clock: { initialMs; incrementMs; remaining: number[]; turnStartedAt: number } | null;
}

interface ChatMessage { id; from; memberId; seat: Seat | null; role; text; at }
```

**RoomSnapshot** (what clients receive; personalised per viewer):

```ts
{
  code, gameId, status, settings,
  players: ({ id, name, role, seat, ready, connected } | null)[],
  spectators: { id, name, ... }[],
  score, matchCount, rematchVotes: Seat[],
  game: { version, state, turnSeat, result, startedAt,
          clock: { initialMs, incrementMs, remaining: number[], running: Seat | null } | null } | null,
  you: { id, role, seat } | null,
  serverNow: number
}
```

## WebSocket event schema

All client→server events use a Socket.IO **ack**. Every ack is
`{ ok: true, ...data }` or `{ ok: false, error: { code, message } }`.

| Event (C→S) | Payload | Ack data | Notes |
|---|---|---|---|
| `room:create` | `{ gameId, name, settings?: { clock?, players?, allowSpectators? } }` | `{ code, token, room, chat }` | Creator takes seat 0 |
| `room:join` | `{ code, name, token?, asSpectator? }` | `{ code, token, room, chat }` | With a known token → reclaims seat (reconnect). Full room → spectator |
| `room:leave` | `{}` | `{}` | Mid-game leave = forfeit |
| `player:ready` | `{ ready: boolean }` | `{}` | All seats ready → match starts |
| `game:move` | `{ move, version }` | `{ version }` | `move` is game-specific, e.g. `{ col: 3 }` |
| `game:resign` | `{}` | `{}` | |
| `game:rematch` | `{}` | `{}` | All players vote → new match, first player alternates |
| `chat:send` | `{ text }` | `{}` | ≤200 chars, control chars stripped |

| Event (S→C) | Payload |
|---|---|
| `room:state` | `RoomSnapshot` — sent after every change, to each member individually |
| `chat:message` | `ChatMessage` |
| `error` | `{ code, message }` — e.g. `SESSION_REPLACED` when the same seat opens in another tab |

Error codes: `BAD_REQUEST, UNKNOWN_GAME, ROOM_NOT_FOUND, ROOM_FULL, NOT_IN_ROOM,
NOT_A_PLAYER, GAME_NOT_ACTIVE, NOT_YOUR_TURN, ILLEGAL_MOVE, STALE_STATE,
RATE_LIMITED, SESSION_REPLACED, INTERNAL`.

Full snapshots instead of diffs: a Connect 4 snapshot is ~1 KB, and snapshots
make reconnection, spectators and late joiners need no special code. Switch to
diffs only if a game's state gets large.

## Anti-cheat basics

- **Server-authoritative.** Clients send intent (`{ col: 3 }`), never results. The server runs the rules and broadcasts the outcome.
- **Every move validated**: membership → role (spectators rejected) → game active → `version` matches → it's your seat's turn → clock not expired → `plugin.validateMove` type-checks and bounds-checks the payload.
- **Version check** stops double-taps, replayed packets and moves made on a stale board. Rejected callers are immediately resynced.
- **Seat tokens** are 128-bit random, stored only on that device, never included in snapshots (tested).
- **Server clocks.** Time is measured on the server; a server timer flags the player even if their client goes silent.
- **Abuse limits**: per-socket token-bucket rate limit, 16 KB max message, name/chat length caps, `hasOwnProperty` game lookup (no `__proto__` tricks), 20 spectators max.
- Not yet covered (fine for friends, needed for public play): accounts, engine-assist detection for chess-like games, IP-level rate limits, chat moderation.

## Reconnection

- Socket.IO auto-reconnects with backoff. On every `connect`, `useRoom` re-sends `room:join` with the stored token → same seat, fresh snapshot.
- Opponents see an **Offline** badge. After **2 minutes** away mid-game the player forfeits (`abandoned`). Clocks keep running while offline — change `GameSession` if you'd rather pause.
- Rooms with nobody connected for **30 minutes** are deleted by the sweeper.

## Adding a game (plugin contract)

See `shared/games/README.md`. In short, a game is two files:

1. `shared/games/<id>.js` — pure rules: `setup, currentSeat, validateMove, applyMove, outcome, view` (+ optional `legalMoves`). Register in `shared/catalog.js` and flip `available: true`.
2. `client/src/games/<id>/Board.jsx` — renders `state`, calls `onMove(move)`. Register in `client/src/games/index.js` with seat colours.

Nothing in the room, socket, clock or lobby code changes.

Reversi (done) shows the pattern for games with passes: `applyMove` sets `turn` to whoever can actually move and records `passed`, so the engine needs no changes. Its board also uses the optional `describeResult` UI hook to show the final disc count.

Chinese Chess (done) uses the optional `seatsFor(state)` UI hook because colours swap each match (the starting seat plays Red). It implements palace/river limits, horse-leg and elephant-eye blocking, cannon screens, flying general, no self-check, and stalemate = loss; draws after 120 plies without a capture or 400 plies total. Perpetual check/chase rulings are not implemented yet.

Chinese Checkers (done) is the first N-player game. The plugin declares `seatOptions: [2,3,4,5,6]`; the host picks a count (`settings.players`) and the room creates that many seats. With more than 2 players, resign / timeout / leaving / abandoning calls the plugin's `eliminate(state, seat)`: the seat is skipped from then on, its marbles stay as obstacles, and the game continues until someone fills their target point (or one player is left). Nobody can join a game in progress; late arrivals become spectators. Moves are `{ from, to }` and the server finds the step or hop chain itself.

Block Territory (ブロック陣取り, done): 14×14 board, 21 pieces each (89 squares, 91 orientations). The first piece covers your start square; later pieces must touch your own at a corner and never along an edge; touching the opponent is fine. Moves are `{ piece, cells }` in absolute board squares; the server checks the squares form that piece in some rotation/reflection, so the client can rotate any way it likes. Players with no legal placement are skipped; the game ends when neither can place, and most squares covered wins.

Notes for the last one:

| Game | State | Move | Gotchas |
|---|---|---|---|
| Jungle | 9×7 + terrain map | `{ from, to }` | Rat vs elephant, rat swims, lion/tiger jump rivers (blocked by rat), traps, dens |

## Scaling beyond memory

The MVP keeps everything in one process, which is plenty for friends (thousands of rooms). When you need restarts without losing games, or more than one server:

**Redis (live state)**
1. Implement `RedisRoomStore` with the same `get/has/set/delete/values` methods. Serialise `Room` to JSON (`seats`, `spectators`, `settings`, `score`, `session.{state, version, result, history, clock}`); rehydrate by passing the plugin back in. Give keys a TTL (`EXPIRE room:<code> 1800`) instead of the sweeper.
2. Make writes atomic per room: `WATCH`/`MULTI` on `room:<code>` (or a Lua script) so two servers can't apply moves to the same version. The existing `version` field is the compare-and-set value.
3. Add `@socket.io/redis-adapter` so `io.to(socketId)` and room broadcasts reach sockets on other instances.
4. Clock flags: replace the in-process `setTimeout` with a Redis sorted set of `{code, deadline}` polled every ~250 ms by one elected worker (or BullMQ delayed jobs).
5. Use sticky sessions at the load balancer if you keep the HTTP long-polling fallback.

**Postgres (history and accounts)**

```sql
create table matches (
  id uuid primary key, room_code text, game_id text not null,
  players jsonb not null,            -- [{seat, name, user_id}]
  settings jsonb, result jsonb,
  started_at timestamptz, ended_at timestamptz
);
create table match_moves (
  match_id uuid references matches(id) on delete cascade,
  ply int not null, seat int not null, move jsonb not null, at timestamptz not null,
  primary key (match_id, ply)
);
create table users (id uuid primary key, display_name text, created_at timestamptz default now());
```

Write a `matches` row when a session finishes (`GameSession.history` already has every move), which enables replays, stats and ratings. Keep Postgres off the hot path; live moves stay in memory/Redis.

## Roadmap ideas

QR code on the waiting screen · move sounds and haptics (`navigator.vibrate`) · undo requests · PWA install · Elo per game · bots via `legalMoves` · i18n (the catalog already carries Chinese names).
