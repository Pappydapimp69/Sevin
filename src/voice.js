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
export const SHAPES = Object.freeze(["rise", "fall", "rise-fall", "two-same", "fall-rise", "climb", "call", "warble"]);

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
    case "climb": { const mid = p * ST(Math.round(v.jump / 2)); return [n(p, 0), n(mid, t * 0.9), n(up, t * 1.8, up * 0.04)]; }
    case "call": return [n(up, 0), n(p, t * 0.8), n(up, t * 1.6), n(p, t * 2.4, -p * 0.04)];
    case "warble": { const hi = p * ST(Math.max(1.5, v.jump / 2)); /* unrounded: every jump is heard */ return [n(p, 0), n(hi, t * 0.6), n(p, t * 1.2), n(hi, t * 1.8, hi * 0.03)]; }
    default: return [n(p, 0)];
  }
}

/** The player's own whistle: the same every run, and like no one else's. */
export const PLAYER_VOICE = Object.freeze({ pitch: 1700, shape: "rise", jump: 5, pace: 0.25 });

/**
 * A whistle in a moment. The VOICE says who (register, shape: the part you
 * learn to know someone by); the MOMENT says how it comes out this time:
 * tempo, an ornament, notes held longer across a distance, softer after
 * dark. Seeded from the moment (hour, minute, distance, time played, how
 * many whistles so far) plus the person's SLOT, never their voice, so a fake
 * in the same moment whistles the same phrasing on its bent voice: one thing
 * off, not everything.
 *
 * ctx: { hour, minute, dist, campDist, played, n, slot }
 * `free`: the player's own whistle may also wander in shape and pitch.
 */
export const ORNAMENTS = Object.freeze(["none", "grace", "trill", "repeat", "echo", "hold"]);
export function phrase(voice, ctx, free = false) {
  const r = stream(hash("phrase", ctx.hour, ctx.minute, Math.round(ctx.dist || 0), Math.round(ctx.campDist ?? -1), ctx.played || 0, ctx.n || 0, ctx.slot ?? "you"));
  const d = Array.from({ length: 8 }, () => r());       // fixed draws, whatever is used
  let v = voice;
  if (free) {
    v = { ...voice,
      shape: SHAPES[Math.floor(d[0] * SHAPES.length)],
      pitch: Math.round(voice.pitch * ST(Math.round((d[1] - 0.5) * 6))),
      jump: 3 + Math.floor(d[2] * 6) };
  }
  const night = ctx.hour >= 18 || ctx.hour < 6;
  const far = (ctx.dist || 0) > 12;
  const tempo = (1 + (d[3] - 0.5) * 0.2) * (night ? 1.1 : 1);
  const gain = night ? 0.7 : 1;
  let out = notes(v).map((x) => ({ ...x, at: x.at * tempo, dur: x.dur * tempo, slide: x.slide * (0.6 + d[4] * 0.8), gain }));
  if (far) out[0] = { ...out[0], dur: out[0].dur * 1.5 };                     // calling across a distance
  const orn = ORNAMENTS[Math.floor(d[5] * ORNAMENTS.length)];
  const last = out[out.length - 1], end = last.at + last.dur;
  const q = 0.07 * tempo;
  if (orn === "grace") out = [{ freq: Math.round(out[0].freq * ST(2)), dur: q, slide: 0, at: 0, gain }, ...out.map((x) => ({ ...x, at: x.at + q }))];
  if (orn === "trill") for (let i = 0; i < 4; i++) out.push({ freq: Math.round(last.freq * (i % 2 ? 1 : ST(2))), dur: q, slide: 0, at: end + i * q, gain });
  if (orn === "repeat") out.push({ ...last, at: end + 0.08 });
  if (orn === "echo") out.push(...out.map((x) => ({ ...x, at: x.at + end + 0.25, gain: gain * 0.4 })));
  if (orn === "hold") out[out.length - 1] = { ...last, dur: last.dur * 1.8 };
  return out.map((x) => ({ ...x, at: Math.round(x.at * 1000) / 1000, dur: Math.round(x.dur * 1000) / 1000 }));
}
