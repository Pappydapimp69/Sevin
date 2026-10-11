import assert from 'node:assert/strict';
import { SIZE, newGame, isValid, play, findMove, scoreFor, tick, rng } from '../src/game.js';

const t = (name, fn) => { fn(); console.log('ok', name); };

t('same seed, same board', () => {
  assert.deepEqual(newGame(42).grid, newGame(42).grid);
  assert.notDeepEqual(newGame(42).grid, newGame(43).grid);
});

t('values are dice', () => {
  const r = rng(1);
  for (let i = 0; i < 1e4; i++) { const v = 1 + Math.floor(r() * 6); assert.ok(v >= 1 && v <= 6); }
});

t('validity rules', () => {
  const g = newGame(1);
  g.grid[0][0] = 3; g.grid[0][1] = 4; g.grid[1][1] = 2; g.grid[0][2] = 5; g.grid[2][2] = 4;
  assert.ok(isValid(g, [{ x: 0, y: 0 }, { x: 1, y: 0 }]));                       // 3+4
  assert.ok(isValid(g, [{ x: 1, y: 1 }, { x: 2, y: 0 }]));                       // 2+5 diagonal
  assert.ok(!isValid(g, [{ x: 0, y: 0 }]));                                      // too short
  assert.ok(!isValid(g, [{ x: 0, y: 0 }, { x: 2, y: 2 }]));                      // not touching
  assert.ok(!isValid(g, [{ x: 0, y: 0 }, { x: 0, y: 0 }]));                      // repeat
  assert.ok(!isValid(g, [{ x: 0, y: 0 }, { x: 1, y: 1 }]));                      // 3+2 != 7
});

t('play clears, scores, refills, adds time', () => {
  const g = newGame(7);
  const m = findMove(g);
  assert.ok(m && isValid(g, m));
  const t0 = g.time, pts = play(g, m);
  assert.equal(pts, scoreFor(m.length));
  assert.equal(g.score, pts);
  assert.equal(g.time, t0 + m.length - 1);
  for (const row of g.grid) for (const v of row) assert.ok(v >= 1 && v <= 6);
  assert.equal(play(g, [{ x: 0, y: 0 }]), 0);
});

t('gravity keeps survivors in order', () => {
  const g = newGame(3);
  for (let y = 0; y < SIZE; y++) g.grid[y][0] = [1, 2, 3, 4, 5, 3, 4][y];
  play(g, [{ x: 0, y: 5 }, { x: 0, y: 6 }]);                                     // 3+4 at bottom
  assert.deepEqual([2, 3, 4, 5, 6].map((y) => g.grid[y][0]), [1, 2, 3, 4, 5]);
});

t('always a move after 500 plays', () => {
  const g = newGame(99);
  for (let i = 0; i < 500; i++) { const m = findMove(g); assert.ok(m); assert.ok(play(g, m) > 0); }
});

t('jackpot', () => assert.equal(scoreFor(7), 7 * 49 * 7));

t('timer ends the run', () => {
  const g = newGame(5);
  tick(g, 1000);
  assert.ok(g.over);
  assert.equal(play(g, findMove(g) || []), 0);
});
