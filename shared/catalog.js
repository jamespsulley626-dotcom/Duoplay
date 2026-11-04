import { connect4 } from './games/connect4.js';
import { reversi } from './games/reversi.js';
import { xiangqi } from './games/xiangqi.js';
import { chineseCheckers } from './games/chinese-checkers.js';
import { blockTerritory } from './games/block-territory.js';

/**
 * Rules modules ("plugins"). Each must implement the GamePlugin contract
 * described in games/README.md. Register new games here.
 */
export const GAMES = Object.freeze({
  [connect4.id]: connect4,
  [reversi.id]: reversi,
  [xiangqi.id]: xiangqi,
  [chineseCheckers.id]: chineseCheckers,
  [blockTerritory.id]: blockTerritory,
});

/** Lobby metadata. `available: false` games show as "Coming soon". */
export const CATALOG = Object.freeze([
  { id: 'connect4', name: 'Connect 4', nameZh: '四子棋', emoji: '🔴', blurb: 'Drop discs, line up four.', minutes: 5, available: true },
  { id: 'reversi', name: 'Reversi', nameZh: '黑白棋', emoji: '⚫', blurb: 'Flip your way to the majority.', minutes: 15, available: true },
  { id: 'xiangqi', name: 'Chinese Chess', nameZh: '象棋', emoji: '🐘', blurb: 'Capture the general.', minutes: 30, available: true },
  { id: 'block-territory', name: 'Block Territory', nameZh: 'ブロック陣取り', emoji: '🟦', blurb: 'Corner-to-corner territory grab.', minutes: 20, available: true },
  { id: 'jungle', name: 'Jungle', nameZh: '斗兽棋', emoji: '🦁', blurb: 'Lead your animals to the den.', minutes: 15, available: false },
  { id: 'chinese-checkers', name: 'Chinese Checkers', nameZh: '跳棋 · 波子棋', emoji: '⭐', blurb: 'Hop across the star. 2–6 players.', minutes: 20, available: true },
]);

export function getGame(id) {
  return Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : null;
}
