import { useEffect, useMemo, useState } from 'react';
import { getGame } from '@duoplay/shared';
import { CELLS, POINT_CELLS } from '@duoplay/shared/games/chinese-checkers.js';

const rules = getGame('chinese-checkers');

export const SEAT_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#334155'];
export const SEAT_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Grey'];

const SQRT3 = Math.sqrt(3);
// Rotate cube coords 60° k times so a chosen point ends up at the bottom.
function rotate({ q, r }, k) {
  let s = -q - r;
  for (let i = 0; i < k; i++) [q, r, s] = [-r, -s, -q];
  return { q, r };
}
const toXY = ({ q, r }) => ({ x: SQRT3 * (q + r / 2), y: 1.5 * r });

function rotationFor(homePoint) {
  if (homePoint === undefined) return 0;
  let best = 0;
  let bestY = -Infinity;
  for (let k = 0; k < 6; k++) {
    const y = POINT_CELLS[homePoint].reduce((sum, i) => sum + toXY(rotate(CELLS[i], k)).y, 0);
    if (y > bestY) [best, bestY] = [k, y];
  }
  return best;
}

export default function ChineseCheckersBoard({ state, mySeat, canMove, onMove }) {
  const [selected, setSelected] = useState(null);
  const { board, homes, lastMove, skipped, out } = state;

  useEffect(() => setSelected(null), [state.moveCount, canMove, out.length]);

  const k = rotationFor(mySeat === null ? undefined : homes[mySeat]);
  const pos = useMemo(() => CELLS.map((c) => toXY(rotate(c, k))), [k]);
  const owner = useMemo(() => {
    const o = Array(CELLS.length).fill(null);
    homes.forEach((p, seat) => POINT_CELLS[p].forEach((i) => (o[i] = seat)));
    return o;
  }, [homes]);
  const myTarget = mySeat === null ? null : new Set(POINT_CELLS[(homes[mySeat] + 3) % 6]);

  const targets = useMemo(
    () => (selected === null || !canMove ? new Map() : rules.reachableFrom(state, selected)),
    [selected, canMove, state],
  );

  function tap(i) {
    if (!canMove) return;
    if (targets.has(i)) return onMove({ from: selected, to: i });
    setSelected(board[i] === mySeat && i !== selected ? i : null);
  }

  const notice = skipped.length
    ? `${skipped.map((s) => (s === mySeat ? 'You' : SEAT_NAMES[s])).join(', ')} had no move and ${skipped.length > 1 ? 'were' : 'was'} skipped`
    : null;

  const pathD = lastMove?.path?.map((i, n) => `${n ? 'L' : 'M'}${pos[i].x.toFixed(2)},${pos[i].y.toFixed(2)}`).join(' ');

  return (
    <div className="mx-auto w-full select-none" style={{ maxWidth: 'max(18rem, min(32rem, calc((100dvh - 22rem) * 0.9)))' }}>
      <svg viewBox="-11.7 -13 23.4 26" className="w-full touch-manipulation" role="grid" aria-label="Chinese Checkers board">
        {/* Star background: two overlapping triangles (unchanged by 60° rotations) */}
        <polygon points="0,-12.8 11.1,6.4 -11.1,6.4" className="fill-[#f3eee3]" />
        <polygon points="0,12.8 11.1,-6.4 -11.1,-6.4" className="fill-[#f3eee3]" />

        {pathD && (
          <path d={pathD} fill="none" stroke={SEAT_COLORS[lastMove.seat]} strokeWidth="0.28" strokeDasharray="0.6 0.45" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        )}

        {CELLS.map((_, i) => {
          const { x, y } = pos[i];
          const v = board[i];
          const home = owner[i];
          const isTarget = targets.has(i);
          const mine = v !== null && v === mySeat;
          return (
            <g key={i} onClick={() => tap(i)} className={canMove && (mine || isTarget) ? 'cursor-pointer' : undefined}>
              {/* Generous invisible hit area for fingers */}
              <circle cx={x} cy={y} r="0.86" fill="transparent" />
              <circle cx={x} cy={y} r="0.5" fill={home === null ? '#ddd5c4' : SEAT_COLORS[home]} opacity={home === null ? 1 : 0.22} />
              {myTarget?.has(i) && <circle cx={x} cy={y} r="0.66" fill="none" stroke={SEAT_COLORS[mySeat]} strokeWidth="0.09" strokeDasharray="0.25 0.18" opacity="0.7" />}
              {v !== null && (
                <>
                  <circle cx={x} cy={y + 0.08} r="0.7" fill="rgba(0,0,0,0.18)" />
                  <circle cx={x} cy={y} r="0.7" fill={SEAT_COLORS[v]} opacity={out.includes(v) ? 0.35 : 1} />
                  <circle cx={x - 0.2} cy={y - 0.22} r="0.2" fill="white" opacity="0.45" />
                </>
              )}
              {i === selected && <circle cx={x} cy={y} r="0.9" fill="none" stroke="#1c1b19" strokeWidth="0.14" />}
              {lastMove?.to === i && i !== selected && <circle cx={x} cy={y} r="0.88" fill="none" stroke={SEAT_COLORS[lastMove.seat]} strokeWidth="0.1" />}
              {isTarget && <circle cx={x} cy={y} r="0.3" fill={SEAT_COLORS[mySeat]} opacity="0.8" />}
            </g>
          );
        })}
      </svg>
      <p className={`mt-1 min-h-5 text-center text-sm ${notice ? 'font-medium text-accent' : 'text-transparent'}`} aria-live="polite">
        {notice ?? '.'}
      </p>
    </div>
  );
}
