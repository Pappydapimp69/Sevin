import { t, assert } from "./lib.mjs";
import { STUDIO, GAME, splashPrompt, skipSplash } from "../src/splash.js";
import { SCHEMES } from "../src/keys.js";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

t("the card names the studio and the game", () => {
  assert.equal(STUDIO, "Zane Paul Studios");
  assert.equal(GAME, "SEVIN");
});

t("the prompt is in the words of each device and has no unfilled token", () => {
  const seen = new Set();
  for (const s of SCHEMES) {
    const p = splashPrompt(s);
    assert.ok(p.length > 3 && !/\{\w+\}/.test(p), `${s}: ${p}`);
    seen.add(p);
  }
  assert.equal(seen.size, SCHEMES.length, "two devices share one prompt");
  assert.match(splashPrompt("gamepad"), /\bA\b/);
  assert.match(splashPrompt("touch"), /[Tt]ap/);
});

t("a link can skip the card, nothing else does", () => {
  assert.ok(skipSplash("#nosplash", "") && skipSplash("", "?nosplash") && skipSplash("", "?a=1&nosplash"));
  assert.ok(!skipSplash("", "") && !skipSplash("#about", "?x=nosplashed"));
});

t("the card is what the page opens on, and its act starts the sound before the title", () => {
  const main = read("src/main.js");
  assert.ok(main.includes("if (skipSplash(location.hash, location.search)) title(); else splash();"), "the page does not open on the card");
  const end = main.slice(main.indexOf("function endSplash"), main.indexOf("function splash()"));
  assert.ok(end.indexOf("audio.begin()") > 0 && end.indexOf("audio.begin()") < end.indexOf("title()"), "sound must start before the title shows");
  assert.ok(/setTimeout\(\(\) => \{ splashEl\.hidden = true; title\(\); \}, \d+\)/.test(end), "the title must wait for the card to fade");
  assert.ok(!/^title\(\);/m.test(main), "the title is called at load, bypassing the card");
});

t("any key, any pad button and any tap dismiss it", () => {
  const input = read("src/input.js"), main = read("src/main.js");
  assert.ok(/menu\?\.any\) \{ e\.preventDefault\(\); if \(!e\.repeat\) menu\.any\(\)/.test(input), "keyboard, and a held key does not count twice");
  assert.ok(/menu\?\.any\) \{ if \(edge\.some\(Boolean\)\) menu\.any\(\)/.test(input), "pad");
  assert.ok(main.includes('splashEl.addEventListener("click", endSplash)'), "pointer and touch, on the finished tap");
  assert.ok(!main.includes('splashEl.addEventListener("pointerdown"'), "dismissing on the press lets its release click the title");
});
