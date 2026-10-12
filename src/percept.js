// percept.js — what the player is told. The only module allowed to lie.
// Reads the sim; never writes it. Renderer and UI draw from here.

import { account, pickPerturbation } from "./chronicle.js";
import { nearMiss } from "./names.js";
import { stream, hash } from "./rng.js";
import { party, today, byId, isNight, callFor } from "./sim.js";
import { mindLevel as _mind } from "./phantom.js";
import { bendCall } from "./voice.js";

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
    // a mind far gone hears one REAL voice a night sing its day wrong (side hash on seed and day)
    const reals = party(sim).filter((x) => !x.fake);
    const misheard = _mind(sim) < 0.35 && reals.length && reals[Math.floor(stream(hash("mindverse", sim.seed, d))() * reals.length)] === m;
    const acc = misheard && sim.chron[d] ? account(sim.chron[d], namer(sim), lieFor(sim, m, d)) : accountFor(sim, m.id, d);
    const all = acc.lines.filter((l) => l && l.length > 3 && !used.has(l));
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

/**
 * Voices. The failing mind hears the team say things they did not say, in their
 * names: someone asleep, someone too far off to be heard. Mostly they answer
 * what you just did (Brain mirage#E19: tie it to a verb); sometimes they come
 * unbidden. Never a number, never a word for the meter.
 */
const VOICES = {
  whistle: ["Not you. Not your whistle.", "Who are you calling for?", "They won't come for that.", "We heard you the first time."],
  stick: ["That one's not for you.", "Put it back.", "Count them again."],
  work: ["Slower. They're watching.", "You're doing it wrong and they know.", "Keep your back to the trees."],
  idle: ["Don't turn around.", "We counted you twice.", "It was you at the tree.", "You're not the one who came back.", "Which of us do you trust?", "Listen to the fire. It's saying your name."],
};
export function voiceLine(sim, verb, tick) {
  const m = _mind(sim);
  if (sim.tutorial || m >= 0.5) return null;
  const r = stream(hash("voice", sim.seed, verb, tick));
  if (r() > (verb === "idle" ? 0.9 : 0.55) * (0.5 - m) * 2.2) return null;
  // in the name of someone who could not have said it: asleep, or out of earshot
  const far = party(sim).filter((x) => x.sleeping || Math.hypot(x.x - sim.player.x, x.y - sim.player.y) > 30);
  const pool = VOICES[verb] || VOICES.idle;
  const line = pool[Math.floor(r() * pool.length)];
  const who = far.length ? far[Math.floor(r() * far.length)].name : null;
  return who ? `${who}: “${line}”` : `Someone says, close to your ear: “${line}”`;
}

/** At night, at the edge of the firelight, one of them stands who is not there. */
export function kinAtTheEdge(sim) {
  if (sim.tutorial || !sim.camp.up || !isNight(sim.time) || _mind(sim) >= 0.45) return null;
  const night = Math.floor((sim.time - 6) / 24);
  const r = stream(hash("kin", sim.seed, night));
  if (r() > 0.6) return null;
  const ps = party(sim);
  if (!ps.length) return null;
  const m = ps[Math.floor(r() * ps.length)], a = r() * Math.PI * 2, d = 13 + r() * 5;
  return { name: m.name, slot: m.slot, voice: m.voice, call: bendCall(callFor(sim, m), sim.seed, 9000 + night), x: sim.camp.x + Math.cos(a) * d, y: sim.camp.y + Math.sin(a) * d, key: "kin" + night };
}
