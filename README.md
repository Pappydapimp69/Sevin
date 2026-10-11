# SEVIN

THE WOODS, rebuilt from scratch.

You walk a trail through the woods with five people and try to come out the
other side. Deadfalls block the trail; cutting one takes hours, and hours are
daylight. At dawn you set everyone's work. At dusk you say who keeps the fire.

At night, sometimes, one of them walks off into the dark, and something with
their name and their hands takes their place at the fire. Nothing announces
it. Nobody else finds it strange.

The only evidence is memory. Ask anyone about any day you lived through. A
real account is the day, told right. A false one is the same day with exactly
one fact bent: a wrong place, a wrong pair of hands, the order swapped, the
weather it was not, a name a letter off. The wrong detail is always taken from
what really happened, so there is nothing to memorise.

A pylon takes two pairs of hands, and a fake cannot be the second pair. At the
far side there is one more pylon home than you have real people. Every try
spends one.

## Play

No build step. Serve the folder:

```
python3 -m http.server
```

Then open http://localhost:8000. Start with **Training camp**.

| | Keyboard and mouse | Controller | Touch |
| --- | --- | --- | --- |
| walk | W A S D | left stick | left thumb |
| look | mouse (click the view) | right stick | right thumb |
| run | Shift | LT / L3 | push the left thumb all the way |
| use (pick up, chop, light, pylon) | E / Space | A | Use |
| ask the person you face | Q | X | Ask |
| whistle (whoever hears and is not busy comes) | F | Y | Whistle |
| camp: make, take down, plan, sleep | C | LB | Camp |
| sleep (from dusk) | Z | RB | Sleep |
| pause | Esc | Start | ☰ |
| menus | arrows, Enter, Esc | D-pad / stick, A, B | tap |

On-screen instructions follow whichever device you used last. Settings (pause
menu or title): volume, look speed, field of view, text size.

## Test

```
npm test                 # pure tier, ~1s
```

## Where things are

`docs/blueprint.md` — the design as built, and the module map.
The design of record lives in Seven: `docs/IDEAS.md`, "THE WOODS: full design
note", and `docs/blueprint-0.35-camp-tasks-and-time.md`.
