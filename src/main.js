import { SIZE, TARGET, START_TIME, newGame, play, sumOf, adjacent, isValid, findMove, tick, dailySeed } from './game.js';

const $ = (id) => document.getElementById(id);
const board = $('board');
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const KEY = 'sevin:best';

let g = null, path = [], dragging = false, last = 0, idle = 0;
const cells = [];

const load = () => { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } };
const save = (v) => { try { localStorage.setItem(KEY, v); } catch {} };
$('best').textContent = load();

for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const d = document.createElement('div');
    d.className = 'die';
    d.dataset.x = x; d.dataset.y = y;
    for (let i = 0; i < 9; i++) d.appendChild(document.createElement('i'));
    board.appendChild(d);
    cells.push(d);
  }

const cellAt = (p) => cells[p.y * SIZE + p.x];

function draw(dropped = new Set()) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = cells[y * SIZE + x], on = PIPS[g.grid[y][x]];
      [...d.children].forEach((pip, i) => pip.classList.toggle('on', on.includes(i)));
      d.classList.remove('sel', 'ok', 'over', 'hint', 'drop');
      if (dropped.has(x)) { void d.offsetWidth; d.classList.add('drop'); }
    }
  const s = path.length ? sumOf(g, path) : 0;
  const cls = s === TARGET && path.length > 1 ? 'ok' : s > TARGET ? 'over' : '';
  path.forEach((p) => cellAt(p).classList.add('sel', ...(cls ? [cls] : [])));
  $('sum').className = cls;
  $('sum').textContent = path.length ? path.map((p) => g.grid[p.y][p.x]).join(' + ') + ' = ' + s : ' ';
  $('score').textContent = g.score;
  hud();
}

function hud() {
  $('time').textContent = Math.ceil(g.time);
  $('fill').style.width = Math.min(100, (g.time / START_TIME) * 100) + '%';
  $('fill').classList.toggle('low', g.time < 10);
}

function pointCell(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.die');
  return el ? { x: +el.dataset.x, y: +el.dataset.y } : null;
}

function extend(p) {
  if (!p) return;
  const i = path.findIndex((q) => q.x === p.x && q.y === p.y);
  if (i >= 0 && i === path.length - 2) path.pop(); // step back
  else if (i === -1 && (!path.length || adjacent(path[path.length - 1], p))) path.push(p);
  else return;
  draw();
}

board.addEventListener('pointerdown', (e) => {
  if (!g || g.over) return;
  dragging = true; idle = 0; path = [];
  extend(pointCell(e));
});
window.addEventListener('pointermove', (e) => { if (dragging) extend(pointCell(e)); });
window.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (isValid(g, path)) {
    const cols = new Set(path.map((p) => p.x));
    const pts = play(g, path), at = cellAt(path[path.length - 1]);
    popup('+' + pts + (path.length === TARGET ? ' JACKPOT' : ''), at);
    path = [];
    draw(cols);
  } else { path = []; draw(); }
});

function popup(text, at) {
  const el = document.createElement('div');
  el.className = 'pop'; el.textContent = text;
  const r = at.getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect();
  el.style.left = r.left - m.left + 'px'; el.style.top = r.top - m.top + 'px';
  document.querySelector('main').appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function start(seed, label) {
  g = newGame(seed); g.label = label; path = [];
  $('overlay').classList.add('hidden');
  draw(new Set([0, 1, 2, 3, 4, 5, 6]));
  last = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = (now - last) / 1000; last = now;
  tick(g, dt);
  idle += dt;
  if (idle > 8) { idle = 0; (findMove(g) || []).forEach((p) => cellAt(p).classList.add('hint')); }
  hud();
  if (g.over) return end();
  requestAnimationFrame(loop);
}

function end() {
  dragging = false; path = []; draw();
  const best = load(), rec = g.score > best;
  if (rec) save(g.score);
  $('best').textContent = Math.max(best, g.score);
  $('title').textContent = rec ? 'NEW BEST' : 'TIME';
  $('msg').innerHTML = `${g.label} &middot; <b>${g.score}</b> points<br>${g.chains} chains, longest ${g.best}`;
  $('play').textContent = 'Again';
  $('overlay').classList.remove('hidden');
}

$('play').onclick = () => start(Date.now(), 'Endless');
$('daily').onclick = () => start(dailySeed(), 'Daily ' + new Date().toISOString().slice(0, 10));
