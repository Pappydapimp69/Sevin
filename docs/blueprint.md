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

## The studio card

The page opens on a Zane Paul Studios card (`splash.js`, `#splash`). It holds until
the player acts (any key, any pad button, a click or tap) because browsers will
not start sound before a gesture: that act calls `audio.begin()` (a three-note
sting, wind and a low drone under the title), the card fades, and only then
does the title show, so the release of a tap or a held key can never press a
title button. `#nosplash` skips it.

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
  when it ends. In the field you can only whistle: whoever hears it and is
  not on a shift whistles back and comes, after a moment.
- **Evenings.** From dusk everyone not with you comes in to the fire, lights it
  if there is wood, keeps it going and waits up for you. Awake after dark wears
  like night. The night is planned when you get back.
- **Using their judgement** (auto): each hour they score what the team needs
  (no camp, a low pile, a deadfall, the fire at evening) weighted by their own
  skills, take the top one, and spread out.
- **Keeping camp** (a task): stay at camp, bring in deadwood, keep the fire.
- **Tasks keep through the night.** After their shift (or dusk) nobody leaves
  the fire to work it, and a whistle from the dark does not pull them out; at
  first light they go back to it. The dawn plan opens on yesterday's work.
  A whistle (or no camp to go back to) keeps someone with you for the rest of
  that day only; their own task waits for the morning.
- **Camp.** One at a time. Take down 1h, make 2h, helpers speed both. The
  woodpile belongs to the camp. The fire belongs to the camp, burns wood, and
  only shields the campsite at night.
- **Sleep is a scene** (`main.js`): into the nearer tent (or down on the ground
  if away from camp), the light goes, a clock runs the hours to dawn, the
  morning comes up. The night is resolved once, in the dark.
- **Night.** Exposure-weighted: outside camp, no fire, deep, alone is worst.
  One real member at most is taken a night. A fake takes the slot with the same
  name and slightly better skills. Nobody is told.
- **Whistles.** Every whistle is made of its moment (`voice.js` `phrase`): the
  hour and minute, the distance, time played, how many whistles so far. The
  moment sets tempo, ornament (grace, trill, repeat, echo, hold), held notes
  across a distance, softness after dark. The person sets register and shape.
  Your own wanders further; nobody needs to recognise it. Heard out to 25 m.
  Never made from the hidden meter.
- **Voices.** Everyone whistles their own way (`voice.js`). A fake whistles
  the one it replaced with exactly one audible thing slightly off: a semitone,
  a narrower jump, a different pace. Derived, like the accounts.
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

## Your own mind (`phantom.js`)

Your meter drains like everyone's and nothing announces it. Below 0.55 the ground
offers sticks that are not there (same ones every time you look, derived from
seed, day and place); you can pick them up and the pack count rises, but only the
SHOWN count. Walking into camp you "drop" them and the pile does not grow.
Below 0.35, when the real fire dies at camp it seems to keep burning, shrinks on
schedule and asks to be fed; feeding spends REAL wood and warms nothing. Others at
camp tend the real fire, which ends it. Morning snaps shown back to true. No
number or word for the meter is ever shown.

## Not built in 0.1, on purpose

- The keystone morning (everyone vanishes and comes back in a new order).
- Further hallucinations: dead pylons seen as live, people who are not there.
- Meta-progression across runs (points returned for who you bring home).
- Seven's "four identical cairns" lesson is designed in: every landmark is drawn
  as what it is named, and no two in one area share a kind.

## Numbers to watch in play

| what | value | where |
| --- | --- | --- |
| game hour | 20 s | `SEC_PER_HOUR` |
| deadfall | 45 person-hours in area 1, 22 after; cut skill +18%/level | `world.js`, `chopRate` |
| gathering | an hour's chop, then home with 1-3 pieces; carrying makes more likely | `WOOD_CHOP_HOURS`, `woodPerChop` |
| carrying | pieces per chop; wood carried when moving camp | `woodPerChop` |
| building | camp up and down +15%/level | `sim.js` |
| watchfulness | on watch: night's take chance -3%/level (cap 18%), watch's extra exposure -25%/level | `night.js` |
| firecraft | each stick burns 1.5 h +20%/level; the watch uses its best hand | `burnHours` |
| hands | stick 0.35 s, feed 1.2 s, light / pylon / rescue 3 s; moving lets go | `ACT_TIME` |
| making camp | 5 person-hours (about 1 h with everyone), at the world's pace, drawn in stages | `PITCH_HOURS` |
| taking camp down | 2 person-hours | `STRIKE_HOURS` |
| fast-forward | chopping only (8x) | `WORK_SPEED` |
| drain | 0.0045/h x depth (1 + 0.6/area) x night | `DRAIN` |
| night take chance | 0.10 + 0.07/area + 0.25 cold or rough + 0.08/fake held + 0.25 x lost mind | `night.js` |
| pylon shield | 36 h | `PYLON_HOURS` |
| ask | 0.5 h | `ASK_HOURS` |
| daylight | full 07:00-16:30, sets to dark by dusk (18:00), first light at dawn (06:00) | `daylight` |
| whistle range | 25 m | `HEAR` |

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
