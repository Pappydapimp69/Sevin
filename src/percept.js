// percept.js — what the player is told. The only module allowed to lie.
// Reads the sim; never writes it. Renderer and UI draw from here.

import { account, pickPerturbation } from "./chronicle.js";
import { nearMiss } from "./names.js";
import { stream, hash } from "./rng.js";
import { party, today, byId } from "./sim.js";

// Names by id, including the missing and the unmade: a fact keeps its actor
// after they are gone.
export function namer(sim) {
  const map = new Map();
  for (const m of sim.members) map.set(m.id, m.name);
  for (const ms of sim.missing) if (!map.has(ms.id)) map.set(ms.id, ms.name);
  return (id) => (id === "you" ? "you" : map.get(id) || "someone");
}

// Days a member can be asked about: every day you have lived, including today.
export const askableDays = (sim) => Array.from({ length: today(sim) }, (_, i) => i + 1).filter((d) => sim.chron[d]);

/**
 * What `memberId` says about `day`. A real member tells the record. A fake
 * tells the record with one fact bent, chosen from a side stream keyed on
 * (seed, fake, day) so it is the SAME lie every time you ask, and asking draws
 * nothing from the run.
 */
export function accountFor(sim, memberId, day) {
  const m = byId(sim, memberId);
  const ch = sim.chron[day];
  if (!ch) return { weather: "", lines: ["Nothing."] };
  const n = namer(sim);
  if (!m || !m.fake) return account(ch, n);
  const pert = lieFor(sim, m, day);
  return account(ch, n, pert);
}

export function lieFor(sim, m, day) {
  const ch = sim.chron[day];
  const r = stream(hash("lie", sim.seed, m.id, day));
  const near = {};
  for (const x of sim.members) near[x.id] = nearMiss(x.name, stream(hash("near", sim.seed, x.id))());
  for (const x of sim.missing) near[x.id] ||= nearMiss(x.name, stream(hash("near", sim.seed, x.id))());
  return pickPerturbation(r, ch, near, m.id);
}

// What people say unprompted. Mood, never a number or a band name. Not a tell
// about who is real — fakes talk like anyone well rested.
const UNEASY = [
  "The trees were closer together this morning.",
  "Did you hear that? Never mind.",
  "I keep counting us. I keep getting it right.",
  "Same stump. We passed that stump.",
  "It's quieter than it should be.",
];
const EASY = [
  "Good wood up here.",
  "My hands are cold.",
  "We'll make the next stretch tomorrow.",
  "Smells like rain.",
];
export function chatter(sim, m, tick) {
  const r = stream(hash("chat", sim.seed, m.id, tick))();
  const pool = m.sanity < 0.45 ? UNEASY : EASY;
  return pool[Math.floor(r * pool.length)];
}

/**
 * The evening song: a verse each, from a fact of today, to their own whistle.
 * A verse is a line of their account of the day, so a fake sings its bent
 * account: if the line it picks is the bent one, the song is wrong. Picked by
 * a side hash on (seed, member, day, how many songs tonight).
 */
export function verses(sim, k = 0) {
  const d = today(sim);
  // each sings a different line of their own account, their own doings first
  const used = new Set();
  const FILL = ["the trail went on north", "the wood was wet and the fire took it anyway", "nobody fell behind today", "the trees were closer in the evening"];
  return party(sim).filter((m) => sim.camp.up && !m.sleeping && Math.hypot(m.x - sim.camp.x, m.y - sim.camp.y) < 14).map((m) => {
    const all = accountFor(sim, m.id, d).lines.filter((l) => l && l.length > 3 && !used.has(l));
    const own = all.filter((l) => l.includes(m.name));
    const pool = own.length ? own : all.length ? all : FILL.filter((l) => !used.has(l));
    const r = stream(hash("verse", sim.seed, m.id, d, k))();
    const line = pool.length ? pool[Math.floor(r * pool.length)] : FILL[0];
    used.add(line);
    return { id: m.id, name: m.name, voice: m.voice, line };
  });
}

/**
 * The morning choice: what a teammate would say, if asked which of the two is
 * the one they know. Derived, never rolled from the run: a real teammate is
 * surer the longer they walked with the real one and the more of the record
 * they share with them; a mind far gone is guessing; a fake always points at
 * the fake, and is always sure. Same answer every time it is asked.
 */
export function voteOf(sim, voter, a, b) {
  const realOne = a.fake ? b : b.fake ? a : a, fakeOne = realOne === a ? b : a;
  if (voter.fake) return { pick: fakeOne.id, p: 0.95 };
  let k = 0;
  for (const ch of Object.values(sim.chron)) for (const f of ch.facts || []) {
    const w = f.withWhom || [];
    if ((f.actor === voter.id && w.includes(realOne.id)) || (f.actor === realOne.id && w.includes(voter.id))) k++;
  }
  const missing = sim.missing.find((x) => x.id === realOne.id);
  k += Math.max(0, (missing?.takenDay ?? 1) - 1);          // days they walked together before
  let p = Math.min(0.9, 0.55 + 0.08 * k);
  if (voter.sanity < 0.4) p = 0.5;
  const r = stream(hash("vote", sim.seed, voter.id, Math.min(a.id, b.id), Math.max(a.id, b.id)))();
  return { pick: r < p ? realOne.id : fakeOne.id, p };
}
export const sureWord = (p) => (p >= 0.85 ? "sure" : p >= 0.7 ? "fairly sure" : p > 0.5 ? "not sure" : "guessing");

export { phantomSticks, phantomWatchers, seesPylonLit, shownWood, shownFire, mindLevel } from "./phantom.js";

export const visibleParty = (sim) => party(sim);
