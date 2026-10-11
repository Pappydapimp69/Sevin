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

export { phantomSticks, shownWood, shownFire } from "./phantom.js";

export const visibleParty = (sim) => party(sim);
