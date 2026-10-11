import { t, assert } from "./lib.mjs";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

// The DOM modules never load in the pure tier, so a typo in them would pass
// every other test and blank the page. Parse them all.
t("every module parses", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    try { execFileSync(process.execPath, ["--check", new URL(f, dir).pathname], { stdio: "pipe" }); }
    catch (e) { assert.fail(f + ": " + e.stderr.toString().split("\n").slice(0, 4).join(" ")); }
  }
});
