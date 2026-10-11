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

import { phrase, PLAYER_VOICE } from "../src/voice.js";
import { readFileSync } from "node:fs";

const moments = (slot) => Array.from({ length: 40 }, (_, i) => ({ hour: 6 + (i % 14), minute: (i * 7) % 60, dist: (i * 3) % 25, campDist: (i * 5) % 40, played: i * 13, n: i, slot }));

t("every whistle comes out of its moment: many different, the same moment the same", () => {
  const you = new Set(moments("you").map((c) => JSON.stringify(phrase(PLAYER_VOICE, c, true))));
  assert.ok(you.size >= 35, `only ${you.size} different whistles of yours in 40 moments`);
  const v = makeVoice(9, 2, 4);
  const them = new Set(moments(2).map((c) => JSON.stringify(phrase(v, c))));
  assert.ok(them.size >= 25, `only ${them.size} different replies in 40 moments`);
  const c = moments(2)[3];
  assert.deepEqual(phrase(v, c), phrase(v, c));
});

t("a teammate still sounds like themselves: their register holds", () => {
  for (let seed = 0; seed < 50; seed++) {
    const v = makeVoice(seed, seed % 5, 3);
    for (const c of moments(seed % 5)) {
      const fs = phrase(v, c).map((n) => n.freq);
      assert.ok(Math.min(...fs) >= v.pitch * 0.97 / Math.pow(2, 1 / 12) - 1, "dropped below their register");
      assert.ok(Math.max(...fs) <= v.pitch * Math.pow(2, (v.jump + 2.5) / 12) + 2, "rose above their register");
    }
  }
});

t("in any one moment a fake's reply is off from the real one's", () => {
  for (let seed = 0; seed < 120; seed++) {
    const v = makeVoice(seed, seed % 5, 3), b = bendVoice(v, seed, 77);
    for (const c of moments(seed % 5).slice(0, 10)) assert.notDeepEqual(phrase(b, c), phrase(v, c), JSON.stringify([v, b, c]));
  }
});

t("no whistle is made from the hidden meter", () => {
  const sim = readFileSync(new URL("../src/sim.js", import.meta.url), "utf8");
  const ctx = sim.slice(sim.indexOf("export function whistleCtx"), sim.indexOf("export function busy"));
  assert.ok(!/sanity/.test(ctx), "whistleCtx reads the meter");
  assert.ok(!/sanity/.test(readFileSync(new URL("../src/voice.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")));
});
