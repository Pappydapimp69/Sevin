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
- **Whistle (rework).** One whistle: everyone in earshot (25 m) whistles back and
  carries on with what they are doing. A second within 3 s: the nearest stops and
  comes to you for half an hour, then goes back to work. Hold the button and it
  is louder, longer and carries up to twice as far.
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

## The keystone morning (`night.js`)

On the third morning you wake and the camp is empty. They come back in out of the
trees one at a time, in a shuffled order, a way off (`startKeystone`). One real
person was swapped in the night so that some of them are, and some are not. The
plan opens when the last is back. From seed, no run-stream draws; old saves skip it.

## Your own mind (`phantom.js`)

Your meter drains like everyone's and nothing announces it. Below 0.75 the ground
offers sticks that are not there, fixed in the world on a 5 m grid (derived from
seed, day and cell, so nothing pops in round you). About 40% of them are not
sticks: come within 4 m and the thing wakes, hisses and slithers away, then sinks
into the leaves; you can pick them up and the pack count rises, but only the
SHOWN count. Walking into camp you "drop" them and the pile does not grow.
Below 0.35, when the real fire dies at camp it seems to keep burning, shrinks on
schedule and asks to be fed; feeding spends REAL wood and warms nothing. Others at
camp tend the real fire, which ends it. Morning snaps shown back to true. No
number or word for the meter is ever shown.

## Dead ends and the world (`mirage.js`, `illusions.js`)

After the third deadfall, 2-3 spurs leave the trail in the same dirt and end in a
small empty clearing (`world.js`, a side stream, so older content is unchanged).
For a mind that is going (below `MIRAGE_MIND`, 0.7, set on first walking in; a
steadier one gets plain dead ends for good): turn round and trees close the
way in; turn back and the dead end is a castle, a chest or a hole (by seed) that
draws away as you walk at it, the view opening and the fog drawing back while
you do; turn round and the way is back; turn back and it is gone, for good. A
timeout (4.5 game hours) opens the way whatever happens. Teammates see none of it.

World effects, all from the seed and the place, gated by the same hidden meter,
and all corrected by the world: trees lean in as you pass, rocks swell and show
a face for under a second, the fog breathes, the sky goes green, daylight
stutters, a moon too big and too low at night (then a second), a far camp-fire
that is out when you reach it, eyes on trunks that shut when looked at,
whispers, a compass that will not sit. Settings has Calm, which turns the camera
and world effects off. Brain T1 stands: a reactive hallucination is more
interesting but harder to hold to "stable reads as a place"; the seal is
state-driven and fixed to place for that reason.

## 0.2: the evening, the two o'clock wake, the golden tree

**Evening** (`sim.js`). From dusk the clock slows (45 s a game hour). At the fire
there is time for the team: *Sing* (each person at camp sings a verse made from
a fact of today, to their own whistle; a fake's verse comes from its bent
account) and *Whistles* (each whistles in turn, by name: where you learn them).
At 22:00 the clock stops: say who keeps watch, and you sleep. Away from camp at
22:00 you sleep where you stand.

**Night** (`night.js`). `sleep()` draws the whole night at once (constant roll
count) and runs 22:00 to 02:00. You always wake at 02:00. From 02:00 to 06:00
the clock runs at 300 s a game hour (20 minutes). Sleeping members do nothing;
the watch sits up. Anyone missing is out there only in this window: they
whistle back from the dark (heard to 70 m). Sleep again any time; awake at
06:00, dawn comes on its own (`dawn()`).

**Refusal zone.** 12 m round every active rescue spot. Nobody but you goes in.
They stop at the edge: the real ones turn their backs; a fake faces in.

**Golden tree** (`grove.js`). On the night someone is taken, their spot sometimes
holds a glowing tree instead of them (never on a later night). It is outside the hidden meter (the woods made it). It
whistles in their voice like they would. Chop it: something drops every 2-3
chops; the tree never falls. The chop follows the body inside it:
- a real tree (the person is in a pocket beside it, unseen): glow sticks and one
  fruit; fruit odds by drop 0/30/50/75/100%; four branches and the fruit and it
  is done.
- a person: arms first (always the first drop), then the head (30% on the second
  chop if both arms were there, certain once they are gone), then the legs.
Before the fruit falls they can still be found on a later night, without the
arms they lost (one arm: half their skills; two: none). When the fruit falls
the whistling stops and they are gone, real tree or not. One fruit per missing
person. The woods remember: the tree keeps its scars and its look until chopped
out; then the next one looks different. Nothing is left of a real tree at dawn;
a person stands one more day.
- The tell: its shadow. In the low sun (06:00-07:00) or by a real glow stick, a
  person's tree casts a person.
- Glow sticks are lit at the campfire only. Lit, a real one holds off what the
  mind makes up for three hours. A limb will not catch.
- The fruit fills both hands until you walk into camp. Eaten (real): for six
  hours the real world dims and the view narrows and everything the mind makes
  up shows full; its own hidden meter, full at first, drains x2 below 0.85, x3
  below 0.75, x4 below 0.5. Your real meter is untouched.
- Firelight is honest: at camp a head is a head. The team sees it; a fake wearing
  that name reacts wrong. Remains at camp: bury (1 h), burn (fuel, everyone
  pays), or ask the head about one day, once: the only witness that cannot be a
  fake.
- At 06:00 what lies on the ground turns true: glow sticks go to plain wood,
  limbs are limbs.

## Wood and the camp site

You mark where the camp goes (camp menu); that is the drop zone the team brings
wood to, and your own wood drops there as you walk up. A camp takes 10 from that
pile only. You carry 10 with no camp up, 5 with one; a teammate carries 4. With
no site marked, gatherers cut until their arms are full and wait by you. Taking
camp down leaves the pile where it stood and gives you back the 10 it was made
of. Moving a site leaves its wood behind too. Gatherers haul an old pile to the
new camp or site on 80% of trips (side hash per trip). Tasks are set at camp, in
daylight, any time; everyone starts on auto.

## Calls: the whistle pad (`voice.callOf`, `sim.playCall`, `ui.whistlePad`, `ui.learn`)

Like an ocarina. Everyone has a call: four notes, up/right/down/left, from the
seed and their id; a fake's is the real one with one note moved. In the evening
at the fire, "Learn their calls": each one awake whistles theirs and you play it
back; learned, it is remembered under the NAME, as heard from whoever whistled
it. Hold the whistle button for the pad (a tap is still a plain whistle):
play four notes and whistle it. Whoever's call it is answers with their own
call, shown as notes and heard from where they are; by day the nearest of them
comes. A fake answers to the call it wears, but in its own, one note off. The
missing answer from the dark in the small hours. Once everyone at camp has
turned in there is nobody to learn from and nobody to set the watch with; still
up at one, you drop where you stand.

## The morning choice (`ui.choose`, `percept.voteOf`)

Two of one person cannot both see the morning. At dawn, if a rescued one sits
beside the thing wearing their name, it is a game show: "Which one is X?", A or
B, and three lifelines for the whole walk. Ask the team: a poll. Ask one: a pick
and how sure. Ask both about a day: two accounts side by side, one bent. Real
teammates are surer the longer they walked with the real one (0.55, +0.08 a
shared day or fact, to 0.9); a far-gone mind guesses; a fake points at the fake
and is sure. Final answer: the other walks into the trees, for good. Nobody says
whether you were right (Brain E24: a paid 1-of-2; E40: memory decides).

## Not built in 0.1, on purpose

- Further hallucinations: dead pylons seen as live, people who are not there.
- Meta-progression across runs (points returned for who you bring home).
- Seven's "four identical cairns" lesson is designed in: every landmark is drawn
  as what it is named, and no two in one area share a kind.

## Numbers to watch in play

| what | value | where |
| --- | --- | --- |
| game hour | 20 s | `SEC_PER_HOUR` |
| deadfall | 90 person-hours in area 1, 44 after; cut skill +18%/level | `world.js`, `chopRate` |
| gathering | an hour's chop, one piece | `WOOD_CHOP_HOURS` |
| fire burn rate | x(1 + 0.5 per area of depth) | `burnRate` |
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
