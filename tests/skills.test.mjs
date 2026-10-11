import { t, assert } from "./lib.mjs";
import { SKILLS, SKILL_LABEL, SKILL_WHAT, TASK_SKILL, WATCH_SKILL, blankSkills, fillSkills, totalPoints } from "../src/skills.js";
import * as S from "../src/sim.js";
import { sleep, takeWeight } from "../src/night.js";
import { loadRun, saveRun } from "../src/save.js";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

t("there are at least five skills, each named and explained", () => {
  assert.ok(SKILLS.length >= 5);
  assert.equal(new Set(SKILLS).size, SKILLS.length);
  for (const k of SKILLS) {
    assert.ok(SKILL_LABEL[k] && SKILL_LABEL[k].length > 3, k + " has no name");
    assert.ok(SKILL_WHAT[k] && SKILL_WHAT[k].length > 25, k + " is not explained");
  }
  assert.deepEqual(Object.keys(SKILL_LABEL).sort(), [...SKILLS].sort());
  assert.deepEqual(Object.keys(SKILL_WHAT).sort(), [...SKILLS].sort());
});

t("every skill is used by a task or by the watch, and every task names a real skill", () => {
  const used = new Set([...Object.values(TASK_SKILL).filter(Boolean), WATCH_SKILL]);
  for (const k of SKILLS) assert.ok(used.has(k), `${k} is not what any task or the watch uses`);
  for (const k of used) assert.ok(SKILLS.includes(k), k + " is not a skill");
});

t("the recruit and plan screens are built from the one list", () => {
  const ui = read("src/ui.js");
  assert.ok(ui.includes("SKILL_WHAT[k]") && ui.includes("SKILLS.flatMap"), "the recruit screen does not list what each skill does");
  assert.ok(!/const SKILLS = \[/.test(ui), "ui.js keeps its own list of skills");
  assert.ok(ui.includes("blankSkills()"), "recruits start from the shared list");
});

t("everyone starts with all of them, and a fake is better at every one", () => {
  const sim = S.createRun({ seed: 3, camp: true });
  for (const m of sim.members) assert.deepEqual(Object.keys(m.skills).sort(), [...SKILLS].sort());
  let seen = 0;
  for (let seed = 0; seed < 40 && seen < 3; seed++) {
    const sm = S.createRun({ seed, camp: true });
    sm.plan.dawnDay = 1; sm.player.x = sm.camp.x; sm.player.y = sm.camp.y;
    for (let n = 0; n < 6 && !sm.missing.length; n++) {
      while (!S.isNight(sm.time)) { S.tick(sm, 0.1, {}); if (sm.plan.pending) S.setDuskPlan(sm, {}); }
      sleep(sm); if (sm.plan.pending) S.setDawnPlan(sm, {});
    }
    for (const ms of sm.missing) {
      const fake = sm.members.find((m) => m.fake && m.slot === ms.slot);
      for (const k of SKILLS) assert.ok(fake.skills[k] >= Math.min(6, ms.skills[k] + 1) - 1e-9, `${k}: ${fake.skills[k]} vs ${ms.skills[k]}`);
      seen++;
    }
  }
  assert.ok(seen >= 1);
});

// --- Building -----------------------------------------------------------------
t("Building: a skilled hand has the camp up sooner", () => {
  const hours = (build) => {
    const sim = S.createRun({ seed: 12 });
    sim.plan.pending = null;
    const [a, ...rest] = S.party(sim);
    for (const m of rest) { m.x = sim.world.deadfalls[0].x; m.y = sim.world.deadfalls[0].y - 3; }
    a.skills.build = build;
    S.setDawnPlan(sim, { [a.id]: "pitch", ...Object.fromEntries(rest.map((m) => [m.id, "chop"])) });
    const t0 = sim.time;
    for (let i = 0; i < 60000 && !sim.camp.up; i++) S.tick(sim, 0.1, {});
    assert.ok(sim.camp.up);
    return sim.time - t0;
  };
  const slow = hours(0), fast = hours(5);
  assert.ok(fast < slow * 0.8, `build 5: ${fast.toFixed(2)} h, build 0: ${slow.toFixed(2)} h`);
});

t("Building: it takes the camp down sooner too, and Carrying no longer builds", () => {
  const src = read("src/sim.js");
  assert.ok(!/skills\.carry \* 0\.5 - others\("pitch"\)/.test(src), "auto still sends the best carrier to build");
  const lines = src.split("\n").filter((l) => /\(1 \+ 0\.1\d? \* m\.skills\./.test(l));
  for (const l of lines) assert.ok(/skills\.build/.test(l), "camp work still reads another skill: " + l.trim());
  assert.ok(lines.length >= 3, "camp work does not read Building in all its places");
});

// --- Watchfulness -------------------------------------------------------------
function takenOver(watch, seeds = 60, nights = 5) {
  let n = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const sim = S.createRun({ seed, camp: true });
    sim.plan.dawnDay = 1; sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
    sim.keystone.done = true;                    // this measures the nightly take, not the third morning
    for (const m of sim.members) m.skills.watch = watch;
    for (let i = 0; i < nights; i++) {
      while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
      sim.camp.pile = 12; sim.camp.lit = true; sim.camp.fire = 12;
      S.setDuskPlan(sim, Object.fromEntries(S.party(sim).map((m) => [m.id, true])));
      sleep(sim);
      if (sim.plan.pending) S.setDawnPlan(sim, {});
    }
    n += sim.missing.length;
  }
  return n;
}
t("Watchfulness: a watchful watch loses fewer people to the night", () => {
  const a = takenOver(0), b = takenOver(5);
  assert.ok(a > 8, `too few taken to measure: ${a}`);
  assert.ok(b < a * 0.6, `watchful ${b} vs unwatchful ${a}`);
});

t("Watchfulness: it grows with a night's watch, and does nothing for someone not on it", () => {
  const sim = S.createRun({ seed: 4, camp: true });
  sim.plan.dawnDay = 1; sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  const [w, o] = S.party(sim);
  while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
  sim.camp.pile = 12; sim.camp.lit = true; sim.camp.fire = 12;
  const w0 = w.skills.watch, o0 = o.skills.watch;
  S.setDuskPlan(sim, { [w.id]: true });
  sleep(sim);
  const stillThere = S.party(sim).find((m) => m.slot === w.slot && m === w);
  if (stillThere) assert.ok(w.skills.watch > w0, "no learning from a night on watch");
  assert.equal(o.skills.watch, o0);
});

// --- old saves ----------------------------------------------------------------
t("a save from before five skills loads with the new ones at 0, and a night draws no NaN", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  try {
    const sim = S.createRun({ seed: 9, camp: true });
    sim.plan.dawnDay = 1; sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
    for (const m of sim.members) { delete m.skills.build; delete m.skills.watch; }
    assert.ok(saveRun(sim));
    const back = loadRun();
    assert.ok(back);
    for (const m of back.members) for (const k of SKILLS) assert.ok(Number.isFinite(m.skills[k]), `${m.name}.${k} = ${m.skills[k]}`);
    while (!S.isNight(back.time)) { S.tick(back, 0.1, {}); if (back.plan.pending) S.setDuskPlan(back, {}); }
    S.setDuskPlan(back, Object.fromEntries(S.party(back).map((m) => [m.id, true])));
    sleep(back);
    for (const m of [...back.members, ...back.missing]) for (const k of SKILLS) assert.ok(Number.isFinite(m.skills[k]), `after the night ${m.name}.${k} = ${m.skills[k]}`);
  } finally { delete globalThis.localStorage; }
});

t("fillSkills fills what is missing and ignores junk", () => {
  assert.deepEqual(fillSkills({ cut: 2 }), { ...blankSkills(), cut: 2 });
  assert.deepEqual(fillSkills({ cut: NaN, junk: 3 }), blankSkills());
  assert.equal(totalPoints({ cut: 2, watch: 3 }), 5);
});

t("Watchfulness: on watch it costs you less the better you are at it, down to being no likelier than anyone", () => {
  const ctx = { out: false, fireHeld: true };
  const person = (watch, onWatch) => ({ watch: onWatch, skills: { watch }, sanity: 1 });
  const idle = takeWeight(person(0, false), ctx);
  const w = [0, 1, 2, 3, 4, 5].map((k) => takeWeight(person(k, true), ctx));
  assert.ok(w[0] > idle, "sitting up with no skill is no riskier than sleeping");
  for (let i = 1; i < w.length; i++) assert.ok(w[i] <= w[i - 1], "more skill, more risk");
  assert.ok(w[2] < w[0] && w[4] <= idle + 1e-9, "a watchful watch is still marked out");
  assert.equal(takeWeight(person(5, false), ctx), idle, "Watchfulness changes someone who is asleep");
});
