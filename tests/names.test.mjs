import { t, assert } from "./lib.mjs";
import { makeName, makeRoster, nearMiss } from "../src/names.js";
import { stream } from "../src/rng.js";

t("makeName draws exactly 10 times, whatever it returns", () => {
  for (let s = 0; s < 200; s++) {
    let n = 0; const r = stream(s);
    makeName(() => { n++; return r(); });
    assert.equal(n, 10);
  }
});
t("rosters: five names, distinct initials, sayable length", () => {
  for (let s = 0; s < 300; s++) {
    const r = makeRoster(stream(s), 5);
    assert.equal(r.length, 5);
    assert.equal(new Set(r.map((n) => n[0])).size, 5, r.join());
    for (const n of r) assert.ok(n.length >= 3 && n.length <= 9 && !/^Tam\d/.test(n), n);
  }
});
t("a near miss is one letter off", () => {
  for (let s = 0; s < 300; s++) {
    const name = makeRoster(stream(s), 1)[0];
    const nm = nearMiss(name, stream(s + 1)());
    assert.notEqual(nm, name);
    assert.equal(nm.length, name.length);
    assert.equal([...name].filter((c, i) => nm[i] !== c).length, 1);
  }
});
