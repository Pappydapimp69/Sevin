// names.js — party names, composed from fragments, never picked from a list.
// A listed name is recognised by run ten; recognition is the enemy.
//
// CONSTANT ROLL COUNT: makeName always draws exactly 10 times.

const ONSET = ["b", "d", "f", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "br", "dr", "gr", "kr", "st", "th", "tr"];
const NUCLEUS = ["a", "e", "i", "o", "u", "ae", "ai", "ea", "ia", "ou"];
const CODA = ["", "", "", "l", "n", "r", "s", "th", "k", "nd"];

const at = (list, x) => list[Math.floor(x * list.length)];

export function makeName(rng) {
  const d = Array.from({ length: 10 }, () => rng());
  const three = d[0] < 0.3;
  let s = at(ONSET, d[1]) + at(NUCLEUS, d[2]);
  let coda = at(CODA, d[3]);
  const on2 = at(ONSET, d[4]);
  if (coda && coda[coda.length - 1] === on2[0]) coda = "";
  s += coda + on2 + at(NUCLEUS, d[5]);
  if (three) {
    let c2 = at(CODA, d[6]);
    const on3 = at(ONSET, d[7]);
    if (c2 && c2[c2.length - 1] === on3[0]) c2 = "";
    s += c2 + on3 + at(NUCLEUS, d[8]);
  }
  s += at(["", "", "n", "l", "s", "r"], d[9]);
  return s[0].toUpperCase() + s.slice(1);
}

// Five distinct names, none sharing an initial (initials are how people hold
// unfamiliar names). Fixed 60 attempts drawn whatever happens.
export function makeRoster(rng, n) {
  const out = [];
  for (let i = 0; i < 60; i++) {
    const nm = makeName(rng);
    if (out.length < n && nm.length <= 9 && !out.some((o) => o[0] === nm[0])) out.push(nm);
  }
  while (out.length < n) out.push("Tam" + out.length); // unreachable in practice; guarded by tests
  return out;
}

// A name one letter off: a vowel shifted. Derived from the name, not a list.
export function nearMiss(name, x) {
  const vowels = "aeiou";
  const idx = [];
  for (let i = 1; i < name.length; i++) if (vowels.includes(name[i])) idx.push(i);
  if (!idx.length) return name + "e";
  const i = idx[Math.floor(x * idx.length)];
  const v = vowels[(vowels.indexOf(name[i]) + 1 + Math.floor(x * 7) % 4) % 5];
  return name.slice(0, i) + v + name.slice(i + 1);
}
