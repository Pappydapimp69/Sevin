import { t, assert } from "./lib.mjs";
import { KEYS, keyed, glyph, SCHEMES } from "../src/keys.js";
import { STEPS } from "../src/tutorial.js";
import { PAD_GAME, KEY_GAME } from "../src/input.js";
import { readFileSync } from "node:fs";

const src = (f) => readFileSync(new URL("../src/" + f, import.meta.url), "utf8");

t("every scheme names every control", () => {
  const names = Object.keys(KEYS.keyboard);
  for (const s of SCHEMES) assert.deepEqual(Object.keys(KEYS[s]).sort(), names.slice().sort(), s);
});

t("every tutorial step is fully filled in for every device", () => {
  for (const step of STEPS) for (const s of SCHEMES) {
    const text = keyed(step.text, s);
    assert.ok(!/\{\w+\}/.test(text), `${step.id}/${s}: ${text}`);
  }
});

t("no on-screen text names a keyboard key directly", () => {
  // instructions must use {tokens}; a bare "press E" is wrong on a pad or a phone
  const bad = /\b(press|Press|tap|Tap|hold|Hold)\s+(\[?[A-Z]\]?|Esc|Shift|Space|WASD|W A S D)\b/;
  for (const f of ["tutorial.js", "ui.js", "main.js", "sim.js", "night.js"]) {
    for (const [i, line] of src(f).split("\n").entries()) {
      if (/^\s*\/\//.test(line)) continue;
      assert.ok(!bad.test(line), `${f}:${i + 1}: ${line.trim()}`);
    }
  }
});

t("the names match the bindings", () => {
  const keyFor = (v) => Object.entries(KEY_GAME).filter(([, x]) => x === v).map(([k]) => k);
  const padFor = (v) => Object.entries(PAD_GAME).filter(([, x]) => x === v).map(([k]) => Number(k));
  const PAD = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Start"];
  for (const v of ["act", "ask", "call", "camp", "sleep", "pause", "help"]) {
    assert.ok(keyFor(v).some((code) => code.replace(/^Key/, "") === KEYS.keyboard[v] || (code === "Escape" && KEYS.keyboard[v] === "Esc")), `keyboard ${v}`);
    assert.ok(padFor(v).some((i) => PAD[i] === KEYS.gamepad[v]), `gamepad ${v} -> ${KEYS.gamepad[v]}`);
  }
  const bar = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const v of ["act", "ask", "call", "camp", "sleep", "pause"]) assert.ok(bar.includes(`data-verb="${v}">${KEYS.touch[v]}<`), `touch ${v}`);
});

t("prompts show the device's own glyph", () => {
  assert.equal(glyph("act", "keyboard"), "[E]");
  assert.equal(glyph("act", "gamepad"), "(A)");
  assert.equal(glyph("act", "touch"), "Use");
});
