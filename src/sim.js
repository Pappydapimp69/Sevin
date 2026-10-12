// sim.js — the only thing that changes a run. Pure; no DOM, no Three.
//
// The world (world.js) is what is THERE, regenerated from the seed. The sim is
// what HAPPENED: where everyone is, what is cut, what is burning, who is real.
// Everything in here is plain data so a save is JSON.stringify(sim).
//
// Commands (act, ask, call, sleep, setPlan, ...) are the player's verbs and are
// called by the UI. `tick` moves time and bodies. Both push to sim.msgs /
// sim.events; the frame loop drains them. Nothing here clears them.

import { makeRng, hash, stream } from "./rng.js";
import { makeRoster } from "./names.js";
import { generateWorld, tutorialWorld, CELL, AREA_H, toCell, center, open, placeName } from "./world.js";
import { record, WEATHERS } from "./chronicle.js";
import { makeVoice } from "./voice.js";
import { SKILLS, fillSkills, TASK_SKILL } from "./skills.js";
import * as Phantom from "./phantom.js";
import * as Mirage from "./mirage.js";
import * as Grove from "./grove.js";
export { TASK_SKILL };

export const SAVE_VERSION = 1;
export const SEC_PER_HOUR = 20;      // real seconds per game hour
export const WORK_SPEED = 8;         // time runs this much faster while you work
export const DAWN = 6, DUSK = 18;
export const EVENING_END = 22;       // the clock stops: say who keeps watch, and sleep
export const WAKE = 2;               // you always wake at two
// Real seconds per game hour: the evening slows down, the small hours slower still.
export const EVENING_SEC = 45, SMALL_HOURS_SEC = 300;
export function secPerHour(t) {
  const h = hourOf(t);
  if (h >= DUSK && h < EVENING_END) return EVENING_SEC;
  if (h >= WAKE && h < DAWN) return SMALL_HOURS_SEC;
  return SEC_PER_HOUR;
}
export const inSmallHours = (t) => hourOf(t) >= WAKE && hourOf(t) < DAWN;
// The camp's layout, around the fire: where the tents stand (render draws
// them, the sleep scene walks into one).
export const TENTS = Object.freeze([{ dx: -3.4, dy: 2.4 }, { dx: 3.2, dy: 2.8 }]);
export const CAMP_R = 12;            // metres: the campsite, and the fire's shield
export const REACH = 3;              // metres: hands' reach
export const HEAR = 25;              // metres: how far a whistle carries
export const MAX_SLOTS = 8;          // fixed for constant roll counts
export const TASKS = ["auto", "follow", "chop", "gather", "camp", "pitch"];
export const CARRY_MAX = 5;           // wood you can carry with a camp up
export const CARRY_NO_CAMP = 10;      // with no camp, you carry the build wood
// what a teammate can carry: one piece for every two points of Carrying, at least one
export const memberCarry = (m) => Math.max(1, Math.floor((m.skills?.carry || 0) / 2));
export const carryMax = (sim) => (sim.camp.up ? CARRY_MAX : CARRY_NO_CAMP);
export const HAUL_CHANCE = 0.8;       // a gatherer hauls an old pile to the new camp this often
export const CAMP_WOOD = 10;          // a camp is made from the team's wood
export const TASK_LABEL = { follow: "with you", chop: "on the deadfall", gather: "gathering wood", camp: "keeping camp", pitch: "making camp", auto: "using their judgement" };
// What can be set this morning: no camp, nobody can stay at it; a camp up,
// nobody needs to make one.
// A camp you have taken down is yours to put up again: the team only ever makes the first.
// making camp is a task only while one you started is half made
export const tasksNow = (sim) => TASKS.filter((t) => (t === "camp" ? sim.camp.up : t === "pitch" ? !sim.camp.up && !!sim.pitch : true));
// person-hours: alone it is most of a morning; the whole team, about an hour
export const PITCH_HOURS = 5;
// Building is the sum of the hands on it: you alone add little; each teammate adds
// a little for their hands and more for every level of Building.
// Your own hands slow the deeper you go (0.6 an hour in area 1, 0.1 less each
// area after) and with a mind that is going; teammates grow with practice.
export const PLAYER_BUILD = [0.6, 0.5, 0.4, 0.3, 0.2];
export const buildRate = (who, sim) => (who === "you"
  ? PLAYER_BUILD[Math.min(PLAYER_BUILD.length - 1, areaAt(sim, sim.player.y))] * (0.5 + 0.5 * sim.player.sanity)
  : 0.25 + 0.25 * (who.skills.build || 0));
// Gathering is chopping deadwood: an hour of daylight a chop, and 1 to 3
// pieces out of it. Carrying makes a bigger haul likelier, never certain.
// The roll is a side hash (who, which chop), not the run stream.
export const WOOD_CHOP_HOURS = 1;
export function woodPerChop() { return 1; }          // one piece an hour's chop

/** Deeper woods eat the fire faster: +50% a level of depth below the first. */
export const burnRate = (sim) => 1 + 0.5 * areaAt(sim, sim.camp.y);
export const STRIKE_HOURS = 2;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * A new run. `party` is [{name, skills:{...SKILLS}}] from recruitment, or
 * omitted to compose one from the seed.
 */
/**
 * `camp`: start with the camp already up (the training ground does; tests may).
 * A real walk starts with none: you arrive carrying the kit.
 */
export function createRun({ seed, party = null, tutorial = false, camp: campUp = tutorial }) {
  const world = tutorial ? tutorialWorld() : generateWorld(seed);
  const rng = makeRng(hash("run", seed));
  const r = () => rng.next();
  if (!party) {
    const names = makeRoster(r, 5);
    party = names.map((name, i) => ({ name, skills: { cut: [3, 1, 1, 2, 1][i], carry: [0, 2, 1, 1, 2][i], fire: [0, 0, 1, 0, 1][i], build: [0, 1, 2, 0, 1][i], watch: [1, 0, 0, 2, 1][i] } }));
  }
  const camp = world.startCamp;
  const sim = {
    v: SAVE_VERSION, seed, tutorial, rngState: rng.s,
    time: DAWN + (tutorial ? 2 : 1),         // you arrive mid-morning
    weather: { 1: WEATHERS[Math.floor(r() * WEATHERS.length)] },
    player: { x: world.start.x, y: world.start.y, yaw: 0, pitch: 0, wood: 0, sanity: 1, carryingKit: false },
    members: [],
    missing: [],
    nextId: 1,
    camp: { up: campUp, x: camp.x, y: camp.y, pile: campUp && !tutorial ? 3 : 0, fire: 0, lit: false },
    pitch: null,                              // {x, y, left, place} while the team makes camp
    deadfalls: world.deadfalls.map(() => ({ done: 0 })),
    sticks: world.sticks.map(() => false),
    pylons: world.pylons.map(() => ({ spent: false, litAt: null })),
    home: { lit: 0, sent: [], count: null, wasted: 0 },
    work: null,                               // {kind, id} the player's hands
    plan: { pending: tutorial ? null : null, day: 1 },
    chron: { 1: { weather: null, facts: [] } },
    seenKeys: {},
    call: null,                               // the dawn call, if any
    lastFollowCall: -1,
    phantom: Phantom.fresh(),
    keystone: { done: false, active: false, order: [], nextAt: 0 },
    whistleWindow: 0,
    mirage: {},
    night: null,                             // the night's draws, between sleeping and dawn
    lifelines: { team: true, one: true, both: true },   // the morning choice: each once a run
    stats: { asked: 0, tested: 0, rescued: 0, whistles: 0 },
    startTime: DAWN + (tutorial ? 2 : 1),
    over: null,
    msgs: [], events: [],
  };
  sim.chron[1].weather = sim.weather[1];
  party.forEach((p, i) => {
    sim.members.push(newMember(sim, p.name, i, fillSkills(p.skills), false, camp.x + Math.cos(i * 1.25) * 4, camp.y + Math.sin(i * 1.25) * 4));
  });
  for (const m of sim.members) m.task = tutorial ? "follow" : "auto";   // using their judgement from the start
  if (!campUp) sim.player.carryingKit = true;
  attach(sim, world);
  return sim;
}

function newMember(sim, name, slot, skills, fake, x, y) {
  const id = sim.nextId++;
  return {
    id, name, slot, fake, skills, sanity: 1, voice: makeVoice(sim.seed, slot, id),
    x, y, task: "camp", state: "idle", stateT: 0, load: 0, worked: 0,
    goal: null, home: false, gone: false, quiet: 0, trainee: false,
  };
}

// The world is not saved; it is regenerated from the seed and attached.
export function attach(sim, world) {
  Object.defineProperty(sim, "world", { value: world || (sim.tutorial ? tutorialWorld() : generateWorld(sim.seed)), enumerable: false, writable: true, configurable: true });
  Object.defineProperty(sim, "rng", { value: makeRng(sim.rngState), enumerable: false, writable: true, configurable: true });
  Object.defineProperty(sim, "fields", { value: new Map(), enumerable: false, writable: true, configurable: true });
  Object.defineProperty(sim, "sealedCells", { value: new Set(), enumerable: false, writable: true, configurable: true });
  sim.mirage ||= {};
  Grove.ensure(sim);
  sim.lifelines ||= { team: true, one: true, both: true };
  for (const m of sim.members) if (m.task === "pitch" && !sim.pitch) m.task = "auto";
  sim.campEvent = false;                 // a scene, never resumed from a save
  sim.piles ||= [];                      // woodpiles left behind where a camp stood
  if (sim.site === undefined) sim.site = null;   // where you said the camp goes: the drop zone
  for (const d of sim.world.decoys || []) if (Mirage.blocked(sim.mirage[d.id])) for (const [x, y] of d.seal) sim.sealedCells.add(x + "," + y);
  return sim;
}

// Draw from the run stream and keep the saved state word in step.
export function draw(sim) {
  const v = sim.rng.next();
  sim.rngState = sim.rng.s;
  return v;
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export const dayOf = (t) => Math.floor((t - DAWN) / 24) + 1;
export const hourOf = (t) => ((t % 24) + 24) % 24;
export const isNight = (t) => hourOf(t) >= DUSK || hourOf(t) < DAWN;
/**
 * How light it is, 0..1, on the SAME clock as isNight: the sun goes down
 * through the last hour and a half before dusk and is gone by dusk; it comes
 * up through the first hour after dawn. The screen and the rules never disagree
 * about whether it is night.
 */
export function daylight(t) {
  const h = hourOf(t);
  if (h >= DUSK || h < DAWN) return h >= DUSK && h < DUSK + 0.25 ? 0.08 * (1 - (h - DUSK) / 0.25) : 0;
  if (h < DAWN + 1) return Math.max(0.08, h - DAWN);         // first light at dawn, full by seven
  if (h > DUSK - 1.5) return Math.max(0.08, (DUSK - h) / 1.5);
  return 1;
}
export const clock = (t) => {
  const h = hourOf(t);
  return String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.floor((h % 1) * 60)).padStart(2, "0");
};
export const today = (sim) => dayOf(sim.time);

/**
 * The compass lies from the third day. The trail still leads north, but the
 * needle reads turned by 1 to 7 eighths of a circle, a different amount each
 * day, and everything the game puts in words about direction follows it. Your
 * ears do not (a whistle is heard from where it really is). Nothing says so.
 */
export function compassOffset(sim) {
  const d = dayOf(sim.time);
  let off = 0;
  for (let k = 3; k <= d; k++) {            // each day turns it on from the day before, never back to true
    const step = 1 + Math.floor(stream(hash("compass", sim.seed, k))() * 6);   // 1..6
    off = (off + step) % 8 || (off + step + 1) % 8;
  }
  return d < 3 ? 0 : off;
}
/** A true bearing (0-7, north first) as the compass would have it. */
export const seenBearing = (sim, b) => (b + compassOffset(sim)) % 8;

export function say(sim, text, kind = "info") {
  sim.msgs.push({ t: sim.time, text, kind });
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

// A cell is passable if the world opens it and no uncut deadfall lies on it.
export function passable(sim, cx, cy) {
  if (!open(sim.world, cx, cy)) return false;
  if (sim.sealedCells && sim.sealedCells.has(cx + "," + cy)) return false;     // trees across the way in (mirage.js)
  for (let i = 0; i < sim.world.deadfalls.length; i++) {
    if (sim.deadfalls[i].done >= 1) continue;
    for (const [dx, dy] of sim.world.deadfalls[i].cells) if (dx === cx && dy === cy) return false;
  }
  return true;
}

const RAD = 0.35;
export function canStand(sim, x, y) {
  for (const [ox, oy] of [[-RAD, -RAD], [RAD, -RAD], [-RAD, RAD], [RAD, RAD]])
    if (!passable(sim, toCell(x + ox), toCell(y + oy))) return false;
  return true;
}

// Distance field to a target cell, cached by target and by which deadfalls are
// cut (cutting one changes every path north).
function field(sim, tx, ty) {
  const gate = sim.deadfalls.map((d) => (d.done >= 1 ? 1 : 0)).join("") + (sim.sealedCells && sim.sealedCells.size ? "s" + sim.sealedCells.size : "");
  const key = tx + "," + ty + "," + gate;
  let f = sim.fields.get(key);
  if (f) return f;
  const { w, h } = sim.world;
  f = new Int32Array(w * h).fill(-1);
  const q = [tx + ty * w];
  f[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!passable(sim, nx, ny)) continue;
      const n = nx + ny * w;
      if (f[n] >= 0) continue;
      f[n] = f[c] + 1;
      q.push(n);
    }
  }
  if (sim.fields.size > 400) sim.fields.clear();
  sim.fields.set(key, f);
  return f;
}

export function reachable(sim, from, to) {
  const f = field(sim, toCell(to.x), toCell(to.y));
  return f[toCell(from.x) + toCell(from.y) * sim.world.w] >= 0;
}

/** Cell-centre waypoints from one point to another along open ground. */
export function route(sim, from, to) {
  const f = field(sim, toCell(to.x), toCell(to.y));
  const w = sim.world.w, out = [];
  let cx = toCell(from.x), cy = toCell(from.y);
  for (let k = 0; k < 4000 && f[cx + cy * w] > 0; k++) {
    let best = null, bv = f[cx + cy * w];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = passable(sim, cx + ox, cy + oy) ? f[cx + ox + (cy + oy) * w] : -1;
      if (v >= 0 && v < bv) { bv = v; best = [cx + ox, cy + oy]; }
    }
    if (!best) break;
    [cx, cy] = best;
    out.push({ x: center(cx), y: center(cy) });
  }
  return out;
}

// Step a body toward a point along the ground. Returns true on arrival.
function steer(sim, m, gx, gy, speed, dt, stopAt = 0.6) {
  const dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
  if (d <= stopAt) return true;
  let tx = gx, ty = gy;
  const cx = toCell(m.x), cy = toCell(m.y), gcx = toCell(gx), gcy = toCell(gy);
  if (Math.abs(cx - gcx) + Math.abs(cy - gcy) > 1) {
    const f = field(sim, gcx, gcy);
    const w = sim.world.w;
    const here = f[cx + cy * w];
    if (here < 0) return false;                 // nowhere to go from here
    let best = null, bv = here;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      const v = passable(sim, nx, ny) ? f[nx + ny * w] : -1;
      // diagonal only if both sides are open, or bodies clip corners
      if (ox && oy && (!passable(sim, cx + ox, cy) || !passable(sim, cx, cy + oy))) continue;
      if (v >= 0 && v < bv) { bv = v; best = [nx, ny]; }
    }
    if (best) { tx = center(best[0]); ty = center(best[1]); }
  }
  const ex = tx - m.x, ey = ty - m.y, ed = Math.hypot(ex, ey) || 1;
  const step = Math.min(speed * dt, ed);
  const nx = m.x + (ex / ed) * step, ny = m.y + (ey / ed) * step;
  if (canStand(sim, nx, ny)) { m.x = nx; m.y = ny; }
  else { m.x = center(cx); m.y = center(cy); }   // unstick toward the cell centre
  return false;
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

// Was the player close enough to see it? Only facts you saw can be bent, so a
// fake's lie is always about something you could have witnessed.
function witnessed(sim, x, y, actor) {
  return actor === "you" || Math.hypot(sim.player.x - x, sim.player.y - y) < 30;
}

export function note(sim, { verb, actor, object = null, cls = null, x, y, withWhom = [], key = null }) {
  const d = today(sim);
  const ch = (sim.chron[d] ||= { weather: sim.weather[d], facts: [] });
  const k = d + ":" + (key || verb + ":" + actor + ":" + object);
  if (sim.seenKeys[k]) return null;
  sim.seenKeys[k] = 1;
  const place = x == null ? null : placeName(sim.world, x, y);
  return record(ch, { t: sim.time, verb, actor, object, cls, place, withWhom, seen: witnessed(sim, x ?? sim.player.x, y ?? sim.player.y, actor) });
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const party = (sim) => sim.members.filter((m) => !m.gone && !m.home && !m.away);
export const real = (sim) => party(sim).filter((m) => !m.fake);
export const byId = (sim, id) => sim.members.find((m) => m.id === id);
export const nameOf = (sim, id) => (id === "you" ? "you" : byId(sim, id)?.name || "someone");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const atCamp = (sim, p) => sim.camp.up && dist(p, sim.camp) < CAMP_R;
const skill = (m, k) => (m === "you" ? 0 : m.skills[k]);
export const areaAt = (sim, y) => Math.max(0, Math.min(sim.world.areas - 1, Math.floor(y / CELL / AREA_H)));

// The deadfall that matters now: the first uncut one north of the camp.
export function currentDeadfall(sim) {
  const base = sim.camp.up ? sim.camp.y : sim.player.y;
  let best = -1;
  sim.world.deadfalls.forEach((d, i) => {
    if (sim.deadfalls[i].done >= 1 || d.y < base - 20) return;
    if (best < 0 || d.y < sim.world.deadfalls[best].y) best = i;
  });
  return best;
}

// The nearest clearing to the camp that is reachable: where wood comes from.
function woodSite(sim, m) {
  let best = null, bd = Infinity;
  for (const c of sim.world.clearings) {
    if (!reachable(sim, m, c)) continue;
    const d = dist(c, sim.camp.up ? sim.camp : m);
    if (d < bd && d > 4) { bd = d; best = c; }
  }
  return best;
}

function speedOf(m) {
  // the fraying lag behind; nothing on screen says why
  return 3.0 * (m.sanity < 0.35 ? 0.75 : 1);
}

function tickMember(sim, m, dt, hours) {
  const p = sim.player;
  m.stateT += hours;

  // They heard the whistle a moment ago and whistle back. That is all: what
  // they are doing is theirs until you whistle twice.
  if (m.answerAt != null && sim.time >= m.answerAt) {
    m.answerAt = null;
    sim.events.push({ kind: "answer", id: m.id, x: m.x, y: m.y, voice: m.voice, ctx: whistleCtx(sim, m) });
  }
  const hr = hourOf(sim.time);
  const lateDay = hr >= DUSK - 1.5 || hr < DAWN;   // a shift that no longer fits is not started

  // A shift ends at dusk: everyone with a field task walks home. With no
  // camp to walk home to, they come back to you.
  if (lateDay && !m.called && (effTask(m) === "chop" || effTask(m) === "gather")) {
    // sent home once; someone already at camp is home
    const home = sim.camp.up ? sim.camp : sim.site;
    if (home) { if (m.state !== "home" && dist(m, home) > 5) { m.state = "home"; m.goal = { x: home.x, y: home.y }; } }
    else if (hr >= DUSK || hr < DAWN) { m.called = true; m.state = "idle"; }   // no campsite at dusk: tonight they stay with you
  }

  // Evening at camp: everyone not with you comes in to the fire, lights it
  // if nobody has, keeps it going, and waits up for you. Awake after dark is
  // night to the mind (drain() counts it).
  // Their task keeps through the night, but after dark nobody leaves the
  // fire to work it; they take it up again at first light.
  if (atFireTonight(sim, m) && m.state !== "home") {
    const spot = { x: sim.camp.x + Math.cos(m.slot * 1.25 + 0.4) * 1.7, y: sim.camp.y + Math.sin(m.slot * 1.25 + 0.4) * 1.7 };
    if (steer(sim, m, spot.x, spot.y, speedOf(m), dt, 0.5)) {
      m.state = "sit";
      if (!sim.camp.lit || sim.camp.fire < 1.5) memberTends(sim, m);
    } else m.state = "walk";
    return;
  }
  if (m.state === "sit") m.state = "idle";

  if (m.state === "home") {
    if (steer(sim, m, m.goal.x, m.goal.y, speedOf(m), dt, 1)) {
      if (m.load > 0) {
        sim.camp.pile += m.load;
        note(sim, { verb: "gathered", actor: m.id, object: "firewood", cls: "wood", x: m.from?.x ?? m.x, y: m.from?.y ?? m.y });
        m.load = 0;
      }
      m.state = "idle";                     // home for the night; the task keeps
    }
    return;
  }

  // Called to you (a whistle, or no camp to go back to): with you until
  // morning, when they go back to the task they were set.
  if (m.task === "auto") autoPick(sim, m);
  // No camp to keep: keeping it means keeping its wood, so they gather for the pile.
  let task = m.called || summoned(sim, m) ? "follow" : effTask(m);
  if (task === "camp" && !sim.camp.up) task = "gather";
  switch (task) {
    case "follow": {
      const near = 2.2 + (m.slot % 3) * 0.9;
      const d = dist(m, p);
      if (d > near) {
        const ang = Math.atan2(m.y - p.y, m.x - p.x);
        steer(sim, m, p.x + Math.cos(ang) * near * 0.8, p.y + Math.sin(ang) * near * 0.8, d > 10 ? speedOf(m) * 1.6 : speedOf(m), dt, 0.3);
      }
      // hands nearby help with the player's work
      if (sim.work && d < 7) helpWork(sim, m, hours);
      break;
    }
    case "chop": {
      // a bounded task: THIS deadfall. When it is through, they go back to camp.
      if (m.chopId == null) m.chopId = currentDeadfall(sim);
      const i = m.chopId;
      if (i < 0 || sim.deadfalls[i].done >= 1) { taskDone(m, "camp"); m.chopId = null; m.state = "idle"; break; }
      const df = sim.world.deadfalls[i];
      const spot = { x: df.x + ((m.slot % 3) - 1) * 1.6, y: df.y - 2.2 };
      if (!reachable(sim, m, spot)) { m.called = true; break; }
      if (steer(sim, m, spot.x, spot.y, speedOf(m), dt, 0.8)) {
        m.state = "work";
        chopAt(sim, i, m, hours);
      }
      break;
    }
    case "gather": {
      const dest = woodDest(sim);
      if (m.state !== "gather" && m.state !== "carry" && m.state !== "haul") {
        // a new trip: most of the time, the old pile comes to the new camp first
        const old = dest && (m.load || 0) === 0 ? sim.piles.find((pl) => pl !== dest && pl.n > 0 && reachable(sim, m, pl)) : null;
        m.trips = (m.trips || 0) + 1;
        if (old && stream(hash("haul", sim.seed, m.id, m.trips))() < HAUL_CHANCE) { m.state = "haul"; m.haul = old; }
        else { m.state = "gather"; m.site = woodSite(sim, m); }
        m.stateT = 0;
      }
      if (m.state === "haul") {
        const pl = sim.piles.find((x) => x.x === m.haul?.x && x.y === m.haul?.y);
        if (!pl || pl.n <= 0) { m.state = "next"; break; }
        if (steer(sim, m, pl.x, pl.y, speedOf(m), dt, 1.5)) {
          const take = Math.min(memberCarry(m) - (m.load || 0), pl.n);
          pl.n -= take; m.load = (m.load || 0) + take; m.from = { x: pl.x, y: pl.y };
          sim.piles = sim.piles.filter((x) => x.n > 0 || x === woodDest(sim));
          m.state = "carry";
        }
        break;
      }
      const site = m.site;
      if (!site) { taskDone(m, "camp"); break; }
      if (m.state === "gather") {
        if (steer(sim, m, site.x, site.y, speedOf(m), dt, site.r * 0.6)) {
          // chopping deadwood, at the world's pace; one chop, then home with it
          m.gathering = (m.gathering || 0) + hours;
          m.workT = sim.time;
          if (m.gathering >= WOOD_CHOP_HOURS) {
            m.gathering = 0;
            m.chops = (m.chops || 0) + 1;
            m.load = Math.min(memberCarry(m), (m.load || 0) + woodPerChop(m, sim.seed, m.chops));
            m.from = { x: site.x, y: site.y };
            practice(sim, m, "carry");
            // nowhere to take it yet: keep cutting until their arms are full
            if (dest || m.load >= memberCarry(m)) m.state = "carry";
          }
        }
      } else {
        // Wood goes to the pile. No camp yet: to where it is being made, or
        // to you, and it waits in their arms until there is a pile.
        // The team's wood is one store: at the camp, or with you (and the kit) when there is none.
        // to the camp's pile, or the marked site; with neither, they wait by you holding it
        const to = dest || sim.player;
        if (steer(sim, m, to.x, to.y, speedOf(m), dt, 3) && dest) {
          addWood(sim, dest, m.load);
          note(sim, { verb: "gathered", actor: m.id, object: "firewood", cls: "wood", x: m.from.x, y: m.from.y });
          m.load = 0;
          m.state = "next";
        }
      }
      break;
    }
    case "pitch": {
      // Making camp where the plan said. Everyone on it carries some of the
      // kit; more hands, sooner up.
      const P = sim.pitch;
      if (!P || sim.camp.up) { taskDone(m, sim.camp.up ? "camp" : "follow"); break; }
      const spot = { x: P.x + Math.cos(m.slot * 1.3) * 2.5, y: P.y + Math.sin(m.slot * 1.3) * 2.5 };
      if (steer(sim, m, spot.x, spot.y, speedOf(m), dt, 0.8)) {
        m.workT = sim.time;
        P.left -= hours * buildRate(m, sim);
        if (!P.hands.includes(m.id)) P.hands.push(m.id);
        if (P.left <= 0) pitchDone(sim);
      }
      break;
    }
    case "camp":
    default: {
      // Keeping camp: stay at it, bring in deadwood from round about, keep
      // the fire fed if it is lit.
      if (!sim.camp.up) { m.called = true; break; }
      const spot = { x: sim.camp.x + Math.cos(m.slot * 1.3) * 3.5, y: sim.camp.y + Math.sin(m.slot * 1.3) * 3.5 };
      steer(sim, m, spot.x, spot.y, speedOf(m), dt, 0.6);
      if (sim.work && dist(m, p) < 7) helpWork(sim, m, hours);
      if (sim.camp.pile < 8) {
        m.kept = (m.kept || 0) + hours;
        if (m.kept >= 1.5) {
          m.kept = 0; sim.camp.pile += 1;
          note(sim, { verb: "gathered", actor: m.id, object: "firewood", cls: "wood", x: sim.camp.x, y: sim.camp.y });
        }
      }
      if (sim.camp.lit && sim.camp.fire < 1.5) memberTends(sim, m);
      break;
    }
  }
}

// Skills grow with use, for everyone, with noise. A fake grows faster, and the
// faster step hides inside ordinary growth: suspicious, never certain.
export function practice(sim, m, k) {
  if (m === "you") return;
  const n = stream(hash("grow", sim.seed, m.id, k, Math.floor(sim.time * 4)))();
  m.skills[k] = Math.min(6, m.skills[k] + (m.fake ? 0.12 : 0.06) + (n - 0.5) * 0.04);
}

// ---------------------------------------------------------------------------
// Work: chopping, camp, the player's hands
// ---------------------------------------------------------------------------

// A deadfall takes `work` person-hours unskilled; cut skill makes an hour count
// for more, as a percentage, so it never floors at zero.
export function chopRate(who) {
  return 1 + 0.18 * skill(who, "cut");
}

function chopAt(sim, i, who, hours) {
  const d = sim.deadfalls[i], df = sim.world.deadfalls[i];
  if (d.done >= 1) return;
  d.done = Math.min(1, d.done + (hours * chopRate(who)) / df.work);
  const actor = who === "you" ? "you" : who.id;
  note(sim, { verb: "cut", actor, object: "deadfall", cls: "gate", x: df.x, y: df.y, key: "cut:" + actor + ":" + i });
  if (who !== "you") { who.worked += hours; if (who.worked > 1) { who.worked = 0; practice(sim, who, "cut"); } }
  if (d.done >= 1) {
    sim.fields.clear();
    note(sim, { verb: "cleared", actor, object: "deadfall", cls: "gate", x: df.x, y: df.y, key: "cleared:" + i });
    say(sim, sim.tutorial ? "The log is through." : "The deadfall comes apart. The trail is open north.", "good");
    sim.events.push({ kind: "cleared", id: i });
    if (sim.work?.kind === "chop") sim.work = null;
  }
}

function helpWork(sim, m, hours) {
  const w = sim.work;
  if (!w || m.sanity < 0.3) return;            // the far-gone stand and watch
  if (w.kind === "chop") chopAt(sim, w.id, m, hours);
  else if (w.kind === "make" && sim.pitch) {
    if (dist(m, sim.pitch) > 7) return;
    sim.pitch.left -= hours * buildRate(m, sim);
    sim.pitch.hands.includes(m.id) || sim.pitch.hands.push(m.id);
    m.workT = sim.time;
    if (sim.pitch.left <= 0) pitchDone(sim);
  } else if (w.kind === "strike") {
    w.left -= hours * (1 + 0.15 * m.skills.build);
    (w.helpers ||= []).includes(m.id) || w.helpers.push(m.id);
    m.workT = sim.time;
  }
}

function tickWork(sim, hours, dt) {
  const w = sim.work;
  if (!w) return;
  if (w.kind === "act") {
    // hands on a thing for a few seconds; it must still be there and in reach
    w.t += dt;
    const still = targetFor(sim, w.target.kind, w.target.id, w.tol);
    if (!still) { sim.work = null; return; }
    if (w.t >= w.need) { sim.work = null; act(sim, still, w.tol); }
    return;
  }
  if (w.kind === "chop") {
    const df = sim.world.deadfalls[w.id];
    if (dist(sim.player, df) > 4.5) { sim.work = null; return; }
    chopAt(sim, w.id, "you", hours);
  } else if (w.kind === "make") {
    // your hands on the camp going up; step away and it waits, half made
    const P = sim.pitch;
    if (!P || sim.camp.up || dist(sim.player, P) > 6) { sim.work = null; return; }
    P.left -= hours * buildRate("you", sim);
    P.hands.includes("you") || P.hands.unshift("you");
    if (P.left <= 0) pitchDone(sim);
  } else if (w.kind === "strike") {
    w.left -= hours;
    if (w.left <= 0) finishCampWork(sim, w);
  } else if (w.kind === "ask") {
    w.left -= hours;
    if (w.left <= 0) sim.work = null;
  }
}

function finishCampWork(sim, w) {
  sim.work = null;
  const helpers = (w.helpers || []).slice();
  {
    const left = 0;                                    // the team's wood goes with the team
    note(sim, { verb: "struck", actor: "you", object: "camp", cls: "camp", x: sim.camp.x, y: sim.camp.y, withWhom: helpers });
    // the pile stays where it is; the ten that made the camp come back to you
    if (sim.camp.pile > 0) sim.piles.push({ x: sim.camp.x, y: sim.camp.y, n: sim.camp.pile });
    sim.player.wood = Math.min(CARRY_NO_CAMP, sim.player.wood + CAMP_WOOD);
    sim.site = null;
    sim.camp = { up: false, x: sim.camp.x, y: sim.camp.y, pile: 0, fire: 0, lit: false };
    sim.player.carryingKit = true;
    sim.campStruck = true;                              // from here only you can make camp
    sim.pitch = null;
    // the camp is gone, not the work: those using their judgement think again now
    for (const m of party(sim)) { if (m.task === "pitch") m.task = "auto"; if (m.task === "auto") { m.autoTask = null; m.autoUntil = 0; } }
    say(sim, `Camp is down. The woodpile stays where it was; you carry the kit and the ${CAMP_WOOD} wood it was made of. Mark the next site to make camp again.`, "good");
    sim.events.push({ kind: "struck" });
  }
}

// ---------------------------------------------------------------------------
// Verbs the player uses (called by the UI)
// ---------------------------------------------------------------------------

/**
 * Everything within reach that the action key could act on, each with the
 * point it is AT. `tolerance` widens reach and the facing cone (touch aiming is
 * coarse; Brain: touch tolerance, not an easier game).
 */
export function actionTargets(sim, tolerance = 1) {
  const p = sim.player, W = sim.world, out = [];
  if (sim.over || p.holding) return out;          // both hands full: nothing else until camp
  const R = (r) => r * tolerance;
  const ge = sim.grove?.enc;
  if (ge && Grove.treeUp(sim) && dist(ge, p) < R(REACH + 1.2)) out.push({ kind: "gchop", id: 0, x: ge.x, y: ge.y, h: 2.2, label: "Chop the glowing tree" });
  for (const it of sim.gdrops || [])
    if (!it.taken && dist(it, p) < R(2.6) && (it.shown === "fruit" || it.shown === "branch" || it.shown === "stick"))
      out.push({ kind: "gpick", id: it.id, x: it.x, y: it.y, h: 0.5, label: it.shown === "fruit" ? "Pick it up (both hands)" : it.shown === "branch" ? "Pick up the glowing branch" : "Pick up wood" });
  for (const ms of sim.missing)
    if (Grove.personOut(sim, ms) && dist(ms, p) < R(REACH)) out.push({ kind: "rescue", id: ms.id, x: ms.x, y: ms.y, h: 1.9, label: "Bring " + ms.name + " home" });
  for (let i = 0; i < W.pylons.length; i++)
    if (!sim.pylons[i].spent && dist(W.pylons[i], p) < R(REACH + 0.5)) out.push({ kind: "pylon", id: i, x: W.pylons[i].x, y: W.pylons[i].y, h: 4.4, label: "Light the pylon" });
  for (let i = 0; i < W.deadfalls.length; i++) {
    const df = W.deadfalls[i];
    if (sim.deadfalls[i].done >= 1) continue;
    // the log is long: the point that counts is the bit of it in front of you
    const xs = df.cells.map((c) => c[0] * CELL);
    const x = Math.max(Math.min(...xs), Math.min(Math.max(...xs) + CELL, p.x));
    if (Math.abs(x - p.x) < R(2.5) && Math.abs(df.y - p.y) < R(3.5))
      out.push({ kind: "chop", id: i, x, y: df.y, h: 1.6, label: sim.work?.kind === "chop" ? "Stop chopping" : "Chop" });
  }
  for (let i = 0; i < W.sticks.length; i++)
    if (!sim.sticks[i] && dist(W.sticks[i], p) < R(2.6)) out.push({ kind: "stick", id: i, x: W.sticks[i].x, y: W.sticks[i].y, h: 0.6, label: "Pick up wood" });
  // a failing mind: sticks that are not there, and a dead fire that seems to burn
  for (const ps of Phantom.phantomSticks(sim))
    if (!ps.slither && dist(ps, p) < R(2.6)) out.push({ kind: "stick", id: ps.id, x: ps.x, y: ps.y, h: 0.6, label: "Pick up wood", phantom: true });
  if (sim.camp.up && !sim.keystone.active && dist(sim.camp, p) < R(REACH)) {
    const pile = sim.camp.pile > 0 ? "" : " (no wood in the pile)";
    const seen = Phantom.shownFire(sim);
    out.push({ kind: seen.lit ? "feed" : "light", id: 0, x: sim.camp.x, y: sim.camp.y, h: 1.4, phantom: seen.phantom, label: (seen.lit ? "Feed the fire" : "Light the fire") + pile });
    // a glow stick wakes only in the campfire
    if (p.glows?.length && sim.camp.lit && !Grove.glowing(sim)) out.push({ kind: "snap", id: 0, x: sim.camp.x, y: sim.camp.y + 0.3, h: 1.2, label: "Hold a glowing branch to the fire" });
  }
  // the far side is a place, not a thing: no facing needed
  if (W.farSide && dist(W.farSide, p) < W.farSide.r) out.push({ kind: "home", id: 0, x: p.x, y: p.y, h: 0, label: "Light a pylon home", area: true });
  return out;
}

/**
 * What pressing the action key would do: the thing you are LOOKING at. The
 * nearest-in-front wins, not a fixed order, so a stick at your feet is not
 * lost behind a fire at your back.
 */
export function resolveAction(sim, tolerance = 1) {
  const p = sim.player;
  const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
  const cone = 1.0 * tolerance;              // radians either side of straight ahead
  let best = null, bs = Infinity;
  for (const t of actionTargets(sim, tolerance)) {
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    const ang = d < 0.9 || t.area ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d)));
    if (ang > cone) continue;
    const score = ang * 2 + d * 0.25 + (t.area ? 3 : 0);
    if (score < bs) { bs = score; best = t; }
  }
  return best;
}

/** The target a tap or a press means, if it is still in reach. */
export function targetFor(sim, kind, id, tolerance = 1) {
  return actionTargets(sim, tolerance).find((t) => t.kind === kind && t.id === id) || null;
}

/**
 * The player's hands take time: picking up, lighting, feeding, a pylon, a
 * person found. About three seconds standing still; moving lets go. Chopping
 * is its own long work and starts at once.
 */
export const ACT_SECONDS = 3;
const ACT_TIME = { stick: 0.35, feed: 1.2, light: 3, pylon: 3, home: 3, rescue: 3, gchop: 1.4, gpick: 0.6, snap: 2 };
export const ACT_VERB = { stick: "Picking up wood", light: "Lighting the fire", feed: "Feeding the fire", pylon: "Lighting the pylon", home: "Lighting a pylon home", rescue: "Helping them up", gchop: "Chopping", gpick: "Picking it up", snap: "Holding it to the fire" };
export function begin(sim, target = null, tolerance = 1) {
  if (sim.work?.kind === "act") return null;            // already at it
  const t = target || resolveAction(sim, tolerance);
  if (!t) return null;
  if (t.kind === "chop") return act(sim, t, tolerance);
  sim.work = { kind: "act", target: { kind: t.kind, id: t.id }, label: ACT_VERB[t.kind] || t.label, t: 0, need: ACT_TIME[t.kind] ?? ACT_SECONDS, tol: tolerance };
  return { kind: "begin", of: t.kind };
}

export function act(sim, target = null, tolerance = 1) {
  const a = target || resolveAction(sim, tolerance);
  if (!a) return null;
  const p = sim.player, W = sim.world;
  switch (a.kind) {
    case "stick":
      if (Phantom.shownWood(sim) >= carryMax(sim)) { say(sim, "Your arms are full."); break; }
      if (a.phantom) { Phantom.pickPhantom(sim, a.id); sim.events.push({ kind: "stick" }); break; }
      sim.sticks[a.id] = true;
      p.wood += 1;
      note(sim, { verb: "picked", actor: "you", object: "firewood", cls: "wood", x: W.sticks[a.id].x, y: W.sticks[a.id].y });
      sim.events.push({ kind: "stick" });
      break;
    case "chop":
      sim.work = sim.work?.kind === "chop" ? null : { kind: "chop", id: a.id };
      break;
    case "light":
    case "feed": if (a.phantom) Phantom.feedPhantom(sim); else tendFire(sim); break;
    case "pylon": return lightPylon(sim, a.id);
    case "home": return lightHome(sim);
    case "rescue": return rescue(sim, a.id);
    case "gchop": Grove.chop(sim); break;
    case "gpick": Grove.pick(sim, a.id); break;
    case "snap": Grove.snap(sim); break;
  }
  return a;
}

/** Someone at camp lights the fire or feeds it, a stick at a time, if there is wood. */
/**
 * Firecraft: how long a stick burns in their hands. Anyone can keep a fire;
 * someone who knows how makes the woodpile last (+20% a level).
 */
export const burnHours = (who) => 1.5 * (1 + 0.2 * (who && who !== "you" ? who.skills.fire : 0));

function memberTends(sim, m) {
  if (!sim.camp.up || sim.camp.pile <= 0) return;
  if (m.tendAt != null && sim.time - m.tendAt < 0.25) return;   // one stick a quarter hour
  m.tendAt = sim.time;
  sim.camp.pile -= 1;
  if (!sim.camp.lit) {
    sim.camp.lit = true; sim.camp.fire = 2 * burnHours(m);
    note(sim, { verb: "lit", actor: m.id, object: "fire", cls: "fire", x: sim.camp.x, y: sim.camp.y });
    sim.events.push({ kind: "lit", by: m.id });
  } else sim.camp.fire = Math.min(12, sim.camp.fire + burnHours(m));
  practice(sim, m, "fire");
}

/** The keystone morning: one comes back in out of the trees every little while. */
function keystoneStep(sim) {
  const k = sim.keystone;
  if (!k.active || sim.time < k.nextAt) return;
  const m = byId(sim, k.order.shift());
  if (m) {
    const r = stream(hash("return", sim.seed, m.id));
    let x = sim.player.x, y = sim.player.y;
    for (let i = 0; i < 20; i++) {                    // out of the trees, a way off
      const a = r() * Math.PI * 2, d = 14 + r() * 8;
      const cx = sim.player.x + Math.cos(a) * d, cy = sim.player.y + Math.sin(a) * d;
      if (canStand(sim, cx, cy) && reachable(sim, sim.player, { x: cx, y: cy })) { x = cx; y = cy; break; }
    }
    m.away = false; m.x = x; m.y = y; m.called = true; m.state = "idle";
    say(sim, `${m.name} comes in out of the trees.`, "talk");
    sim.events.push({ kind: "returned", id: m.id });
  }
  k.nextAt = sim.time + 0.3 + stream(hash("gap", sim.seed, k.order.length))() * 0.3;
  if (!k.order.length) {
    k.active = false; k.done = true;
    sim.plan.pending = null;                  // now the fire can be lit
    say(sim, "That is everyone.", "info");
  }
}

/** Light the fire, or feed it, from the camp's woodpile. */
export function tendFire(sim) {
  if (!sim.camp.up) return false;
  if (sim.camp.pile <= 0) { say(sim, "The woodpile is empty."); return false; }
  sim.camp.pile -= 1;
  if (!sim.camp.lit) {
    sim.camp.lit = true; sim.camp.fire = 3;
    note(sim, { verb: "lit", actor: "you", object: "fire", cls: "fire", x: sim.camp.x, y: sim.camp.y });
    sim.events.push({ kind: "lit" });
  } else sim.camp.fire = Math.min(12, sim.camp.fire + 1.5);
  return true;
}

// Carried wood goes to the pile the moment you walk into camp.
function dropWood(sim) {
  // at the camp, or at the site you marked for one
  const at = sim.camp.up ? (!sim.player.carryingKit && dist(sim.player, sim.camp) < CAMP_R * 0.6) : sim.site && dist(sim.player, sim.site) < 4;
  if (at && (sim.player.wood > 0 || sim.phantom.extra > 0)) {
    sim.camp.pile += sim.player.wood;
    say(sim, `You drop ${Phantom.shownWood(sim)} wood on the pile.`);   // what you believed you had
    sim.player.wood = 0;
    sim.phantom.extra = 0;
    sim.events.push({ kind: "dropped" });
  }
}

// A camp needs room: open ground all round.
function roomAt(sim, x, y) {
  if (!canStand(sim, x, y)) return false;
  for (let a = 0; a < 8; a++) if (!canStand(sim, x + Math.cos(a * 0.785) * 2, y + Math.sin(a * 0.785) * 2)) return false;
  return true;
}
/** Where you would make camp: a few steps ahead, where you can watch it go up; else at your feet. */
export function campSpot(sim) {
  const p = sim.player;
  const ahead = { x: p.x + Math.sin(p.yaw) * 4, y: p.y + Math.cos(p.yaw) * 4 };
  if (roomAt(sim, ahead.x, ahead.y)) return ahead;
  return roomAt(sim, p.x, p.y) ? { x: p.x, y: p.y } : null;
}
/** Where gathered wood goes: the camp's pile, or the site you marked for one. */
// With neither, the pile the last camp left: the wood is still there to add to.
export const woodDest = (sim) => (sim.camp.up ? sim.camp : sim.site || sim.piles[sim.piles.length - 1] || null);
function addWood(sim, dest, n) {
  if (dest === sim.camp || dest === sim.site) sim.camp.pile += n;
  else dest.n += n;
}
/** Mark where the camp goes. Wood brought here waits for it. A site moved leaves its wood behind. */
export function canMarkSite(sim) { return !sim.camp.up && !sim.pitch && !sim.work && !!campSpot(sim); }
export function markSite(sim) {
  if (!canMarkSite(sim)) return false;
  if (sim.site && sim.camp.pile > 0) sim.piles.push({ x: sim.site.x, y: sim.site.y, n: sim.camp.pile });
  const at = campSpot(sim);
  sim.site = { x: at.x, y: at.y, place: placeName(sim.world, at.x, at.y) };
  sim.camp.x = at.x; sim.camp.y = at.y; sim.camp.pile = 0;
  say(sim, `The camp goes here, by the ${sim.site.place}. Wood brought here waits for it.`, "good");
  return true;
}
export function canMakeCamp(sim) {
  if (sim.camp.up || sim.work) return false;
  if (sim.pitch && dist(sim.player, sim.pitch) < 6) return true;      // carry on with this one (paid)
  return !!sim.site && dist(sim.player, sim.site) < 6 && sim.camp.pile >= CAMP_WOOD;
}
export function makeCamp(sim) {
  if (!canMakeCamp(sim)) return false;
  const fresh = !sim.pitch || dist(sim.player, sim.pitch) >= 6;
  if (fresh) {
    // you are making it here: whoever was making it elsewhere stops
    if (sim.pitch) for (const m of party(sim)) if (m.task === "pitch") m.task = "follow";
    const at = sim.site;
    sim.camp.pile -= CAMP_WOOD;                       // ten from the site's pile go into it
    sim.pitch = { x: at.x, y: at.y, left: PITCH_HOURS, place: placeName(sim.world, at.x, at.y), hands: [] };
  }
  sim.player.carryingKit = false;
  // a new camp is marked out first: five seconds where you stand, then it is the builders' work
  // (stand at it and use the camp menu again to lend your own hands)
  sim.work = fresh ? { kind: "markout", t: 0, need: 5 } : { kind: "make" };
  return true;
}
export function canStrikeCamp(sim) {
  return sim.camp.up && !sim.work && dist(sim.player, sim.camp) < CAMP_R;
}
export function strikeCamp(sim) {
  if (!canStrikeCamp(sim)) return false;
  sim.camp.lit = false; sim.camp.fire = 0;
  sim.work = { kind: "strike", left: STRIKE_HOURS, helpers: [] };
  return true;
}

/**
 * Busy: on a shift. Cutting at the deadfall, out for wood or carrying a load
 * home. A whistle does not pull anyone off work they were set at dawn.
 */
/** After dusk, with a camp up, everyone not with you holds to the fire. */
export function atFireTonight(sim, m) {
  const hr = hourOf(sim.time);
  // a field shift ends early so they are home by dark; once home, they stay
  const t = effTask(m);
  const from = t === "chop" || t === "gather" ? DUSK - 1.5 : DUSK - 0.25;
  return (hr >= from || hr < DAWN) && sim.camp.up && t !== "follow" && !m.called && !summoned(sim, m) && t !== "pitch";
}

/**
 * The moment a whistle is made in: the hour and minute, how far the whistler
 * is from you and from camp, how long this walk has gone on, how many
 * whistles so far. voice.js turns it into this one whistle's phrasing.
 * Never the hidden meter: a whistle must not give a mind away.
 */
export function whistleCtx(sim, m) {
  const who = m || sim.player;
  const h = hourOf(sim.time);
  return {
    hour: Math.floor(h), minute: Math.floor((h % 1) * 60),
    dist: m ? Math.round(dist(m, sim.player)) : 0,
    campDist: sim.camp.up ? Math.round(dist(who, sim.camp)) : -1,
    played: Math.floor((sim.time - (sim.startTime ?? DAWN + 1)) * 60),
    n: sim.stats.whistles || 0,
    slot: m ? m.slot : "you",
  };
}

export function busy(sim, m) {
  if (m.called || summoned(sim, m)) return false;
  const t = effTask(m);
  if (t === "gather") return true;
  if (t === "chop") return m.chopId == null || sim.deadfalls[m.chopId]?.done < 1;
  return m.state === "home" && m.load > 0;
}

/** Called over: with you until their half hour is up. */
export const summoned = (sim, m) => m.summonUntil != null && sim.time < m.summonUntil;
export const SUMMON_HOURS = 0.5;                 // half an hour of the world's clock
export const WHISTLE_WINDOW = 3;                 // seconds in which a second whistle summons

/**
 * Whistle. EVERYONE in earshot whistles back, whatever they are doing: the
 * further off, the longer before they answer, and the far-gone may not (it
 * sounds the same either way). That is all one whistle does. Whistle again
 * within three seconds and the nearest of them stops what they are doing and
 * comes to you for half an hour, then goes back to their work. Draws nothing
 * from the run.
 */
export function whistle(sim, power = 1) {
  const second = (sim.whistleWindow || 0) > 0;
  const inRange = party(sim).filter((m) => dist(m, sim.player) <= HEAR * power).sort((a, b) => dist(a, sim.player) - dist(b, sim.player));
  for (const m of inRange) {
    if (m.answerAt != null || m.sanity < 0.25 || m.sleeping) continue;
    const jitter = stream(hash("whistle", sim.seed, m.id, Math.floor(sim.time * 60)))();
    m.answerAt = sim.time + 0.04 + dist(m, sim.player) * 0.005 + jitter * 0.03;    // ~1-4 s
  }
  // the night carries: whoever is out there whistles back from the dark, to 70 m
  if (inSmallHours(sim.time) || Grove.treeUp(sim)) for (const ms of sim.missing) {
    if (ms.answerAt != null || !(Grove.personOut(sim, ms) || (sim.grove.enc?.msId === ms.id && Grove.treeUp(sim) && !sim.grove.enc.silent))) continue;
    if (dist(ms, sim.player) > 70 * power) continue;
    ms.answerAt = sim.time + 0.008 + dist(ms, sim.player) * 0.0001;
  }
  let summonedId = null;
  // after dark nobody leaves the fire for a whistle: they answer, and stay
  if (second && inRange.length && isNight(sim.time)) say(sim, "They whistle back, but after dark nobody leaves the fire.", "talk");
  else if (second && inRange.length) {
    const m = inRange.find((x) => x.sanity >= 0.25) || inRange[0];
    m.summonUntil = sim.time + SUMMON_HOURS;
    m.state = "idle"; m.site = null; m.chopId = null;
    summonedId = m.id;
    say(sim, `${m.name} stops what they are doing and comes.`, "talk");
    sim.events.push({ kind: "summoned", id: m.id });
  }
  sim.whistleWindow = second ? 0 : WHISTLE_WINDOW;
  sim.stats.whistles = (sim.stats.whistles || 0) + 1;
  sim.events.push({ kind: "whistle", power, ctx: whistleCtx(sim, null) });
  return summonedId;
}
// The two-hands rule. The nearest companion is the second pair. A fake cannot
// be: it is gone the moment the pylon catches. The pylon is spent either way.
export function lightPylon(sim, i) {
  const W = sim.world;
  const py = W.pylons[i];
  // the second pair of hands: whoever is beside you
  const near = party(sim).filter((m) => dist(m, sim.player) < 5).sort((a, b) => dist(a, sim.player) - dist(b, sim.player));
  if (!near.length) { say(sim, "It takes two. Nobody is close enough to take the other side."); return { kind: "pylon", fail: "alone" }; }
  const m = near[0];
  sim.pylons[i].spent = true;
  sim.stats.tested++;
  note(sim, { verb: "pylon", actor: "you", object: "pylon", cls: "pylon", x: py.x, y: py.y, withWhom: [m.id] });
  if (m.fake) {
    m.gone = true;
    sim.pylons[i].litAt = null;
    say(sim, "The pylon takes. " + m.name + " is not there when the light settles.", "bad");
    sim.events.push({ kind: "unmade", id: m.id });
  } else {
    sim.pylons[i].litAt = sim.time;
    say(sim, "The pylon takes, blue and steady. " + m.name + " lets go of the other side.", "good");
    sim.events.push({ kind: "pylonLit", id: i, by: m.id });
  }
  return { kind: "pylon", by: m.id };
}

// Depth pressure for an area: a pylon lit there in the last 36 hours cancels it.
export const PYLON_HOURS = 36;
export function shielded(sim, area) {
  return sim.world.pylons.some((p, i) => p.area === area && sim.pylons[i].litAt != null && sim.time - sim.pylons[i].litAt < PYLON_HOURS);
}

// The far side. Pylons home number the real people with you, plus one. Each
// attempt spends one. A fake cannot be the second pair of hands.
export function homeCount(sim) {
  if (sim.home.count == null) sim.home.count = real(sim).length + 1;
  return sim.home.count;
}
export function lightHome(sim) {
  const total = homeCount(sim);
  if (sim.home.lit >= total) { say(sim, "Every pylon here is dark."); return null; }
  const fs = sim.world.farSide;
  const near = party(sim).filter((m) => dist(m, sim.player) < 5).sort((a, b) => dist(a, sim.player) - dist(b, sim.player));
  if (!near.length) { say(sim, "It takes two."); return { kind: "home", fail: "alone" }; }
  const m = near[0];
  sim.home.lit++;
  if (m.fake) {
    m.gone = true;
    sim.home.wasted++;
    say(sim, "The pylon catches and goes out. " + m.name + " is not there.", "bad");
    sim.events.push({ kind: "unmade", id: m.id });
  } else {
    m.home = true;
    sim.home.sent.push(m.id);
    say(sim, m.name + " goes home.", "good");
    sim.events.push({ kind: "sentHome", id: m.id });
  }
  if (sim.home.lit >= total) say(sim, "That was the last pylon here. Press {camp} to walk out.");
  note(sim, { verb: "pylon", actor: "you", object: "pylon", cls: "pylon", x: fs.x, y: fs.y, withWhom: [m.id] });
  return { kind: "home", by: m.id };
}

/** Walk out alone. The run ends. */
export function walkOut(sim) {
  const people = sim.members.filter((m) => !m.trainee);
  sim.over = {
    home: people.filter((m) => m.home).map((m) => ({ name: m.name, fake: m.fake })),
    left: people.filter((m) => !m.home && !m.gone).map((m) => ({ name: m.name, fake: m.fake })),
    unmade: people.filter((m) => m.gone).map((m) => ({ name: m.name, fake: m.fake })),
    lost: sim.missing.filter((ms) => !ms.found).map((ms) => ({ name: ms.name })),
    days: today(sim),
  };
  sim.events.push({ kind: "over" });
  return sim.over;
}

// Someone found in the woods follows you. At camp they stand beside the one
// who took their slot, under the same name. One of the two is real.
function rescue(sim, id) {
  const ms = sim.missing.find((x) => x.id === id);
  ms.found = true;
  // what the tree took, they come home without: one arm, half their skill; both, none
  const k = (ms.arms ?? 2) >= 2 ? 1 : ms.arms === 1 ? 0.5 : 0;
  const sk = Object.fromEntries(Object.entries(fillSkills(ms.skills)).map(([n, v]) => [n, Math.floor(v * k)]));
  const m = newMember(sim, ms.name, ms.slot, sk, false, ms.x, ms.y);
  m.arms = ms.arms ?? 2;
  m.id = ms.id; sim.nextId = Math.max(sim.nextId, ms.id + 1);
  m.voice = ms.voice;                          // their own whistle, unbent
  m.sanity = Math.max(0.2, ms.sanity);
  m.task = "follow";
  // the original record entry is re-used: same id, the real one
  const i = sim.members.findIndex((x) => x.id === id);
  if (i >= 0) sim.members[i] = m; else sim.members.push(m);
  sim.stats.rescued++;
  note(sim, { verb: "found", actor: "you", object: null, x: ms.x, y: ms.y, withWhom: [m.id], key: "found:" + id });
  say(sim, ms.name + (m.arms < 2 ? (m.arms ? " is here, cold, one arm gone at the shoulder, and comes with you." : " is here, cold, both arms gone, and comes with you.") : " is here, cold, and comes with you."), "good");
  sim.events.push({ kind: "rescued", id });
  return { kind: "rescue", id };
}

/** Let `hours` go by: the world keeps moving while you stand. */
export function pass(sim, hours) {
  const keep = sim.work;
  sim.work = { kind: "ask", left: hours };
  for (let i = 0; i < 2000 && sim.work && sim.work.kind === "ask"; i++) tick(sim, 0.1, {});
  sim.work = keep && keep.kind !== "ask" ? keep : null;
}

/** Ask someone about a day. Half an hour of daylight, every time. */
export const ASK_HOURS = 0.5;
export function askMember(sim, id, day) {
  const m = byId(sim, id);
  if (!m || m.gone || m.home || !sim.chron[day]) return false;
  sim.stats.asked++;
  pass(sim, ASK_HOURS);
  return true;
}

// ---------------------------------------------------------------------------
// Plans: dawn sets the day, dusk sets the night
// ---------------------------------------------------------------------------

/** Where the team would make camp: the nearest clearing you can walk to. */
export function pitchSite(sim, from = sim.player) {
  let best = null, bd = Infinity;
  for (const c of sim.world.clearings) {
    if (!reachable(sim, from, c)) continue;
    const d = dist(c, from);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Using their judgement
// ---------------------------------------------------------------------------

/** What a person on "auto" is doing right now. */
export const effTask = (m) => (m.task === "auto" ? m.autoTask || "camp" : m.task);

/** A task ran out: back to camp, or for someone on auto, a fresh look. */
function taskDone(m, next) {
  if (m.task === "auto") { m.autoTask = null; m.autoUntil = 0; } else m.task = next;
}

/**
 * Each hour, someone using their judgement scores what the team needs and
 * takes the most needed thing they are good for (Brain: utility scoring,
 * keep what an input MEANS apart from how much it matters). They spread out:
 * the more already on a thing, the less it calls. Mid-load, they finish.
 */
export function autoScores(sim, m) {
  const others = (t) => party(sim).filter((o) => o !== m && !o.called && effTask(o) === t).length;
  const s = {};
  // before there is a camp, its wood is the first thing anyone needs
  // a camp you started and left half made: the good builders carry on with it
  if (sim.pitch && !sim.camp.up && m.skills.build >= 2) s.pitch = 9 + m.skills.build - others("pitch") * 2;
  s.gather = (sim.camp.up
    ? Math.max(0, 7 - sim.camp.pile) + m.skills.carry * 0.5 - others("gather") * 1.5
    : Math.max(1, CAMP_WOOD + 2 - sim.camp.pile) * 1.5 + m.skills.carry * 0.5 - others("gather") * 0.4)
    + (woodDest(sim) && sim.piles.some((pl) => pl !== woodDest(sim) && pl.n > 0) ? 3 : 0);       // an old pile to bring over
  const i = currentDeadfall(sim);
  if (i >= 0 && reachable(sim, m, sim.world.deadfalls[i])) s.chop = 4 + m.skills.cut * 0.8 - others("chop") * 0.5;
  if (sim.camp.up) s.camp = 1.5 + m.skills.fire * 0.5 + (hourOf(sim.time) >= DUSK - 3 ? 3 : 0) - others("camp") * 2;
  return s;
}
function autoPick(sim, m) {
  if (m.autoTask && sim.time < (m.autoUntil || 0)) return;
  if (m.load > 0 || m.state === "carry" || m.state === "home") return;     // finish the load first
  const s = autoScores(sim, m);
  let best = "camp", bs = -Infinity;
  for (const [t, v] of Object.entries(s)) if (v > bs) { bs = v; best = t; }
  if (best !== m.autoTask) { m.state = "idle"; m.site = null; m.chopId = null; }
  m.autoTask = best;
  m.autoUntil = sim.time + 1;
  // nobody has the camp in hand yet: they take the kit to the nearest clearing
}

function pitchDone(sim) {
  const P = sim.pitch;
  sim.pitch = null;
  const carried = party(sim).filter((m) => m.task === "pitch" || m.task === "gather").reduce((s, m) => s + (m.state === "carry" && dist(m, P) < 6 ? m.load : 0), 0);
  for (const m of party(sim)) if (m.state === "carry" && dist(m, P) < 6) { m.load = 0; m.state = "gather"; }
  // what you carry goes on the new pile if you are there
  const yours = dist(sim.player, P) < 8 ? sim.player.wood : 0;
  sim.player.wood -= yours;
  if (sim.work?.kind === "make") sim.work = null;
  sim.camp = { up: true, x: P.x, y: P.y, pile: sim.camp.pile + carried + yours, fire: 0, lit: false };
  sim.site = null;
  sim.player.carryingKit = false;
  for (const id of P.hands) { const h = byId(sim, id); if (h) practice(sim, h, "build"); }
  const [first, ...rest] = P.hands;
  note(sim, { verb: "pitched", actor: first, object: "camp", cls: "camp", x: P.x, y: P.y, withWhom: rest });
  for (const m of party(sim)) if (m.task === "pitch") { m.task = "camp"; m.state = "idle"; }
  say(sim, `Camp is up by the ${P.place}.`, "good");
  sim.events.push({ kind: "pitched" });
}

/** Everyone on the team, including anyone still out on the keystone morning. */
/** Two at the fire under one name: by morning only one of them can stay. */
export function twins(sim) {
  const by = {};
  for (const m of party(sim)) (by[m.name] ||= []).push(m);
  return Object.values(by).filter((g) => g.length > 1);
}
/** The choice. The one not kept walks into the trees and is gone. Nobody says which was which. */
export function chooseTwin(sim, keepId, goId) {
  const go = byId(sim, goId), keep = byId(sim, keepId);
  if (!go || !keep) return;
  go.gone = true; go.sentAway = true;
  note(sim, { verb: "sent", actor: "you", object: null, x: sim.player.x, y: sim.player.y, withWhom: [keepId] });
  say(sim, `${go.name} walks into the trees and does not look back. ${keep.name} stays.`, "warn");
  sim.events.push({ kind: "chosen" });
  sim.plan.pending = twins(sim).length ? "choose" : null;
}

export const roster = (sim) => sim.members.filter((m) => !m.gone && !m.home);

export function setDawnPlan(sim, tasks) {
  const allowed = tasksNow(sim);
  for (const m of roster(sim)) {
    const t = allowed.includes(tasks[m.id]) ? tasks[m.id] : "follow";
    m.task = t; m.state = "idle"; m.site = null; m.stateT = 0; m.chopId = null; m.called = false;
    note(sim, { verb: "assigned", actor: m.id, object: TASK_LABEL[t], cls: "task", x: sim.camp.x, y: sim.camp.y, key: "assigned:" + m.id });
  }
  sim.plan.pending = null;
  sim.plan.dawnDay = today(sim);
  sim.events.push({ kind: "planned" });
}

export function setDuskPlan(sim, watch) {
  for (const m of party(sim)) {
    m.watch = !!watch[m.id];
    if (m.watch) note(sim, { verb: "watched", actor: m.id, object: "fire", cls: "fire", x: sim.camp.x, y: sim.camp.y });
  }
  sim.plan.pending = null;
  sim.plan.duskDone = today(sim);
}

// ---------------------------------------------------------------------------
// tick
// ---------------------------------------------------------------------------

/**
 * input: {fwd, side, sprint, yaw, pitch} — movement relative to facing, in
 * [-1,1]. Returns the hours that passed.
 */
export function tick(sim, dt, input = {}) {
  if (sim.over || sim.plan.pending || sim.asleep) return 0;
  dt = Math.min(dt, 0.1);
  const p = sim.player;
  if (input.yaw != null) p.yaw = input.yaw;
  if (input.pitch != null) p.pitch = input.pitch;

  // movement
  // picking up wood holds you still until it is in your hands
  const pickingUp = (sim.work?.kind === "act" && (sim.work.target?.kind === "stick" || sim.work.target?.kind === "gpick")) || sim.work?.kind === "markout";
  if (sim.work?.kind === "markout") {
    sim.work.t += dt;                              // real seconds
    if (sim.work.t >= sim.work.need) {
      sim.work = null;
      say(sim, "The camp is marked out. The builders will put it up; stand at it and use the camp menu to lend a hand.", "good");
    }
  }
  const fwd = pickingUp ? 0 : input.fwd || 0, side = pickingUp ? 0 : input.side || 0;
  const moving = Math.abs(fwd) + Math.abs(side) > 0.05;
  if (moving) {
    if (sim.work && sim.work.kind !== "ask") {
      if (sim.work.kind === "make" || sim.work.kind === "strike") say(sim, "You leave the camp work half done.");
      sim.work = null;
    }
    const sp = (input.sprint ? 6 : 3.6) * (p.carryingKit ? 0.8 : 1);
    // facing yaw: 0 = north (+y). Forward = (sin yaw, cos yaw)
    const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), ry = -Math.sin(p.yaw);
    let vx = (fx * fwd + rx * side), vy = (fy * fwd + ry * side);
    const n = Math.hypot(vx, vy);
    if (n > 1) { vx /= n; vy /= n; }
    const nx = p.x + vx * sp * dt, ny = p.y + vy * sp * dt;
    if (canStand(sim, nx, p.y)) p.x = nx;
    if (canStand(sim, p.x, ny)) p.y = ny;
  }

  // Chopping runs the clock fast (a deadfall is a day's work). Everything else
  // takes its hours at the pace of the world: an hour to make camp is an hour.
  // Work that spends the day runs the day fast: chopping, asking, making or taking down camp.
  // After dark the clock keeps its own pace.
  const fast = sim.work && ["chop", "ask", "make", "strike"].includes(sim.work.kind);
  const speed = fast && (sim.work.kind === "ask" || !isNight(sim.time)) ? WORK_SPEED : 1;
  let hours = (dt * speed) / secPerHour(sim.time);
  const before = sim.time;
  sim.time += hours;
  // 22:00: one by one, everyone at camp not on watch turns in, 5 to 45 minutes after
  // ten (side hash per person and night). Asleep is asleep until morning.
  const hb = hourOf(before);
  if (!sim.tutorial && hb >= DUSK && hb < EVENING_END && hourOf(sim.time) >= EVENING_END && !sim.campEvent) {
    for (const m of party(sim)) {
      if (m.watch || m.sleeping || !atCamp(sim, m)) continue;
      m.bedAt = before - hb + EVENING_END + (5 + stream(hash("bed", sim.seed, m.id, today(sim)))() * 40) / 60;
    }
    say(sim, "It is ten. One by one, they turn in.", "info");
  }
  for (const m of party(sim)) if (m.bedAt != null && sim.time >= m.bedAt) { m.bedAt = null; m.sleeping = true; m.state = "idle"; }
  // by eleven you are asleep too: at camp, once the watch is said; anywhere else, where you stand
  if (!sim.tutorial && hb >= EVENING_END && hb < 23 && hourOf(sim.time) >= 23) {
    sim.time = before - hb + 23; hours = sim.time - before;
    sim.work = null;
    if (sim.camp.up && atCamp(sim, p) && sim.plan.duskDone !== today(sim)) sim.plan.pending = "dusk";
    else sim.wantSleep = true;
  }
  // awake at six: dawn comes on its own
  if (!sim.tutorial && hb >= WAKE && hb < DAWN && hourOf(sim.time) >= DAWN) {
    sim.time = before - hb + DAWN; hours = sim.time - before;
    sim.wantDawn = true;
  }

  if (sim.whistleWindow > 0) sim.whistleWindow = Math.max(0, sim.whistleWindow - dt);   // real seconds
  keystoneStep(sim);
  Mirage.tickMirage(sim, dt, input);
  tickWork(sim, hours, dt);
  dropWood(sim);
  Grove.setDown(sim);
  Grove.tidy(sim);
  for (const m of party(sim)) { if (m.sleeping && !m.watch) continue; tickMember(sim, m, dt * speed, hours); }
  refuse(sim);
  // those out there whistle back, distressed once the tree is being cut; silent once the fruit is down
  for (const ms of sim.missing) {
    if (ms.answerAt == null || sim.time < ms.answerAt) continue;
    ms.answerAt = null;
    const e = sim.grove?.enc, tree = e && e.msId === ms.id && Grove.treeUp(sim);
    if (ms.lost || (tree && e.silent)) continue;
    if (!tree && !Grove.personOut(sim, ms)) continue;
    sim.events.push({ kind: "answer", id: ms.id, x: ms.x, y: ms.y, voice: ms.voice, distress: !!(tree && e.drops > 0), ctx: whistleCtx(sim, { ...ms, slot: ms.slot }) });
  }
  Grove.tickFruit(sim, hours, 1 + areaAt(sim, p.y) * 0.6);
  // a whistle from the dark on a quiet night: nobody is out there
  const fw = sim.falseWhistle;
  if (fw && sim.time >= fw.at) { sim.falseWhistle = null; sim.events.push({ kind: "answer", x: fw.x, y: fw.y, voice: fw.voice, ctx: whistleCtx(sim, { x: fw.x, y: fw.y, slot: fw.slot }) }); }

  // the fire burns whenever it is lit
  if (sim.camp.lit) {
    sim.camp.fire -= hours * burnRate(sim);
    if (sim.camp.fire <= 0) { sim.camp.fire = 0; sim.camp.lit = false; sim.events.push({ kind: "fireOut" }); Phantom.onFireOut(sim); }
  }
  Phantom.tickPhantom(sim, hours);

  drain(sim, hours);


  // dusk: at camp, the night needs a plan
  if (!sim.tutorial && hourOf(sim.time) >= DUSK - 1.5 && hourOf(before) < DUSK - 1.5) say(sim, "The light is going.", "warn");
  if (!sim.tutorial && hourOf(sim.time) >= DUSK && hourOf(before) < DUSK) {
    say(sim, "It is dark.", "warn");
    sim.events.push({ kind: "dusk" });
  }
  return hours;
}

// Nobody but you goes near where the lost one is. They stop at the edge; the
// real ones turn their backs to it, and something wearing a name faces in.
function refuse(sim) {
  const spots = Grove.spots(sim);
  for (const m of party(sim)) {
    m.edge = null;
    for (const s of spots) {
      const d = dist(m, s);
      if (d >= Grove.ZONE_R + 0.5) continue;
      const k = (Grove.ZONE_R + 0.5) / Math.max(0.01, d);
      const nx = s.x + (m.x - s.x) * k, ny = s.y + (m.y - s.y) * k;
      if (canStand(sim, nx, ny)) { m.x = nx; m.y = ny; }
      m.edge = { x: s.x, y: s.y };
    }
  }
}

// The hidden meter. Depth and night wear on everyone; a lit pylon cancels depth
// for its area; a lit fire at camp blunts the night. It never heals.
export const DRAIN = 0.007;
function drain(sim, hours) {
  if (sim.tutorial) return;
  const night = isNight(sim.time);
  const bodies = [sim.player, ...party(sim)];
  for (const b of bodies) {
    const area = areaAt(sim, b.y);
    const depth = shielded(sim, area) ? 1 : 1 + area * 0.6;
    const nightMul = night ? (atCamp(sim, b) && sim.camp.lit ? 1.2 : 2.5) : 1;
    b.sanity = Math.max(0, b.sanity - hours * DRAIN * depth * nightMul * (b.fake ? 0 : 1));
  }
}

export function snapshot(sim) {
  return JSON.stringify(sim, (k, v) => (k === "msgs" || k === "events" ? [] : v));
}
