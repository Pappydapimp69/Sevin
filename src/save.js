// save.js — the ONLY localStorage caller. Keys are namespaced `sevin:*`
// because GitHub Pages serves every project of an account from one origin.

import { SAVE_VERSION, attach, snapshot } from "./sim.js";

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
  const base = { sens: 1, fov: 72, volume: 0.7, ui: "normal", tutorialDone: false };
  try { return { ...base, ...JSON.parse(get(SETTINGS) || "{}") }; } catch { return base; }
}
export function saveSettings(s) { set(SETTINGS, JSON.stringify(s)); }
