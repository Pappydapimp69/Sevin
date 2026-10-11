// save.js — the ONLY localStorage caller. Keys are namespaced `sevin:*`
// because GitHub Pages serves every project of an account from one origin.

import { SAVE_VERSION, attach, snapshot } from "./sim.js";
import { makeVoice, bendVoice } from "./voice.js";
import { fillSkills } from "./skills.js";
import { fresh as freshPhantom } from "./phantom.js";

const RUN = "sevin:run", RUNS = "sevin:runs", SETTINGS = "sevin:settings";

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const del = (k) => { try { localStorage.removeItem(k); } catch {} };

export function saveRun(sim) {
  if (sim.tutorial || sim.over) return false;
  return set(RUN, snapshot(sim));
}

export function loadRun() {
  const raw = get(RUN);
  if (!raw) return null;
  try {
    const sim = JSON.parse(raw);
    if (sim.v !== SAVE_VERSION) return null;
    sim.msgs = []; sim.events = [];
    sim.phantom ||= freshPhantom();
    // a run already past the third morning has had its keystone (or never will)
    sim.keystone ||= { done: true, active: false, order: [], nextAt: 0 };
    for (const m of sim.members) m.away ||= false;
    // saves from before there were five skills: the new ones at 0 (a missing
    // one would be undefined, and arithmetic on it NaN, quietly, in the night)
    for (const m of [...sim.members, ...sim.missing]) m.skills = fillSkills(m.skills);
    // saves from before whistles: give everyone theirs, a fake its bent copy
    for (const ms of sim.missing) ms.voice ||= makeVoice(sim.seed, ms.slot, ms.id);
    for (const m of sim.members) {
      if (m.voice) continue;
      const real = sim.members.find((o) => !o.fake && o.slot === m.slot && o !== m) || sim.missing.find((o) => o.slot === m.slot);
      m.voice = m.fake ? bendVoice(real?.voice || makeVoice(sim.seed, m.slot, m.id), sim.seed, m.id) : makeVoice(sim.seed, m.slot, m.id);
    }
    return attach(sim);
  } catch { return null; }
}

export const hasRun = () => !!loadRun();
export const clearRun = () => del(RUN);

export function recordRun(over) {
  const list = runs();
  list.push({ at: Date.now(), days: over.days, home: over.home.filter((h) => !h.fake).length, unmade: over.unmade.filter((u) => u.fake).length });
  set(RUNS, JSON.stringify(list.slice(-50)));
}
export function runs() {
  try { return JSON.parse(get(RUNS) || "[]"); } catch { return []; }
}

export function settings() {
  const base = { sens: 1, fov: 72, volume: 0.7, ui: "normal", tutorialDone: false, team: "clearers" };
  try { return { ...base, ...JSON.parse(get(SETTINGS) || "{}") }; } catch { return base; }
}
export function saveSettings(s) { set(SETTINGS, JSON.stringify(s)); }
