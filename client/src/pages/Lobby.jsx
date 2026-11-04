import { useState } from 'react';
import { C2S, CATALOG, LIMITS, getGame } from '@duoplay/shared';
import { Badge, Button, Card, Field, Toast } from '../components/ui.jsx';
import { navigate } from '../lib/router.js';
import { extractCode, getName, setName, setToken } from '../lib/session.js';
import { request } from '../net/socket.js';

const CLOCKS = [
  { id: 'none', label: 'No clock', value: null },
  { id: '3+2', label: '3 + 2', value: { initialMs: 180_000, incrementMs: 2_000 } },
  { id: '5', label: '5 min', value: { initialMs: 300_000, incrementMs: 0 } },
  { id: '10+5', label: '10 + 5', value: { initialMs: 600_000, incrementMs: 5_000 } },
];

const STEPS = [
  { title: 'Create a room', body: 'Pick a game and get a 5-letter code.' },
  { title: 'Send the link', body: 'Friends open it on any phone or laptop.' },
  { title: 'Play', body: 'Everyone taps Ready. Moves sync instantly.' },
];

export default function Lobby() {
  const [name, setNameState] = useState(getName);
  const [tab, setTab] = useState('create');
  const [gameId, setGameId] = useState('connect4');
  const [clockId, setClockId] = useState('none');
  const [players, setPlayers] = useState(2);
  const [code, setCode] = useState('');
  const [watch, setWatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const playerOptions = getGame(gameId)?.seatOptions ?? [2];
  const playerCount = playerOptions.includes(players) ? players : playerOptions[0];
  const trimmed = name.trim();
  const saveName = () => trimmed && setName(trimmed);

  async function createRoom() {
    if (!trimmed) return setError('Enter your name first');
    saveName();
    setBusy(true);
    const clock = CLOCKS.find((c) => c.id === clockId).value;
    const res = await request(C2S.ROOM_CREATE, { gameId, name: trimmed, settings: { clock, players: playerCount } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setToken(res.code, res.token);
    navigate(`/r/${res.code}`);
  }

  function joinRoom(e) {
    e.preventDefault();
    const c = extractCode(code);
    if (c.length !== LIMITS.CODE_LENGTH) return setError('Room codes are 5 characters');
    if (!trimmed) return setError('Enter your name first');
    saveName();
    navigate(`/r/${c}${watch ? '?watch' : ''}`);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm text-white">D</span>
            Duoplay
          </a>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="rounded-full px-3 py-1.5 text-muted hover:text-ink">How it works</a>
            <a href="#games" className="rounded-full px-3 py-1.5 text-muted hover:text-ink">Games</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-7 pb-16 sm:pt-16">
        <div className="grid gap-7 lg:grid-cols-[1fr_420px] lg:items-start lg:gap-10">
          {/* Hero */}
          <section className="lg:pt-6">
            <h1 className="text-[1.75rem] leading-[1.15] font-extrabold tracking-tight sm:text-5xl">
              Classic board games.
              <br />
              <span className="text-accent">One link</span> to play with a friend.
            </h1>
            <p className="mt-3 max-w-md text-[15px] text-muted sm:mt-4 sm:text-lg">
              Connect 4, Reversi, Chinese Chess, Block Territory and Chinese Checkers for up to 6 — with Jungle on the way. Real-time, in the browser.
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {['No install', 'No sign-up', 'Phone & desktop'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="text-accent">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {/* Play panel */}
          <Card padded={false} className="shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
            <div className="p-5 pb-0">
              <Field
                id="name"
                label="Your name"
                value={name}
                maxLength={LIMITS.NAME_MAX}
                onChange={(e) => setNameState(e.target.value)}
                onBlur={saveName}
                placeholder="e.g. James"
                autoComplete="nickname"
              />
              <div className="mt-5 grid grid-cols-2 rounded-full bg-ink/5 p-1 text-sm font-semibold" role="tablist">
                {[
                  ['create', 'Create room'],
                  ['join', 'Join with code'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-full py-2 transition ${tab === id ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'create' ? (
              <div className="p-5">
                <p className="mb-2 text-sm font-medium text-muted">Game</p>
                <div className="space-y-1.5">
                  {CATALOG.filter((g) => g.available).map((g) => (
                    <GameRow key={g.id} game={g} selected={g.id === gameId} onSelect={() => setGameId(g.id)} />
                  ))}
                </div>

                {playerOptions.length > 1 && (
                  <>
                    <p className="mt-5 mb-2 text-sm font-medium text-muted">Players</p>
                    <div className="flex flex-wrap gap-1.5">
                      {playerOptions.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPlayers(n)}
                          aria-pressed={playerCount === n}
                          className={`min-w-11 rounded-full border px-3 py-1.5 text-sm transition ${playerCount === n ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:border-ink/30'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <p className="mt-5 mb-2 text-sm font-medium text-muted">Clock</p>
                <div className="flex flex-wrap gap-1.5">
                  {CLOCKS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClockId(c.id)}
                      aria-pressed={clockId === c.id}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${clockId === c.id ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:border-ink/30'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <Button size="lg" className="mt-6 w-full" onClick={createRoom} disabled={busy}>
                  {busy ? 'Creating…' : 'Create room'}
                </Button>
              </div>
            ) : (
              <form onSubmit={joinRoom} className="p-5">
                <Field
                  id="code"
                  label="Room code or link"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="K7Q2M"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="text-center font-mono text-xl tracking-[0.35em] uppercase"
                />
                <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                  Watch as a spectator
                </label>
                <Button type="submit" size="lg" className="mt-6 w-full">Join room</Button>
              </form>
            )}
          </Card>
        </div>

        {/* Games */}
        <section id="games" className="mt-20 scroll-mt-20">
          <h2 className="text-xl font-bold">Games</h2>
          <p className="mt-1 text-sm text-muted">2–6 players · real-time · {CATALOG.length} titles</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={!g.available}
                onClick={() => {
                  setGameId(g.id);
                  setTab('create');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition enabled:hover:border-ink/25 disabled:cursor-default"
              >
                <span className={`grid size-12 shrink-0 place-items-center rounded-xl text-2xl ${g.available ? 'bg-accent-soft' : 'bg-ink/5 grayscale'}`} aria-hidden>
                  {g.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{g.name}</span>
                    <span className="text-sm text-faint">{g.nameZh}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{g.blurb}</span>
                  <span className="mt-2 flex gap-1.5">
                    {g.available ? <Badge tone="accent">Play now</Badge> : <Badge>Coming soon</Badge>}
                    <Badge>~{g.minutes} min</Badge>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mt-20 scroll-mt-20">
          <h2 className="text-xl font-bold">How it works</h2>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-surface p-5">
                <span className="font-mono text-3xl font-bold text-accent/30">{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-2 font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-faint">
          <span>© {new Date().getFullYear()} Duoplay</span>
          <span>Made for playing with friends</span>
        </div>
      </footer>

      <Toast message={error} onClose={() => setError(null)} />
    </div>
  );
}

function GameRow({ game, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? 'border-accent bg-accent-soft/60' : 'border-line hover:border-ink/25'}`}
    >
      <span className="grid size-9 place-items-center rounded-lg bg-surface text-lg" aria-hidden>{game.emoji}</span>
      <span className="flex-1">
        <span className="font-semibold">{game.name}</span> <span className="text-sm text-faint">{game.nameZh}</span>
      </span>
      <span className={`size-4 rounded-full border-2 ${selected ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_white]' : 'border-line'}`} />
    </button>
  );
}
