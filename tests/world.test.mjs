import { t, assert } from "./lib.mjs";
import { generateWorld, AREA_H, CELL, LANDMARKS } from "../src/world.js";
import { createRun, reachable, passable } from "../src/sim.js";

const SEEDS = [1, 2, 3, 42, 777, 9001, 123456, 31337];

t("same seed, same woods", () => {
  const a = generateWorld(5), b = generateWorld(5);
  assert.deepEqual([...a.walk], [...b.walk]);
  assert.deepEqual(a.pylons, b.pylons);
  assert.notDeepEqual([...a.walk], [...generateWorld(6).walk]);
});

t("three pylons in area 1, two to four after", () => {
  for (const s of SEEDS) {
    const w = generateWorld(s);
    assert.equal(w.pylons.filter((p) => p.area === 0).length, 3);
    for (let a = 1; a < w.areas - 1; a++) {
      const n = w.pylons.filter((p) => p.area === a).length;
      assert.ok(n >= 2 && n <= 4, `seed ${s} area ${a} has ${n}`);
    }
  }
});

t("landmarks in one area are all different (a wrong place must look wrong)", () => {
  for (const s of SEEDS) {
    const w = generateWorld(s);
    for (let a = 0; a < w.areas; a++) {
      const kinds = w.clearings.filter((c) => c.area === a).map((c) => c.kind);
      assert.equal(new Set(kinds).size, kinds.length);
      for (const k of kinds) assert.ok(LANDMARKS.includes(k));
    }
  }
});

t("the deadfall is the only way north, and cutting it opens the way", () => {
  for (const s of SEEDS) {
    const sim = createRun({ seed: s });
    const w = sim.world;
    const start = w.start;
    const north = { x: w.trailX[AREA_H + 10] * CELL + 1, y: (AREA_H + 10) * CELL + 1 };
    assert.ok(!reachable(sim, start, north), `seed ${s}: north reachable past an uncut deadfall`);
    sim.deadfalls[0].done = 1; sim.fields.clear();
    assert.ok(reachable(sim, start, north), `seed ${s}: north not reachable after cutting`);
  }
});

t("every clearing, pylon and stick is reachable once deadfalls are cut", () => {
  for (const s of SEEDS) {
    const sim = createRun({ seed: s });
    sim.deadfalls.forEach((d) => (d.done = 1)); sim.fields.clear();
    const w = sim.world;
    for (const c of w.clearings) assert.ok(reachable(sim, w.start, c), `seed ${s} clearing ${c.id}`);
    for (const p of w.pylons) assert.ok(reachable(sim, w.start, p), `seed ${s} pylon ${p.id}`);
    for (const k of w.sticks) assert.ok(reachable(sim, w.start, k), `seed ${s} stick ${k.id}`);
    assert.ok(reachable(sim, w.start, w.farSide), `seed ${s} far side`);
  }
});

t("area 1 is reachable without cutting anything (camp, wood, pylons)", () => {
  for (const s of SEEDS) {
    const sim = createRun({ seed: s });
    const w = sim.world;
    for (const c of w.clearings.filter((c) => c.area === 0)) assert.ok(reachable(sim, w.start, c));
    for (const p of w.pylons.filter((p) => p.area === 0)) assert.ok(reachable(sim, w.start, p), `seed ${s} pylon ${p.id}`);
  }
});
