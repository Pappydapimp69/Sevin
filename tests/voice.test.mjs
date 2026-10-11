import { t, assert } from "./lib.mjs";
import { makeVoice, bendVoice, notes, SHAPES, BEND_KINDS } from "../src/voice.js";
import * as S from "../src/sim.js";
import { sleep } from "../src/night.js";

t("everyone in a party whistles differently", () => {
  for (let seed = 0; seed < 200; seed++) {
    const sim = S.createRun({ seed, camp: true });
    const sigs = S.party(sim).map((m) => JSON.stringify(notes(m.voice)));
    assert.equal(new Set(sigs).size, sigs.length, `seed ${seed}`);
    const pitches = S.party(sim).map((m) => m.voice.pitch).sort((a, b) => a - b);
    for (let i = 1; i < pitches.length; i++) assert.ok(pitches[i] / pitches[i - 1] > 1.05, `seed ${seed}: two pitches within a semitone`);
  }
});

t("a fake's whistle is the real one with exactly one thing slightly off", () => {
  const seen = new Set();
  for (let seed = 0; seed < 300; seed++) {
    const v = makeVoice(seed, seed % 5, 7);
    const b = bendVoice(v, seed, 99);
    const changed = Object.keys(v).filter((k) => v[k] !== b[k]);
    assert.equal(changed.length, 1, JSON.stringify([v, b]));
    const k = changed[0];
    seen.add(k);
    if (k === "pitch") assert.ok(Math.abs(Math.log2(b.pitch / v.pitch) * 12) <= 1.05);
    if (k === "jump") assert.ok(Math.abs(b.jump - v.jump) <= 2);
    if (k === "pace") assert.ok(b.pace / v.pace > 0.7 && b.pace / v.pace < 1.4);
    assert.notDeepEqual(notes(b), notes(v));
    assert.deepEqual(bendVoice(v, seed, 99), b, "not the same bend every time");
  }
  for (const k of BEND_KINDS) assert.ok(seen.has(k), "never bent " + k);
});

t("the night's fake carries the taken one's whistle, bent; the found one keeps theirs", () => {
  let checked = 0;
  for (let seed = 0; seed < 40 && checked < 5; seed++) {
    const sim = S.createRun({ seed, camp: true });
    sim.plan.dawnDay = 1;
    sim.player.x = sim.camp.x; sim.player.y = sim.camp.y;
    for (let n = 0; n < 6 && !sim.missing.length; n++) {
      while (!S.isNight(sim.time)) { S.tick(sim, 0.1, {}); if (sim.plan.pending) S.setDuskPlan(sim, {}); }
      sleep(sim);
      if (sim.plan.pending) S.setDawnPlan(sim, {});
    }
    if (!sim.missing.length) continue;
    const ms = sim.missing[0];
    const fake = sim.members.find((m) => m.fake && m.slot === ms.slot);
    assert.notDeepEqual(fake.voice, ms.voice);
    assert.equal(Object.keys(ms.voice).filter((k) => ms.voice[k] !== fake.voice[k]).length, 1);
    checked++;
  }
  assert.ok(checked >= 3);
});

t("every shape plays", () => {
  for (const shape of SHAPES) assert.ok(notes({ pitch: 1500, shape, jump: 4, pace: 0.25 }).length >= 2);
});
