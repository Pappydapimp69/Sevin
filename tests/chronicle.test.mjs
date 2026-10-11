import { t, assert } from "./lib.mjs";
import { record, account, accountText, candidates, pickPerturbation, WEATHERS, KINDS } from "../src/chronicle.js";
import { stream } from "../src/rng.js";

function day(seen = true) {
  const ch = { weather: "fog", facts: [] };
  const f = (verb, actor, extra = {}) => record(ch, { verb, actor, seen, ...extra });
  f("assigned", 1, { object: "on the deadfall", cls: "task", place: "pond" });
  f("assigned", 2, { object: "gathering wood", cls: "task", place: "pond" });
  f("cut", 1, { object: "deadfall", cls: "gate", place: "rocks" });
  f("gathered", 2, { object: "firewood", cls: "wood", place: "birches" });
  f("lit", "you", { object: "fire", cls: "fire", place: "pond" });
  f("pylon", "you", { object: "pylon", cls: "pylon", place: "stones", withWhom: [3] });
  return ch;
}
const N = (id) => (id === "you" ? "you" : ["", "Ama", "Brel", "Cosk"][id]);

t("every real account of a day is identical", () => {
  const ch = day();
  assert.equal(accountText(account(ch, N)), accountText(account(ch, N)));
});

t("a fake's account differs from the truth in exactly one place", () => {
  const ch = day();
  const truth = account(ch, N);
  for (let s = 0; s < 400; s++) {
    const p = pickPerturbation(stream(s), ch, { 1: "Ame", 2: "Bril", 3: "Cask" });
    assert.ok(p, "no perturbation");
    const lie = account(ch, N, p);
    assert.notEqual(accountText(lie), accountText(truth));
    const diff = lie.lines.filter((l, i) => l !== truth.lines[i]).length + (lie.weather !== truth.weather ? 1 : 0);
    // an order swap moves two lines; a name slip touches every line that person is in
    if (p.kind === "order") assert.equal(diff, 2);
    else if (p.kind === "name") assert.ok(diff >= 1);
    else assert.equal(diff, 1, JSON.stringify(p));
  }
});

t("every bent value comes from the day itself, never a list", () => {
  const ch = day();
  const actors = new Set(ch.facts.map((f) => f.actor));
  const places = new Set(ch.facts.map((f) => f.place));
  const people = new Set(ch.facts.flatMap((f) => [f.actor, ...f.withWhom]));
  for (const c of candidates(ch, {})) {
    if (c.kind === "actor") assert.ok(actors.has(c.to));
    if (c.kind === "place") assert.ok(places.has(c.to));
    if (c.kind === "with") assert.ok(people.has(c.to));
    if (c.kind === "object") assert.ok(ch.facts.some((f) => f.object === c.to && f.cls === ch.facts[c.at].cls));
    if (c.kind === "weather") assert.ok(WEATHERS.includes(c.to) && c.to !== ch.weather);
  }
});

t("only facts you saw can be bent (the weather everyone saw)", () => {
  const ch = day(false);
  const kinds = new Set(candidates(ch, { 1: "Ame" }).map((c) => c.kind));
  assert.deepEqual([...kinds], ["weather"]);
});

t("pickPerturbation draws exactly twice", () => {
  for (const ch of [day(), day(false), { weather: "clear", facts: [] }]) {
    let n = 0; const r = stream(3);
    pickPerturbation(() => { n++; return r(); }, ch, {});
    assert.equal(n, 2);
  }
});

t("over many lies, every kind of bend turns up", () => {
  const ch = day();
  const seen = new Set();
  for (let s = 0; s < 500; s++) seen.add(pickPerturbation(stream(s), ch, { 1: "Ame", 2: "Bril", 3: "Cask" }).kind);
  for (const k of KINDS) assert.ok(seen.has(k), "never saw " + k);
});
