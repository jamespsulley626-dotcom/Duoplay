import { useEffect, useMemo, useState } from 'react';
import { getGame } from '@duoplay/shared';
import { PIECES, STARTS, anchorCells, transform } from '@duoplay/shared/games/block-territory.js';

const rules = getGame('block-territory');

export const SEAT_FILL = ['bg-[#2563eb]', 'bg-[#f97316]'];
export const SEAT_NAMES = ['Blue', 'Orange'];
const GHOST_OK = ['bg-[#2563eb]/45', 'bg-[#f97316]/45'];
const SIZE = 14;

/** The shape cell closest to its centre, so the piece sits under your finger. */
function pivotOf(shape) {
  const cr = shape.reduce((a, [r]) => a + r, 0) / shape.length;
  const cc = shape.reduce((a, [, c]) => a + c, 0) / shape.length;
  return shape.reduce((best, cell) => (Math.hypot(cell[0] - cr, cell[1] - cc) < Math.hypot(best[0] - cr, best[1] - cc) ? cell : best));
}

function MiniPiece({ shape, seat, size = 'size-2.5' }) {
  const rows = Math.max(...shape.map(([r]) => r)) + 1;
  const cols = Math.max(...shape.map(([, c]) => c)) + 1;
  const on = new Set(shape.map(([r, c]) => `${r},${c}`));
  return (
    <span className="inline-grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
      {Array.from({ length: rows * cols }, (_, i) => (
        <span key={i} className={`${size} rounded-[2px] ${on.has(`${Math.floor(i / cols)},${i % cols}`) ? SEAT_FILL[seat] : ''}`} />
      ))}
    </span>
  );
}

export default function BlockTerritoryBoard({ state, mySeat, canMove, onMove }) {
  const { board, remaining, counts, lastMove, skipped } = state;
  const [pieceId, setPieceId] = useState(null);
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    setPieceId(null);
    setAnchor(null);
  }, [state.moveCount]);

  const shape = pieceId ? transform(PIECES[pieceId], rot, flip) : null;
  const ghost = useMemo(() => {
    if (!shape || !anchor) return null;
    const [pr, pc] = pivotOf(shape);
    const cells = shape.map(([r, c]) => [r - pr + anchor[0], c - pc + anchor[1]]);
    return { cells, problem: rules.check(state, { piece: pieceId, cells }) };
  }, [shape, anchor, pieceId, state]);
  const ghostSet = new Set(ghost?.cells.map(([r, c]) => `${r},${c}`) ?? []);
  const lastSet = new Set(lastMove?.cells.map(([r, c]) => `${r},${c}`) ?? []);
  const hints = useMemo(() => (canMove && !ghost ? new Set(anchorCells(state, mySeat).map(([r, c]) => `${r},${c}`)) : new Set()), [canMove, ghost, state, mySeat]);

  const place = () => ghost && !ghost.problem && onMove({ piece: pieceId, cells: ghost.cells });

  function tapCell(r, c) {
    if (!canMove || !pieceId) return;
    if (anchor && anchor[0] === r && anchor[1] === c && ghost && !ghost.problem) return place();
    setAnchor([r, c]);
  }

  const opp = mySeat === null ? 1 : 1 - mySeat;
  const me = mySeat ?? 0;
  const notice = skipped.length
    ? skipped[0] === mySeat
      ? 'You have no legal placement — your opponent plays again'
      : `${mySeat === null ? SEAT_NAMES[skipped[0]] : 'Your opponent'} has no legal placement — ${mySeat === null ? 'skipped' : 'play again'}`
    : null;

  return (
    <div className="mx-auto w-full select-none" style={{ maxWidth: 'max(18rem, min(30rem, calc(100dvh - 26rem)))' }}>
      {/* Score */}
      <div className="mb-2 flex items-center justify-center gap-4 text-sm font-semibold">
        {[0, 1].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-3.5 rounded-[3px] ${SEAT_FILL[s]}`} />
            {counts[s]} <span className="font-normal text-faint">· {remaining[s].length} left</span>
          </span>
        ))}
      </div>

      {/* Board */}
      <div className="grid gap-px rounded-lg bg-line p-px" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }} onPointerLeave={(e) => e.pointerType === 'mouse' && setAnchor(null)}>
        {board.map((row, r) =>
          row.map((v, c) => {
            const k = `${r},${c}`;
            const isGhost = ghostSet.has(k);
            const isStart = STARTS.some(([sr, sc]) => sr === r && sc === c);
            let fill = 'bg-surface';
            if (v !== null) fill = SEAT_FILL[v];
            if (isGhost) fill = ghost.problem ? 'bg-rose-400/60' : GHOST_OK[me];
            return (
              <button
                key={k}
                type="button"
                onClick={() => tapCell(r, c)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && canMove && pieceId && setAnchor([r, c])}
                className={`relative aspect-square ${fill} ${canMove && pieceId ? 'cursor-pointer' : 'cursor-default'}`}
                aria-label={`Row ${r + 1}, column ${c + 1}`}
              >
                {v === null && isStart && !isGhost && <span className={`absolute inset-[30%] rounded-full ${SEAT_FILL[STARTS.findIndex(([sr, sc]) => sr === r && sc === c)]} opacity-40`} />}
                {v === null && hints.has(k) && !isGhost && <span className={`absolute inset-[38%] rounded-full ${SEAT_FILL[me]} opacity-60`} />}
                {lastSet.has(k) && v !== null && <span className="absolute inset-[28%] rounded-[2px] bg-white/45" />}
              </button>
            );
          }),
        )}
      </div>

      <p className={`mt-1.5 min-h-5 text-center text-sm ${ghost?.problem ? 'text-rose-600' : notice ? 'font-medium text-accent' : 'text-transparent'}`} aria-live="polite">
        {ghost?.problem ?? notice ?? '.'}
      </p>

      {/* Controls + tray (players only) */}
      {mySeat !== null && (
        <div className="mt-1">
          <div className="mb-2 flex items-center gap-2">
            <button type="button" disabled={!pieceId} onClick={() => setRot((r) => (r + 1) % 4)} className="min-h-10 flex-1 rounded-full border border-line bg-surface text-sm font-semibold disabled:opacity-40">⟳ Rotate</button>
            <button type="button" disabled={!pieceId} onClick={() => setFlip((f) => !f)} className="min-h-10 flex-1 rounded-full border border-line bg-surface text-sm font-semibold disabled:opacity-40">⇋ Flip</button>
            <button type="button" disabled={!ghost || !!ghost.problem || !canMove} onClick={place} className="min-h-10 flex-1 rounded-full bg-accent text-sm font-semibold text-white disabled:opacity-40">Place</button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 rounded-xl border border-line bg-surface p-2">
            {remaining[me].map((id) => (
              <button
                key={id}
                type="button"
                disabled={!canMove}
                onClick={() => {
                  setPieceId(id === pieceId ? null : id);
                  setRot(0);
                  setFlip(false);
                  setAnchor(null);
                }}
                aria-pressed={id === pieceId}
                aria-label={`Piece ${id}`}
                className={`grid min-h-11 min-w-11 place-items-center rounded-lg p-1.5 transition ${id === pieceId ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-ink/5'} disabled:opacity-50`}
              >
                <MiniPiece shape={PIECES[id]} seat={me} />
              </button>
            ))}
            {remaining[me].length === 0 && <span className="py-2 text-sm text-muted">All pieces placed 🎉</span>}
          </div>
          <p className="mt-1.5 text-center text-xs text-faint">
            {pieceId ? 'Tap the board to preview · tap again or press Place to confirm' : canMove ? 'Pick a piece' : `Opponent holds ${remaining[opp].length} pieces`}
          </p>
        </div>
      )}
    </div>
  );
}
