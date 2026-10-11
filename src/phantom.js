// phantom.js — what a failing mind shows YOU. The only place the player's own
// hallucinations live. Everything here is derived (from the seed, the day and
// where you stand) and draws nothing from the run stream.
//
// The rules, from the design note: a hallucination behaves CORRECTLY. The
// phantom stick can be picked up and the count goes up; the phantom fire burns
// down on schedule and asks to be fed. What gives it away is the world: the
// pile that did not grow, the cold. Feeding the false fire spends REAL wood.
// Morning snaps what you saw back to what was true. Nothing announces it, and
// no number or word for the meter is ever shown.

import { stream, hash } from "./rng.js";
import { canStand, hourOf, today, SEC_PER_HOUR } from "./sim.js";

export const STICK_MIND = 0.75;      // below this the ground starts offering things
export const FIRE_MIND = 0.55;       // below this a dead fire can still seem to burn
export const fresh = () => ({ taken: [], extra: 0, fire: 0, slither: {} });

const mind = (sim) => sim.player.sanity;

// A phantom stick sits where it sits: the world is cut into 5 m cells and each
// cell either holds one or does not, from (seed, day, cell). Nothing is placed
// round YOU, so nothing pops in as you walk; a failing mind just fills more
// cells. Some of them are not sticks. When you come close the thing wakes and
// slithers away through the leaves.
const CELL_M = 5, SHOW_M = 15, SNAKE_M = 4, SLITHER_S = 5.5;
const kindOf = (sim, id) => (stream(hash("kind", sim.seed, id))() < 0.4 ? "snake" : "stick");

/** The slither's head at `e` seconds, and how far it has sunk back into the ground. */
function slitherAt(sl, e) {
  const d = 0.9 * e + 0.25 * e * e;           // it starts slow and then goes
  return { x: sl.x + Math.cos(sl.ang) * d, y: sl.y + Math.sin(sl.ang) * d, ang: sl.ang, t: e, sink: Math.max(0, (e - 4) / 1.5) };
}

/**
 * What is on the ground that is not there: still ones that look like any
 * other stick (kind says what they really are), and any that have woken and
 * are slithering away (slither: true, not pickable).
 */
export function phantomSticks(sim) {
  const m = mind(sim);
  const ph = sim.phantom || fresh();
  const out = [];
  const sl = ph.slither || {};
  for (const [id, v] of Object.entries(sl)) out.push({ id, slither: true, kind: "snake", ...slitherAt(v, (sim.time - v.t0) * SEC_PER_HOUR) });
  if (m >= STICK_MIND) return out;
  const density = Math.min(0.5, 0.12 + (STICK_MIND - m) * 0.9);
  const day = today(sim);
  const cx0 = Math.floor((sim.player.x - SHOW_M) / CELL_M), cx1 = Math.floor((sim.player.x + SHOW_M) / CELL_M);
  const cy0 = Math.floor((sim.player.y - SHOW_M) / CELL_M), cy1 = Math.floor((sim.player.y + SHOW_M) / CELL_M);
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const r = stream(hash("phantom", sim.seed, day, cx, cy));
    const has = r(), x = cx * CELL_M + r() * CELL_M, y = cy * CELL_M + r() * CELL_M, rot = r() * 6.28;
    if (has >= density) continue;
    const id = `p${day}:${cx}:${cy}`;
    if (ph.taken.includes(id) || sl[id] || !canStand(sim, x, y)) continue;
    out.push({ id, x, y, rot, kind: kindOf(sim, id) });
  }
  return out;
}

/** What the player is told is in the pack: the true count plus what they "picked up". */
export const shownWood = (sim) => sim.player.wood + (sim.phantom?.extra || 0);

/** The fire as seen: a phantom one burns when the real one is out. */
export function shownFire(sim) {
  const c = sim.camp, ph = sim.phantom;
  if (!c.up) return { up: false, lit: false, fire: 0, phantom: false };
  if (c.lit) return { up: true, lit: true, fire: c.fire, phantom: false };
  if (ph && ph.fire > 0 && mind(sim) < FIRE_MIND) return { up: true, lit: true, fire: ph.fire, phantom: true };
  return { up: true, lit: false, fire: 0, phantom: false };
}

export function pickPhantom(sim, id) {
  const ph = (sim.phantom ||= fresh());
  ph.taken.push(id);
  ph.extra += 1;
}

/** Feeding what is not burning: the wood is really spent, nothing warms. */
export function feedPhantom(sim) {
  const ph = (sim.phantom ||= fresh());
  if (sim.camp.pile <= 0) return false;
  sim.camp.pile -= 1;
  ph.fire = Math.min(12, ph.fire + 1.5);
  return true;
}

/** The real fire just went out with a failing mind at camp: it does not seem to. */
export function onFireOut(sim) {
  const ph = (sim.phantom ||= fresh());
  if (mind(sim) < FIRE_MIND && sim.camp.up) ph.fire = 2.5;
}

/** On schedule, a phantom fire shrinks and goes out like a real one. */
export function tickPhantom(sim, hours) {
  const ph = sim.phantom;
  if (!ph) return;
  ph.slither ||= {};
  // a "stick" that is a snake wakes when you come close, and goes
  for (const s of phantomSticks(sim)) {
    if (s.slither || s.kind !== "snake" || Math.hypot(s.x - sim.player.x, s.y - sim.player.y) > SNAKE_M) continue;
    const away = Math.atan2(s.y - sim.player.y, s.x - sim.player.x) + (stream(hash("wind", sim.seed, s.id))() - 0.5) * 0.9;
    ph.slither[s.id] = { x: s.x, y: s.y, ang: away, t0: sim.time };
    sim.events.push({ kind: "hiss" });
  }
  for (const [id, v] of Object.entries(ph.slither)) {
    if ((sim.time - v.t0) * SEC_PER_HOUR > SLITHER_S) { delete ph.slither[id]; ph.taken.push(id); }
  }
  if (ph.fire > 0) ph.fire = Math.max(0, ph.fire - hours);
  if (sim.camp.lit) ph.fire = 0;            // a real fire is lit: nothing false to show
}

/** Dawn: shown snaps to true. */
export const reconcile = (sim) => { sim.phantom = fresh(); };
