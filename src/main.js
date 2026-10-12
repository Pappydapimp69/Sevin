// main.js — the loop and the wiring. Holds no rules of its own.

import * as S from "./sim.js";
import { sleep, dawn, canSleep, BEARINGS, bearingOf, swapOut } from "./night.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { createUI } from "./ui.js";
import { createTutorial, tutorialStep, STEPS } from "./tutorial.js";
import { makeRoster } from "./names.js";
import { stream, hash } from "./rng.js";
import { chatter, verses, shownWood, voiceLine, kinAtTheEdge } from "./percept.js";
import * as Grove from "./grove.js";
import { glyphs } from "./voice.js";
import * as Save from "./save.js";
import { createAudio } from "./audio.js";
import { STUDIO, GAME, splashPrompt, skipSplash } from "./splash.js";

const canvas = document.getElementById("view");
const renderer = createRenderer(canvas);
let sim = null;
let paused = true;
let lastSave = 0;
let chatClock = 0, voiceClock = 0;

const audio = createAudio();
const input = createInput(canvas, (v, a) => { audio.unlock(); verb(v, a); }, { onScheme: () => { ui.rekey(); paintSplash(); }, onTap: (x, y) => tap(x, y) });
// Touch aims coarsely: wider reach and facing cone there (Brain: touch
// tolerance, not an easier game).
const tolerance = () => (input.state.scheme === "touch" ? 1.4 : 1);
const prefs = Save.settings();
const ui = createUI({
  paused: (on) => { paused = on; input.setEnabled(!on); },
  setMenu: (m) => input.setMenu(m),
  callFor: (m) => S.callFor(sim, m),
  playCall: (call, ms) => { audio.event({ kind: "call", call }, sim); ms.forEach((m, i) => setTimeout(() => audio.event({ kind: "call", voice: m.voice, call: S.callFor(sim, m) }, sim), 1400 + i * 1500)); },
  scheme: () => input.state.scheme,
  settings: () => prefs,
  applySettings: (st) => { applySettings(st); Save.saveSettings(st); },
  continueRun: () => start(Save.loadRun()),
  newRun: () => recruit(freshSeed()),
  tutorial: () => start(createTutorial()),
  toTitle: () => title(),
  finishTutorial: () => ui_finishTutorial(),
});

function applySettings(st) {
  input.state.sens = st.sens;
  audio.setVolume(st.volume);
  renderer.setFov(st.fov);
  renderer.setCalm(st.calm);
  document.documentElement.style.setProperty("--ui", { small: "13px", normal: "16px", large: "20px" }[st.ui] || "16px");
}
applySettings(prefs);
// The browser starts sound only after a gesture.
for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, () => audio.unlock(), { passive: true });

// The seed is chosen once, at the start of a run, and everything after is a
// function of it. (Choosing it from the clock is fine; DERIVING the world from
// device state is what is forbidden.)
const freshSeed = () => (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;

function ui_finishTutorial() {
  prefs.tutorialDone = true; Save.saveSettings(prefs);
  ui.tutorialEnd({ newRun: () => recruit(freshSeed()), toTitle: title });
}

function title() {
  sim = null;
  audio.titleBed(true);
  ui.hideHud();
  ui.title({ canContinue: Save.hasRun(), record: Save.runs() });
}

function recruit(seed) {
  sim = null;                // nothing behind the choice: no training text, no HUD
  ui.hideHud();
  const names = makeRoster(stream(hash("names", seed)), 5);
  ui.recruit(names, (team) => {
    const run = S.createRun({ seed, party: team });
    S.say(run, `You walk in at the south end of the trail with the camp kit. Mark where the camp goes from the camp menu: the team brings wood there, and ${S.CAMP_WOOD} from that pile makes the camp.`);
    S.say(run, "Somewhere north, a deadfall lies across the trail.");
    start(run);
    Save.saveRun(run);
  }, () => recruit(freshSeed()));
}

function start(run) {
  if (!run) return title();
  sim = run;
  audio.titleBed(false);
  ui.resetLog();
  input.state.yaw = sim.player.yaw;
  input.state.pitch = sim.player.pitch;
  ui.close();
  if (!sim.tutorial && sim.plan.pending) openPending();
}

// ---------------------------------------------------------------- verbs

function lookTarget() {
  if (!sim) return null;
  const p = sim.player;
  const fx = Math.sin(p.yaw), fy = Math.cos(p.yaw);
  let best = null, bd = Infinity;
  for (const m of S.party(sim)) {
    const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
    if (d > 5 * tolerance() || d < 0.01) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d)));
    if (ang < 0.45 * tolerance() && d < bd) { bd = d; best = m; }
  }
  return best;
}

const campVerbs = {
  strike: () => { if (S.strikeCamp(sim)) S.say(sim, "You start taking the camp down. Stand still; whoever is near helps."); },
  make: () => { if (S.makeCamp(sim) && sim.work?.kind === "make") S.say(sim, "You lend a hand with the camp. Stand still; moving stops."); },
  canStrike: () => S.canStrikeCamp(sim),
  canMake: () => S.canMakeCamp(sim),
  canMark: () => S.canMarkSite(sim),
  mark: () => S.markSite(sim),
  canSleep: () => canSleep(sim),
  sleep: () => doSleep(),
  plan: () => { sim.plan.pending = "dawn"; openPending(); },
  canWalkOut: () => !!sim.world.farSide && Math.hypot(sim.world.farSide.x - sim.player.x, sim.world.farSide.y - sim.player.y) < sim.world.farSide.r + 4,
  evening: () => !sim.tutorial && S.atCamp(sim, sim.player) && S.hourOf(sim.time) >= S.DUSK && S.hourOf(sim.time) < S.EVENING_END && S.party(sim).length > 0,
  sing: (after) => {
    sim.songs = (sim.songs || 0) + 1;
    sim.sangDay = S.today(sim);
    const vs = verses(sim, sim.songs);
    if (!vs.length) { after?.(); return; }
    ui.song(vs, {
      sing: (v) => { S.say(sim, `${v.name} sings: “${v.line}”`, "talk"); audio.event({ kind: "sing", voice: v.voice }, sim); },
      done: () => { S.pass(sim, 0.5); after?.(); },
    });
  },
  learn: (after) => {
    const people = S.party(sim).filter((m) => S.atCamp(sim, m) && !m.sleeping);
    if (!people.length) { S.say(sim, "Nobody is up to whistle."); after?.(); return; }
    ui.learn(sim, people, {
      callOf: (m) => S.callFor(sim, m),
      play: (m) => audio.event({ kind: "call", voice: m.voice, call: S.callFor(sim, m) }, sim),
      note: (k) => audio.event({ kind: "padnote", key: k }, sim),
      noteAs: (m, k) => audio.event({ kind: "call", voice: m.voice, call: k }, sim),
      wrong: () => audio.event({ kind: "padwrong" }, sim),
      flourish: (m) => audio.event({ kind: "flourish", voice: m.voice, call: S.callFor(sim, m) }, sim),
      // remembered under the name, as heard from whoever whistled it
      learned: (m) => { (sim.learned ||= {})[m.name] = S.callFor(sim, m); },
      done: () => { S.pass(sim, 0.25); after?.(); },
    });
  },
  round: () => {
    const ps = S.party(sim).filter((m) => S.atCamp(sim, m));
    ps.forEach((m, i) => setTimeout(() => { if (sim) { S.say(sim, `${m.name} whistles.`, "talk"); audio.event({ kind: "sing", voice: m.voice, ctx: S.whistleCtx(sim, m) }, sim); } }, i * 2200));
    S.pass(sim, 0.25);
  },
  eat: () => { Grove.eat(sim); },
  bury: (i) => { Grove.bury(sim, i); S.pass(sim, 1); },
  burn: (i) => { Grove.burn(sim, i); },
  askHead: (i) => {
    const r = sim.remains[i];
    // the dead cannot be fakes: the record as it was, once
    ui.ask(sim, { id: r.msId, name: r.name + "'s head", head: true }, (id, day) => { if (r.asked) { S.say(sim, "It says nothing more."); return false; } r.asked = true; S.pass(sim, S.ASK_HOURS); return true; });
  },
  walkOut: () => ui.confirm("Walk out now? Whoever has not gone home stays here.", () => finish(S.walkOut(sim))),
};

function verbAct(target) {
  S.begin(sim, target, tolerance());
}

function verb(v, arg) {
  if (v === "escape") { if (ui.open && ui.open !== "title" && ui.open !== "recruit" && ui.open !== "end") ui.close(); return; }
  if (!sim || paused) return;
  switch (v) {
    case "act": {
      if (sim.tutorial && tutorialStep(sim)?.id === "end") { ui_finishTutorial(); break; }
      verbAct(null);
      break;
    }
    case "call": {
      // a tap is a whistle; hold it and the pad comes up, to play someone's call
      if ((arg || 0) >= 0.45) { openPad(); break; }
      S.whistle(sim, 1);
      S.say(sim, "You whistle.");
      kinAnswers();
      { const l = voiceLine(sim, "whistle", sim.stats.whistles); if (l) setTimeout(() => sim && S.say(sim, l, "talk"), 1800); }
      break;
    }
    case "camp": if (!sim.tutorial || STEPS[sim.tut.step]?.id === "strike" || STEPS[sim.tut.step]?.id === "end") ui.campMenu(sim, campVerbs); break;
    case "sleep": doSleep(); break;
    case "pause": ui.pause({ quit: () => { if (sim && !sim.tutorial) Save.saveRun(sim); title(); } }); break;
    case "help": ui.help(); break;
  }
}

// A tap on the world acts on whatever is under the finger, if it is in reach.
function tap(x, y) {
  if (!sim || paused) return;
  // a tap on someone does nothing (Ask is its own button); it reaches what is behind them
  const hit = renderer.pick(x, y, ["member"]);
  if (!hit) return;
  const kinds = hit.kind === "fire" ? ["snap", "light", "feed"] : [hit.kind];
  const all = S.actionTargets(sim, tolerance());
  const t = kinds.map((k) => all.find((a) => a.kind === k && a.id === hit.id)).find(Boolean);
  if (!t) {
    // wood is not offered to full arms: say that, not "too far"
    const full = shownWood(sim) >= S.carryMax(sim);
    const glowFull = (sim.player.glows?.length || 0) >= S.GLOW_MAX;
    if ((hit.kind === "stick" && full) || (hit.kind === "gpick" && (full || glowFull))) { S.say(sim, "Your arms are full."); return; }
    S.say(sim, "Too far. Walk closer."); return;
  }
  if (sim.tutorial && tutorialStep(sim)?.id === "end") return;
  verbAct(t);
}

function kinAnswers() {
  const kin = kinAtTheEdge(sim);
  if (!kin || sim.kinGone?.[kin.key]) return;
  setTimeout(() => { if (!sim) return; audio.event({ kind: "callanswer", x: kin.x, y: kin.y, voice: kin.voice, call: kin.call, delay: 0 }, sim); S.say(sim, `A call back, from the edge of the firelight:  ${glyphs(kin.call)}`); }, 1400);
}

function openPad() {
  ui.whistlePad(sim, sim.learned, {
    note: (k) => audio.event({ kind: "padnote", key: k }, sim),
    send: (seq) => {
      if (seq.length < 4) { S.whistle(sim, 1); S.say(sim, "You whistle."); return; }
      audio.event({ kind: "call", call: seq }, sim);
      S.say(sim, "You whistle a call.");
      S.playCall(sim, seq);
    },
  });
}

function doSleep() {
  if (!canSleep(sim)) { S.say(sim, sim.tutorial ? "Not here." : "Not yet. Sleep comes at dusk."); return; }
  const atFire = sim.camp.up && S.atCamp(sim, sim.player);
  // Ending the day before ten: the fire first. Talk, then a song, then the watch, then the tents.
  // After ten there is no song; whoever is still up turns in.
  if (atFire && S.hourOf(sim.time) < S.EVENING_END && S.hourOf(sim.time) >= S.DUSK - 1 && sim.sangDay !== S.today(sim) && S.party(sim).some((m) => !m.sleeping)) {
    campEvening(() => doSleep());
    return;
  }
  // the watch is said to someone awake; come back after they have all turned in and there is nobody to ask
  if (atFire && sim.plan.duskDone !== S.today(sim) && S.party(sim).some((m) => S.atCamp(sim, m) && !m.sleeping)) { sim.plan.pending = "dusk"; openPending(true); return; }
  if (!S.atCamp(sim, sim.player)) { ui.confirm(sim.camp.up ? "Sleep here, away from the camp and its fire?" : "Sleep with no camp?", () => goToSleep()); return; }
  goToSleep();
}

// The end of the day at the fire: a little talk, then everyone sings a verse of
// today. Nobody turns in while it lasts.
function campEvening(then) {
  sim.campEvent = true;
  sim.sangDay = S.today(sim);
  // Whoever is still out is called in, and the song waits for them (a while, not forever).
  const out = S.party(sim).filter((m) => !m.sleeping && !S.atCamp(sim, m));
  if (out.length) {
    S.say(sim, "You call them in to the fire.", "talk");
    for (const m of out) { m.called = false; m.summonUntil = null; m.state = "home"; m.goal = { x: sim.camp.x, y: sim.camp.y }; }
    const t0 = performance.now();
    const wait = () => {
      if (!sim) return;
      const still = S.party(sim).filter((m) => !m.sleeping && !S.atCamp(sim, m));
      if (still.length && performance.now() - t0 < 15000) return setTimeout(wait, 500);
      startSong(then);
    };
    return setTimeout(wait, 500);
  }
  startSong(then);
}
function startSong(then) {
  const ps = S.party(sim).filter((m) => S.atCamp(sim, m) && !m.sleeping);
  const talk = ps.slice(0, 3).map((m, i) => `${m.name}: “${chatter(sim, m, Math.floor(sim.time * 3) + i)}”`);
  S.say(sim, "Everyone comes in close to the fire.", "talk");
  talk.forEach((line, i) => setTimeout(() => sim && S.say(sim, line, "talk"), 1200 + i * 2200));
  const t0 = 1200 + talk.length * 2200;
  setTimeout(() => {
    if (!sim) return;
    // the song, then each one whistles their call and you play it back
    campVerbs.sing(() => { if (!sim) return; S.say(sim, "Then, one by one, they whistle their calls for you to learn.", "talk"); campVerbs.learn(() => { sim.campEvent = false; if (!scene) then(); }); });
  }, t0);
}

// ---------------------------------------------------------------- the night
// Going to sleep is a scene, not a cut: into the tent (or down on the ground),
// the light goes, the hours go by on a clock, and the morning comes up. The
// night itself is resolved in the dark, once, by night.js.
let scene = null;
const fade = document.getElementById("fade");
const SCENE = { settle: 2.4, dark: 1.0, hours: 4.2, wake: 1.4 };

function goToSleep(collapsed = false) {
  if (scene || !sim) return;
  const p = sim.player;
  const from = { x: p.x, y: p.y, h: 1.65, yaw: p.yaw, pitch: p.pitch };
  let to;
  if (!collapsed && sim.camp.up && S.atCamp(sim, p)) {
    // the nearer of the two tents, from its open side
    const tents = S.TENTS.map((t) => ({ x: sim.camp.x + t.dx, y: sim.camp.y + t.dy }));
    const tent = tents.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    const yaw = Math.atan2(tent.x - p.x, tent.y - p.y);
    // walk to the opening, where the tent fills the view; then duck in
    var door = { x: tent.x - Math.sin(yaw) * 2.6, y: tent.y - Math.cos(yaw) * 2.6, h: 1.5, yaw, pitch: -0.12 };
    to = { x: tent.x - Math.sin(yaw) * 0.5, y: tent.y - Math.cos(yaw) * 0.5, h: 0.6, yaw, pitch: -0.05 };
  } else {
    to = { x: p.x, y: p.y, h: 0.25, yaw: p.yaw, pitch: 0.9 };    // down on the ground, eyes on the canopy
  }
  scene = { t: 0, phase: "settle", from, to, door: typeof door === "undefined" ? null : door, startTime: sim.time, startDay: S.today(sim), rough: !(sim.camp.up && S.atCamp(sim, p)), collapsed };
  paused = true; input.setEnabled(false);
  fade.hidden = false; fade.style.opacity = 0;
  document.getElementById("fadeClock").textContent = "";
  document.getElementById("fadeDay").textContent = "";
  document.getElementById("fadeNote").textContent = "";
}

const ease = (k) => k * k * (3 - 2 * k);
function lerpCam(a, b, k) {
  let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, h: a.h + (b.h - a.h) * k, yaw: a.yaw + dy * k, pitch: a.pitch + (b.pitch - a.pitch) * k };
}

/** Advance the scene; returns the camera to draw from, or null when it is over. */
function tickScene(dt) {
  const sc = scene;
  sc.t += dt;
  const $ = (id) => document.getElementById(id);
  if (sc.phase === "settle") {
    const raw = Math.min(1, sc.t / SCENE.settle), k = ease(raw);
    fade.style.opacity = String(Math.max(0, (raw - 0.75) / 0.25) * 0.6);
    if (sc.t >= SCENE.settle) { sc.phase = "dark"; sc.t = 0; }
    if (!sc.door) return lerpCam(sc.from, sc.to, k);
    return raw < 0.7 ? lerpCam(sc.from, sc.door, ease(raw / 0.7)) : lerpCam(sc.door, sc.to, ease((raw - 0.7) / 0.3));
  }
  if (sc.phase === "dark") {
    fade.style.opacity = String(0.6 + 0.4 * Math.min(1, sc.t / SCENE.dark));
    if (sc.t >= SCENE.dark) {
      // the night happens here, in the dark, once
      sleep(sim);
      Save.saveRun(sim);
      sc.endTime = sim.time;
      sc.phase = "hours"; sc.t = 0;
      $("fadeNote").textContent = sc.collapsed ? "You do not remember lying down." : sc.rough ? "You sleep where you are." : "";
    }
    return sc.to;
  }
  if (sc.phase === "hours") {
    const k = Math.min(1, sc.t / SCENE.hours);
    const t = sc.startTime + (sc.endTime - sc.startTime) * ease(k);
    $("fadeClock").textContent = S.clock(t);
    $("fadeDay").textContent = `DAY ${S.dayOf(t)}`;
    if (k >= 1) { sc.phase = "wake"; sc.t = 0; $("fadeNote").textContent = ""; }
    return sc.to;
  }
  // wake: the morning comes up where you lay down
  const k = Math.min(1, sc.t / SCENE.wake);
  fade.style.opacity = String(1 - ease(k));
  if (k >= 0.4) { $("fadeClock").textContent = ""; $("fadeDay").textContent = ""; }
  if (k >= 1) {
    fade.hidden = true; scene = null;
    paused = false; input.setEnabled(true);
    if (sim.plan.pending) openPending();
    return null;
  }
  return lerpCam(sc.to, { ...sc.from, x: sim.player.x, y: sim.player.y, pitch: 0 }, ease(k));
}

function openPending(sleepAfter = false) {
  if (sim.plan.pending === "choose") {
    const pair = S.twins(sim)[0];
    if (!pair) { sim.plan.pending = "dawn"; return openPending(); }
    ui.choose(sim, pair.slice(0, 2), (keep, go) => { S.chooseTwin(sim, keep, go); Save.saveRun(sim); if (sim.plan.pending) openPending(); });
  } else if (sim.plan.pending === "dawn") {
    ui.dawnPlan(sim, (choice) => { S.setDawnPlan(sim, choice); Save.saveRun(sim); });
  } else if (sim.plan.pending === "dusk") {
    ui.duskPlan(sim, (watch, sleepNow) => {
      S.setDuskPlan(sim, watch);
      if (sleepNow || sleepAfter || S.hourOf(sim.time) >= S.EVENING_END) setTimeout(doSleep, 0);
    }, () => S.tendFire(sim));
  }
}

function finish(over) {
  if (!over) return;
  Save.recordRun(over);
  Save.clearRun();
  ui.end(over, { toTitle: title });
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (paused) input.pollMenu();
  if (sim) {
    if (!paused) {
      const inp = input.read(dt);
      S.tick(sim, dt, inp);
      audio.frame(sim, dt, Math.abs(inp.fwd) + Math.abs(inp.side) > 0.1, inp.sprint);
      if (sim.wantSleep) { sim.wantSleep = false; goToSleep(false); }
      // the training's call round comes to you; closed unfinished, it comes back
      if (sim.tutorial && tutorialStep(sim)?.id === "learn" && !ui.open && performance.now() > (sim.tut.learnAt || 0)) { sim.tut.learnAt = performance.now() + 4000; campVerbs.learn(); }
      if (sim.wantDawn) { sim.wantDawn = false; dawn(sim); Save.saveRun(sim); if (sim.plan.pending) openPending(); }
      if (sim.plan.pending && !ui.open) openPending();
      // the voices: unbidden now and then; the rest are answers to what you do
      voiceClock += dt;
      if (voiceClock > 22) { voiceClock = 0; const l = voiceLine(sim, "idle", Math.floor(sim.time * 3)); if (l) S.say(sim, l, "talk"); }
      // the one at the edge of the firelight: walk up to it and it is gone; whistle and it answers, one note off
      const kin = kinAtTheEdge(sim);
      if (kin && !sim.kinGone?.[kin.key] && Math.hypot(kin.x - sim.player.x, kin.y - sim.player.y) < 8) (sim.kinGone ||= {})[kin.key] = true;
      // someone says something now and then
      chatClock += dt;
      if (chatClock > 25 && !sim.tutorial) {
        chatClock = 0;
        const near = S.party(sim).filter((m) => Math.hypot(m.x - sim.player.x, m.y - sim.player.y) < 10);
        if (near.length) {
          const m = near[Math.floor((sim.time * 7) % near.length)];
          S.say(sim, `${m.name}: “${chatter(sim, m, Math.floor(sim.time * 3))}”`, "talk");
        }
      }
      if (!sim.tutorial && now - lastSave > 15000) { lastSave = now; Save.saveRun(sim); }
    }
    // the night scene holds the camera; its fire still crackles
    const cam = scene ? tickScene(dt) : null;
    if (scene) audio.frame(sim, dt, false, false);
    // events: sound, and the end of a run; drained whether or not paused,
    // but held through the night scene so morning sounds come at morning
    if (!scene) for (const e of sim.events) {
      audio.event(e, sim);
      if (e.kind === "over") finish(sim.over);
      if (e.kind === "stick" || e.kind === "gchop" || e.kind === "felled") { const l = voiceLine(sim, e.kind === "stick" ? "stick" : "work", Math.floor(sim.time * 20)); if (l) S.say(sim, l, "talk"); }
      // a whistle back is heard, not seen: say where it came from
      if (e.kind === "answer") S.say(sim, `A whistle back, from the ${BEARINGS[S.seenBearing(sim, bearingOf(sim.player, e))]}.`);
      if (e.kind === "callanswer") setTimeout(() => sim && S.say(sim, `A call back, from the ${BEARINGS[S.seenBearing(sim, bearingOf(sim.player, e))]}:  ${glyphs(e.call)}`), (e.delay || 1) * 1000);
    }
    if (!scene) sim.events.length = 0;
    const step = sim.tutorial ? tutorialStep(sim) : null;
    const action = paused ? null : S.resolveAction(sim, tolerance());
    if (scene) ui.hideHud(); else ui.hud(sim, { action, target: paused ? null : lookTarget(), step });
    renderer.draw(sim, dt, { target: scene ? null : action, cam });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => { if (document.hidden && sim && !sim.tutorial) Save.saveRun(sim); });

// touch buttons
for (const b of document.querySelectorAll("#touchbar button")) {
  // a long press is ours (the whistle pad), not the browser's menu or text selection
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  if (b.dataset.verb === "call") {
    let t0 = null;
    b.addEventListener("pointerdown", () => { t0 = performance.now(); });
    const up = () => { if (t0 != null) { const d = (performance.now() - t0) / 1000; t0 = null; verb("call", d); } };
    b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up);
  } else b.addEventListener("click", (e) => { e.preventDefault(); verb(b.dataset.verb); });
}

// ---------------------------------------------------------------- the studio card
const splashEl = document.getElementById("splash");
function paintSplash() {
  document.getElementById("splashPrompt").textContent = splashPrompt(input.state.scheme);
}
let splashUp = false;
function endSplash() {
  if (!splashUp) return;
  splashUp = false;
  input.setMenu(null);
  audio.begin();                      // the gesture that starts the sound
  splashEl.classList.add("gone");
  // The title waits for the card to fade. Shown at once, it would sit under
  // the finger or the held key that dismissed the card and take its release
  // (or its key repeat) as a press.
  setTimeout(() => { splashEl.hidden = true; title(); }, 950);
}
function splash() {
  document.getElementById("splashStudio").textContent = STUDIO;
  document.getElementById("splashGame").textContent = GAME;
  paintSplash();
  splashEl.hidden = false;
  splashUp = true;
  hudHide();
  // any key, any pad button, any tap
  input.setMenu({ nav() {}, confirm: endSplash, cancel: endSplash, any: endSplash });
  splashEl.addEventListener("click", endSplash);       // a finished tap or click, not the press
}
const hudHide = () => ui.hideHud();

if (skipSplash(location.hash, location.search)) title(); else splash();

// for tests and the curious
window.__sevin = { Grove, swapOut, get sim() { return sim; }, get scene() { return scene; }, get splashUp() { return splashUp; }, S, verb, input, audio, renderer, tap, ui, start, recruit, title, createTutorial, sleep: () => doSleep() };
