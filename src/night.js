// night.js — sleep to dawn. The one place people are taken and replaced.
//
// CONSTANT ROLL COUNT: a night draws exactly NIGHT_DRAWS from the run stream,
// whoever is there, whether or not anyone is taken, whether or not anyone
// calls. Draw unconditionally, use conditionally.

import {
  burnRate, burnHours, practice, draw, party, real, atCamp, isNight, hourOf, today, dayOf, DAWN, DUSK, MAX_SLOTS, CAMP_R,
  areaAt, shielded, canStand, reachable, note, say, DRAIN,
} from "./sim.js";
import { WEATHERS } from "./chronicle.js";
import { CELL, AREA_H, center } from "./world.js";
import { bendVoice } from "./voice.js";
import { SKILLS } from "./skills.js";
import { reconcile } from "./phantom.js";
import { stream, hash } from "./rng.js";

export const NIGHT_DRAWS = 2 + MAX_SLOTS * 2 + 4;
export const BEARINGS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/**
 * Someone is taken in the night and something takes the slot: same name, a
 * little better at the work, a whistle with one thing slightly off. The real
 * one is out in the woods; the other sits at the fire as if nothing happened.
 */
export function swapOut(sim, taken, ang01, d01, d) {
  const camp = sim.camp, p = sim.player;
  const from = camp.up ? camp : p;
  const spot = placeMissing(sim, from, ang01 * Math.PI * 2, d01);
  sim.missing.push({
    id: taken.id, name: taken.name, slot: taken.slot, skills: { ...taken.skills }, sanity: taken.sanity, voice: taken.voice,
    x: spot.x, y: spot.y, area: spot.area, nights: 1, found: false, lost: false, takenDay: d,
  });
  sim.members = sim.members.filter((m) => m !== taken);
  const sk = taken.skills;
  const fakeId = sim.nextId++;
  const fake = {
    id: fakeId, name: taken.name, slot: taken.slot, fake: true, voice: bendVoice(taken.voice, sim.seed, fakeId),
    skills: Object.fromEntries(SKILLS.map((k) => [k, Math.min(6, (sk[k] || 0) + 1)])),
    sanity: 1, x: taken.x, y: taken.y, task: taken.task, state: "idle", stateT: 0, load: 0, worked: 0,
    goal: null, home: false, gone: false, quiet: 0, trainee: false, since: d + 1,
  };
  if (!atCamp(sim, fake) && camp.up) { fake.x = camp.x + 2; fake.y = camp.y + 1; }
  sim.members.push(fake);
  sim.members.sort((a, b) => a.slot - b.slot);
  return fake;
}

/**
 * THE KEYSTONE MORNING. On the third morning you wake and the camp is empty.
 * They come back one at a time, in no order you could have predicted, as you
 * come into range. Some of them are, some are not, and from here on no
 * certainty about anyone is available. One real person was quietly swapped in
 * the night so that this is true. Derived from the seed; draws nothing.
 */
export const KEYSTONE_DAY = 3;
export function startKeystone(sim, d) {
  const k = sim.keystone;
  const people = party(sim);
  if (k.done || k.active || people.length < 2) return;
  const r = stream(hash("keystone", sim.seed));
  const reals = people.filter((m) => !m.fake);
  if (reals.length > 1) {
    const victim = reals[Math.floor(r() * reals.length)];
    swapOut(sim, victim, r(), r(), d);
  }
  const all = party(sim).slice();
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  for (const m of all) { m.away = true; m.state = "idle"; m.watch = false; }
  sim.keystone = { done: false, active: true, order: all.map((m) => m.id), nextAt: sim.time + 0.25 };
  sim.plan.pending = null;                     // nothing to plan, and no fire to light, until they are all back
  say(sim, "You wake and nobody is here. The camp is empty.", "warn");
}

/**
 * How likely the night is to pick this person, weighted by exposure: outside
 * the camp, a dead fire, awake and sitting up, and a failing mind all raise it.
 * Sitting up alone in the dark is exposed, but a watchful one is not: Watchfulness
 * takes the watch's extra weight off, a quarter a level.
 */
export function takeWeight(m, { out, fireHeld }) {
  return 1 + (out ? 3 : 0) + (fireHeld ? 0 : 1.5) + (m.watch ? Math.max(0, 1 - 0.25 * m.skills.watch) : 0) + (1 - m.sanity) * 2;
}

export function canSleep(sim) {
  return !sim.tutorial && !sim.over && !sim.plan.pending && (isNight(sim.time) || hourOf(sim.time) >= DUSK - 1);
}

/** Hours from now to the next dawn. */
function hoursToDawn(t) {
  const h = hourOf(t);
  return h < DAWN ? DAWN - h : 24 - h + DAWN;
}

// Where the taken one ends up: out from camp, on open ground, in the same area,
// somewhere you can walk to.
function placeMissing(sim, from, ang, d01) {
  const area = areaAt(sim, from.y);
  const lo = area * AREA_H * CELL + 4, hi = (area + 1) * AREA_H * CELL - 10;
  for (let k = 0; k < 40; k++) {
    const d = 22 + d01 * 30 - k * 0.5;
    const a = ang + k * 0.41;
    const x = from.x + Math.cos(a) * d, y = Math.max(lo, Math.min(hi, from.y + Math.sin(a) * d));
    if (canStand(sim, x, y) && Math.hypot(x - from.x, y - from.y) > CAMP_R + 4 && reachable(sim, from, { x, y })) return { x, y, area };
  }
  // fall back to the farthest reachable clearing in the area
  const cs = sim.world.clearings.filter((c) => c.area === area && reachable(sim, from, c));
  cs.sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y));
  const c = cs[0] || { x: from.x, y: from.y };
  return { x: c.x, y: c.y, area };
}

export function sleep(sim) {
  if (!canSleep(sim)) return null;
  const p = sim.player;
  const hours = hoursToDawn(sim.time);
  const camp = sim.camp;
  const rough = !atCamp(sim, p);
  const D = Array.from({ length: NIGHT_DRAWS }, () => draw(sim));
  let di = 0;
  const rTake = D[di++], rWho = D[di++];
  const slotDraws = [];
  for (let s = 0; s < MAX_SLOTS; s++) slotDraws.push([D[di++], D[di++]]);
  const rWeather = D[di++], rCall = D[di++], rFalse = D[di++], rBear = D[di++];

  // --- the fire: what is in it, plus what a watch feeds it from the pile -----
  let fuel = camp.up && camp.lit ? camp.fire : 0;
  const watchers = party(sim).filter((m) => m.watch && atCamp(sim, m));
  if (camp.up && camp.lit && watchers.length && fuel < hours * burnRate(sim)) {
    // the best hand at a fire among the watch makes the pile last longest
    const per = Math.max(...watchers.map((w) => burnHours(w)));
    const need = Math.ceil((hours * burnRate(sim) - fuel) / per), use = Math.min(need, camp.pile);
    camp.pile -= use; fuel += use * per;
  }
  const burn = hours * burnRate(sim);          // deeper, the fire eats wood faster
  const fireHeld = camp.up && fuel >= burn;
  const fireHours = Math.min(fuel / burnRate(sim), hours);
  if (camp.up) { camp.fire = fuel - burn > 1e-6 ? fuel - burn : 0; camp.lit = camp.fire > 0; }   // a fire with no fuel is out, not lit

  // --- the hidden meter, across the night -----------------------------------
  const bodies = [p, ...party(sim)];
  for (const b of bodies) {
    if (b.fake) continue;
    const area = areaAt(sim, b.y);
    const depth = shielded(sim, area) ? 1 : 1 + area * 0.6;
    const inside = atCamp(sim, b);
    const covered = inside ? fireHours : 0;
    const loss = DRAIN * depth * (covered * 0.6 + (hours - covered) * (inside ? 1.6 : 2.6));
    b.sanity = Math.max(0, b.sanity - loss);
  }

  // --- who the night takes ----------------------------------------------------
  const d = today(sim);
  const reals = real(sim);
  const fakesHeld = party(sim).filter((m) => m.fake).length;
  const area = areaAt(sim, camp.up ? camp.y : p.y);
  // Watchfulness: those sitting up at the fire, awake and looking, make the
  // night less likely to take anyone (3% a level, to a limit of 18%). Skill 0
  // sits up and does no good, as before.
  const watchSkill = watchers.reduce((s, m) => s + m.skills.watch, 0);
  const pressure =
    0.1 + (shielded(sim, area) ? 0 : 0.07 * area) + (fireHeld && !rough ? 0 : 0.25) + 0.08 * fakesHeld +
    0.25 * (1 - reals.reduce((s, m) => s + m.sanity, 0) / Math.max(1, reals.length)) -
    Math.min(0.18, 0.03 * watchSkill);
  const P = d === 1 ? 0 : Math.max(0, Math.min(0.85, pressure));
  let taken = null;
  if (rTake < P && reals.length > 1) {
    const weights = reals.map((m) => takeWeight(m, { out: !atCamp(sim, m), fireHeld }));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rWho * total;
    for (let i = 0; i < reals.length; i++) { x -= weights[i]; if (x < 0) { taken = reals[i]; break; } }
    taken ||= reals[reals.length - 1];
  }

  for (const ms of sim.missing) {
    if (ms.found || ms.lost) continue;
    ms.nights++;
    ms.sanity = Math.max(0, ms.sanity - 0.08);
  }

  if (taken) {
    const [ang01, d01] = slotDraws[taken.slot % MAX_SLOTS];
    swapOut(sim, taken, ang01, d01, d);
  }

  // morning: what you saw snaps back to what was true
  reconcile(sim);

  // the night's watch learns from it
  for (const w of watchers) practice(sim, w, "watch");

  // --- dawn -------------------------------------------------------------------
  // Dawn is an exact time. Adding hours to a float can land a hair short of it,
  // which would make "tomorrow" today and overwrite today's record.
  sim.time = DAWN + 24 * d;
  const nd = today(sim);
  if (nd !== d + 1 || sim.chron[nd]) throw new Error("night: dawn did not advance the day");
  sim.weather[nd] = WEATHERS[Math.floor(rWeather * WEATHERS.length)];
  sim.chron[nd] = { weather: sim.weather[nd], facts: [] };
  for (const m of party(sim)) {
    // the task they had yesterday is the task they wake to
    m.watch = false; m.state = "idle"; m.load = 0; m.site = null;
    m.called = false;                         // a new day: back to their own work
  }

  // Lost: the camp has moved two areas past them.
  const campArea = areaAt(sim, camp.up ? camp.y : p.y);
  for (const ms of sim.missing) if (!ms.found && campArea > ms.area + 1) ms.lost = true;

  // The call. It comes from the missing one's real bearing, fades with nights
  // out (with a floor), and false calls happen too, so a call is not an
  // announcement. A bearing that holds across dawns is the tell.
  const out = sim.missing.filter((ms) => !ms.found && !ms.lost);
  const heardFrom = camp.up ? camp : p;
  let bearing = null;
  if (out.length) {
    const ms = out[0];
    if (rCall < Math.max(0.35, 0.95 - 0.15 * (ms.nights - 1))) bearing = bearingOf(heardFrom, ms);
  }
  if (bearing == null && rFalse < 0.22) bearing = Math.floor(rBear * 8);
  sim.call = bearing == null ? null : { day: nd, bearing };

  sim.asleep = false;
  sim.wantSleep = false;
  // at camp, or anywhere if there is no camp: you wake with whoever is around
  sim.plan.pending = !camp.up || atCamp(sim, p) ? "dawn" : null;
  sim.plan.day = nd;
  if (nd === KEYSTONE_DAY && !sim.keystone.done) startKeystone(sim, d);

  const lines = [`Day ${nd}.`];
  if (!fireHeld && camp.up && camp.lit === false) lines.push("The fire was out before light.");
  if (sim.call) lines.push(`At first light, a voice, a long way off. From the ${BEARINGS[sim.call.bearing]}.`);
  say(sim, lines.join(" "), sim.call ? "warn" : "info");
  sim.events.push({ kind: "dawn", day: nd, fireHeld, rough });
  return { hours, fireHeld, rough, taken: taken ? taken.id : null };
}

export function bearingOf(from, to) {
  // 0 = north (+y), clockwise
  const a = Math.atan2(to.x - from.x, to.y - from.y);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
