// main.js — the loop and the wiring. Holds no rules of its own.

import * as S from "./sim.js";
import { sleep, canSleep } from "./night.js";
import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { createUI } from "./ui.js";
import { createTutorial, tutorialStep } from "./tutorial.js";
import { makeRoster } from "./names.js";
import { stream, hash } from "./rng.js";
import { chatter } from "./percept.js";
import * as Save from "./save.js";

const canvas = document.getElementById("view");
const renderer = createRenderer(canvas);
let sim = null;
let paused = true;
let lastSave = 0;
let chatClock = 0;

const input = createInput(canvas, (v) => verb(v));
const ui = createUI({
  paused: (on) => { paused = on; input.setEnabled(!on); },
  continueRun: () => start(Save.loadRun()),
  newRun: () => recruit(freshSeed()),
  tutorial: () => start(createTutorial()),
  toTitle: () => title(),
  finishTutorial: () => {
    const st = Save.settings(); st.tutorialDone = true; Save.saveSettings(st);
    ui.tutorialEnd({ newRun: () => recruit(freshSeed()), toTitle: title });
  },
});

// The seed is chosen once, at the start of a run, and everything after is a
// function of it. (Choosing it from the clock is fine; DERIVING the world from
// device state is what is forbidden.)
const freshSeed = () => (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;

function title() {
  sim = null;
  ui.hideHud();
  ui.title({ canContinue: Save.hasRun(), record: Save.runs() });
}

function recruit(seed) {
  const names = makeRoster(stream(hash("names", seed)), 5);
  ui.recruit(names, (team) => {
    const run = S.createRun({ seed, party: team });
    S.say(run, "You walk in at the south end of the trail. Camp is in the clearing ahead. North is the way through.");
    S.say(run, "Somewhere north, a deadfall lies across the trail.");
    start(run);
    Save.saveRun(run);
  }, () => recruit(freshSeed()));
}

function start(run) {
  if (!run) return title();
  sim = run;
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
    if (d > 5 || d < 0.01) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d)));
    if (ang < 0.45 && d < bd) { bd = d; best = m; }
  }
  return best;
}

const campVerbs = {
  strike: () => { if (S.strikeCamp(sim)) S.say(sim, "You start taking the camp down. Stand still; whoever is near helps."); },
  make: () => { if (S.makeCamp(sim)) S.say(sim, "You start making camp. Stand still; whoever is near helps."); },
  canStrike: () => S.canStrikeCamp(sim),
  canMake: () => S.canMakeCamp(sim),
  canSleep: () => canSleep(sim),
  sleep: () => doSleep(),
  plan: () => { sim.plan.pending = "dawn"; openPending(); },
  canWalkOut: () => !!sim.world.farSide && Math.hypot(sim.world.farSide.x - sim.player.x, sim.world.farSide.y - sim.player.y) < sim.world.farSide.r + 4,
  walkOut: () => ui.confirm("Walk out now? Whoever has not gone home stays here.", () => finish(S.walkOut(sim))),
};

function verb(v) {
  if (v === "escape") { if (ui.open && ui.open !== "title" && ui.open !== "recruit" && ui.open !== "end") ui.close(); return; }
  if (!sim || paused) return;
  switch (v) {
    case "act": {
      const r = S.act(sim);
      if (r?.kind === "home" && sim.home.lit >= S.homeCount(sim)) S.say(sim, "That was the last pylon here. Press C to walk out.");
      break;
    }
    case "ask": {
      const t = lookTarget();
      if (!t) { S.say(sim, "Look at someone to ask them."); break; }
      ui.ask(sim, t, (id, day) => S.askMember(sim, id, day));
      break;
    }
    case "call": {
      const heard = S.callOut(sim);
      S.say(sim, heard.length ? "You call out." : "You call out. Nothing comes back.");
      break;
    }
    case "camp": if (!sim.tutorial || sim.tut.step >= 8) ui.campMenu(sim, campVerbs); break;
    case "sleep": doSleep(); break;
    case "pause": ui.pause({ quit: () => { if (sim && !sim.tutorial) Save.saveRun(sim); title(); } }); break;
    case "help": ui.help(); break;
  }
}

function doSleep() {
  if (!canSleep(sim)) { S.say(sim, sim.tutorial ? "Not here." : "Not yet. Sleep comes at dusk."); return; }
  const go = () => {
    sleep(sim);
    Save.saveRun(sim);
    if (sim.plan.pending) openPending();
  };
  if (sim.camp.up && S.atCamp(sim, sim.player) && sim.plan.duskDone !== S.today(sim)) { sim.plan.pending = "dusk"; openPending(true); return; }
  if (!S.atCamp(sim, sim.player)) ui.confirm(sim.camp.up ? "Sleep here, away from the camp and its fire?" : "Sleep with no camp?", go);
  else go();
}

function openPending(sleepAfter = false) {
  if (sim.plan.pending === "dawn") {
    ui.dawnPlan(sim, (choice) => { S.setDawnPlan(sim, choice); sim.plan.dawnDay = S.today(sim); Save.saveRun(sim); });
  } else if (sim.plan.pending === "dusk") {
    ui.duskPlan(sim, (watch, sleepNow) => {
      S.setDuskPlan(sim, watch);
      if (sleepNow || sleepAfter) setTimeout(doSleep, 0);
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
  if (sim) {
    if (!paused) {
      const inp = input.read(dt);
      S.tick(sim, dt, inp);
      if (sim.wantSleep) { sim.wantSleep = false; sleep(sim); Save.saveRun(sim); }
      if (sim.plan.pending && !ui.open) openPending();
      for (const e of sim.events) if (e.kind === "over") finish(sim.over);
      sim.events.length = 0;
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
    const step = sim.tutorial ? tutorialStep(sim) : null;
    ui.hud(sim, { action: paused ? null : S.resolveAction(sim), target: paused ? null : lookTarget(), step });
    renderer.draw(sim, dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => { if (document.hidden && sim && !sim.tutorial) Save.saveRun(sim); });

// touch buttons
for (const b of document.querySelectorAll("#touchbar button")) b.addEventListener("click", (e) => { e.preventDefault(); verb(b.dataset.verb); });

title();

// for tests and the curious
window.__sevin = { get sim() { return sim; }, S, verb, input, ui, start, recruit, title, createTutorial, sleep: () => doSleep() };
