import { useState } from 'react';

const DISC = ['bg-rose-500 shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]', 'bg-amber-400 shadow-[inset_0_-3px_0_rgba(0,0,0,0.14)]'];

function Disc({ seat, ghost = false, drop = 0, win = false }) {
  return (
    <span
      className={[
        'absolute inset-[8%] rounded-full',
        DISC[seat],
        ghost ? 'opacity-40' : '',
        drop ? 'animate-drop' : '',
        win ? 'ring-4 ring-ink/80 animate-pulse' : '',
      ].join(' ')}
      style={drop ? { '--drop-from': `-${drop * 112}%` } : undefined}
    />
  );
}

/**
 * Whole columns are the tap targets (big, thumb-friendly on phones).
 * The server decides where the disc lands; we only send { col }.
 */
export default function Connect4Board({ state, mySeat, canMove, onMove }) {
  const [hover, setHover] = useState(null);
  const { rows, cols, board, lastMove, winLine } = state;
  const wins = new Set((winLine ?? []).map(([r, c]) => `${r}:${c}`));
  const colFull = (c) => board[0][c] !== null;

  return (
    // Fit the board between the two player strips on short phones, cap it on desktop.
    <div className="mx-auto w-full select-none" style={{ maxWidth: 'max(17rem, min(30rem, calc(100dvh - 19rem)))' }}>
      {/* Slim hover marker (desktop); on touch the column highlight is enough */}
      <div className="mb-1 grid h-4 grid-cols-7 gap-1.5 px-2" aria-hidden>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex justify-center">
            {canMove && hover === c && !colFull(c) && <span className={`h-3 w-1/2 rounded-full opacity-70 ${DISC[mySeat]}`} />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 rounded-2xl bg-board p-2 shadow-[0_10px_30px_rgba(19,111,104,0.18)]">
        {Array.from({ length: cols }, (_, c) => {
          const disabled = !canMove || colFull(c);
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => onMove({ col: c })}
              onPointerEnter={() => setHover(c)}
              onPointerLeave={() => setHover(null)}
              aria-label={`Drop in column ${c + 1}`}
              className={[
                'flex flex-col gap-1.5 rounded-xl p-0.5 transition-colors outline-none',
                disabled ? 'cursor-default' : 'cursor-pointer hover:bg-white/15 focus-visible:bg-white/20 active:bg-white/25',
              ].join(' ')}
            >
              {Array.from({ length: rows }, (_, r) => {
                const v = board[r][c];
                const isLast = lastMove && lastMove.row === r && lastMove.col === c;
                return (
                  <span key={r} className="relative block aspect-square overflow-hidden rounded-full bg-hole shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]">
                    {v !== null && <Disc key={isLast ? `last-${state.moveCount}` : 'disc'} seat={v} drop={isLast ? r + 1 : 0} win={wins.has(`${r}:${c}`)} />}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
