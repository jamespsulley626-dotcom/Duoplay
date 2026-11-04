import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGame } from '@duoplay/shared';

const c4 = getGame('connect4');

function play(cols, startingSeat = 0) {
  let s = c4.setup({ startingSeat });
  for (const col of cols) {
    const seat = c4.currentSeat(s);
    assert.equal(c4.validateMove(s, { col }, seat), null, `col ${col} should be legal`);
    s = c4.applyMove(s, { col }, seat);
  }
  return s;
}

test('vertical win', () => {
  const s = play([0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(c4.outcome(s), { winner: 0, reason: 'four_in_a_row' });
  assert.equal(c4.currentSeat(s), null);
  assert.equal(s.winLine.length, 4);
});

test('horizontal win for second player', () => {
  const s = play([0, 1, 0, 2, 0, 3, 6, 4]);
  assert.equal(s.winner, 1);
});

test('diagonal win', () => {
  // Seat 0 builds a / diagonal on cols 0..3
  const s = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(s.winner, 0);
});

test('rejects bad payloads and full columns', () => {
  const s = play([0, 0, 0, 0, 0, 0]);
  assert.match(c4.validateMove(s, { col: 0 }), /full/);
  assert.match(c4.validateMove(s, { col: 7 }), /range/);
  assert.match(c4.validateMove(s, { col: '3' }), /range/);
  assert.match(c4.validateMove(s, { col: 1.5 }), /range/);
  assert.match(c4.validateMove(s, null), /object/);
  assert.equal(c4.legalMoves(s).length, 6);
});

test('draw on full board', () => {
  // Column-pair pattern that fills the board with no four-in-a-row.
  const order = [];
  for (const pair of [[0, 1], [2, 3], [4, 5]]) {
    for (let i = 0; i < 3; i++) order.push(pair[0], pair[1]);
    for (let i = 0; i < 3; i++) order.push(pair[1], pair[0]);
  }
  for (let i = 0; i < 6; i++) order.push(6);
  // Seat parity for column 6 alternates, which is safe vertically (never 4 in a row).
  const s = play(order);
  assert.equal(s.winner, null);
  assert.equal(s.draw, true);
  assert.deepEqual(c4.outcome(s), { winner: null, reason: 'board_full' });
});

test('applyMove does not mutate input', () => {
  const s0 = c4.setup();
  const s1 = c4.applyMove(s0, { col: 3 }, 0);
  assert.equal(s0.board[5][3], null);
  assert.equal(s1.board[5][3], 0);
});
