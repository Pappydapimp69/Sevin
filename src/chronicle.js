// chronicle.js — what happened, and how somebody tells you about it. Pure.
//
// THE WRONG DETAIL IS DERIVED FROM THE RECORD. IT IS NEVER AUTHORED.
//
// A fake's account is the real account with exactly one fact bent, and the
// bent value comes from that same day: a place really visited, a person really
// there, a weather it really was not. There is no list to learn.
//
// Phrasing is authored and SHARED: real and fake speak through the same
// templates, so the player reads substance, not style.

export const WEATHERS = Object.freeze(["clear", "drizzle", "fog", "wind", "cold"]);

export function record(chron, f) {
  const fact = { i: chron.facts.length, t: f.t, verb: f.verb, actor: f.actor, object: f.object ?? null, cls: f.cls ?? null, place: f.place ?? null, withWhom: (f.withWhom || []).slice(), seen: f.seen !== false };
  chron.facts.push(fact);
  return fact;
}

const at = (f) => (f.place ? ` by the ${f.place}` : "");
const PHRASE = {
  assigned: (f, n) => `${cap(n(f.actor))} was ${f.object} that day`,
  cut: (f, n) => `${cap(n(f.actor))} put the axe into the deadfall${at(f)}`,
  cleared: (f, n) => `${cap(n(f.actor))} broke the deadfall${at(f)} through`,
  gathered: (f, n) => `${cap(n(f.actor))} brought ${f.object} back from the ${f.place}`,
  picked: (f, n) => `${cap(n(f.actor))} picked up ${f.object}${at(f)}`,
  lit: (f, n) => `${cap(n(f.actor))} got the ${f.object} going`,
  watched: (f, n) => `${cap(n(f.actor))} sat up with the ${f.object}`,
  pitched: (f, n) => `${cap(n(f.actor))} put up camp${at(f)}${helpers(f, n)}`,
  struck: (f, n) => `${cap(n(f.actor))} took the camp down${at(f)}${helpers(f, n)}`,
  pylon: (f, n) => `${cap(n(f.actor))} lit a pylon${at(f)} with ${f.withWhom.map(n).join(" and ") || "nobody"}`,
  found: (f, n) => `${cap(n(f.actor))} found ${f.withWhom.map(n).join(", ")}${at(f)}`,
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const helpers = (f, n) => (f.withWhom.length ? `, with ${f.withWhom.map(n).join(" and ")}` : "");

export function phrase(f, n) {
  const fn = PHRASE[f.verb];
  if (!fn) throw new Error("chronicle: no phrasing for " + f.verb);
  return fn(f, n);
}

const WEATHER_LINE = {
  clear: "It was clear all day.",
  drizzle: "It drizzled on us most of the day.",
  fog: "Fog sat in and never lifted.",
  wind: "Wind all day, up in the tops.",
  cold: "Cold enough that the water skinned over.",
};

/**
 * One person's account of a day. `perturb` is null for the real: every real
 * account of a day is IDENTICAL, which is why a lone difference means something.
 */
export function account(chron, nameOf, perturb = null) {
  let facts = chron.facts.map((f) => ({ ...f, withWhom: f.withWhom.slice() }));
  let weather = chron.weather;
  let names = nameOf;
  if (perturb) {
    const p = perturb;
    switch (p.kind) {
      case "order": [facts[p.at], facts[p.at + 1]] = [facts[p.at + 1], facts[p.at]]; break;
      case "actor": facts[p.at].actor = p.to; break;
      case "place": facts[p.at].place = p.to; break;
      case "object": facts[p.at].object = p.to; break;
      case "with": facts[p.at].withWhom = [p.to]; break;
      case "weather": weather = p.to; break;
      case "name": names = (id) => (id === p.who ? p.to : nameOf(id)); break;
      default: throw new Error("chronicle: unknown perturbation " + p.kind);
    }
  }
  return { weather: WEATHER_LINE[weather] || WEATHER_LINE.clear, lines: facts.map((f) => phrase(f, names)) };
}

export const accountText = (a) => [a.weather, ...a.lines].join("\n");

export const KINDS = Object.freeze(["order", "actor", "place", "object", "with", "weather", "name"]);

/**
 * Every bend this day supports, using only values the day itself contains, and
 * only on facts the player saw (a lie about something you could not have seen
 * is not catchable, it is a coin flip). The weather everyone saw.
 */
export function candidates(chron, nearMisses = {}, speaker = null) {
  const F = chron.facts;
  const actors = [...new Set(F.map((f) => f.actor))];
  const places = [...new Set(F.map((f) => f.place).filter(Boolean))];
  const people = [...new Set(F.flatMap((f) => [f.actor, ...f.withWhom]))];
  const out = [];
  for (let a = 0; a + 1 < F.length; a++)
    if (F[a].seen && F[a + 1].seen && phrase(F[a], String) !== phrase(F[a + 1], String)) out.push({ kind: "order", at: a });
  F.forEach((f, i) => {
    if (!f.seen) return;
    for (const a of actors) if (a !== f.actor && a !== speaker) out.push({ kind: "actor", at: i, to: a });
    if (f.place) for (const p of places) if (p !== f.place) out.push({ kind: "place", at: i, to: p });
    if (f.object && f.cls)
      for (const o of new Set(F.filter((g) => g.cls === f.cls && g.object !== f.object).map((g) => g.object))) out.push({ kind: "object", at: i, to: o });
    if (f.withWhom.length === 1)
      for (const who of people) if (who !== f.withWhom[0] && who !== f.actor && who !== "you") out.push({ kind: "with", at: i, to: who });
  });
  for (const a of people) if (nearMisses[a] && F.some((f) => f.seen && (f.actor === a || f.withWhom.includes(a)))) out.push({ kind: "name", who: a, to: nearMisses[a] });
  for (const w of WEATHERS) if (w !== chron.weather) out.push({ kind: "weather", to: w });
  return out;
}

/**
 * Pick the one bend. Spread across kinds first, then within the kind.
 * CONSTANT ROLL COUNT: exactly two draws. Verified visible, not trusted.
 */
export function pickPerturbation(rng, chron, nearMisses = {}, speaker = null) {
  const all = candidates(chron, nearMisses, speaker);
  const rKind = rng(), rWhich = rng();
  const truth = accountText(account(chron, String));
  const visible = all.filter((c) => accountText(account(chron, String, c)) !== truth);
  if (!visible.length) return null;
  const kinds = KINDS.filter((k) => visible.some((c) => c.kind === k));
  const kind = kinds[Math.floor(rKind * kinds.length)];
  const pool = visible.filter((c) => c.kind === kind);
  return pool[Math.floor(rWhich * pool.length)];
}
