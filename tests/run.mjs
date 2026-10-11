// Pure tier: every *.test.mjs, in one process, about a second.
import { readdirSync } from "node:fs";
import { done } from "./lib.mjs";
const files = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".test.mjs")).sort();
for (const f of files) { console.log(f); await import("./" + f); }
const { passes, fails } = done();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
