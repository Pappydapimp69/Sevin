// grove.js — the golden tree. Mutates sim.grove, sim.gdrops, sim.remains,
// sim.bodies, the player's hands and the missing it stands in for. Called from
// sim.js and night.js only.
//
// Some nights a missing person's spot holds a faintly glowing tree instead of
// them. It is the WOODS' lie, not the mind's: the hidden meter has nothing to
// do with it. Chop it and something falls every two or three chops; it never
// comes down. The chop follows the body inside it:
//
//   a real tree (they are in a pocket beside it, unseen): glow sticks and one
//     fruit. Fruit odds by drop 0/30/50/75/100%. Four branches and the fruit,
//     and it is done.
//   a person: arms first, then the head (30% on the second chop with both arms
//     there, certain once they are gone), then the legs.
//
// When the fruit falls the whistling stops and they are gone, real tree or
// not. Before it, they can still be found on another night, short what they
// lost. The woods remember: one tree, its scars and its look, until it is
// chopped out. Firelight and morning tell the truth. Every roll here is a side
// hash; nothing draws from the run stream.

import { stream, hash } from "./rng.js";

export const ZONE_R = 12;                  // metres round a rescue spot nobody else will enter
export const GLOW_HOURS = 3;
export const FRUIT_HOURS = 6;
const FRUIT_ODDS = [0, 0.3, 0.5, 0.75, 1];
const DAWN = 6, WAKE = 2;
const hr = (t) => ((t % 24) + 24) % 24;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function fresh() { return { look: 0, scars: 0, fruit: true, enc: null }; }

export function ensure(sim) {
  sim.grove ||= fresh();
  sim.gdrops ||= [];
  sim.remains ||= [];
  sim.bodies ||= [];
  sim.player.glows ||= [];
  for (const ms of sim.missing) { ms.arms ??= 2; ms.legs ??= 2; }
}

const active = (ms) => !ms.found && !ms.lost;
/** The night's window, two until seven (the tree is still there in the low sun). */
export function treeUp(sim) {
  const e = sim.grove?.enc;
  if (!e) return false;
  const t0 = WAKE + 24 * e.d, t1 = DAWN + 24 * e.d + 1;      // 02:00 that night to 07:00 next morning
  return sim.time >= t0 && sim.time < t1;
}
/** A missing person is out there to be found only in the small hours. */
export function personOut(sim, ms) {
  const h = hr(sim.time);
  if (!active(ms) || !(h >= WAKE && h < DAWN)) return false;
  const e = sim.grove?.enc;
  return !(e && e.msId === ms.id && treeUp(sim));
}
/** Rescue spots tonight: everyone out there, and the tree if it stands. */
export function spots(sim) {
  const out = [];
  const h = hr(sim.time);
  if (h >= WAKE && h < DAWN) for (const ms of sim.missing) if (active(ms)) out.push(ms);
  if (treeUp(sim)) { const e = sim.grove.enc; if (!out.some((s) => s.id === e.msId)) out.push({ x: e.x, y: e.y }); }
  return out;
}

/** The night falls: does a golden tree stand where someone is? One tree, one night. */
export function nightFalls(sim, d) {
  ensure(sim);
  const g = sim.grove;
  g.enc = null;
  for (const ms of sim.missing) {
    if (!active(ms)) continue;
    const r = stream(hash("gtree", sim.seed, ms.id, d));
    if (r() >= 0.4) continue;
    const real = r() < 0.5;
    g.enc = { d, msId: ms.id, real, x: ms.x, y: ms.y, hits: 0, need: 2 + (r() < 0.5 ? 1 : 0), drops: 0, startArms: ms.arms, headDown: false, full: false };
    break;
  }
}

/** One chop. Returns what fell, if anything. */
export function chop(sim) {
  const g = sim.grove, e = g.enc;
  if (!e || !treeUp(sim)) return null;
  if (e.full) { sim.msgs.push({ t: sim.time, text: "Nothing more will come off it.", kind: "info" }); return null; }
  e.hits++;
  sim.events.push({ kind: "gchop" });
  // they whistle while it is cut, real tree or not, until the fruit is down
  const who = sim.missing.find((x) => x.id === e.msId);
  if (who && !e.silent && (e.drops > 0 || e.hits === 1) && who.answerAt == null) who.answerAt = sim.time + 0.004;
  if (e.hits < e.need) return null;
  const r = stream(hash("gdrop", sim.seed, e.msId, e.d, e.drops));
  e.hits = 0; e.need = 2 + (r() < 0.5 ? 1 : 0);
  const ms = sim.missing.find((x) => x.id === e.msId);
  let truth;
  if (e.real) {
    const i = g.scars + (g.fruit ? 0 : 1);
    const pf = g.fruit ? (g.scars >= 4 ? 1 : FRUIT_ODDS[Math.min(4, i)]) : 0;
    if (r() < pf) { truth = "fruit"; g.fruit = false; }
    else if (g.scars < 4) { truth = "glow"; g.scars++; }
    if (g.scars >= 4 && !g.fruit) e.full = true;
  } else {
    const roll = r();
    if (e.headDown) { if (ms.legs > 0) { truth = "leg"; ms.legs--; } if (!ms.legs) e.full = true; }
    else if (ms.arms === 2) { truth = "arm"; ms.arms = 1; }
    else if (ms.arms === 1) {
      if (e.startArms === 1 || roll >= 0.3) { truth = "arm"; ms.arms = 0; }
      else truth = "head";
    } else truth = "head";
    if (truth === "head") e.headDown = true;
    g.scars = Math.min(4, g.scars + (truth === "head" ? 0 : 1));
  }
  if (!truth) return null;
  e.drops++;
  const fruitLike = truth === "fruit" || truth === "head";
  if (fruitLike) {
    // one fruit per missing person: they are gone
    ms.lost = true; ms.dead = true; e.silent = true;
    sim.events.push({ kind: "silence" });
  }
  const a = r() * Math.PI * 2, rr = 1.2 + r() * 1.4;
  const drop = { id: sim.gdrops.length, truth, msId: e.msId, name: ms?.name, x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr, d: e.d, taken: false, shown: fruitLike ? "fruit" : "branch" };
  sim.gdrops.push(drop);
  sim.events.push({ kind: "gdrop", fruit: fruitLike });
  return drop;
}

/** Pick something up off the ground by the tree. */
export function pick(sim, id) {
  const it = sim.gdrops[id], p = sim.player;
  if (!it || it.taken) return;
  if (it.shown === "fruit") {
    it.taken = true; p.holding = { truth: it.truth, msId: it.msId, name: it.name };
    sim.msgs.push({ t: sim.time, text: "You lift it in both hands. You can do nothing else until you set it down at camp.", kind: "info" });
  } else if (it.shown === "branch") {
    it.taken = true; p.glows.push({ truth: it.truth, msId: it.msId, name: it.name });
    sim.msgs.push({ t: sim.time, text: "A branch, faintly glowing. It wants a fire to wake it.", kind: "info" });
  } else if (it.shown === "stick") {
    it.taken = true; p.wood += 1;
  }
  sim.events.push({ kind: "stick" });
}

// Firelight is honest. What you carried in is seen for what it is, by everyone.
function reveal(sim, part) {
  const S = sim, name = part.name || "someone";
  const word = { arm: "an arm", leg: "a leg", head: `${name}'s head` }[part.truth];
  S.remains.push({ truth: part.truth, msId: part.msId, name, asked: false, x: S.camp.x + (S.remains.length % 3) - 1, y: S.camp.y - 2.2 - Math.floor(S.remains.length / 3) * 0.6 });
  S.msgs.push({ t: S.time, text: part.truth === "head" ? `In the firelight it is not a fruit. It is ${word}.` : `It will not catch. In the firelight it is not a branch. It is ${word}.`, kind: "bad" });
  for (const m of S.members) {
    if (m.gone || m.home || m.away || dist(m, S.camp) > 14) continue;
    // the one wearing that name looks at what was theirs, and does not flinch
    if (m.fake && m.name === name) S.msgs.push({ t: S.time, text: `${m.name} looks at it a long time, and says nothing.`, kind: "talk" });
    else S.msgs.push({ t: S.time, text: `${m.name} turns away from it.`, kind: "talk" });
  }
  S.events.push({ kind: "reveal", truth: part.truth });
}

/** Walk into camp holding it: it goes down by the fire. */
export function setDown(sim) {
  const p = sim.player;
  if (!p.holding || !sim.camp.up || dist(p, sim.camp) > 6) return;
  const h = p.holding; p.holding = null;
  if (h.truth === "head") reveal(sim, h);
  else { sim.campFruit = (sim.campFruit || 0) + 1; sim.msgs.push({ t: sim.time, text: "You set the fruit down by the fire. It is warm, and smells of nothing.", kind: "info" }); }
}

/** A glow stick is woken in the campfire, or will not catch. */
export function snap(sim) {
  const p = sim.player;
  const s = p.glows.shift();
  if (!s) return;
  if (s.truth === "glow") {
    p.glowUntil = sim.time + GLOW_HOURS;
    sim.msgs.push({ t: sim.time, text: "It catches cold and gold, and holds. What is not there keeps back from it.", kind: "good" });
    sim.events.push({ kind: "glowOn" });
  } else reveal(sim, s);
}
export const glowing = (sim) => sim.player.glowUntil != null && sim.time < sim.player.glowUntil;

/** Eat the fruit: for six hours the real world dims and what the mind makes up shows full. */
export function eat(sim) {
  if (!sim.campFruit) return;
  sim.campFruit--;
  sim.fruit = { until: sim.time + FRUIT_HOURS, meter: 1 };
  sim.msgs.push({ t: sim.time, text: "It tastes of nothing at all. The fire goes small and far away.", kind: "warn" });
  sim.events.push({ kind: "ate" });
}
/** The fruit's own meter: superficial, full at first, faster as it falls. */
export function tickFruit(sim, hours, depth) {
  const f = sim.fruit;
  if (!f) return;
  if (sim.time >= f.until) { sim.fruit = null; sim.msgs.push({ t: sim.time, text: "The world comes back to its size.", kind: "info" }); return; }
  const k = f.meter < 0.5 ? 4 : f.meter < 0.75 ? 3 : f.meter < 0.85 ? 2 : 1;
  f.meter = Math.max(0, f.meter - hours * 0.06 * depth * k);
}

/** What can be done with the remains at camp. */
export function bury(sim, i) {
  const r = sim.remains.splice(i, 1)[0];
  if (!r) return;
  sim.msgs.push({ t: sim.time, text: `You bury it at the edge of the camp. Nobody says ${r.name}'s name.`, kind: "info" });
  for (const b of [sim.player, ...sim.members]) if (!b.fake && b.sanity != null) b.sanity = Math.min(1, b.sanity + 0.02);
}
export function burn(sim, i) {
  const r = sim.remains.splice(i, 1)[0];
  if (!r) return;
  sim.camp.fire = Math.min(12, sim.camp.fire + 3); if (sim.camp.fire > 0) sim.camp.lit = true;
  sim.msgs.push({ t: sim.time, text: "It burns. Everyone watches it burn.", kind: "bad" });
  for (const b of [sim.player, ...sim.members]) if (!b.fake && b.sanity != null) b.sanity = Math.max(0, b.sanity - 0.06);
}

/** Six in the morning: what lies on the ground turns true; a chopped-out tree goes, or stands as what it was. */
export function morning(sim) {
  ensure(sim);
  for (const it of sim.gdrops) {
    if (it.taken || it.true) continue;
    it.true = true;
    it.shown = it.truth === "glow" ? "stick" : it.truth === "fruit" ? "fruit" : it.truth;
  }
  const g = sim.grove, e = g.enc;
  if (e) {
    if (!e.real && e.headDown) {
      // their tree is done with: the next one will look different
      if (e.full) sim.bodies.push({ x: e.x, y: e.y, msId: e.msId, until: sim.time + 24 + 24 });
      g.look++; g.scars = 0; g.fruit = true;
    } else if (e.real && e.full) { g.look++; g.scars = 0; g.fruit = true; }
  }
  sim.bodies = sim.bodies.filter((b) => sim.time < b.until);
}

/** When the tree is gone for the day. */
export function tidy(sim) {
  const e = sim.grove?.enc;
  if (e && !treeUp(sim) && sim.time > DAWN + 24 * e.d + 1) sim.grove.enc = null;
}

/** The tell: by low sun or a real glow stick, a person's tree casts a person. */
export function shadowShape(sim) {
  const e = sim.grove?.enc;
  if (!e || !treeUp(sim) || e.full) return null;
  const h = hr(sim.time);
  const lowSun = h >= DAWN && h < DAWN + 1;
  const lit = glowing(sim) && dist(sim.player, e) < 14;
  if (!lowSun && !lit) return null;
  const ms = sim.missing.find((x) => x.id === e.msId);
  return { person: !e.real && !e.headDown, arms: ms ? ms.arms : 2, from: lowSun ? { x: e.x + 30, y: e.y } : { x: sim.player.x, y: sim.player.y } };
}
