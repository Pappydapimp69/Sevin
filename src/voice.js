// voice.js — how each person whistles. Pure; no DOM, no audio.
//
// Everyone has their own whistle: a pitch, a shape, a jump between notes, a
// pace. The player learns them by ear. Something wearing a person's name
// whistles THEIR whistle with one thing slightly wrong, and that wrong thing is
// DERIVED from the real whistle (a semitone off, a narrower jump, a beat
// slower), never picked from a list of "fake whistles". Same rule as the
// accounts in chronicle.js.
//
// Everything here comes from side hashes; nothing draws from the run stream.

import { stream, hash } from "./rng.js";

// The shapes a whistle can take. The domain whistles are drawn FROM.
export const SHAPES = Object.freeze(["rise", "fall", "rise-fall", "two-same", "fall-rise"]);

const ST = (n) => Math.pow(2, n / 12);       // n semitones as a ratio

/** One person's whistle. Spaced by slot so no two in a party sound alike. */
export function makeVoice(seed, slot, id) {
  const r = stream(hash("voice", seed, id));
  const a = r(), b = r(), c = r(), d = r();
  return {
    pitch: Math.round(1250 * ST(slot * 2.6 + a * 1.2)),         // Hz, ~1250-2700
    shape: SHAPES[(slot + Math.floor(b * SHAPES.length)) % SHAPES.length],
    jump: 3 + Math.floor(c * 5),                                  // semitones, 3-7
    pace: Math.round((0.22 + d * 0.14) * 100) / 100,              // seconds per note
  };
}

export const BEND_KINDS = Object.freeze(["pitch", "jump", "pace"]);

/**
 * The same whistle, one thing slightly off. Exactly one parameter moves, and
 * only a little: close enough to pass at a distance, wrong to an ear that
 * knows the real one.
 */
export function bendVoice(v, seed, fakeId) {
  const r = stream(hash("bend", seed, fakeId));
  // only what can be HEARD: two notes on one pitch have no jump to bend
  const kinds = v.shape === "two-same" ? BEND_KINDS.filter((k) => k !== "jump") : BEND_KINDS;
  const kind = kinds[Math.floor(r() * kinds.length)];
  const dir = r() < 0.5 ? -1 : 1;
  const out = { ...v };
  if (kind === "pitch") out.pitch = Math.round(v.pitch * ST(dir));                 // one semitone
  if (kind === "jump") out.jump = Math.max(2, v.jump + (v.jump <= 3 ? 2 : dir * 2)); // two semitones
  if (kind === "pace") out.pace = Math.round(v.pace * (dir > 0 ? 1.35 : 0.72) * 100) / 100;
  return out;
}

/** The notes to play: [{freq, dur, slide, at}] in seconds. */
export function notes(v) {
  const p = v.pitch, up = p * ST(v.jump), down = p / ST(v.jump), t = v.pace;
  const n = (freq, at, slide = 0) => ({ freq: Math.round(freq), dur: t, slide: Math.round(slide), at: Math.round(at * 100) / 100 });
  switch (v.shape) {
    case "rise": return [n(p, 0, p * 0.05), n(up, t * 1.2, up * 0.05)];
    case "fall": return [n(up, 0), n(p, t * 1.2, -p * 0.04)];
    case "rise-fall": return [n(p, 0), n(up, t * 1.1), n(p, t * 2.2, -p * 0.05)];
    case "two-same": return [n(p, 0, p * 0.03), n(p, t * 1.4, p * 0.03)];
    case "fall-rise": return [n(up, 0), n(p, t * 1.1), n(up, t * 2.2, up * 0.04)];
    default: return [n(p, 0)];
  }
}

/** The player's own whistle: the same every run, and like no one else's. */
export const PLAYER_VOICE = Object.freeze({ pitch: 1700, shape: "rise", jump: 5, pace: 0.25 });
