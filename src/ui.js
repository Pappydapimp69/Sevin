// ui.js — every panel and the HUD. DOM only. Reads sim/percept, and changes
// the run only through the verbs main.js hands it.
//
// One modal at a time. While a modal is open the game is paused and the mouse
// is released; closing it is always one click or Esc.

import { clock, today, party, TASKS, TASK_LABEL, atCamp, dayOf, isNight, hourOf, DUSK, CAMP_R, ASK_HOURS } from "./sim.js";
import { accountFor, askableDays } from "./percept.js";
import { BEARINGS } from "./night.js";
import { KEYS, keyed, glyph } from "./keys.js";

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const btn = (label, fn, cls = "") => h("button", { class: cls, disabled: cls.includes("disabled"), on: { click: fn } }, label);

const SKILLS = ["cut", "carry", "fire"];
const SKILL_LABEL = { cut: "Cutting", carry: "Carrying", fire: "Firecraft" };
const dots = (n) => "●".repeat(Math.max(0, Math.round(n))) + "○".repeat(Math.max(0, 6 - Math.round(n)));

export function fireWords(camp) {
  if (!camp.up) return "no camp";
  if (!camp.lit) return "cold";
  if (camp.fire < 2) return "burning low";
  if (camp.fire < 6) return "burning";
  return "burning well";
}

export function createUI(api) {
  const modal = $("modal");
  let open = null;

  const K = (t) => keyed(t, api.scheme());
  let onCancel = null;

  function show(name, ...content) {
    open = name;
    onCancel = null;
    modal.replaceChildren(h("div", { class: "panel " + name }, ...content));
    modal.hidden = false;
    api.paused(true);
    api.setMenu(menu);
    const first = modal.querySelector("button.primary:not(:disabled)") || focusables()[0];
    first?.focus({ preventScroll: true });
  }
  function close() {
    open = null;
    onCancel = null;
    modal.hidden = true;
    modal.replaceChildren();
    api.setMenu(null);
    api.paused(false);
  }

  // Menus are driven the same way by a pad, the arrow keys, a mouse or a
  // finger: move focus spatially, confirm, cancel.
  const focusables = () => [...modal.querySelectorAll("button:not(:disabled), select, input")].filter((e) => e.offsetParent !== null);
  const menu = {
    nav(dx, dy) {
      const cur = document.activeElement;
      if (dx && cur?.tagName === "SELECT") {
        cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + dx));
        cur.dispatchEvent(new Event("change"));
        return;
      }
      if (dx && cur?.type === "range") {
        cur.value = String(Number(cur.value) + dx * Number(cur.step || 1));
        cur.dispatchEvent(new Event("input"));
        return;
      }
      const all = focusables();
      if (!all.length) return;
      if (!all.includes(cur)) { all[0].focus(); return; }
      const a = cur.getBoundingClientRect(), ax = a.x + a.width / 2, ay = a.y + a.height / 2;
      let best = null, bs = Infinity;
      for (const el of all) {
        if (el === cur) continue;
        const b = el.getBoundingClientRect(), bx = b.x + b.width / 2, by = b.y + b.height / 2;
        const along = (bx - ax) * dx + (by - ay) * dy;
        if (along <= 2) continue;
        const across = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
        const score = along + across * 2.5;
        if (score < bs) { bs = score; best = el; }
      }
      // nothing that way: wrap through the list instead
      if (!best) { const i = all.indexOf(cur); best = all[(i + (dx + dy > 0 ? 1 : -1) + all.length) % all.length]; }
      best.focus({ preventScroll: false });
    },
    confirm() {
      const cur = document.activeElement;
      if (!modal.contains(cur)) { focusables()[0]?.focus(); return; }
      if (cur.type === "checkbox") { cur.checked = !cur.checked; cur.dispatchEvent(new Event("change")); return; }
      if (cur.tagName === "BUTTON") cur.click();
    },
    cancel() { if (onCancel) onCancel(); },
  };

  // ---------------------------------------------------------------- title
  function title({ canContinue, record }) {
    const runs = record.length;
    const home = record.reduce((s, r) => s + r.home, 0);
    show("title",
      h("h1", {}, "SEVIN"),
      h("p", { class: "lede" }, "Walk the trail through the woods and come out the other side."),
      h("div", { class: "stack" },
        canContinue && btn("Continue", api.continueRun, "primary"),
        btn("New walk", api.newRun, canContinue ? "" : "primary"),
        btn("Training camp", api.tutorial),
        btn("Controls", () => help(() => api.toTitle())),
        btn("Settings", () => settings(() => api.toTitle())),
      ),
      runs ? h("p", { class: "small" }, `${runs} walk${runs > 1 ? "s" : ""}. ${home} brought home.`) : null,
    );
  }

  // ---------------------------------------------------------------- recruit
  function recruit(names, onStart, onReroll) {
    const POINTS = 10;
    const team = names.map((name) => ({ name, skills: { cut: 0, carry: 0, fire: 0 } }));
    const left = () => POINTS - team.reduce((s, m) => s + m.skills.cut + m.skills.carry + m.skills.fire, 0);
    const body = h("div");
    function paint() {
      body.replaceChildren(
        h("p", {}, `Five people walk in with you. Spend ${POINTS} points on what they are good at. Points left: `, h("b", { id: "pts" }, left())),
        h("table", { class: "grid" },
          h("tr", {}, h("th", {}, ""), ...SKILLS.map((k) => h("th", {}, SKILL_LABEL[k]))),
          ...team.map((m, i) => h("tr", {},
            h("td", { class: "name" }, m.name),
            ...SKILLS.map((k) => h("td", {},
              btn("−", () => { if (m.skills[k] > 0) { m.skills[k]--; paint(); } }, "tiny"),
              h("span", { class: "val", "data-k": k, "data-i": i }, m.skills[k]),
              btn("+", () => { if (left() > 0 && m.skills[k] < 5) { m.skills[k]++; paint(); } }, "tiny"),
            )),
          )),
        ),
        h("p", { class: "small" }, "Anyone can do anything. Skill makes it faster. Spread it and you are slow; stack it and one loss cripples you."),
      );
    }
    paint();
    show("recruit", h("h2", {}, "Who walks in"), body,
      h("div", { class: "row" }, btn("Other names", onReroll), btn("Back", api.toTitle), btn("Walk in", () => onStart(team), "primary")));
    onCancel = api.toTitle;
  }

  // ---------------------------------------------------------------- dawn plan
  function dawnPlan(sim, onDone) {
    const choice = {};
    const rows = party(sim).map((m) => {
      choice[m.id] = m.task === "camp" ? "follow" : m.task;
      const sel = h("select", { "data-id": m.id, on: { change: (e) => (choice[m.id] = e.target.value) } },
        ...TASKS.map((t) => h("option", { value: t, selected: choice[m.id] === t }, TASK_LABEL[t])));
      return h("tr", {}, h("td", { class: "name" }, m.name), h("td", {}, sel),
        h("td", { class: "skills" }, SKILLS.map((k) => h("span", { class: "sk", title: SKILL_LABEL[k] }, k + " " + dots(m.skills[k])))));
    });
    const call = sim.call && sim.call.day === today(sim) ? h("p", { class: "warn" }, `At first light someone heard a voice from the ${BEARINGS[sim.call.bearing]}.`) : null;
    show("plan",
      h("h2", {}, `Dawn, day ${today(sim)}`),
      h("p", {}, `Weather: ${sim.weather[today(sim)]}. The woodpile has ${sim.camp.pile}. Set the day's work. Out there you can only call people back to you.`),
      call,
      h("table", { class: "grid" }, rows),
      h("p", { class: "small" }, "On the deadfall: they cut until dusk. Gathering: they bring loads back to the pile. At camp: they stay by the fire. With you: they follow and lend a hand."),
      h("div", { class: "row" }, btn("Begin the day", () => { onDone(choice); close(); }, "primary")),
    );
  }

  // ---------------------------------------------------------------- dusk plan
  function duskPlan(sim, onDone, onFeed) {
    const watch = {};
    const body = h("div");
    function paint() {
      body.replaceChildren(
        h("p", {}, `The fire is ${fireWords(sim.camp)}. The woodpile has ${sim.camp.pile}. A fire that dies in the night leaves the whole camp open.`),
        h("div", { class: "row" },
          btn(sim.camp.lit ? "Feed the fire" : "Light the fire", () => { onFeed(); paint(); }),
        ),
        h("p", {}, "Who sits up with the fire? A watch keeps it fed from the pile, and is awake."),
        h("table", { class: "grid" }, party(sim).map((m) => h("tr", {},
          h("td", { class: "name" }, m.name),
          h("td", {}, h("label", {}, h("input", { type: "checkbox", "data-id": m.id, checked: !!watch[m.id], on: { change: (e) => (watch[m.id] = e.target.checked) } }), " watch")),
        ))),
      );
    }
    paint();
    show("plan",
      h("h2", {}, `Dusk, day ${today(sim)}`), body,
      h("div", { class: "row" },
        btn("Stay up a while", () => { onDone(watch, false); close(); }),
        btn("Sleep", () => { onDone(watch, true); close(); }, "primary")));
  }

  // ---------------------------------------------------------------- ask
  function ask(sim, m, onAsk) {
    const out = h("div", { class: "account" }, h("p", { class: "small" }, "Pick a day. Every question costs half an hour."));
    const days = askableDays(sim);
    const asked = new Set();
    show("ask",
      h("h2", {}, `Ask ${m.name}`),
      h("div", { class: "row wrap" }, days.map((d) => btn(d === today(sim) ? `Today` : `Day ${d}`, () => {
        if (!onAsk(m.id, d)) return;
        asked.add(d);
        const acc = accountFor(sim, m.id, d);
        out.replaceChildren(
          h("p", { class: "who" }, `${m.name}, about ${d === today(sim) ? "today" : "day " + d}:`),
          h("p", {}, "“" + acc.weather + "”"),
          ...(acc.lines.length ? acc.lines.map((l) => h("p", {}, "“" + l + ".”")) : [h("p", {}, "“Not much to tell.”")]),
          h("p", { class: "small" }, `It is ${clock(sim.time)}.`),
        );
      }, "day"))),
      out,
      h("div", { class: "row" }, btn("Done", close, "primary")),
    );
    onCancel = close;
    modal.querySelector("button.day")?.focus();
  }

  // ---------------------------------------------------------------- camp menu
  function campMenu(sim, v) {
    const items = [];
    if (sim.camp.up) {
      items.push(btn("Take the camp down (an hour)", () => { close(); v.strike(); }, v.canStrike() ? "" : "disabled"));
      if (atCamp(sim, sim.player) && today(sim) && hourOf(sim.time) < 10 && sim.plan.dawnDay !== today(sim)) items.push(btn("Set the day's work", () => { close(); v.plan(); }));
    } else {
      items.push(btn("Make camp here (two hours)", () => { close(); v.make(); }, v.canMake() ? "primary" : "disabled"));
      if (!v.canMake()) items.push(h("p", { class: "small" }, "A camp needs open ground all round."));
    }
    if (v.canWalkOut()) items.push(btn("Walk out of the woods", () => { close(); v.walkOut(); }, "primary"));
    items.push(btn(isNight(sim.time) || hourOf(sim.time) >= DUSK - 1 ? "Sleep" : "Sleep (not until dusk)", () => { close(); v.sleep(); }, v.canSleep() ? "" : "disabled"));
    show("camp", h("h2", {}, "Camp"),
      h("p", {}, sim.camp.up ? `Camp is up. The fire is ${fireWords(sim.camp)}. The pile has ${sim.camp.pile}.` : `No camp. You carry ${sim.player.wood} wood${sim.player.carryingKit ? " and the kit" : ""}.`),
      h("div", { class: "stack" }, items), h("div", { class: "row" }, btn("Close", close)));
    onCancel = close;
  }

  // ---------------------------------------------------------------- pause / help / settings
  function pause(v) {
    show("pause", h("h2", {}, "Paused"),
      h("div", { class: "stack" }, btn("Resume", close, "primary"), btn("Controls", () => help(() => pause(v))),
        btn("Settings", () => settings(() => pause(v))), btn("Save and quit to title", v.quit)));
    onCancel = close;
  }

  const CONTROL_ROWS = [
    ["move", "walk"], ["look", "look"], ["run", "run"],
    ["act", "use what is in front of you: pick up, chop, light, feed, a pylon"],
    ["ask", "ask the person you are looking at"], ["call", "call everyone in earshot to you"],
    ["camp", "camp: make it, take it down, plan the day, sleep"], ["sleep", "sleep (from dusk)"],
    ["pause", "pause"], ["menu", "move around menus"], ["back", "back out of a menu"],
  ];
  function help(back) {
    const sch = api.scheme();
    const name = { keyboard: "Keyboard and mouse", gamepad: "Controller", touch: "Touch" };
    show("help", h("h2", {}, "Controls · " + name[sch]),
      h("table", { class: "grid keys" }, CONTROL_ROWS.map(([k, v]) => h("tr", {}, h("td", { class: "name" }, KEYS[sch][k]), h("td", {}, v)))),
      h("p", { class: "small" }, "The game follows whatever you last touched: keyboard and mouse, a controller, or the screen."),
      h("div", { class: "row" }, btn("Back", back || close, "primary")));
    onCancel = back || close;
  }

  function settings(back) {
    const st = api.settings();
    const row = (label, input) => h("tr", {}, h("td", { class: "name" }, label), h("td", {}, input));
    const range = (key, min, max, step, fmt) => {
      const out = h("span", { class: "small" }, " " + fmt(st[key]));
      const r = h("input", { type: "range", min, max, step, value: st[key], "data-key": key, on: { input: (e) => { st[key] = Number(e.target.value); out.textContent = " " + fmt(st[key]); api.applySettings(st); } } });
      return h("span", {}, r, out);
    };
    const sizes = ["small", "normal", "large"];
    const sizeRow = h("span", {}, sizes.map((z) => btn(z, (e) => { st.ui = z; api.applySettings(st); for (const b of e.target.parentNode.children) b.classList.toggle("sel", b === e.target); }, "tiny" + (st.ui === z ? " sel" : ""))));
    show("settings", h("h2", {}, "Settings"),
      h("table", { class: "grid" },
        row("Volume", range("volume", 0, 1, 0.1, (v) => Math.round(v * 100) + "%")),
        row("Look speed", range("sens", 0.3, 3, 0.1, (v) => v.toFixed(1) + "x")),
        row("Field of view", range("fov", 60, 100, 5, (v) => v + "°")),
        row("Text size", sizeRow),
      ),
      h("div", { class: "row" }, btn("Back", back || close, "primary")));
    onCancel = back || close;
    modal.querySelector("input")?.focus();
  }

  // ---------------------------------------------------------------- end
  function end(over, v) {
    const li = (p, note) => h("li", {}, p.name, note ? h("span", { class: "small" }, " — " + note) : null);
    show("end", h("h2", {}, over.home.length ? "Out of the woods" : "Out of the woods, alone"),
      h("p", {}, `${over.days} days.`),
      h("h3", {}, "Came home with you"), h("ul", {}, over.home.length ? over.home.map((p) => li(p)) : h("li", {}, "nobody")),
      over.left.length ? [h("h3", {}, "Left at the far side"), h("ul", {}, over.left.map((p) => li(p, p.fake ? "was never them" : "was real")))] : null,
      over.unmade.length ? [h("h3", {}, "Gone in the light of a pylon"), h("ul", {}, over.unmade.map((p) => li(p, p.fake ? "was never them" : "")))] : null,
      over.lost.length ? [h("h3", {}, "Still out there"), h("ul", {}, over.lost.map((p) => li(p)))] : null,
      h("div", { class: "row" }, btn("Title", v.toTitle, "primary")));
  }

  function tutorialEnd(v) {
    show("title", h("h2", {}, "Training done"),
      h("p", {}, "The woods are north. Five people walk in with you."),
      h("div", { class: "stack" }, btn("Choose your five", v.newRun, "primary"), btn("Title", v.toTitle)));
  }

  function confirm(text, yes, no) {
    show("confirm", h("p", {}, text), h("div", { class: "row" }, btn("No", () => { close(); no?.(); }), btn("Yes", () => { close(); yes(); }, "primary")));
    onCancel = () => { close(); no?.(); };
  }

  // ---------------------------------------------------------------- HUD
  const log = $("log");
  let lastMsg = 0;
  function hud(sim, view) {
    $("hud").hidden = false;
    const d = today(sim);
    $("clock").textContent = sim.tutorial ? "Training camp" : `Day ${d} · ${clock(sim.time)}${isNight(sim.time) ? " · night" : ""}`;
    const bits = [];
    if (sim.player.wood) bits.push(`carrying ${sim.player.wood} wood`);
    if (sim.player.carryingKit) bits.push("the camp kit");
    if (sim.camp.up && atCamp(sim, sim.player)) bits.push(`pile ${sim.camp.pile}`, `fire ${fireWords(sim.camp)}`);
    $("carry").textContent = bits.join(" · ");
    $("compass").textContent = compass(sim.player.yaw);

    // the prompt: the action in front of you, and who you are looking at
    const sch = api.scheme();
    const lines = [];
    if (sch === "touch") {
      if (view.action) lines.push(`${view.action.label} (tap it, or Use)`);
      if (view.target) lines.push(`Ask ${view.target.name} (tap them)`);
    } else {
      if (view.action) lines.push(`${glyph("act", sch)} ${view.action.label}`);
      if (view.target) lines.push(`${glyph("ask", sch)} Ask ${view.target.name}`);
    }
    $("prompt").textContent = lines.join("   ");
    $("work").textContent = sim.work ? workText(sim.work) : "";
    $("work").hidden = !sim.work;

    // messages
    for (; lastMsg < sim.msgs.length; lastMsg++) {
      const m = sim.msgs[lastMsg];
      const el = h("div", { class: "msg " + m.kind, "data-raw": m.text }, K(m.text));
      log.append(el);
      setTimeout(() => el.classList.add("old"), 9000);
      while (log.children.length > 5) log.firstChild.remove();
    }

    const tut = $("tut");
    tut.hidden = !view.step;
    if (view.step) {
      const key = view.step.id + ":" + sch;
      if (tut.dataset.step !== key) {
        tut.dataset.step = key;
        tut.replaceChildren(...[h("b", {}, "Training · "), K(view.step.text), view.step.id === "end" ? h("div", {}, btn(`Start the walk ${glyph("act", sch)}`, api.finishTutorial, "primary")) : null].filter(Boolean));
      }
    }
    const touch = sch === "touch";
    $("touchbar").hidden = !touch;
    $("cross").hidden = touch && !view.action && !view.target;
    log.style.bottom = touch ? "84px" : "16px";
  }
  function resetLog() { lastMsg = 0; log.replaceChildren(); }
  // The device changed: everything already on screen is re-worded for it.
  function rekey() {
    for (const el of log.children) el.textContent = K(el.dataset.raw);
    if (open === "help") help(onCancel);
  }
  function hideHud() { $("hud").hidden = true; }

  return { title, recruit, dawnPlan, duskPlan, ask, campMenu, pause, help, settings, end, tutorialEnd, confirm, hud, close, resetLog, rekey, hideHud, menu, get open() { return open; } };
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(yaw) {
  const deg = (((yaw * 180) / Math.PI) % 360 + 360) % 360;
  const out = [];
  for (let k = -2; k <= 2; k++) {
    const i = (((Math.round(deg / 45) + k) % 8) + 8) % 8;
    out.push(k === 0 ? `[ ${POINTS[i]} ]` : POINTS[i]);
  }
  return out.join("   ");
}

function workText(w) {
  switch (w.kind) {
    case "chop": return "Chopping. Time runs fast. Move to stop.";
    case "make": return "Making camp. Move to stop.";
    case "strike": return "Taking the camp down. Move to stop.";
    case "ask": return "Talking.";
    default: return "";
  }
}
