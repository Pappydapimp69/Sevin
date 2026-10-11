import assert from "node:assert/strict";
export { assert };
let fails = 0, passes = 0;
export function t(name, fn) {
  try { fn(); passes++; console.log("  ok  " + name); }
  catch (e) { fails++; console.log("  FAIL " + name + "\n       " + (e.stack || e).toString().split("\n").slice(0, 3).join("\n       ")); }
}
export function done() { return { passes, fails }; }
