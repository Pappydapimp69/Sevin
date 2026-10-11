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
import { canStand, hourOf, today } from "./sim.js";

export const STICK_MIND = 0.55;      // below this the ground starts offering things
export const FIRE_MIND = 0.35;       // below this a dead fire can still seem to burn
export const fresh = () => ({ taken: [], extra: 0, fire: 0 });

const mind = (sim) => sim.player.sanity;

/** Sticks that are not there, near you, the same ones every time you look. */
export function phantomSticks(sim) {
  const m = mind(sim);
  if (m >= STICK_MIND) return [];
  const ph = sim.phantom || fresh();
  const n = Math.min(6, 1 + Math.floor((STICK_MIND - m) / 0.07));
  // anchored to a 12 m cell round you, so they hold still as you walk up to one,
  // and only on ground you could really stand on: they look like the real ones
  const gx = Math.floor(sim.player.x / 12), gy = Math.floor(sim.player.y / 12);
  const r = stream(hash("phantom", sim.seed, today(sim), Math.floor(hourOf(sim.time) / 3), gx, gy));
  const out = [];
  for (let i = 0; i < 40 && out.length < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 6, rot = r() * 6.28;
    const x = gx * 12 + 6 + Math.cos(a) * d, y = gy * 12 + 6 + Math.sin(a) * d;
    const id = `p${today(sim)}:${gx}:${gy}:${i}`;
    if (ph.taken.includes(id) || !canStand(sim, x, y)) continue;
    out.push({ id, x, y, rot });
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
  if (ph.fire > 0) ph.fire = Math.max(0, ph.fire - hours);
  if (sim.camp.lit) ph.fire = 0;            // a real fire is lit: nothing false to show
}

/** Dawn: shown snaps to true. */
export const reconcile = (sim) => { sim.phantom = fresh(); };
