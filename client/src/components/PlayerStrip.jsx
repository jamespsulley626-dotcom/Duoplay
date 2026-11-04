import { useEffect, useState } from 'react';
import { Badge } from './ui.jsx';

function useNow(active) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Server sends remaining ms at send time; we count down locally from receipt. */
function Clock({ clock, seat, receivedAt }) {
  const running = clock.running === seat;
  const now = useNow(running);
  const ms = clock.remaining[seat] - (running ? now - receivedAt : 0);
  const tone = running ? (ms < 10_000 ? 'bg-red-600 text-white' : 'bg-gray-900 text-white') : 'bg-gray-100 text-gray-500';
  return <span className={`rounded-md px-2.5 py-1 font-mono text-base tabular-nums ${tone}`}>{fmt(ms)}</span>;
}

export default function PlayerStrip({ player, seat, seatUI, isYou, game, score, receivedAt, compact = false, out = false }) {
  const isTurn = game && game.turnSeat === seat;
  const name = player?.name ?? (game ? 'Left' : 'Waiting…');
  const status = out ? 'Out' : isTurn ? (isYou ? 'Your move' : 'Thinking…') : `${seatUI.label} · ${score ?? 0} win${score === 1 ? '' : 's'}`;
  return (
    <div
      className={[
        'flex items-center rounded-xl border transition-colors',
        compact ? 'gap-2 px-2.5 py-2' : 'gap-3 px-3 py-2.5',
        isTurn ? 'border-accent bg-accent-soft/60' : 'border-line bg-white',
        out ? 'opacity-50' : '',
      ].join(' ')}
    >
      <span className={`${compact ? 'size-4' : 'size-5'} shrink-0 rounded-full ${seatUI.dot}`} aria-label={seatUI.label} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate font-semibold ${compact ? 'text-sm' : ''}`}>{name}</span>
          {isYou && <Badge tone="accent">You</Badge>}
          {player && !player.connected && !out && <Badge tone="bad">Offline</Badge>}
        </div>
        <div className={`truncate text-xs ${out ? 'text-rose-600' : 'text-gray-500'}`}>{status}</div>
      </div>
      {game?.clock && !compact && <Clock clock={game.clock} seat={seat} receivedAt={receivedAt} />}
      {game?.clock && compact && isTurn && <Clock clock={game.clock} seat={seat} receivedAt={receivedAt} />}
    </div>
  );
}
