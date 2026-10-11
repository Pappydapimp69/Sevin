# SEVIN — blueprint

SEVIN is THE WOODS rebuilt from an empty repo. Seven (the fork of MIRAGE)
carries the design of record, `Seven/docs/IDEAS.md` "THE WOODS: full design
note" and `Seven/docs/blueprint-0.35-camp-tasks-and-time.md`. Seven at 0.40 does
not work as a game: tutorial, UI, camp and deadfall are broken. SEVIN keeps the
design and the house rules and drops the code.

## Why from scratch

Seven grew THE WOODS on top of MIRAGE's survey game. The two share verbs,
state, HUD and save, so every new organ was wired through bones built for a
different game. SEVIN has one game, so each module has one job.

## Modules

| file | job | DOM/Three? |
| --- | --- | --- |
| `src/rng.js` | seeded rng with a saveable state word | no |
| `src/names.js` | composed names, near-miss names | no |
| `src/world.js` | the map: a pure function of the seed | no |
| `src/chronicle.js` | facts, accounts, the one bent fact | no |
| `src/sim.js` | the ONLY mutator of run state; `tick(sim, dt, input)` | no |
| `src/night.js` | sleep to dawn: fire, takes, fakes, the call | no |
| `src/tutorial.js` | the walk-in: steps gated on state | no |
| `src/percept.js` | what the player is told; reads sim, never writes | no |
| `src/save.js` | the only `localStorage` caller, keys `sevin:*` | no |
| `src/render.js` | three.js scene, reads sim + percept | Three |
| `src/ui.js` | HUD, plans, ask, menus | DOM |
| `src/input.js` | keys, mouse, touch -> one input object | DOM |
| `src/main.js` | the loop | both |

## The run

- **Map.** A trail south to north through five areas. Dense forest you cannot
  walk through, one path, clearings with distinct landmarks (creek, birch
  stand, rock shelf, old burn, pond, standing stones). Deadfalls lie across the
  trail in areas 1, 3 and 4: a time gate, never a wall. Area 5 is the far side.
- **Clock.** 1 game hour = 20 s. Dawn 06:00, dusk 18:00. Holding a work verb
  runs time 8x. The day ends when you sleep.
- **Party.** Five recruited companions, 10 skill points across cut, carry and
  fire. Anyone can do anything; skill makes it faster. Skills grow with
  practice, with noise.
- **Plan.** Dawn at camp sets tasks (chop, gather, follow, guard camp). Dusk sets
  watch or sleep, and lights the fire. A task is a shift; a member comes home
  when it ends. In the field you can only call people to you.
- **Camp.** One at a time. Take down 1h, make 2h, helpers speed both. The
  woodpile belongs to the camp. The fire belongs to the camp, burns wood, and
  only shields the campsite at night.
- **Night.** Exposure-weighted: outside camp, no fire, deep, alone is worst.
  One real member at most is taken a night. A fake takes the slot with the same
  name and slightly better skills. Nobody is told.
- **The call.** At first light, a voice from a bearing (8 directions). False
  calls also happen, so a call is not an announcement; a bearing that holds
  across dawns is the tell. It fades with nights out, with a floor, and stops
  when the camp moves two areas past them.
- **Rescue.** Only you can bring someone back. They come home beside the one
  who never left, same name. One of two is real.
- **Ask.** Ask anyone about any day you lived through. Costs half an hour.
  Accounts are derived from the day's record. A fake's has exactly one fact
  bent, using values from that same record, and only a fact you witnessed.
- **Pylons.** 3 in area 1, 2-4 after. Lighting takes two pairs of hands. It
  shields the area's depth for 36h (blue to red). A fake cannot be the second
  pair of hands: it vanishes. The pylon is spent either way.
- **The far side.** Pylons home = real members + 1. Each one sends one person
  home with the pair of hands that lit it. Every attempt spends one. You can
  always walk out alone.

## Not built in 0.1, on purpose

- The keystone morning (everyone vanishes and comes back in a new order).
- Your own mind going: the player's hidden meter drains but changes nothing yet.
  The design's fabricated fire and phantom wood belong here.
- Meta-progression across runs (points returned for who you bring home).
- Seven's "four identical cairns" lesson is designed in: every landmark is drawn
  as what it is named, and no two in one area share a kind.

## Numbers to watch in play

| what | value | where |
| --- | --- | --- |
| game hour | 20 s | `SEC_PER_HOUR` |
| deadfall | 22 person-hours, cut skill +18%/level | `world.js`, `chopRate` |
| drain | 0.0045/h x depth (1 + 0.6/area) x night | `DRAIN` |
| night take chance | 0.10 + 0.07/area + 0.25 cold or rough + 0.08/fake held + 0.25 x lost mind | `night.js` |
| pylon shield | 36 h | `PYLON_HOURS` |
| ask | 0.5 h | `ASK_HOURS` |

None of these has met a human player. Brain T11: automated 3D verification
checks logic, not whether it reads or whether it is fun.

## House rules (from Seven, still binding)

- `sim.js`/`night.js` mutate; `percept.js` lies; render and UI read percept.
- Hidden meters never reach the screen.
- Constant roll count: every decision draws a fixed number of times.
- Anything that gates an rng draw is save state.
- One seed per run; never device state.
- Tells are DERIVED from the record, never authored.
- Negative-control every guard.
