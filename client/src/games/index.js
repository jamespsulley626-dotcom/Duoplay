import Connect4Board from './connect4/Connect4Board.jsx';
import ReversiBoard from './reversi/ReversiBoard.jsx';
import XiangqiBoard from './xiangqi/XiangqiBoard.jsx';
import ChineseCheckersBoard, { SEAT_NAMES } from './chinese-checkers/ChineseCheckersBoard.jsx';
import BlockTerritoryBoard from './block-territory/BlockTerritoryBoard.jsx';

/**
 * Client half of a game plugin: how to draw it. Rules live in
 * @duoplay/shared and are enforced by the server.
 *
 * Board props: { state, mySeat, canMove, onMove(move) }
 * seats[i]: label + Tailwind classes for the seat's token colour.
 * describeResult?(state, result): optional line under the win/draw headline.
 * seatsFor?(state): optional per-match seat styling (overrides `seats` once a game exists).
 */
const DOTS = ['bg-[#e11d48]', 'bg-[#2563eb]', 'bg-[#16a34a]', 'bg-[#f59e0b]', 'bg-[#7c3aed]', 'bg-[#334155]'];

export const GAME_UI = {
  connect4: {
    Board: Connect4Board,
    seats: [
      { label: 'Red', dot: 'bg-rose-500' },
      { label: 'Yellow', dot: 'bg-amber-400' },
    ],
  },
  reversi: {
    Board: ReversiBoard,
    seats: [
      { label: 'Black', dot: 'bg-ink' },
      { label: 'White', dot: 'bg-white border border-line' },
    ],
    describeResult: (state) => `${state.counts[0]} – ${state.counts[1]} discs`,
  },
  xiangqi: {
    Board: XiangqiBoard,
    // Before the first match colours aren't assigned yet.
    seats: [
      { label: 'Player 1', dot: 'bg-faint' },
      { label: 'Player 2', dot: 'bg-faint' },
    ],
    // Whoever starts the match plays Red, so colours swap on rematch.
    seatsFor: (state) =>
      [0, 1].map((seat) =>
        seat === state.red ? { label: 'Red', dot: 'bg-[#b4232a]' } : { label: 'Black', dot: 'bg-ink' },
      ),
  },
  'chinese-checkers': {
    Board: ChineseCheckersBoard,
    // Six seats; the room only uses as many as the host picked (2–6).
    seats: SEAT_NAMES.map((label, i) => ({ label, dot: DOTS[i] })),
  },
  'block-territory': {
    Board: BlockTerritoryBoard,
    seats: [
      { label: 'Blue', dot: 'bg-[#2563eb] rounded-[4px]' },
      { label: 'Orange', dot: 'bg-[#f97316] rounded-[4px]' },
    ],
    describeResult: (state) => `${state.counts[0]} – ${state.counts[1]} squares`,
  },
};

export const getGameUI = (id) => GAME_UI[id] ?? null;
