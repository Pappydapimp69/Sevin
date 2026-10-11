import { t, assert } from "./lib.mjs";
import * as S from "../src/sim.js";
import { sleep } from "../src/night.js";
import { createTutorial, tutorialStep, STEPS } from "../src/tutorial.js";
import { readFileSync } from "node:fs";
import { askableDays } from "../src/percept.js";

t("anyone can chop; skill makes it faster, never zero", () => {
  assert.equal(S.chopRate("you"), 1);
  assert.ok(S.chopRate({ skills: { cut: 3 } }) > S.chopRate({ skills: { cut: 0 } }));
  assert.ok(S.chopRate({ skills: { cut: 0 } }) > 0);
});

t("chopping alone clears a deadfall, and progress persists", () => {
  const sim = S.createRun({ seed: 11 });
  for (const m of sim.members) m.task = "camp";
  const df = sim.world.deadfalls[0];
  sim.player.x = df.x; sim.player.y = df.y - 2.5;
  assert.equal(S.resolveAction(sim).kind, "chop");
  S.act(sim);
  for (let i = 0; i < 300; i++) S.tick(sim, 0.1, {});
  const mid = sim.deadfalls[0].done;
  assert.ok(mid > 0 && mid < 1);
  S.tick(sim, 0.1, { fwd: 1 });             // moving stops the work
  assert.equal(sim.work, null);
  assert.equal(sim.deadfalls[0].done, mid);
});

t("helpers make the deadfall go faster", () => {
  const time = (help) => {
    const sim = S.createRun({ seed: 11 });
    const df = sim.world.deadfalls[0];
    sim.player.x = df.x; sim.player.y = df.y - 2.5;
    for (const m of sim.members) { m.task = help ? "follow" : "camp"; if (help) { m.x = sim.player.x; m.y = sim.player.y - 1.5; } }
    S.act(sim);
    const t0 = sim.time;
    for (let i = 0; i < 20000 && sim.deadfalls[0].done < 1; i++) S.tick(sim, 0.1, {});
    return sim.time - t0;
  };
  assert.ok(time(true) < time(false) / 2);
});

t("the dawn plan sends people to work, and they come home at dusk", () => {
  const sim = S.createRun({ seed: 5 });
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  const [a, b] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "chop", [b.id]: "gather" });
  const pile0 = sim.camp.pile;
  for (let i = 0; i < 3000 && S.hourOf(sim.time) < 14; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.deadfalls[0].done > 0, "nobody chopped");
  assert.ok(sim.camp.pile > pile0, "no wood came back");
  for (let i = 0; i < 4000 && !sim.plan.pending; i++) S.tick(sim, 0.1, {});
  assert.ok(Math.hypot(a.x - sim.camp.x, a.y - sim.camp.y) < S.CAMP_R, "the cutter stayed out after dark");
});

t("camp comes down, is carried, goes up somewhere else", () => {
  const sim = S.createRun({ seed: 5 });
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  sim.camp.pile = 5;
  assert.ok(S.strikeCamp(sim));
  for (let i = 0; i < 500 && sim.work; i++) S.tick(sim, 0.1, {});
  assert.equal(sim.camp.up, false);
  assert.equal(sim.player.wood, 5);
  sim.player.x = sim.world.start.x; sim.player.y = sim.world.start.y + 4;
  assert.ok(S.canMakeCamp(sim), "no room on the trail start");
  S.makeCamp(sim);
  for (let i = 0; i < 1000 && sim.work; i++) S.tick(sim, 0.1, {});
  assert.equal(sim.camp.up, true);
  assert.equal(sim.camp.pile, 5);
  assert.ok(Math.hypot(sim.camp.x - sim.player.x, sim.camp.y - sim.player.y) < 1);
});

t("a pylon unmakes a fake and spares a real one, and is spent either way", () => {
  const sim = S.createRun({ seed: 2 });
  const py = sim.world.pylons[0];
  sim.player.x = py.x; sim.player.y = py.y - 1;
  const [a, ...rest] = S.party(sim);
  for (const m of rest) { m.x = 0; m.y = 0; }
  a.x = sim.player.x + 1; a.y = sim.player.y;
  S.act(sim, S.targetFor(sim, "pylon", 0));
  assert.ok(sim.pylons[0].spent && !a.gone);
  a.fake = true;
  const py2 = sim.world.pylons[1];
  sim.player.x = py2.x; sim.player.y = py2.y - 1; a.x = sim.player.x + 1; a.y = sim.player.y;
  S.act(sim, S.targetFor(sim, "pylon", 1));
  assert.ok(sim.pylons[1].spent && a.gone);
});

t("the far side has one more pylon than real people; every try spends one", () => {
  const sim = S.createRun({ seed: 2 });
  S.party(sim)[1].fake = true;
  sim.player.x = sim.world.farSide.x; sim.player.y = sim.world.farSide.y;
  const n = S.homeCount(sim);
  assert.equal(n, 4 + 1);
  for (const m of S.party(sim)) { m.x = sim.player.x + 1; m.y = sim.player.y; }
  let tries = 0;
  while (S.party(sim).length && tries < 10) { S.act(sim); tries++; }
  assert.equal(sim.home.lit, 5);
  assert.equal(sim.home.sent.length, 4);
  const over = S.walkOut(sim);
  assert.equal(over.home.length, 4);
  assert.equal(over.unmade.length, 1);
});

t("save round trip resumes the same run", () => {
  const sim = S.createRun({ seed: 9 });
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  for (let i = 0; i < 200; i++) S.tick(sim, 0.1, {});
  const copy = S.attach(JSON.parse(S.snapshot(sim)));
  for (const s of [sim, copy]) {
    while (!S.isNight(s.time)) { S.tick(s, 0.1, {}); if (s.plan.pending) S.setDuskPlan(s, {}); }
    for (let n = 0; n < 3; n++) { sleep(s); if (s.plan.pending) S.setDawnPlan(s, {}); while (!S.isNight(s.time)) { S.tick(s, 0.1, {}); if (s.plan.pending) S.setDuskPlan(s, {}); } }
  }
  assert.equal(S.snapshot(copy), S.snapshot(sim));
});

t("the tutorial: every step, and nobody's mind is touched", () => {
  const sim = createTutorial();
  assert.equal(tutorialStep(sim).id, "walk");
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  for (let i = 0; i < 200; i++) S.tick(sim, 0.1, {});
  sim.sticks[0] = sim.sticks[1] = sim.sticks[2] = true; sim.camp.pile = 3;
  S.tendFire(sim);
  sim.stats.asked = 1;
  S.callOut(sim);
  sim.deadfalls[0].done = 1;
  sim.pylons[0].spent = true; sim.pylons[0].litAt = sim.time;
  sim.camp.up = false;
  assert.equal(tutorialStep(sim).id, "end");
  for (const b of [sim.player, ...sim.members]) assert.equal(b.sanity, 1);
  assert.equal(STEPS.length, 10);
});

t("the hidden meter never reaches the screen", () => {
  for (const f of ["src/ui.js", "src/render.js", "src/main.js", "src/tutorial.js"]) {
    const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!/\.sanity/.test(src), f + " reads sanity");
    assert.ok(!/hallucinat/i.test(src.replace(/\/\/.*$/gm, "")), f + " names it");
  }
});

t("only save.js touches localStorage", () => {
  for (const f of ["ui", "render", "main", "sim", "night", "percept", "input", "tutorial", "world", "chronicle"]) {
    assert.ok(!readFileSync(new URL(`../src/${f}.js`, import.meta.url), "utf8").includes("localStorage"), f);
  }
});

t("you can always ask about today, even before anything has happened", () => {
  const sim = S.createRun({ seed: 4 });
  assert.deepEqual(askableDays(sim), [1]);
});

t("the action is what you are looking at, not a fixed order", () => {
  const sim = S.createRun({ seed: 3 });
  const c = sim.camp;
  // stand between the fire (south) and a stick (north)
  sim.player.x = c.x; sim.player.y = c.y + 1.5;
  const k = sim.world.sticks.findIndex((st) => st.area === 0);
  sim.world.sticks[k] = { ...sim.world.sticks[k], x: c.x, y: c.y + 3.5 };
  sim.player.yaw = 0;                 // facing north, at the stick
  assert.equal(S.resolveAction(sim).kind, "stick");
  sim.player.yaw = Math.PI;           // facing south, at the fire
  assert.equal(S.resolveAction(sim).kind, "light");
  sim.player.yaw = Math.PI / 2;       // facing east, at neither
  assert.equal(S.resolveAction(sim), null);
});

t("touch tolerance widens reach without changing what is there", () => {
  const sim = S.createRun({ seed: 3 });
  const k = sim.world.sticks.findIndex((st) => st.area === 0);
  const st = sim.world.sticks[k];
  sim.player.x = st.x; sim.player.y = st.y - 3; sim.player.yaw = 0;
  assert.equal(S.targetFor(sim, "stick", k), null);
  assert.ok(S.targetFor(sim, "stick", k, 1.4));
});
