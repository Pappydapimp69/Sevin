// night.js — sleep to dawn. The one place people are taken and replaced.
//
// CONSTANT ROLL COUNT: a night draws exactly NIGHT_DRAWS from the run stream,
// whoever is there, whether or not anyone is taken, whether or not anyone
// calls. Draw unconditionally, use conditionally.

import {
  burnHours, draw, party, real, atCamp, isNight, hourOf, today, dayOf, DAWN, DUSK, MAX_SLOTS, CAMP_R,
  areaAt, shielded, canStand, reachable, note, say, DRAIN,
} from "./sim.js";
import { WEATHERS } from "./chronicle.js";
import { CELL, AREA_H, center } from "./world.js";
import { bendVoice } from "./voice.js";

export const NIGHT_DRAWS = 2 + MAX_SLOTS * 2 + 4;
export const BEARINGS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

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
  if (camp.up && camp.lit && watchers.length && fuel < hours) {
    // the best hand at a fire among the watch makes the pile last longest
    const per = Math.max(...watchers.map((w) => burnHours(w)));
    const need = Math.ceil((hours - fuel) / per), use = Math.min(need, camp.pile);
    camp.pile -= use; fuel += use * per;
  }
  const fireHeld = camp.up && fuel >= hours;
  const fireHours = Math.min(fuel, hours);
  if (camp.up) { camp.fire = Math.max(0, fuel - hours); camp.lit = camp.fire > 0; }

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
  const pressure =
    0.1 + (shielded(sim, area) ? 0 : 0.07 * area) + (fireHeld && !rough ? 0 : 0.25) + 0.08 * fakesHeld +
    0.25 * (1 - reals.reduce((s, m) => s + m.sanity, 0) / Math.max(1, reals.length));
  const P = d === 1 ? 0 : Math.min(0.85, pressure);
  let taken = null;
  if (rTake < P && reals.length > 1) {
    const weights = reals.map((m) => {
      const out = !atCamp(sim, m);
      return 1 + (out ? 3 : 0) + (fireHeld ? 0 : 1.5) + (m.watch ? 1 : 0) + (1 - m.sanity) * 2;
    });
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
    const from = camp.up ? camp : p;
    const spot = placeMissing(sim, from, ang01 * Math.PI * 2, d01);
    sim.missing.push({
      id: taken.id, name: taken.name, slot: taken.slot, skills: { ...taken.skills }, sanity: taken.sanity, voice: taken.voice,
      x: spot.x, y: spot.y, area: spot.area, nights: 1, found: false, lost: false, takenDay: d,
    });
    sim.members = sim.members.filter((m) => m !== taken);
    // Something takes the slot: same name, a little better at the work.
    const sk = taken.skills;
    const fakeId = sim.nextId++;
    const fake = {
      // their whistle, with one thing slightly wrong
      id: fakeId, name: taken.name, slot: taken.slot, fake: true, voice: bendVoice(taken.voice, sim.seed, fakeId),
      skills: { cut: Math.min(6, sk.cut + 1), carry: Math.min(6, sk.carry + 1), fire: Math.min(6, sk.fire + 1) },
      sanity: 1, x: taken.x, y: taken.y, task: taken.task, state: "idle", stateT: 0, load: 0, worked: 0,
      goal: null, home: false, gone: false, quiet: 0, trainee: false, since: d + 1,
    };
    if (!atCamp(sim, fake) && camp.up) { fake.x = camp.x + 2; fake.y = camp.y + 1; }
    sim.members.push(fake);
    sim.members.sort((a, b) => a.slot - b.slot);
  }

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
