// audio.js — the woods, heard. WebAudio, synthesised; no files. Reads sim,
// never writes it. The browser will not start sound until the player has
// pressed something, so `unlock` is called from the first input.

import { isNight } from "./sim.js";
import { notes, PLAYER_VOICE } from "./voice.js";

export function createAudio() {
  let ctx = null, master = null, noise = null;
  let wind = null, fire = null;
  let volume = 0.7;
  let chopClock = 0, stepClock = 0, crackleClock = 0;

  function unlock() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    wind = loop(400, 0.0);
    fire = loop(900, 0.0, "bandpass");
  }

  function loop(freq, gain, type = "lowpass") {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { f, g };
  }

  function burst({ freq = 800, q = 1, dur = 0.08, gain = 0.3, type = "bandpass", pan = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f); f.connect(g); g.connect(p); p.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, pan = 0, slide = 0, type = "sine", delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(f); f.connect(g); g.connect(p); p.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Pan for a world bearing (0 = north, clockwise, in eighths) relative to facing.
  function panFor(bearing, yaw) {
    const a = (bearing * Math.PI) / 4 - yaw;
    return Math.max(-1, Math.min(1, Math.sin(a)));
  }

  /** The dawn call: a far voice, two falling notes, from where it came from. */
  function call(bearing, yaw) {
    const pan = panFor(bearing, yaw);
    for (const [d, f] of [[0, 330], [0.55, 262], [2.2, 330], [2.75, 262]]) tone(f, 0.5, 0.18, pan, -30, "triangle", d);
  }

  // A whistle: the notes of one person's voice (voice.js).
  function whistleTone(pan, gain, voice) {
    for (const n of notes(voice)) tone(n.freq, n.dur, gain, pan, n.slide, "sine", n.at);
  }

  function event(e, sim) {
    if (!ctx) return;
    switch (e.kind) {
      case "stick": burst({ freq: 1800, dur: 0.06, gain: 0.25 }); break;
      case "dropped": for (let i = 0; i < 3; i++) setTimeout(() => burst({ freq: 500, dur: 0.1, gain: 0.3 }), i * 90); break;
      case "lit": burst({ freq: 300, dur: 0.6, gain: 0.4, type: "lowpass" }); break;
      case "cleared": burst({ freq: 120, dur: 1.2, gain: 0.8, type: "lowpass" }); break;
      case "pylonLit": tone(523, 1.4, 0.25); tone(784, 1.6, 0.18, 0, 0, "sine", 0.15); break;
      case "unmade": tone(196, 2.2, 0.3, 0, -60, "sawtooth"); break;
      case "sentHome": tone(659, 1.2, 0.2); tone(988, 1.4, 0.15, 0, 0, "sine", 0.2); break;
      case "whistle": whistleTone(0, 0.22, PLAYER_VOICE); break;
      case "answer": {
        // their whistle back: from where they are, fainter with distance
        const dx = e.x - sim.player.x, dy = e.y - sim.player.y, d = Math.hypot(dx, dy);
        const a = Math.atan2(dx, dy) - sim.player.yaw;
        whistleTone(Math.max(-1, Math.min(1, Math.sin(a))), Math.max(0.04, 0.16 * (1 - d / 60)), e.voice || PLAYER_VOICE);
        break;
      }
      case "dawn": if (sim.call) setTimeout(() => call(sim.call.bearing, sim.player.yaw), 600); break;
      case "rescued": tone(392, 0.8, 0.2); break;
    }
  }

  /** Every frame: wind by weather, fire by distance, steps, the axe. */
  function frame(sim, dt, moving, running) {
    if (!ctx) return;
    const weather = sim.weather[Math.floor((sim.time - 6) / 24) + 1];
    const t = ctx.currentTime;
    const w = weather === "wind" ? 0.22 : weather === "drizzle" ? 0.14 : 0.06;
    wind.g.gain.setTargetAtTime(w * (isNight(sim.time) ? 0.7 : 1), t, 0.5);
    wind.f.frequency.setTargetAtTime(weather === "drizzle" ? 2500 : 380 + Math.sin(t * 0.3) * 120, t, 0.5);

    const c = sim.camp;
    const dist = Math.hypot(c.x - sim.player.x, c.y - sim.player.y);
    const near = c.up && c.lit ? Math.max(0, 1 - dist / 25) : 0;
    fire.g.gain.setTargetAtTime(near * 0.08, t, 0.3);
    crackleClock -= dt;
    if (near > 0 && crackleClock <= 0) { crackleClock = 0.05 + Math.random() * 0.4; burst({ freq: 2000 + Math.random() * 2000, dur: 0.03, gain: near * 0.35, q: 3 }); }

    stepClock -= dt;
    if (moving && stepClock <= 0) { stepClock = running ? 0.3 : 0.45; burst({ freq: 400, dur: 0.07, gain: 0.12, type: "lowpass" }); }

    chopClock -= dt;
    if (sim.work?.kind === "chop" && chopClock <= 0) { chopClock = 0.55; burst({ freq: 220, dur: 0.12, gain: 0.5, q: 2 }); burst({ freq: 1400, dur: 0.04, gain: 0.2 }); }
  }

  function setVolume(v) { volume = v; if (master) master.gain.value = v; }

  return { unlock, frame, event, setVolume, call };
}
