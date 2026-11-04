import { useMemo } from 'react';
import { getGame } from '@duoplay/shared';

const rules = getGame('reversi');

// Seat 0 = Black, seat 1 = White.
const DISC = [
  'bg-ink shadow-[inset_0_-3px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.3)]',
  'bg-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.25)]',
];

function Disc({ seat, flipKey }) {
  return <span key={flipKey} className={`absolute inset-[10%] rounded-full ${DISC[seat]} ${flipKey ? 'animate-flip' : ''}`} />;
}

/**
 * Every square is a button; only legal squares are enabled. Legal moves are
 * computed here purely as a hint — the server re-validates every move.
 */
export default function ReversiBoard({ state, mySeat, canMove, onMove }) {
  const { board, lastMove, counts, passed, turn, over } = state;

  const legal = useMemo(() => {
    if (!canMove) return new Set();
    return new Set(rules.legalMoves(state).map((m) => `${m.r}:${m.c}`));
  }, [state, canMove]);

  const flipped = useMemo(() => new Set((lastMove?.flipped ?? []).map(([r, c]) => `${r}:${c}`)), [lastMove]);

  let notice = null;
  if (passed !== null && !over) {
    if (mySeat === null) notice = `${passed === 0 ? 'Black' : 'White'} has no move — ${turn === 0 ? 'Black' : 'White'} plays again`;
    else if (passed === mySeat) notice = 'You have no legal move — your opponent plays again';
    else notice = 'Your opponent has no legal move — play again';
  }

  return (
    <div className="mx-auto w-full select-none" style={{ maxWidth: 'max(17rem, min(30rem, calc(100dvh - 21rem)))' }}>
      <div className="mb-2 flex items-center justify-center gap-4 text-sm font-semibold">
        <span className="flex items-center gap-1.5"><span className={`size-4 rounded-full ${DISC[0]}`} />{counts[0]}</span>
        <span className="text-faint">–</span>
        <span className="flex items-center gap-1.5"><span className={`size-4 rounded-full border border-line ${DISC[1]}`} />{counts[1]}</span>
      </div>

      <div className="grid grid-cols-8 gap-[3px] rounded-2xl bg-[#2f6b4f] p-[6px] shadow-[0_10px_30px_rgba(47,107,79,0.2)]" role="grid" aria-label="Reversi board">
        {board.map((row, r) =>
          row.map((v, c) => {
            const k = `${r}:${c}`;
            const isLegal = legal.has(k);
            const isLast = lastMove && lastMove.r === r && lastMove.c === c;
            return (
              <button
                key={k}
                type="button"
                disabled={!isLegal}
                onClick={() => onMove({ r, c })}
                aria-label={`Row ${r + 1}, column ${c + 1}${v === null ? '' : v === 0 ? ', black' : ', white'}`}
                className={`relative aspect-square rounded-[4px] bg-[#3d8562] outline-none ${isLegal ? 'cursor-pointer hover:bg-[#4a9670] focus-visible:bg-[#4a9670]' : 'cursor-default'}`}
              >
                {v !== null && <Disc seat={v} flipKey={flipped.has(k) || isLast ? `${k}-${state.moveCount}` : null} />}
                {isLegal && <span className={`absolute inset-[36%] rounded-full opacity-35 ${mySeat === 0 ? 'bg-ink' : 'bg-white'}`} />}
                {isLast && <span className="absolute top-1/2 left-1/2 size-[14%] -translate-1/2 rounded-full bg-rose-500" />}
              </button>
            );
          }),
        )}
      </div>

      <p className={`mt-2 min-h-5 text-center text-sm ${notice ? 'font-medium text-accent' : 'text-transparent'}`} aria-live="polite">
        {notice ?? '.'}
      </p>
    </div>
  );
}
