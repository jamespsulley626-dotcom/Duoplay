import { useEffect, useMemo, useState } from 'react';
import { getGame } from '@duoplay/shared';

const rules = getGame('xiangqi');

/**
 * Two standard piece sets.
 *  繁 Traditional (Hong Kong / Taiwan sets): Red and Black use different characters for every piece.
 *  简 Simplified (mainland sets): Red and Black share 车/马/炮, differing only in general, advisor/elephant, soldier.
 */
const SETS = {
  hant: {
    lang: 'zh-Hant',
    font: '"Noto Serif TC","Noto Serif SC","PMingLiU","Songti TC",serif',
    river: ['楚 河', '漢 界'],
    r: { k: '帥', a: '仕', e: '相', h: '傌', r: '俥', c: '炮', p: '兵' },
    b: { k: '將', a: '士', e: '象', h: '馬', r: '車', c: '砲', p: '卒' },
  },
  hans: {
    lang: 'zh-Hans',
    font: '"Noto Serif SC","Noto Serif TC","Songti SC","SimSun",serif',
    river: ['楚 河', '汉 界'],
    r: { k: '帅', a: '仕', e: '相', h: '马', r: '车', c: '炮', p: '兵' },
    b: { k: '将', a: '士', e: '象', h: '马', r: '车', c: '炮', p: '卒' },
  },
};

const SCRIPT_KEY = 'duoplay:xiangqi-script';
function initialScript() {
  try {
    const saved = localStorage.getItem(SCRIPT_KEY);
    if (saved === 'hant' || saved === 'hans') return saved;
  } catch {
    /* storage unavailable */
  }
  // Mainland / Singapore browsers default to simplified; everyone else to traditional.
  return /^zh-(cn|sg|hans)/i.test(navigator.language ?? '') ? 'hans' : 'hant';
}

// Intersection (r, c) → percentage position inside the 9×10 board.
const X = (c) => `${((c + 0.5) / 9) * 100}%`;
const Y = (r) => `${((r + 0.5) / 10) * 100}%`;

function Grid({ set }) {
  const line = 'stroke-[#8b6b3d]';
  const h = Array.from({ length: 10 }, (_, r) => <line key={`h${r}`} x1="5" x2="85" y1={5 + r * 10} y2={5 + r * 10} />);
  const v = Array.from({ length: 9 }, (_, c) =>
    c === 0 || c === 8 ? (
      <line key={`v${c}`} x1={5 + c * 10} x2={5 + c * 10} y1="5" y2="95" />
    ) : (
      <g key={`v${c}`}>
        <line x1={5 + c * 10} x2={5 + c * 10} y1="5" y2="45" />
        <line x1={5 + c * 10} x2={5 + c * 10} y1="55" y2="95" />
      </g>
    ),
  );
  return (
    <svg viewBox="0 0 90 100" className="absolute inset-0 size-full" aria-hidden>
      <g className={line} strokeWidth="0.35" fill="none">
        {h}
        {v}
        {/* Palaces */}
        <line x1="35" y1="5" x2="55" y2="25" />
        <line x1="55" y1="5" x2="35" y2="25" />
        <line x1="35" y1="75" x2="55" y2="95" />
        <line x1="55" y1="75" x2="35" y2="95" />
        <rect x="5" y="5" width="80" height="90" strokeWidth="0.7" />
      </g>
      <g className="fill-[#8b6b3d]" fontSize="5" fontWeight="700" fontFamily={set.font} textAnchor="middle" dominantBaseline="central" opacity="0.7" lang={set.lang}>
        <text x="25" y="50">{set.river[0]}</text>
        <text x="65" y="50">{set.river[1]}</text>
      </g>
    </svg>
  );
}

export default function XiangqiBoard({ state, mySeat, canMove, onMove }) {
  const [selected, setSelected] = useState(null);
  const [script, setScript] = useState(initialScript);
  const set = SETS[script];
  const switchScript = (next) => {
    setScript(next);
    try {
      localStorage.setItem(SCRIPT_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };
  const { board, lastMove, check, result, turn, red } = state;

  const mySide = mySeat === null ? 'r' : mySeat === red ? 'r' : 'b';
  const flip = mySide === 'b'; // your pieces always at the bottom
  const toView = (r, c) => (flip ? [9 - r, 8 - c] : [r, c]);

  useEffect(() => setSelected(null), [state.moveCount, canMove]);

  const targets = useMemo(() => {
    if (!selected || !canMove) return new Map();
    return new Map(rules.targetsFrom(state, selected[0], selected[1]).map(([r, c]) => [`${r}:${c}`, [r, c]]));
  }, [selected, canMove, state]);

  function tapPiece(r, c) {
    if (!canMove) return;
    const target = targets.get(`${r}:${c}`);
    if (target) return onMove({ from: selected, to: target });
    if (board[r][c]?.[0] === mySide) setSelected(selected && selected[0] === r && selected[1] === c ? null : [r, c]);
    else setSelected(null);
  }

  const turnSide = turn === red ? 'r' : 'b';
  let notice = null;
  if (check && !result) notice = mySeat === null ? `${turnSide === 'r' ? 'Red' : 'Black'} is in check` : turn === mySeat ? 'Check! Protect your general' : 'Check!';

  const pieces = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      const isTarget = targets.has(`${r}:${c}`);
      if (!p && !isTarget) continue;
      const [vr, vc] = toView(r, c);
      const isSel = selected && selected[0] === r && selected[1] === c;
      const isTo = lastMove && lastMove.to[0] === r && lastMove.to[1] === c;
      const mine = p?.[0] === mySide;
      pieces.push(
        <button
          key={`${r}:${c}`}
          type="button"
          onClick={() => tapPiece(r, c)}
          disabled={!canMove || (!mine && !isTarget)}
          aria-label={p ? `${p[0] === 'r' ? 'Red' : 'Black'} ${set[p[0]][p[1]]}` : 'Move here'}
          className="absolute z-10 grid aspect-square w-[10.6%] -translate-1/2 place-items-center rounded-full outline-none disabled:cursor-default"
          style={{ left: X(vc), top: Y(vr) }}
        >
          {p ? (
            <span
              className={[
                'grid size-full place-items-center rounded-full border-[2px] bg-[#fbf1dc] font-bold leading-none shadow-[0_2px_0_rgba(90,60,20,0.35)] transition-transform',
                'text-[min(4.6vw,1.45rem)]',
                p[0] === 'r' ? 'border-[#b4232a] text-[#b4232a]' : 'border-ink text-ink',
                isSel ? '-translate-y-0.5 ring-4 ring-accent/50' : '',
                isTarget ? 'ring-4 ring-rose-500/70' : '',
                isTo && !isSel ? 'ring-2 ring-accent' : '',
              ].join(' ')}
              style={{ fontFamily: set.font }}
              lang={set.lang}
            >
              <span className="grid size-[82%] place-items-center rounded-full border border-current/40">{set[p[0]][p[1]]}</span>
            </span>
          ) : (
            <span className="size-[34%] rounded-full bg-accent/70" />
          )}
        </button>,
      );
    }
  }

  const from = lastMove && toView(lastMove.from[0], lastMove.from[1]);

  return (
    <div className="mx-auto w-full select-none" style={{ maxWidth: 'max(17rem, min(30rem, calc((100dvh - 21rem) * 0.9)))' }}>
      <div className="mb-1.5 flex justify-end">
        <div className="flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold" role="group" aria-label="Piece characters">
          {[['hant', '繁', 'Traditional'], ['hans', '简', 'Simplified']].map(([id, label, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-pressed={script === id}
              onClick={() => switchScript(id)}
              lang={SETS[id].lang}
              style={{ fontFamily: SETS[id].font }}
              className={`rounded-full px-2.5 py-1 transition ${script === id ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative aspect-[9/10] rounded-xl bg-[#f0dcae] shadow-[0_10px_30px_rgba(139,107,61,0.25)]" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
        <div className="absolute inset-[2%]">
          <Grid set={set} />
          {from && <span className="absolute size-[4%] -translate-1/2 rounded-full border-2 border-dashed border-accent/70" style={{ left: X(from[1]), top: Y(from[0]) }} />}
          {pieces}
        </div>
      </div>
      <p className={`mt-2 min-h-5 text-center text-sm ${notice ? 'font-semibold text-rose-600' : 'text-transparent'}`} aria-live="polite">
        {notice ?? '.'}
      </p>
    </div>
  );
}
