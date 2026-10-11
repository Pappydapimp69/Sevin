# SEVIN

A dice-chain puzzle. Drag across touching dice (diagonals count) that add up to exactly **7**.

- Cleared dice fall, new ones roll in from the top.
- Score = 7 × length². A chain of seven ones is the jackpot (×7).
- You start with 77 seconds; every chain adds `length − 1` seconds.
- Dead boards reshuffle. Stall for 8s and a hint pulses.
- **Daily** gives everyone the same board for the UTC date.

## Run

No build step. Serve the folder and open it:

```
python3 -m http.server
```

## Test

```
npm test
```

## Layout

- `src/game.js` — pure logic (seeded rng, rules, gravity, move search). No DOM.
- `src/main.js` — input, drawing, timer loop.
- `tests/game.mjs` — logic tests.
