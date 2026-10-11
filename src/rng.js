// rng.js — seeded randomness. The world and the run are pure functions of one
// seed; the stream's position is one integer, so a save can restore it.

export function makeRng(state) {
  const r = { s: state >>> 0 };
  r.next = () => {
    r.s = (r.s + 0x6d2b79f5) >>> 0;
    let t = r.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return r;
}

// A plain function view: rng() -> [0,1).
export function stream(seed) {
  const r = makeRng(seed);
  return () => r.next();
}

// Hash any list of integers/strings to a seed. Used to derive side streams
// (the world, one fake's lie about one day) without touching the run stream.
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
