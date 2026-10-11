// world.js — the woods. A pure function of the seed: same seed, same map.
// No DOM, no Three. The sim owns what CHANGES (deadfall progress, sticks taken,
// pylons spent); this file only says what is there.
//
// Coordinates: metres. x runs west->east, y runs south->north. The trail starts
// in the south and the far side is in the north.

import { stream, hash } from "./rng.js";

export const CELL = 2;          // metres per grid cell
export const W = 48;            // cells across
export const AREA_H = 40;       // cells per area, south to north
export const AREAS = 5;
export const H = AREA_H * AREAS;

// Landmark kinds. Each one is drawn as the thing it is named after, so a
// wrong-place claim is checkable: "the creek" and "the pond" do not look alike.
export const LANDMARKS = ["creek", "birches", "rocks", "old burn", "pond", "stones"];

// Deadfalls lie across the trail near the north edge of these areas.
export const DEADFALL_AREAS = [0, 2, 3];

export const idx = (cx, cy) => cy * W + cx;
export const toCell = (m) => Math.floor(m / CELL);
export const center = (c) => c * CELL + CELL / 2;
export const areaOf = (yMetres) => Math.max(0, Math.min(AREAS - 1, Math.floor(yMetres / CELL / AREA_H)));

export function generateWorld(seed) {
  const rng = stream(hash("world", seed));
  const walk = new Uint8Array(W * H);
  const open = (cx, cy) => {
    if (cx >= 1 && cy >= 0 && cx < W - 1 && cy < H) walk[idx(cx, cy)] = 1;
  };

  // --- the trail: three cells wide, wandering north --------------------------
  const trailX = new Float32Array(H);
  let x = W / 2, drift = 0;
  for (let cy = 0; cy < H; cy++) {
    drift = drift * 0.9 + (rng() - 0.5) * 0.6;
    x = Math.max(9, Math.min(W - 10, x + drift));
    trailX[cy] = x;
    const cx = Math.round(x);
    for (let d = -1; d <= 1; d++) open(cx + d, cy);
    // keep the trail continuous where it steps sideways
    if (cy > 0) {
      const px = Math.round(trailX[cy - 1]);
      for (let k = Math.min(px, cx) - 1; k <= Math.max(px, cx) + 1; k++) open(k, cy);
    }
  }

  // --- clearings: three per area, off the trail, each a distinct landmark ----
  const clearings = [];
  for (let a = 0; a < AREAS; a++) {
    const kinds = LANDMARKS.slice();
    // shuffle with a fixed number of draws
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    for (let k = 0; k < 3; k++) {
      const r1 = rng(), r2 = rng(), r3 = rng();
      const cy = a * AREA_H + 7 + k * 10 + Math.floor(r1 * 4);
      const side = (k + a) % 2 ? 1 : -1;
      const off = 7 + Math.floor(r2 * 5);
      const tx = Math.round(trailX[cy]);
      const cx = Math.max(6, Math.min(W - 7, tx + side * off));
      const rad = 3 + Math.floor(r3 * 2);
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad + 1) open(cx + dx, cy + dy);
      // a spur from the trail
      for (let sx = Math.min(tx, cx); sx <= Math.max(tx, cx); sx++) { open(sx, cy); open(sx, cy + 1); }
      clearings.push({
        id: clearings.length, area: a, kind: kinds[k],
        x: center(cx), y: center(cy), r: rad * CELL,
      });
    }
  }

  // The far side: a wide clearing at the end of the trail.
  const endCy = H - 6, endCx = Math.round(trailX[endCy]);
  for (let dy = -5; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) open(endCx + dx, endCy + dy);
  const farSide = { x: center(endCx), y: center(endCy), r: 10 };

  // --- deadfalls: across the trail near each gated area's north edge ---------
  const deadfalls = DEADFALL_AREAS.map((a, i) => {
    const cy = (a + 1) * AREA_H - 3;
    const cx = Math.round(trailX[cy]);
    // The deadfall must be the ONLY way north: find every walkable cell on
    // that row (the trail, plus any sidestep) and block them all.
    const cells = [];
    for (let k = 0; k < W; k++) if (walk[idx(k, cy)]) cells.push([k, cy]);
    // person-hours to clear. The first is the big one: it is what teaches the
    // loop, and it should not fall the first afternoon.
    return { id: i, area: a, x: center(cx), y: center(cy), cells, work: a === 0 ? 45 : 22 };
  });

  // --- pylons: 3 in area 1, 2-4 after; one in a clearing, rest by the trail --
  const pylons = [];
  for (let a = 0; a < AREAS - 1; a++) {
    const rN = rng();
    const n = a === 0 ? 3 : 2 + Math.floor(rN * 3);
    const cs = clearings.filter((c) => c.area === a);
    for (let k = 0; k < 4; k++) {
      const rY = rng(), rS = rng();
      if (k >= n) continue;
      let px, py;
      if (k < cs.length && k < 2) {
        const c = cs[(k + 1) % cs.length];
        px = c.x + c.r * 0.5; py = c.y + c.r * 0.5;
      } else {
        const cy = a * AREA_H + 4 + Math.floor(rY * (AREA_H - 10));
        px = center(Math.round(trailX[cy]) + (rS < 0.5 ? -2 : 2)); py = center(cy);
        open(toCell(px), toCell(py));
      }
      pylons.push({ id: pylons.length, area: a, x: px, y: py });
    }
  }

  // --- sticks: deadwood on the ground, finite, near clearings and the trail --
  const sticks = [];
  for (let a = 0; a < AREAS; a++) {
    for (let k = 0; k < 24; k++) {
      const r1 = rng(), r2 = rng(), r3 = rng();
      const cs = clearings.filter((c) => c.area === a);
      let sx, sy;
      if (r1 < 0.6) {
        const c = cs[Math.floor(r2 * cs.length)];
        const ang = r3 * Math.PI * 2;
        sx = c.x + Math.cos(ang) * c.r * 0.7; sy = c.y + Math.sin(ang) * c.r * 0.7;
      } else {
        const cy = a * AREA_H + 2 + Math.floor(r2 * (AREA_H - 6));
        sx = center(Math.round(trailX[cy])) + (r3 - 0.5) * 3; sy = center(cy);
      }
      if (walk[idx(toCell(sx), toCell(sy))]) sticks.push({ id: sticks.length, area: a, x: sx, y: sy, rot: r3 * 6.28 });
    }
  }

  // --- trees: only where they can be seen (near open ground) -----------------
  const near = new Uint8Array(W * H);
  for (let cy = 0; cy < H; cy++)
    for (let cx = 0; cx < W; cx++) {
      if (!walk[idx(cx, cy)]) continue;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) near[idx(nx, ny)] = 1;
        }
    }
  const trees = [];
  for (let cy = -4; cy < H + 4; cy++)
    for (let cx = 0; cx < W; cx++) {
      const inside = cy >= 0 && cy < H;
      if (inside && (walk[idx(cx, cy)] || !near[idx(cx, cy)])) continue;
      if (!inside && (cx < 4 || cx > W - 5)) continue;
      const tr = stream(hash("tree", seed, cx, cy));
      trees.push({ x: center(cx) + (tr() - 0.5) * 1.2, y: center(cy) + (tr() - 0.5) * 1.2, s: 0.8 + tr() * 0.6, k: tr() });
    }

  const startCamp = clearings.find((c) => c.area === 0);
  return {
    seed, w: W, h: H, areas: AREAS, walk, trailX, clearings, farSide, deadfalls, pylons, sticks, trees,
    start: { x: center(Math.round(trailX[2])), y: center(2) },
    startCamp: { x: startCamp.x, y: startCamp.y },
  };
}

export const open = (world, cx, cy) =>
  cx >= 0 && cy >= 0 && cx < world.w && cy < world.h && world.walk[cy * world.w + cx] === 1;

// The training ground: one clearing with the training camp, a short trail north
// to a practice log across it, and a mossed-over pylon beyond. Authored, not a
// seed: the walk-in is the same for everyone.
export function tutorialWorld() {
  const w = 40, h = 44;
  const walk = new Uint8Array(w * h);
  const o = (cx, cy) => { if (cx > 0 && cy >= 0 && cx < w - 1 && cy < h) walk[cy * w + cx] = 1; };
  const disc = (cx, cy, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) o(cx + dx, cy + dy); };
  disc(20, 10, 6);                                   // the training camp
  for (let cy = 10; cy < 36; cy++) for (let d = -1; d <= 1; d++) o(20 + d, cy);  // the trail
  disc(20, 36, 4);                                   // where the pylon stands
  const trailX = new Float32Array(h).fill(20);
  const clearings = [
    { id: 0, area: 0, kind: "birches", x: center(20), y: center(10), r: 12 },
    { id: 1, area: 0, kind: "stones", x: center(20), y: center(36), r: 8 },
  ];
  const logCy = 24, cells = [];
  for (let k = 0; k < w; k++) if (walk[logCy * w + k]) cells.push([k, logCy]);
  const deadfalls = [{ id: 0, area: 0, x: center(20), y: center(logCy), cells, work: 1.5 }];
  const pylons = [{ id: 0, area: 0, x: center(22), y: center(37), mossed: true }];
  const sticks = [];
  for (let k = 0; k < 8; k++) {
    const a = k * 0.8 + 0.4;
    sticks.push({ id: k, area: 0, x: center(20) + Math.cos(a) * 8, y: center(10) + Math.sin(a) * 8, rot: a });
  }
  const trees = [];
  for (let cy = -4; cy < h + 4; cy++)
    for (let cx = 0; cx < w; cx++) {
      if (cy >= 0 && cy < h && walk[cy * w + cx]) continue;
      const tr = stream(hash("ttree", cx, cy));
      if (tr() < 0.15) continue;
      trees.push({ x: center(cx) + (tr() - 0.5) * 1.2, y: center(cy) + (tr() - 0.5) * 1.2, s: 0.8 + tr() * 0.6, k: tr() });
    }
  return {
    seed: 0, tutorial: true, w, h, areas: 1, walk, trailX, clearings, farSide: null, deadfalls, pylons, sticks, trees,
    start: { x: center(20), y: center(4) }, startCamp: { x: center(20), y: center(11) },
  };
}

// The nearest landmark to a point, for naming where something happened.
export function placeName(world, x, y) {
  let best = null, bd = Infinity;
  for (const c of world.clearings) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best ? best.kind : "trail";
}
