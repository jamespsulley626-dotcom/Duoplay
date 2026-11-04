# Game plugins

A game is a plain object of **pure functions**. The server's `GameSession`
handles everything generic (turn enforcement, versioning, clocks, resign,
timeouts); the plugin only knows the rules.

```js
export const myGame = {
  id: 'my-game',            // unique, used in URLs and the catalog
  seats: 2,                 // default number of players
  seatOptions?: [2, 3, 4],  // optional: player counts the host can choose

  setup({ startingSeat, seats }) -> state
  currentSeat(state)      -> seat number to move, or null when the game is over
  validateMove(state, move, seat) -> null | 'reason it is illegal'
  applyMove(state, move, seat)    -> new state (never mutate the input)
  outcome(state)          -> null | { winner: seat | null, reason: string }
  view(state, viewerSeat) -> state as that viewer may see it (hide private info)
  legalMoves?(state)      -> move[]  (optional; used for hints and bots)
  eliminate?(state, seat) -> state   (optional; N-player games: remove a seat that resigned,
                                      timed out or left, and pass the turn on)
}
```

Rules:

1. **Never trust the move payload.** `validateMove` must type-check every
   field (`Number.isInteger`, bounds, enum membership) before reading the board.
2. **Keep state JSON-serialisable.** It is sent to clients, and later stored in
   Redis/Postgres. No class instances, Maps, or functions.
3. **No randomness or time.** If a game needs dice/shuffles, pass a seed into
   `setup` from the server and use a seeded PRNG so replays are deterministic.
4. **Passing turns** (Reversi): handle inside `applyMove` by setting the next
   `turn` to whoever can actually move; `currentSeat` stays the source of truth.

To add a game:

1. Create `shared/games/<id>.js` and register it in `shared/catalog.js`
   (`GAMES` + set `available: true` in `CATALOG`).
2. Create `client/src/games/<id>/Board.jsx` and register it in
   `client/src/games/index.js`. The board receives
   `{ state, mySeat, canMove, onMove }` and calls `onMove(move)`. Optionally add
   `describeResult(state, result)` for the line under the win/draw headline.
   If seat colours change per match (Xiangqi: the starting seat plays Red), add
   `seatsFor(state)` returning the seat labels/colours for the current match.
3. Add unit tests in `server/test/`.
