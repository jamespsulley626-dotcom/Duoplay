import { useState } from 'react';
import { C2S, CATALOG, LIMITS, ROOM_STATUS } from '@duoplay/shared';
import { ChatPanel, ChatSheet } from '../components/Chat.jsx';
import PlayerStrip from '../components/PlayerStrip.jsx';
import { Badge, Button, Card, Field, Toast } from '../components/ui.jsx';
import { getGameUI } from '../games/index.js';
import { useRoom } from '../hooks/useRoom.js';
import { navigate } from '../lib/router.js';
import { clearToken, getName, getToken, roomLink, setName } from '../lib/session.js';

const REASONS = {
  four_in_a_row: 'four in a row',
  board_full: 'board is full',
  resign: 'by resignation',
  timeout: 'on time',
  abandoned: 'opponent disconnected',
  left: 'opponent left',
  filled_target: 'all marbles home',
  last_player: 'last player still in',
  no_moves: 'nobody can move',
  more_squares: 'more squares covered',
  equal_squares: 'same number of squares',
  checkmate: 'by checkmate',
  stalemate: 'by stalemate (no legal move)',
  no_capture: '120 moves without a capture',
  move_limit: 'move limit reached',
  more_discs: 'more discs',
  equal_discs: 'equal discs',
};

export default function Room({ code, asSpectator }) {
  // A friend opening the share link for the first time needs a name before joining.
  const [name, setNameState] = useState(() => getName() || (getToken(code) ? 'Player' : ''));
  if (!name) return <NameGate code={code} onSubmit={(n) => (setName(n), setNameState(n))} />;
  return <RoomView code={code} name={name} asSpectator={asSpectator} />;
}

function NameGate({ code, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <Card>
        <p className="text-sm text-muted">You’ve been invited to room</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
        >
          <Field
            id="gate-name"
            label="Your name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={LIMITS.NAME_MAX}
            placeholder="e.g. Mei"
          />
          <Button type="submit" size="lg" disabled={!value.trim()}>Join game</Button>
        </form>
      </Card>
    </main>
  );
}

function RoomView({ code, name, asSpectator }) {
  const { room, chat, error, clearError, fatal, connected, act } = useRoom(code, name, { asSpectator });
  const [pending, setPending] = useState(false);

  if (fatal) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-5xl">🫥</p>
        <p className="text-xl font-semibold">{fatal.message}</p>
        <Button onClick={() => navigate('/')}>Back to lobby</Button>
      </main>
    );
  }
  if (!room) {
    return <main className="flex min-h-dvh items-center justify-center text-muted">Joining {code}…</main>;
  }

  const meta = CATALOG.find((g) => g.id === room.gameId);
  const ui = getGameUI(room.gameId);
  // Some games (Xiangqi) swap colours between matches, so seat styling can depend on state.
  const seats = (room.game && ui.seatsFor?.(room.game.state)) || ui.seats;
  const you = room.you;
  const mySeat = you?.role === 'player' ? you.seat : null;
  const multi = room.players.length > 2;
  // Two players: you at the bottom, opponent on top. Spectators see seat 0 at the bottom.
  const bottomSeat = mySeat ?? 0;
  const topSeat = (bottomSeat + 1) % room.players.length;
  // More players: everyone else in turn order after you, you last.
  const others = [...room.players.keys()].map((k) => (bottomSeat + 1 + k) % room.players.length).filter((s) => s !== bottomSeat);

  async function leave() {
    await act(C2S.ROOM_LEAVE);
    clearToken(code);
    navigate('/');
  }

  async function move(m) {
    if (pending) return;
    setPending(true);
    await act(C2S.GAME_MOVE, { move: m, version: room.game.version });
    setPending(false);
  }

  const strip = (seat, compact = false) => (
    <PlayerStrip
      key={seat}
      compact={compact}
      out={room.game?.eliminated?.includes(seat)}
      player={room.players[seat]}
      seat={seat}
      seatUI={seats[seat]}
      isYou={seat === mySeat}
      game={room.game}
      score={room.score[seat]}
      receivedAt={room.receivedAt}
    />
  );

  const inGame = room.status === ROOM_STATUS.PLAYING || room.status === ROOM_STATUS.FINISHED;
  const chatProps = { chat, youId: you?.id, act, seatsUI: seats };

  return (
    <div className="flex min-h-dvh flex-col pb-24 lg:pb-6">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur">
       <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3">
        <Button variant="ghost" size="sm" className="px-2.5" onClick={leave} aria-label="Leave room">←</Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">{meta?.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            Room <span className="font-mono font-semibold tracking-widest text-ink">{room.code}</span>
            {room.settings.clock && <Badge>{room.settings.clock.initialMs / 60000}+{room.settings.clock.incrementMs / 1000}</Badge>}
            {room.spectators.length > 0 && <Badge>👀 {room.spectators.length}</Badge>}
          </div>
        </div>
        <ShareButton code={room.code} compact />
       </div>
      </header>

      {!connected && (
        <div className="bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">Connection lost — reconnecting…</div>
      )}

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-4 px-3 pt-4 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-3">
          {!inGame && <PreGame room={room} mySeat={mySeat} ui={ui} act={act} />}

          {inGame && (
            <>
              {multi ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{others.map((s) => strip(s, true))}</div> : strip(topSeat)}
              <div className="py-2">
                <ui.Board
                  state={room.game.state}
                  mySeat={mySeat}
                  canMove={room.status === ROOM_STATUS.PLAYING && room.game.turnSeat === mySeat && connected && !pending}
                  onMove={move}
                />
              </div>
              {strip(bottomSeat)}
              <GameFooter room={room} mySeat={mySeat} ui={ui} act={act} />
            </>
          )}
        </section>

        <aside className="sticky top-18 hidden h-[calc(100dvh-6.5rem)] overflow-hidden rounded-2xl border border-line bg-surface lg:flex lg:flex-col">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Chat</div>
          <ChatPanel {...chatProps} className="flex-1" />
        </aside>
      </div>

      <div className="lg:hidden">
        <ChatSheet {...chatProps} />
      </div>
      <Toast message={error?.message} onClose={clearError} />
    </div>
  );
}

function ShareButton({ code, compact = false }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = roomLink(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Play with me on Duoplay', text: `Room code ${code}`, url });
        return;
      } catch {
        /* cancelled → fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this link', url);
    }
  }
  return (
    <Button variant={compact ? 'secondary' : 'primary'} onClick={share} size={compact ? 'sm' : 'lg'} className={compact ? '' : 'w-full'}>
      {copied ? 'Link copied!' : compact ? 'Share' : 'Share invite link'}
    </Button>
  );
}

function PreGame({ room, mySeat, ui, act }) {
  const me = mySeat !== null ? room.players[mySeat] : null;
  const waiting = room.status === ROOM_STATUS.WAITING;
  return (
    <Card className="animate-pop flex flex-col items-center gap-5 py-10 text-center">
      {waiting ? (
        <>
          <p className="text-sm text-muted">
            Send this code to {room.players.length > 2 ? `your friends · ${room.players.filter(Boolean).length} of ${room.players.length} joined` : 'your friend'}
          </p>
          <p className="font-mono text-5xl font-bold tracking-[0.25em] text-accent">{room.code}</p>
          <div className="w-full max-w-xs"><ShareButton code={room.code} /></div>
        </>
      ) : (
        <p className="text-2xl font-bold">Ready to play?</p>
      )}

      <div className="grid w-full max-w-sm gap-2">
        {room.players.map((p, seat) => (
          <div key={seat} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className={`size-5 rounded-full ${ui.seats[seat].dot}`} />
            <span className="flex-1 truncate text-left font-medium">{p ? p.name : <span className="text-faint">Waiting for player…</span>}</span>
            {p && !p.connected && <Badge tone="bad">Offline</Badge>}
            {p && <Badge tone={p.ready ? 'good' : 'neutral'}>{p.ready ? 'Ready' : 'Not ready'}</Badge>}
          </div>
        ))}
      </div>

      {me && (
        <Button size="lg" className="w-full max-w-sm" variant={me.ready ? 'secondary' : 'primary'} onClick={() => act(C2S.PLAYER_READY, { ready: !me.ready })}>
          {me.ready ? 'Cancel ready' : waiting ? (room.players.length > 2 ? 'Ready (waiting for friends)' : 'Ready (waiting for friend)') : "I'm ready"}
        </Button>
      )}
      {!me && <p className="text-sm text-muted">You’re watching. The game starts when both players are ready.</p>}
    </Card>
  );
}

function GameFooter({ room, mySeat, ui, act }) {
  const { game, status, players, rematchVotes } = room;
  if (status === ROOM_STATUS.PLAYING) {
    return mySeat !== null ? (
      <div className="flex justify-center">
        <Button variant="danger" size="sm" onClick={() => confirm('Resign this game?') && act(C2S.GAME_RESIGN)}>Resign</Button>
      </div>
    ) : null;
  }

  const { winner, reason } = game.result;
  const headline =
    winner === null ? "It's a draw" : winner === mySeat ? 'You win! 🎉' : `${players[winner]?.name ?? 'Opponent'} wins`;
  // Session-level endings (resign, clock, leaving) are generic; rule-based endings let the game describe them.
  const sessionEnd = ['resign', 'timeout', 'abandoned', 'left'].includes(reason);
  const detail = (!sessionEnd && ui.describeResult?.(game.state, game.result)) || REASONS[reason] || reason;
  const voted = mySeat !== null && rematchVotes.includes(mySeat);
  const otherVoted = rematchVotes.some((s) => s !== mySeat);

  return (
    <Card className="animate-pop flex flex-col items-center gap-3 text-center">
      <p className="text-2xl font-bold">{headline}</p>
      <p className="text-sm text-muted">
        {detail}
      </p>
      {mySeat !== null && (
        <Button size="lg" className="w-full max-w-xs" disabled={voted} onClick={() => act(C2S.GAME_REMATCH)}>
          {voted ? 'Waiting for opponent…' : otherVoted ? 'Accept rematch' : 'Rematch'}
        </Button>
      )}
    </Card>
  );
}
