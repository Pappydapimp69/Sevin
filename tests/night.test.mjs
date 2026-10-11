import { t, assert } from "./lib.mjs";
import * as S from "../src/sim.js";
import { sleep, NIGHT_DRAWS } from "../src/night.js";
import { accountFor } from "../src/percept.js";
import { makeRng } from "../src/rng.js";

function toDusk(sim) {
  while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
  if (sim.plan.pending === "dusk") S.setDuskPlan(sim, {});
}
function nights(seed, n, careful = false) {
  const sim = S.createRun({ seed });
  sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
  for (let i = 0; i < n; i++) {
    toDusk(sim);
    if (careful) { sim.camp.pile += 10; S.tendFire(sim); for (let k = 0; k < 8; k++) S.tendFire(sim); }
    sleep(sim);
    if (sim.plan.pending === "dawn") S.setDawnPlan(sim, {});
  }
  return sim;
}

t("a night draws the same count whatever happens", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = nights(seed, 0);
    for (let i = 0; i < 6; i++) {
      toDusk(sim);
      const before = sim.rngState;
      sleep(sim);
      const r = makeRng(before); for (let k = 0; k < NIGHT_DRAWS; k++) r.next();
      assert.equal(sim.rngState, r.s, `seed ${seed} night ${i}`);
      if (sim.plan.pending) S.setDawnPlan(sim, {});
    }
  }
});

t("the first night takes nobody (day one is quiet)", () => {
  for (let seed = 0; seed < 40; seed++) assert.equal(nights(seed, 1).missing.length, 0);
});

t("someone taken leaves a fake with their name and better hands", () => {
  let found = 0;
  for (let seed = 0; seed < 40; seed++) {
    const sim = nights(seed, 5);
    for (const ms of sim.missing) {
      const fake = sim.members.find((m) => m.fake && m.slot === ms.slot);
      assert.ok(fake, "slot left empty");
      assert.equal(fake.name, ms.name);
      assert.ok(fake.skills.cut > ms.skills.cut - 0.01);
      found++;
    }
  }
  assert.ok(found > 5, "nobody was ever taken in 40 runs of 5 nights: " + found);
});

t("a kept fire at camp takes fewer than a cold one", () => {
  let cold = 0, warm = 0;
  for (let seed = 0; seed < 60; seed++) { cold += nights(seed, 5).missing.length; warm += nights(seed, 5, true).missing.length; }
  assert.ok(warm < cold, `warm ${warm} cold ${cold}`);
});

t("the missing stand somewhere you can walk to", () => {
  for (let seed = 0; seed < 40; seed++) {
    const sim = nights(seed, 5);
    for (const ms of sim.missing) assert.ok(S.reachable(sim, sim.camp, ms), `seed ${seed}`);
  }
});

t("a fake's account of a shared day differs; a real one's matches", () => {
  let checked = 0;
  for (let seed = 0; seed < 40 && checked < 5; seed++) {
    const sim = nights(seed, 5);
    const fake = sim.members.find((m) => m.fake);
    const realOne = sim.members.find((m) => !m.fake);
    if (!fake || !realOne) continue;
    for (let d = 1; d < S.today(sim); d++) {
      const a = accountFor(sim, realOne.id, d), b = accountFor(sim, fake.id, d), c = accountFor(sim, realOne.id, d);
      assert.deepEqual(a, c);
      assert.notDeepEqual(a, b, `seed ${seed} day ${d}`);
      // the same lie every time you ask
      assert.deepEqual(b, accountFor(sim, fake.id, d));
    }
    checked++;
  }
  assert.ok(checked >= 3);
});

t("asking costs half an hour and draws nothing from the run", () => {
  const sim = nights(3, 2);
  const t0 = sim.time, r0 = sim.rngState;
  S.askMember(sim, sim.members[0].id, 1);
  assert.ok(Math.abs(sim.time - t0 - S.ASK_HOURS) < 0.05, `${sim.time - t0}`);
  assert.equal(sim.rngState, r0);
});

t("every night advances exactly one day and keeps every day's record", () => {
  for (let seed = 0; seed < 30; seed++) {
    const sim = nights(seed, 6, true);
    assert.equal(S.today(sim), 7);
    for (let d = 1; d <= 7; d++) assert.ok(sim.chron[d], `seed ${seed} lost day ${d}`);
    assert.ok(sim.chron[1].facts.length > 0, `seed ${seed}: day 1 record was wiped`);
  }
});
