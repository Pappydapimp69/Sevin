// ui.js — every panel and the HUD. DOM only. Reads sim/percept, and changes
// the run only through the verbs main.js hands it.
//
// One modal at a time. While a modal is open the game is paused and the mouse
// is released; closing it is always one click or Esc.

import { clock, today, party, roster, compassOffset, seenBearing, TASKS, TASK_LABEL, TASK_SKILL, tasksNow, pitchSite, PITCH_HOURS, STRIKE_HOURS, atCamp, dayOf, isNight, hourOf, DUSK, CAMP_R, ASK_HOURS } from "./sim.js";
import { accountFor, askableDays, shownWood, shownFire, mindLevel, voteOf, sureWord } from "./percept.js";
import { stream as _stream, hash as _hash } from "./rng.js";
import { BEARINGS } from "./night.js";
import { KEYS, keyed, glyph } from "./keys.js";
import { SKILLS, SKILL_LABEL, SKILL_WHAT, TEAMS, DEFAULT_TEAM, teamSkills, teamFocus } from "./skills.js";

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
    // a menu opened again keeps its place: the pad does not jump back to the top
    if (!restoreFocus(name)) {
      const first = modal.querySelector("button.primary:not(:disabled)") || focusables()[0];
      first?.focus({ preventScroll: true });
    }
  }

  // Where the selection was, per menu: its label (and which of that label it
  // was) and its place in the list. A choice that repaints the menu, or a menu
  // shown again, puts it back there rather than at the top.
  const place = {};
  const labelOf = (el) => (el.tagName === "BUTTON" ? el.textContent : el.tagName + ":" + (el.dataset.id || el.name || ""));
  modal.addEventListener("focusin", (e) => {
    if (!open) return;
    const all = focusables(), lab = labelOf(e.target);
    place[open] = { lab, nth: all.filter((x) => labelOf(x) === lab).indexOf(e.target), idx: all.indexOf(e.target) };
  });
  function restoreFocus(name) {
    const k = place[name];
    if (!k) return false;
    const all = focusables();
    if (!all.length) return false;
    const same = all.filter((x) => labelOf(x) === k.lab);
    const el = same[k.nth] || same[0] || all[Math.min(k.idx, all.length - 1)];
    el.focus({ preventScroll: true });
    return true;
  }
  // a choice that rebuilds part of the menu takes focus with it: put it back
  new MutationObserver(() => {
    if (open && !modal.contains(document.activeElement)) restoreFocus(open);
  }).observe(modal, { childList: true, subtree: true });
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
  // Seven's team select: pick a KIND of team, one tap. The five people take its
  // two skills in turn (skills.js TEAMS); no points to count.
  function recruit(names, onStart, onReroll) {
    let pick = api.settings().team || DEFAULT_TEAM;
    if (!TEAMS.some((t) => t.id === pick)) pick = DEFAULT_TEAM;
    const cards = h("div", { class: "teamcards" });
    const roster = h("ul", { class: "roster" });
    const note = h("p", { class: "small" });
    function paint() {
      cards.replaceChildren(...TEAMS.map((t) => h("button", { class: "teamcard" + (t.id === pick ? " sel" : ""), "data-team": t.id, on: { click: () => { pick = t.id; const st = api.settings(); st.team = pick; api.applySettings(st); paint(); } } },
        h("span", { class: "option-title" }, t.title),
        h("span", { class: "option-detail" }, t.detail || t.skills.map((k) => SKILL_LABEL[k]).join(" · ")))));
      const t = TEAMS.find((x) => x.id === pick);
      note.textContent = t.note + ".";
      roster.replaceChildren(...names.map((n, i) => h("li", {}, h("span", { class: "name" }, n), h("span", { class: "focus" }, SKILL_LABEL[teamFocus(pick, i)]))));
    }
    paint();
    show("recruit", h("h2", {}, "Who walks in"),
      h("label", { class: "field-label" }, "Team"), cards, note, roster,
      h("p", { class: "small" }, "Anyone can do anything. A skill makes it go further or faster, and grows with use."),
      h("div", { class: "row" }, btn("Other names", onReroll), btn("Back", api.toTitle),
        btn("Walk in", () => onStart(names.map((name, i) => ({ name, skills: teamSkills(pick)[i] }))), "primary")));
    onCancel = api.toTitle;
  }

  // ---------------------------------------------------------------- dawn plan
  function dawnPlan(sim, onDone) {
    const choice = {};
    const allowed = tasksNow(sim);
    const taskText = (t) => TASK_LABEL[t] + (TASK_SKILL[t] ? `  ·  ${SKILL_LABEL[TASK_SKILL[t]]}` : t === "auto" ? "  ·  whatever is needed" : "  ·  helps you");
    const rows = roster(sim).map((m) => {
      choice[m.id] = allowed.includes(m.task) ? m.task : "follow";      // yesterday's work, unless you change it
      const skillCells = SKILLS.map((k) => h("span", { class: "sk", "data-k": k, title: SKILL_LABEL[k] }, k + " " + dots(m.skills[k])));
      // the skill this task uses lights up in the row
      const mark = () => skillCells.forEach((el) => el.classList.toggle("used", el.dataset.k === TASK_SKILL[choice[m.id]]));
      const sel = h("select", { "data-id": m.id, on: { change: (e) => { choice[m.id] = e.target.value; mark(); } } },
        ...allowed.map((t) => h("option", { value: t, selected: choice[m.id] === t }, taskText(t))));
      mark();
      return h("tr", {}, h("td", { class: "name" }, m.name), h("td", {}, sel), h("td", { class: "skills" }, h("div", { class: "skillrow" }, skillCells)));
    });
    const call = sim.call && sim.call.day === today(sim) ? h("p", { class: "warn" }, `At first light someone heard a voice from the ${BEARINGS[seenBearing(sim, sim.call.bearing)]}.`) : null;
    show("plan",
      h("h2", {}, `Dawn, day ${today(sim)}`),
      h("p", {}, `Weather: ${sim.weather[today(sim)]}. ` + (sim.camp.up
        ? `The woodpile has ${sim.camp.pile}. Set the day's work. Out there you can only whistle people back to you.`
        : sim.pitch
          ? `Camp is still going up by the ${sim.pitch.place}. Set the day's work.`
          : sim.campStruck
            ? `There is no camp. You took it down, so only you can put it up again: use ${KEYS[api.scheme()].camp}, wherever you stand, before dark or everyone sleeps in the open.`
            : `There is no camp yet. Somebody has to make one before dark, or everyone sleeps in the open. ` +
            `Whoever you set to making camp takes the kit to the ${pitchSite(sim)?.kind || "nearest clearing"} and puts it up. Or put it up yourself with ${KEYS[api.scheme()].camp}, wherever you stand.`)),
      call,
      h("table", { class: "grid" }, rows),
      h("p", { class: "small" }, "On the deadfall (Cutting): they cut until their shift ends. Gathering wood (Carrying): they bring loads back to the pile" + (sim.camp.up ? "" : " (to you, until there is one)") + ". " +
        (sim.camp.up ? "Keeping camp (Firecraft): they stay, bring in deadwood and keep the fire. " : "Making camp (Building): most of a morning alone, about an hour with everyone. ") + "With you: they follow and lend a hand to whatever you are doing. " +
        "Using their judgement: each hour they do what the team needs most that they are good for (make camp, keep the pile up, cut, keep the fire), and spread out."),
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
        h("p", {}, "Who sits up with the fire? A watch keeps it fed from the pile and is awake; the more watchful they are (" + SKILL_LABEL.watch + "), the less likely the night takes anyone."),
        h("table", { class: "grid" }, party(sim).map((m) => h("tr", {},
          h("td", { class: "name" }, m.name),
          h("td", {}, h("label", {}, h("input", { type: "checkbox", "data-id": m.id, checked: !!watch[m.id], on: { change: (e) => (watch[m.id] = e.target.checked) } }), " watch")),
          h("td", { class: "skills" }, h("div", { class: "skillrow" }, h("span", { class: "sk used", title: SKILL_LABEL.watch }, "watchful " + dots(m.skills.watch)))),
        ))),
      );
    }
    paint();
    show("plan",
      h("h2", {}, hourOf(sim.time) >= 22 ? `Ten o'clock, day ${today(sim)}` : `Dusk, day ${today(sim)}`), body,
      h("div", { class: "row" },
        hourOf(sim.time) >= 22 ? null : btn("Stay up a while", () => { onDone(watch, false); close(); }),
        btn("Sleep", () => { onDone(watch, true); close(); }, "primary")));
  }

  // ---------------------------------------------------------------- the morning choice
  // Two of one person at the fire, and only one can stay. A game show: two
  // answers, three lifelines a run (ask the team, ask one, ask both), and a
  // final answer. Nobody tells you if you were right.
  function choose(sim, pair, onFinal) {
    const flip = _stream(_hash("show", sim.seed, pair[0].id, pair[1].id))() < 0.5;
    const [A, B] = flip ? [pair[1], pair[0]] : pair;
    const name = A.name, L = (id) => (id === A.id ? "A" : "B");
    const others = party(sim).filter((m) => m.id !== A.id && m.id !== B.id);
    const out = h("div", { class: "account" });
    const ll = sim.lifelines;
    function paint() {
      body.replaceChildren(
        h("p", { class: "small" }, `Morning, day ${today(sim)}. Two people sit at the fire and both of them are ${name}. Only one of them can stay.`),
        h("div", { class: "row wrap answers" },
          btn(`A · ${name}`, () => final(A), "answer"),
          btn(`B · ${name}`, () => final(B), "answer")),
        h("p", { class: "small" }, "Lifelines, once each for the whole walk:"),
        h("div", { class: "row wrap" },
          life("Ask the team", ll.team && others.length, () => { ll.team = false; poll(); paint(); }),
          life("Ask one of them", ll.one && others.length, () => { ll.one = false; pickOne(); }),
          life("Ask both about a day", ll.both, () => { ll.both = false; pickDay(); })),
        out,
      );
    }
    // a spent lifeline stays in the row and keeps focus (greyed, does nothing), so
    // the pad stays where it was instead of jumping to an answer
    const life = (label, ok, fn) => { const b = btn(label, () => { if (ok) fn(); }, ok ? "" : "spent"); if (!ok) b.setAttribute("aria-disabled", "true"); return b; };
    function poll() {
      const votes = others.map((m) => voteOf(sim, m, A, B));
      const a = votes.filter((v) => v.pick === A.id).length, n = votes.length;
      const pa = Math.round((a / n) * 100);
      out.replaceChildren(h("p", { class: "who" }, "The team:"),
        h("div", { class: "poll" },
          h("div", { class: "bar" }, h("span", { style: `width:${pa}%` }), ` A  ${pa}%`),
          h("div", { class: "bar" }, h("span", { style: `width:${100 - pa}%` }), ` B  ${100 - pa}%`)));
    }
    function pickOne() {
      out.replaceChildren(h("p", { class: "who" }, "Who do you ask?"), h("div", { class: "row wrap" }, others.map((m) => btn(m.name, () => {
        const v = voteOf(sim, m, A, B);
        out.replaceChildren(h("p", { class: "who" }, `${m.name}:`), h("p", {}, `“${L(v.pick)}. I'm ${sureWord(v.p)}.”`));
        paint();
      }))));
      paint();
    }
    function pickDay() {
      const days = askableDays(sim);
      out.replaceChildren(h("p", { class: "who" }, "Which day?"), h("div", { class: "row wrap" }, days.map((d) => btn(`Day ${d}`, () => {
        const acc = (m) => accountFor(sim, m.id, d);
        const col = (lab, m) => h("div", { class: "col" }, h("p", { class: "who" }, `${lab}, about day ${d}:`), ...(acc(m).lines.length ? acc(m).lines.map((l) => h("p", {}, "“" + l + ".”")) : [h("p", {}, "“Not much to tell.”")]));
        out.replaceChildren(h("div", { class: "row twocol" }, col("A", A), col("B", B)));
        paint();
      }))));
      paint();
    }
    function final(m) {
      const go = m === A ? B : A;
      show("confirm", h("h2", {}, "Final answer?"), h("p", {}, `${L(m.id)} stays. The other walks into the trees, for good.`),
        h("div", { class: "row" }, btn("No", () => choose(sim, pair, onFinal)), btn("Final answer", () => { close(); onFinal(m.id, go.id); }, "primary")));
      onCancel = () => choose(sim, pair, onFinal);
    }
    const body = h("div");
    paint();
    show("choose", h("h2", {}, `Which one is ${name}?`), body);
    onCancel = null;
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
      items.push(btn("Take the camp down", () => { close(); v.strike(); }, v.canStrike() ? "" : "disabled"));
      if (atCamp(sim, sim.player) && !sim.keystone.active && hourOf(sim.time) < 10 && sim.plan.dawnDay !== today(sim)) items.push(btn("Set the day's work", () => { close(); v.plan(); }));
    } else {
      const here = sim.pitch && Math.hypot(sim.pitch.x - sim.player.x, sim.pitch.y - sim.player.y) < 5;
      items.push(btn(here ? "Keep making camp" : "Make camp here", () => { close(); v.make(); }, v.canMake() ? "primary" : "disabled"));
      if (!v.canMake()) items.push(h("p", { class: "small" }, "A camp needs open ground all round."));
    }
    // the evening at the fire, until ten
    if (v.evening()) {
      items.push(btn("Sing together", () => { close(); v.sing(); }, "primary"));
      items.push(btn("Whistle round the fire", () => { close(); v.round(); }));
    }
    if (atCamp(sim, sim.player)) {
      if (sim.campFruit) items.push(btn("Eat the fruit", () => { close(); v.eat(); }));
      (sim.remains || []).forEach((r, i) => {
        const what = r.truth === "head" ? `${r.name}'s head` : `the ${r.truth}`;
        if (r.truth === "head" && !r.asked) items.push(btn(`Ask ${r.name}'s head about a day`, () => { close(); v.askHead(i); }));
        items.push(btn(`Bury ${what}`, () => { close(); v.bury(i); }));
        items.push(btn(`Burn ${what}`, () => { close(); v.burn(i); }));
      });
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
    ["ask", "ask the person you are looking at"], ["call", "whistle (everyone near answers); twice in three seconds calls the nearest over for half an hour"],
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
    const calmRow = h("span", {}, btn(st.calm ? "On" : "Off", (e) => { st.calm = !st.calm; e.target.textContent = st.calm ? "On" : "Off"; e.target.classList.toggle("sel", st.calm); api.applySettings(st); }, "tiny" + (st.calm ? " sel" : "")));
    show("settings", h("h2", {}, "Settings"),
      h("table", { class: "grid" },
        row("Volume", range("volume", 0, 1, 0.1, (v) => Math.round(v * 100) + "%")),
        row("Look speed", range("sens", 0.3, 3, 0.1, (v) => v.toFixed(1) + "x")),
        row("Field of view", range("fov", 60, 100, 5, (v) => v + "°")),
        row("Text size", sizeRow),
        row("Calm (no camera or world effects)", calmRow),
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
    const wood = shownWood(sim);
    if (wood) bits.push(`carrying ${wood} wood`);
    if (sim.player.carryingKit) bits.push("the camp kit");
    if (sim.player.holding) bits.push("it, in both hands");
    if (sim.player.glows?.length) bits.push(`${sim.player.glows.length} glowing branch${sim.player.glows.length > 1 ? "es" : ""}`);
    if (sim.player.glowUntil != null && sim.time < sim.player.glowUntil) bits.push("a lit branch");
    if (sim.camp.up && atCamp(sim, sim.player)) bits.push(`pile ${sim.camp.pile}`, `fire ${fireWords(shownFire(sim))}`);
    $("carry").textContent = bits.join(" · ");
    const shake = mindLevel(sim) < 0.4 && !sim.tutorial ? Math.sin(sim.time * 90) * 0.5 * (0.4 - mindLevel(sim)) : 0;      // the needle will not sit
    $("compass").textContent = compass(sim.player.yaw + (compassOffset(sim) * Math.PI) / 4 + shake);

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
    // after dusk, at the camp: the day can end here
    const hint = $("sleepHint");
    const endDay = !sim.tutorial && !sim.over && sim.camp.up && isNight(sim.time) && atCamp(sim, sim.player) && !sim.work && !sim.plan.pending;
    hint.hidden = !endDay;
    const what = hourOf(sim.time) < 6 ? "sleep until morning" : "end the day";
    if (endDay) hint.textContent = sch === "touch" ? `Tap ${KEYS.touch.sleep} to ${what}` : `Press ${KEYS[sch].sleep} to ${what}`;
    $("work").textContent = sim.work ? workText(sim.work, sim) : "";
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

  return { title, recruit, choose, dawnPlan, duskPlan, ask, campMenu, pause, help, settings, end, tutorialEnd, confirm, hud, close, resetLog, rekey, hideHud, menu, get open() { return open; } };
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

const bar = (f, n = 12) => { const k = Math.round(Math.max(0, Math.min(1, f)) * n); return "▮".repeat(k) + "▯".repeat(n - k); };
function workText(w, sim) {
  switch (w.kind) {
    case "chop": return "Chopping. Time runs fast. Move to stop.";
    case "make": return `Making camp  ${bar(sim.pitch ? 1 - sim.pitch.left / PITCH_HOURS : 1)}  (move to stop)`;
    case "strike": return `Taking the camp down  ${bar(1 - w.left / STRIKE_HOURS)}  (move to stop)`;
    case "ask": return "Talking.";
    case "act": {
      const n = 12, f = Math.round(Math.min(1, w.t / w.need) * n);
      return `${w.label}  ${"▮".repeat(f)}${"▯".repeat(n - f)}`;
    }
    default: return "";
  }
}
