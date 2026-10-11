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
  const sim = S.createRun({ seed: 11, camp: true });
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
    const sim = S.createRun({ seed: 11, camp: true });
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
  const sim = S.createRun({ seed: 5, camp: true });
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
  const sim = S.createRun({ seed: 5, camp: true });
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
  assert.ok(Math.hypot(sim.camp.x - sim.player.x, sim.camp.y - sim.player.y) <= 4.01);
});

t("a pylon unmakes a fake and spares a real one, and is spent either way", () => {
  const sim = S.createRun({ seed: 2, camp: true });
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
  const sim = S.createRun({ seed: 2, camp: true });
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
  const sim = S.createRun({ seed: 9, camp: true });
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
  S.whistle(sim);
  for (let i = 0; i < 100; i++) S.tick(sim, 0.1, {});
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
  const sim = S.createRun({ seed: 4, camp: true });
  assert.deepEqual(askableDays(sim), [1]);
});

t("the action is what you are looking at, not a fixed order", () => {
  const sim = S.createRun({ seed: 3, camp: true });
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
  const sim = S.createRun({ seed: 3, camp: true });
  const k = sim.world.sticks.findIndex((st) => st.area === 0);
  const st = sim.world.sticks[k];
  sim.player.x = st.x; sim.player.y = st.y - 3; sim.player.yaw = 0;
  assert.equal(S.targetFor(sim, "stick", k), null);
  assert.ok(S.targetFor(sim, "stick", k, 1.4));
});

t("a whistle: idle people in earshot come, after a moment; busy and far ones do not", () => {
  const sim = S.createRun({ seed: 6, camp: true });
  sim.plan.dawnDay = 1;
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  const [idle, cutter, gatherer, far] = S.party(sim);
  idle.task = "camp";
  cutter.task = "chop"; cutter.chopId = 0;
  gatherer.task = "gather";
  far.task = "camp"; far.x = sim.player.x + S.HEAR + 10; far.y = sim.player.y;
  const r0 = sim.rngState;
  const heard = S.whistle(sim);
  assert.deepEqual(heard, [idle.id]);
  assert.ok(!idle.called, "came instantly");
  assert.equal(sim.rngState, r0, "whistling drew from the run");
  S.tick(sim, 0.1, {});
  assert.ok(!idle.called, "came within a tenth of a second");
  for (let i = 0; i < 60; i++) S.tick(sim, 0.1, {});
  assert.ok(idle.called, "never came");
  assert.equal(idle.task, "camp", "the whistle overwrote their task");
  assert.equal(cutter.task, "chop");
  assert.equal(gatherer.task, "gather");
  assert.equal(far.task, "camp");
});

t("the further off, the longer before they set out", () => {
  const sim = S.createRun({ seed: 6, camp: true });
  const [a, b] = S.party(sim);
  a.task = b.task = "camp";
  a.x = sim.player.x + 3; a.y = sim.player.y;
  b.x = sim.player.x + 22; b.y = sim.player.y;
  S.whistle(sim);
  assert.ok(b.answerAt - sim.time > a.answerAt - sim.time + 0.05);
});

t("a walk starts with no camp, the kit in hand, and the day's plan open", () => {
  const sim = S.createRun({ seed: 12 });
  assert.equal(sim.camp.up, false);
  assert.equal(sim.player.carryingKit, true);
  assert.equal(sim.plan.pending, "dawn");
  assert.ok(S.tasksNow(sim).includes("pitch") && !S.tasksNow(sim).includes("camp"));
});

t("set to making camp, they take the kit to the nearest clearing and put it up", () => {
  const sim = S.createRun({ seed: 12 });
  const [a, b, c] = S.party(sim);
  const site = S.pitchSite(sim);
  S.setDawnPlan(sim, { [a.id]: "pitch", [b.id]: "pitch", [c.id]: "gather" });
  assert.ok(sim.pitch && !sim.camp.up);
  assert.equal(sim.player.carryingKit, false);
  const t0 = sim.time;
  for (let i = 0; i < 4000 && !sim.camp.up; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.camp.up, "camp never went up");
  assert.ok(sim.time - t0 > 0.6, "camp went up too fast: " + (sim.time - t0));
  assert.equal(sim.camp.x, site.x); assert.equal(sim.camp.y, site.y);
  const f = sim.chron[1].facts.find((x) => x.verb === "pitched");
  assert.ok(f && [a.id, b.id].includes(f.actor), "nobody is on record for pitching it");
  assert.equal(a.task, "camp");
});

t("no camp: a gatherer brings the wood to you", () => {
  const sim = S.createRun({ seed: 12 });
  const [a] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "gather" });
  for (let i = 0; i < 4000 && sim.player.wood === 0; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.player.wood > 0);
});

t("making camp yourself stops the team making one elsewhere", () => {
  const sim = S.createRun({ seed: 12 });
  const [a] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "pitch" });
  sim.player.x = sim.world.start.x; sim.player.y = sim.world.start.y + 4;
  assert.ok(S.makeCamp(sim));
  assert.ok(Math.hypot(sim.pitch.x - sim.player.x, sim.pitch.y - sim.player.y) <= 4.01, "the camp is not going up where you are");
  assert.equal(a.task, "follow");
});
t("wood comes up off the ground at once; lighting a fire takes about three seconds; moving lets go", () => {
  const sim = S.createRun({ seed: 3, camp: true });
  sim.plan.dawnDay = 1;
  const k = sim.world.sticks.findIndex((st) => st.area === 0);
  const st = sim.world.sticks[k];
  sim.player.x = st.x; sim.player.y = st.y - 0.5; sim.player.yaw = 0;
  S.begin(sim, S.targetFor(sim, "stick", k));
  for (let i = 0; i < 5; i++) S.tick(sim, 0.1, {});         // half a second
  assert.equal(sim.sticks[k], true, "a stick took longer than half a second");
  sim.camp.pile = 3;
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y - 1; sim.player.yaw = 0;
  S.begin(sim, S.targetFor(sim, "light", 0));
  for (let i = 0; i < 25; i++) S.tick(sim, 0.1, {});
  assert.equal(sim.camp.lit, false, "lit before three seconds");
  for (let i = 0; i < 6; i++) S.tick(sim, 0.1, {});
  assert.equal(sim.camp.lit, true, "never lit");
  sim.camp.lit = false; sim.camp.fire = 0;
  S.begin(sim, S.targetFor(sim, "light", 0));
  for (let i = 0; i < 15; i++) S.tick(sim, 0.1, {});
  S.tick(sim, 0.1, { fwd: 1 });
  for (let i = 0; i < 30; i++) S.tick(sim, 0.1, {});
  assert.equal(sim.camp.lit, false, "moving did not let go");
});
t("the first deadfall is a long day even for everyone, and the biggest on the trail", () => {
  const sim = S.createRun({ seed: 11, camp: true });
  const w = sim.world.deadfalls;
  assert.ok(w[0].work >= 2 * Math.max(...w.slice(1).map((d) => d.work)) - 1);
  const df = w[0];
  sim.player.x = df.x; sim.player.y = df.y - 2.5;
  for (const m of sim.members) { m.task = "follow"; m.x = sim.player.x; m.y = sim.player.y - 1.5; m.skills.cut = 2; }
  S.act(sim, S.targetFor(sim, "chop", 0));
  const t0 = sim.time;
  for (let i = 0; i < 40000 && sim.deadfalls[0].done < 1; i++) S.tick(sim, 0.1, {});
  const hours = sim.time - t0;
  assert.ok(hours > 5, `all six cleared it in ${hours.toFixed(1)} h`);
});

t("making camp takes its hours at the world's pace, not fast-forwarded", () => {
  const sim = S.createRun({ seed: 12 });
  for (const m of sim.members) { m.task = "chop"; m.x = sim.world.deadfalls[0].x; m.y = sim.world.deadfalls[0].y - 3; }   // nobody helps
  sim.plan.pending = null; sim.plan.dawnDay = 1;
  sim.player.x = sim.world.start.x; sim.player.y = sim.world.start.y + 4;
  S.makeCamp(sim);
  let secs = 0;
  const t0 = sim.time;
  while (!sim.camp.up && secs < 400) { S.tick(sim, 0.1, {}); secs += 0.1; }
  assert.ok(sim.camp.up);
  assert.ok(Math.abs(sim.time - t0 - S.PITCH_HOURS) < 0.05, `took ${sim.time - t0} h`);
  assert.ok(Math.abs(secs - S.PITCH_HOURS * S.SEC_PER_HOUR) < 0.5, `took ${secs} real seconds`);
});

t("at dusk the team comes in, lights the fire and waits up; waiting wears like night", () => {
  const sim = S.createRun({ seed: 5, camp: true });
  sim.plan.dawnDay = 1;
  sim.camp.pile = 6; sim.camp.lit = false;
  const [a, b] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "gather", [b.id]: "camp" });
  // you are away, out on the trail
  sim.player.x = sim.world.start.x; sim.player.y = sim.world.start.y;
  for (const m of S.party(sim)) if (m !== a && m !== b) m.task = "camp";
  for (let i = 0; i < 20000 && S.hourOf(sim.time) < 19; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.camp.lit, "nobody lit the fire");
  const lit = sim.chron[1].facts.find((f) => f.verb === "lit");
  assert.ok(lit && lit.actor !== "you");
  for (const m of [a, b]) assert.ok(Math.hypot(m.x - sim.camp.x, m.y - sim.camp.y) < 4, m.name + " is not at the fire");
  assert.equal(sim.plan.pending, null, "the night was planned without you");
  const s0 = b.sanity;
  for (let i = 0; i < 600; i++) S.tick(sim, 0.1, {});     // an hour and a half of waiting up
  assert.ok(b.sanity < s0, "waiting up after dark cost nothing");
  assert.ok(sim.camp.lit, "they let the fire go out with wood in the pile");
});

t("keeping camp brings in wood by day", () => {
  const sim = S.createRun({ seed: 5, camp: true });
  sim.plan.dawnDay = 1;
  sim.camp.pile = 0;
  const [a] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "camp" });
  for (let i = 0; i < 2000; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.camp.pile >= 1);
});

t("tasks keep through the night; after dark nobody leaves the fire; at first light they go back to it", () => {
  const sim = S.createRun({ seed: 5, camp: true });
  sim.plan.dawnDay = 1;
  sim.camp.pile = 8;
  // camp a short walk south of the deadfall, on the trail
  const df = sim.world.deadfalls[0], cy = Math.floor(df.y / 2) - 8;
  sim.camp.x = Math.round(sim.world.trailX[cy]) * 2 + 1; sim.camp.y = cy * 2 + 1;
  const [cutter, gatherer, keeper] = S.party(sim);
  S.setDawnPlan(sim, { [cutter.id]: "chop", [gatherer.id]: "gather", [keeper.id]: "camp" });
  sim.player.x = sim.world.start.x; sim.player.y = sim.world.start.y;      // you are away
  const near = (m) => Math.hypot(m.x - sim.camp.x, m.y - sim.camp.y) < 5;
  let maxAway = 0;
  const home = new Set();
  for (let i = 0; i < 40000 && S.hourOf(sim.time) < 23; i++) {
    S.tick(sim, 0.1, {});
    if (S.hourOf(sim.time) < 16.4) continue;
    if (S.hourOf(sim.time) > 17.25 && S.hourOf(sim.time) < 17.3) assert.equal(cutter.state, "sit", "home from the shift but not resting at the fire");
    for (const m of [cutter, gatherer, keeper]) {
      const d = Math.hypot(m.x - sim.camp.x, m.y - sim.camp.y);
      if (d < 5) home.add(m);
      if (home.has(m)) maxAway = Math.max(maxAway, d);   // once in, do they go back out?
    }
  }
  assert.equal(cutter.task, "chop"); assert.equal(gatherer.task, "gather"); assert.equal(keeper.task, "camp");
  for (const m of [cutter, gatherer, keeper]) assert.ok(near(m), m.name + " is out in the dark");
  assert.ok(maxAway < 8, `someone left the fire after their shift: ${maxAway.toFixed(1)} m`);
  // a whistle from the dark does not pull anyone off the fire
  S.whistle(sim);
  for (let i = 0; i < 200; i++) S.tick(sim, 0.1, {});
  for (const m of [cutter, gatherer, keeper]) assert.ok(near(m) && !m.called, m.name + " left the fire for a whistle");
  // morning: back to it
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  sim.plan.duskDone = S.today(sim);
  sleep(sim);
  assert.equal(cutter.task, "chop", "the task did not survive the night");
  sim.plan.pending = null;
  for (let i = 0; i < 1500; i++) S.tick(sim, 0.1, {});
  assert.ok(!near(cutter), "the cutter did not go back out in the morning");
});

t("every skill does something you can see in play", () => {
  // cutting: a deadfall goes faster
  assert.ok(S.chopRate({ skills: { cut: 4 } }) > S.chopRate({ skills: { cut: 0 } }));
  // carrying: a bigger load
  const load = (carry) => {
    const sim = S.createRun({ seed: 5, camp: true });
    sim.plan.dawnDay = 1;
    const [a] = S.party(sim);
    a.skills.carry = carry;
    S.setDawnPlan(sim, { [a.id]: "gather" });
    for (let i = 0; i < 3000 && !a.load; i++) S.tick(sim, 0.1, {});
    return a.load;
  };
  assert.ok(load(4) > load(0), "carrying changes nothing");
  // firecraft: the night's watch gets through on less wood
  const used = (fire) => {
    const sim = S.createRun({ seed: 5, camp: true });
    sim.plan.dawnDay = 1;
    sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
    while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
    const [w] = S.party(sim);
    w.skills.fire = fire; w.x = sim.camp.x; w.y = sim.camp.y;
    sim.camp.pile = 20; sim.camp.lit = true; sim.camp.fire = 0.5;
    S.setDuskPlan(sim, { [w.id]: true });
    const p0 = sim.camp.pile;
    sleep(sim);
    return p0 - sim.camp.pile;
  };
  assert.ok(used(4) < used(0), `firecraft changes nothing: ${used(4)} vs ${used(0)} sticks`);
});

t("every task says which skill it leans on, and it is the one the sim uses", () => {
  for (const t of S.TASKS) assert.ok(t in S.TASK_SKILL, t + " has no skill named");
  assert.equal(S.TASK_SKILL.chop, "cut");
  assert.equal(S.TASK_SKILL.gather, "carry");
  assert.equal(S.TASK_SKILL.pitch, "build");
  assert.equal(S.TASK_SKILL.camp, "fire");
  const ui = readFileSync(new URL("../src/ui.js", import.meta.url), "utf8");
  assert.ok(ui.includes("TASK_SKILL[t]") && ui.includes('classList.toggle("used"'), "the plan screen does not show it");
});

t("gathering is chopping: an hour a chop, 1 to 3 pieces back from it", () => {
  for (const carry of [0, 2, 6]) {
    const sim = S.createRun({ seed: 5, camp: true });
    sim.plan.dawnDay = 1;
    const [a] = S.party(sim);
    a.skills.carry = carry;
    S.setDawnPlan(sim, { [a.id]: "gather" });
    let started = null, trips = [], pile = sim.camp.pile;
    for (let i = 0; i < 20000 && S.hourOf(sim.time) < 16; i++) {
      S.tick(sim, 0.1, {});
      if (started == null && a.gathering > 0) started = sim.time;
      if (started != null && a.load && trips.length === 0) trips.push({ took: sim.time - started, load: a.load });
      if (sim.camp.pile > pile) { assert.ok(sim.camp.pile - pile <= 3, `a trip brought ${sim.camp.pile - pile}`); pile = sim.camp.pile; }
    }
    assert.ok(trips[0].took >= 0.95, `a chop took ${trips[0].took} h`);   // an hour, not the constant: it is what is tested
    assert.ok(trips[0].load >= 1 && trips[0].load <= 3);
    assert.ok(sim.camp.pile - 3 <= 27, "too much wood for a day");
  }
});

t("called to you by day, back to their own task the next morning", () => {
  const sim = S.createRun({ seed: 5, camp: true });
  sim.plan.dawnDay = 1;
  const [a] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "camp" });
  sim.player.x = sim.camp.x + 6; sim.player.y = sim.camp.y;
  S.whistle(sim);
  for (let i = 0; i < 100; i++) S.tick(sim, 0.1, {});
  assert.ok(a.called);
  assert.equal(a.task, "camp");
  while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
  sleep(sim);
  assert.ok(!a.called, "still with you the next day");
  assert.equal(a.task, "camp");
});

t("no camp at dusk: they spend the night with you and keep their task", () => {
  const sim = S.createRun({ seed: 5 });
  const [a] = S.party(sim);
  S.setDawnPlan(sim, { [a.id]: "chop" });
  for (let i = 0; i < 40000 && S.hourOf(sim.time) < 19; i++) S.tick(sim, 0.1, {});
  assert.equal(a.task, "chop");
  assert.ok(a.called);
  sleep(sim);
  assert.ok(!a.called);
  assert.equal(a.task, "chop");
});

t("it is dark when the game says night, and light when it says day", () => {
  for (let h = 0; h < 24; h += 0.25) {
    const t = 24 + h, d = S.daylight(t);
    if (S.isNight(t) && S.hourOf(t) >= S.DUSK + 0.25) assert.equal(d, 0, `light at ${h}:00 in the night`);
    if (S.isNight(t)) assert.ok(d <= 0.1, `${d} light at ${h} though it is night`);
    if (h >= 7 && h <= 16) assert.equal(d, 1, `dim at ${h} in the day`);
  }
  assert.ok(S.daylight(24 + 17) < 0.8 && S.daylight(24 + 17) > 0.2, "no sunset before dusk");
});

t("using their judgement: they make camp when there is none, keep the pile up, cut, and spread out", () => {
  const sim = S.createRun({ seed: 7 });
  const all = S.party(sim);
  S.setDawnPlan(sim, Object.fromEntries(all.map((m) => [m.id, "auto"])));
  for (let i = 0; i < 30; i++) S.tick(sim, 0.1, {});
  assert.ok(all.some((m) => S.effTask(m) === "pitch"), "nobody made camp");
  assert.ok(sim.pitch, "no camp is going up");
  const picks = new Set(all.map((m) => S.effTask(m)));
  assert.ok(picks.size >= 2, "they all did the same thing: " + [...picks]);
  for (let i = 0; i < 20000 && !sim.camp.up; i++) S.tick(sim, 0.1, {});
  assert.ok(sim.camp.up, "camp never went up");
  sim.camp.pile = 0;
  for (let i = 0; i < 400; i++) S.tick(sim, 0.1, {});
  assert.ok(all.some((m) => S.effTask(m) === "gather"), "an empty pile and nobody gathering");
  assert.ok(all.every((m) => m.task === "auto"), "auto was overwritten");
  const s = S.autoScores(sim, all[0]);
  assert.ok("chop" in s && "camp" in s && "gather" in s);
});

t("a chop brings 1 to 3 pieces; carrying makes a bigger haul likelier, not certain", () => {
  const avg = (carry) => {
    let sum = 0, seen = new Set();
    for (let k = 0; k < 400; k++) { const n = S.woodPerChop({ id: 3, skills: { carry } }, 11, k); assert.ok(n >= 1 && n <= 3, String(n)); sum += n; seen.add(n); }
    return { mean: sum / 400, seen };
  };
  const lo = avg(0), hi = avg(5);
  assert.ok(hi.mean > lo.mean + 0.4, `${lo.mean} vs ${hi.mean}`);
  assert.equal(lo.seen.size, 3, "an unskilled hand never got 1, 2 and 3");
  assert.ok(hi.seen.has(1) || hi.seen.has(2), "a skilled hand always got 3: that is certain, not likely");
});
