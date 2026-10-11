// SEVIN — pure game logic. No DOM here; main.js draws, this decides.

export const SIZE = 7;
export const TARGET = 7;
export const START_TIME = 77;

// mulberry32: small, seedable, state is one integer.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roll = (r) => 1 + Math.floor(r() * 6);

export function newGame(seed = Date.now()) {
  const r = rng(seed);
  const grid = [];
  for (let y = 0; y < SIZE; y++) {
    const row = [];
    for (let x = 0; x < SIZE; x++) row.push(roll(r));
    grid.push(row);
  }
  const g = { seed, r, grid, score: 0, time: START_TIME, chains: 0, best: 0, over: false };
  ensureMove(g);
  return g;
}

export const adjacent = (a, b) =>
  !(a.x === b.x && a.y === b.y) && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

export const sumOf = (g, path) => path.reduce((s, p) => s + g.grid[p.y][p.x], 0);

// A path is valid if it is >=2 distinct cells, each touching the last, summing to 7.
export function isValid(g, path) {
  if (path.length < 2) return false;
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p.x < 0 || p.y < 0 || p.x >= SIZE || p.y >= SIZE) return false;
    const k = p.y * SIZE + p.x;
    if (seen.has(k)) return false;
    seen.add(k);
    if (i && !adjacent(path[i - 1], p)) return false;
  }
  return sumOf(g, path) === TARGET;
}

// Score grows with length squared; a seven-long chain (all ones) is the jackpot.
export function scoreFor(len) {
  const base = TARGET * len * len;
  return len === TARGET ? base * 7 : base;
}

export const timeFor = (len) => len - 1;

// Remove the path, drop columns, refill from the top. Returns points earned.
export function play(g, path) {
  if (g.over || !isValid(g, path)) return 0;
  const gone = new Set(path.map((p) => p.y * SIZE + p.x));
  for (let x = 0; x < SIZE; x++) {
    const keep = [];
    for (let y = SIZE - 1; y >= 0; y--) if (!gone.has(y * SIZE + x)) keep.push(g.grid[y][x]);
    for (let y = SIZE - 1, i = 0; y >= 0; y--, i++) g.grid[y][x] = i < keep.length ? keep[i] : roll(g.r);
  }
  const pts = scoreFor(path.length);
  g.score += pts;
  g.time += timeFor(path.length);
  g.chains++;
  g.best = Math.max(g.best, path.length);
  ensureMove(g);
  return pts;
}

// Depth-first search for any valid chain. Sums only grow, so prune at > 7.
export function findMove(g) {
  const path = [];
  const used = new Set();
  const dfs = (p, sum) => {
    path.push(p);
    used.add(p.y * SIZE + p.x);
    if (sum === TARGET && path.length >= 2) return true;
    if (sum < TARGET) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const q = { x: p.x + dx, y: p.y + dy };
          if (q.x < 0 || q.y < 0 || q.x >= SIZE || q.y >= SIZE) continue;
          if (used.has(q.y * SIZE + q.x)) continue;
          if (dfs(q, sum + g.grid[q.y][q.x])) return true;
        }
    }
    path.pop();
    used.delete(p.y * SIZE + p.x);
    return false;
  };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (dfs({ x, y }, g.grid[y][x])) return path.slice();
  return null;
}

// A dead board reshuffles rather than ends the run.
export function ensureMove(g) {
  let tries = 0;
  while (!findMove(g) && tries++ < 100)
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) g.grid[y][x] = roll(g.r);
}

export function tick(g, dt) {
  if (g.over) return;
  g.time = Math.max(0, g.time - dt);
  if (g.time === 0) g.over = true;
}

// Same date, same board, for everyone.
export function dailySeed(d = new Date()) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
