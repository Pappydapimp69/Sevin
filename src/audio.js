// audio.js — the woods, heard. WebAudio, synthesised; no files. Reads sim,
// never writes it. The browser will not start sound until the player has
// pressed something, so `unlock` is called from the first input.

import { isNight } from "./sim.js";
import { notes, phrase, PLAYER_VOICE, callNotes } from "./voice.js";

export function createAudio() {
  let ctx = null, master = null, noise = null;
  let wind = null, fire = null, bed = [];
  let volume = 0.7;
  let behindClock = 20, chopClock = 0, stepClock = 0, crackleClock = 0, whisperClock = 20;

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
    // the title bed: two soft detuned drones, a fifth apart
    bed = [55, 82.5].map((f, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; o.detune.value = i ? 5 : -4;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(master); o.start();
      return g;
    });
  }

  /**
   * The audio stream begins here, on the player's first act: the studio
   * sting (three soft rising notes) and the bed under the title (wind and a
   * low drone). `titleBed(false)` lets the game's own wind take over.
   */
  function begin() {
    unlock();
    if (!ctx) return;
    [[392, 0], [523.25, 0.32], [783.99, 0.64]].forEach(([f, d]) => tone(f, 1.8, 0.16, 0, 0, "sine", d));
    titleBed(true);
  }
  function titleBed(on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    wind.g.gain.setTargetAtTime(on ? 0.07 : 0, t, on ? 1.5 : 0.4);
    wind.f.frequency.setTargetAtTime(420, t, 0.5);
    for (const g of bed) g.gain.setTargetAtTime(on ? 0.05 : 0, t, on ? 2.5 : 0.6);
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

  // A whistle: one phrase (voice.js), each note with its own loudness.
  function whistleTone(pan, gain, notesList) {
    for (const n of notesList) tone(n.freq, n.dur, gain * (n.gain ?? 1), pan, n.slide, "sine", n.at);
  }

  function event(e, sim) {
    if (!ctx) return;
    switch (e.kind) {
      case "hiss": burst({ freq: 6000, q: 0.6, dur: 0.9, gain: 0.16, type: "highpass" }); burst({ freq: 3500, q: 1, dur: 0.6, gain: 0.08 }); break;
      case "stick": burst({ freq: 1800, dur: 0.06, gain: 0.25 }); break;
      case "dropped": for (let i = 0; i < 3; i++) setTimeout(() => burst({ freq: 500, dur: 0.1, gain: 0.3 }), i * 90); break;
      case "lit": burst({ freq: 300, dur: 0.6, gain: 0.4, type: "lowpass" }); break;
      case "cleared": burst({ freq: 120, dur: 1.2, gain: 0.8, type: "lowpass" }); break;
      case "pylonLit": tone(523, 1.4, 0.25); tone(784, 1.6, 0.18, 0, 0, "sine", 0.15); break;
      case "unmade": tone(196, 2.2, 0.3, 0, -60, "sawtooth"); break;
      case "sentHome": tone(659, 1.2, 0.2); tone(988, 1.4, 0.15, 0, 0, "sine", 0.2); break;
      case "whistle": {
        // held: longer and louder
        const pw = e.power || 1, ph = (e.ctx ? phrase(PLAYER_VOICE, e.ctx, true) : notes(PLAYER_VOICE)).map((n) => ({ ...n, dur: n.dur * pw, at: n.at * pw }));
        whistleTone(0, 0.22 * Math.min(1.6, pw), ph); break;
      }
      case "answer": {
        // their whistle back: from where they are, fainter with distance
        const dx = e.x - sim.player.x, dy = e.y - sim.player.y, d = Math.hypot(dx, dy);
        const a = Math.atan2(dx, dy) - sim.player.yaw;
        let ph = e.ctx ? phrase(e.voice || PLAYER_VOICE, e.ctx) : notes(e.voice || PLAYER_VOICE);
        // distressed: higher, faster, again
        if (e.distress) ph = [...ph, ...ph.map((n) => ({ ...n, at: n.at + 0.5 }))].map((n) => ({ ...n, freq: n.freq * 1.12, dur: n.dur * 0.6, at: n.at * 0.55 }));
        whistleTone(Math.max(-1, Math.min(1, Math.sin(a))), Math.max(0.04, 0.16 * (1 - d / (e.distress || d > 30 ? 80 : 30))), ph);
        break;
      }
      case "dawn": if (sim.call) setTimeout(() => call(sim.call.bearing, sim.player.yaw), 600); break;
      case "seal": burst({ freq: 90, dur: 1.4, gain: 0.7, type: "lowpass" }); tone(70, 1.8, 0.2, 0, -25, "sawtooth"); break;
      case "shown": tone(523, 2.2, 0.1, 0, 0, "triangle"); tone(622, 2.4, 0.08, 0, 0, "triangle", 0.2); break;
      case "restore": burst({ freq: 300, dur: 0.8, gain: 0.3, type: "lowpass" }); break;
      case "gone": tone(440, 1.2, 0.12, 0, -300, "sine"); break;
      case "sing": whistleTone(0, 0.13, e.ctx ? phrase(e.voice, e.ctx) : notes(e.voice)); break;
      case "wake": tone(110, 2.4, 0.08, 0, -10, "sine"); break;
      case "gchop": burst({ freq: 260, dur: 0.12, gain: 0.45, q: 2 }); burst({ freq: 2400, dur: 0.05, gain: 0.12 }); break;
      case "gdrop": burst({ freq: e.fruit ? 160 : 700, dur: 0.25, gain: 0.35, type: "lowpass" }); break;
      case "silence": tone(330, 1.6, 0.05, 0, -120, "sine"); break;
      case "reveal": tone(98, 2.8, 0.25, 0, -20, "sawtooth"); tone(104, 2.8, 0.2, 0, -20, "sawtooth"); break;
      case "glowOn": tone(880, 1.5, 0.08); tone(1320, 1.8, 0.05, 0, 0, "sine", 0.1); break;
      case "ate": tone(220, 3, 0.1, 0, -110, "triangle"); break;
      case "padnote": whistleTone(0, 0.12, callNotes(PLAYER_VOICE, e.key)); break;
      case "call": whistleTone(0, e.voice ? 0.14 : 0.2, callNotes(e.voice || PLAYER_VOICE, e.call)); break;
      case "callanswer": {
        const dx = e.x - sim.player.x, dy = e.y - sim.player.y, d = Math.hypot(dx, dy);
        const pan = Math.max(-1, Math.min(1, Math.sin(Math.atan2(dx, dy) - sim.player.yaw)));
        setTimeout(() => whistleTone(pan, Math.max(0.04, 0.16 * (1 - d / 80)), callNotes(e.voice, e.call)), (e.delay || 1) * 1000);
        break;
      }
      case "crawl": {
        // joints cracking, wet and dry, a hundred small ones and a few big ones
        for (let i = 0; i < 40; i++) setTimeout(() => burst({ freq: 900 + Math.random() * 4500, q: 6, dur: 0.015 + Math.random() * 0.03, gain: 0.12 + Math.random() * 0.25, pan: Math.random() * 1.4 - 0.7 }), Math.random() * 1400);
        for (let i = 0; i < 5; i++) setTimeout(() => burst({ freq: 180 + Math.random() * 200, q: 3, dur: 0.12, gain: 0.5, type: "lowpass" }), 100 + Math.random() * 1200);
        tone(70, 1.6, 0.12, 0, -25, "sawtooth");
        break;
      }
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
    const near = c.up && c.lit ? Math.max(0, 1 - dist / 6.25) : 0;      // the fire is heard close to, and gone fast
    fire.g.gain.setTargetAtTime(near * 0.08, t, 0.3);
    crackleClock -= dt;
    if (near > 0 && crackleClock <= 0) { crackleClock = 0.05 + Math.random() * 0.4; burst({ freq: 2000 + Math.random() * 2000, dur: 0.03, gain: near * 0.35, q: 3 }); }

    stepClock -= dt;
    if (moving && stepClock <= 0) { stepClock = running ? 0.3 : 0.45; burst({ freq: 400, dur: 0.07, gain: 0.12, type: "lowpass" }); }

    // a failing mind hears someone walking behind it
    behindClock -= dt;
    if (sim.player.sanity < 0.5 && behindClock <= 0) {
      behindClock = 18 + Math.random() * 24;
      for (let i = 0; i < 5; i++) setTimeout(() => burst({ freq: 380, dur: 0.08, gain: 0.14, type: "lowpass", pan: -0.3 + (i % 2) * 0.6 }), i * 420);
    }

    // whispers at the edge of hearing, from one side, too quiet to be words
    whisperClock -= dt;
    if (sim.player.sanity < 0.55 && !sim.tutorial && whisperClock <= 0) {
      whisperClock = 14 + Math.random() * 30;
      const pan = Math.random() < 0.5 ? -0.8 : 0.8;
      for (let i = 0; i < 6; i++) setTimeout(() => burst({ freq: 2600 + Math.random() * 1800, q: 4, dur: 0.18, gain: 0.05, pan }), i * 150 + Math.random() * 80);
    }

    // while one is coming: legs on leaves, joints clicking
    if (sim.phantom?.crawl && Object.keys(sim.phantom.crawl).length && Math.random() < dt * 22) burst({ freq: 1500 + Math.random() * 3500, q: 5, dur: 0.02, gain: 0.14 + Math.random() * 0.12 });

    chopClock -= dt;
    if (sim.work?.kind === "chop" && chopClock <= 0) { chopClock = 0.55; burst({ freq: 220, dur: 0.12, gain: 0.5, q: 2 }); burst({ freq: 1400, dur: 0.04, gain: 0.2 }); }
  }

  function setVolume(v) { volume = v; if (master) master.gain.value = v; }

  return { unlock, begin, titleBed, frame, event, setVolume, call, get running() { return !!ctx && ctx.state === "running"; } };
}
