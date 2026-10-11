# SEVIN

THE WOODS rebuilt from an empty repo. Seven (`Pappydapimp69/Seven`) holds the
design of record and does not work as a game at 0.40 (tutorial, UI, camp and
deadfall broken, per the owner). SEVIN keeps the design and the house rules and
none of the code. Read `docs/blueprint.md` first.

## House rules — still binding

- `sim.js` and `night.js` are the only mutators of a run. `percept.js` is the
  only module allowed to lie; it reads sim and never writes it. `render.js` and
  `ui.js` draw; they never decide.
- **The hidden meter never reaches the screen** — no number, no band name, no
  word for it. `tests/sim.test.mjs` greps the UI for it.
- **Constant roll count.** Every decision draws a fixed number of times. A
  night draws `NIGHT_DRAWS`, always. Asking draws nothing from the run stream:
  a fake's lie comes from a side stream keyed on (seed, fake, day).
- **Anything that gates an rng draw is save state.**
- **One seed per run.** The world is a pure function of it; saves regenerate.
- **Tells are DERIVED, never authored.** `chronicle.js` bends one fact using
  values from the same day, and only facts the player witnessed.
- **Negative-control every guard.** Break what it watches, watch it fail.
- **Every instruction names the device in the player's hand.** Text carries
  `{tokens}` (`keys.js`), filled per scheme when shown. Never write "press E".
  `tests/keys.test.mjs` fails on a bare key name and on a binding that drifts
  from its name.
- The pad is sampled on its own 60 Hz timer, not per frame: at a low frame rate
  a quick tap would otherwise fall between frames.
- Only `save.js` touches `localStorage`, keys `sevin:*` (one origin per
  GitHub account on Pages).

## Testing

- `npm test` — pure tier, every change.
- Browser play-throughs (Playwright, `/opt/pw-browsers/chromium` with
  `--headless=new` and SwiftShader) — once per batch. `window.__sevin` exposes
  the sim and verbs for them.
- A green suite says nothing about whether it is FUN or READABLE (Brain T11).
  A human playing a day is the test that matters.

<!-- brain:pointer v2 — managed by `brain link`/`sync`; edits here are overwritten -->
## Cognitive system: Brain (linked via `brain` CLI)
This project is linked to the Brain cognitive system. Do not read the node
repos directly — use the CLI.

**How to invoke it (try in order, use the first that runs):**
1. `brain <cmd>`
2. if `brain` is not found: `python "$HOME/.brain/Brain/bin/brain" <cmd>`
   (Windows PowerShell: `python "$env:USERPROFILE\.brain\Brain\bin\brain" <cmd>`)

When the user asks anything like "query save" / "ask brain X" / "mine this",
run the matching `brain` command yourself — do not make the user type paths.
Before non-trivial work: `brain query <terms>`. To capture lessons, write a
proposal file + `brain sync` (or `brain mine` for a work-list). `brain sync`
reconciles with main. Keep session output minimal.

### Using Brain well (read this before deciding it's empty)
- **Query with 1-2 KEYWORDS, not sentences.** `brain query reachability`, not
  `brain query "ai cannot reach the exit on a walled map"`. The matcher is
  keyword-based; long phrases return 0. **A 0-result query almost always means
  rephrase, not "empty system"** — try broader / single terms first, and read
  the `local:` bucket, not just the shared counts.
- **Re-query at each NEW sub-problem, not only at session start.** Every
  non-trivial bug or decision is its own retrieval trigger.
- **Capture non-bugs too, not only bugs:** reusable pattern -> `ideas`;
  unresolved fork -> `tension`; experiment/synthesis -> `exploration`; a
  committed decision -> an ADR in the build (and if it generalizes, ALSO an
  `ideas` kernel). See `orchestration.md`'s write-back table.
- **At each milestone, produce a Cognitive Update UNPROMPTED** (New Ideas,
  Memory, Tensions, Exploration, Graduation Candidates) — the standing rule in
  `orchestration.md`.
- **Surface any open (red/yellow) tension that touches your work to the user**
  before committing to that fork.
- **Never hand-write a proposal format.** `brain mine` prints the current
  schema verbatim from the memory repo — follow it exactly. A format you
  invent parses as an EMPTY entry and is held on every field at once.
<!-- /brain:pointer -->
