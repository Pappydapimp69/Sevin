// splash.js — the studio card. Pure; the DOM and sound live in main.js/audio.js.
//
// It holds until the player acts, because a browser will not start sound
// before a gesture: the act that dismisses it is the one that starts the
// audio and goes on to the title.

import { keyed } from "./keys.js";

export const STUDIO = "Zane Paul Studios";
export const GAME = "SEVIN";

/** What the card says to do, in the words of the device in the player's hand. */
export const splashPrompt = (scheme) => keyed("{begin}", scheme);

/** Skip it (tests, a link with #nosplash). */
export const skipSplash = (hash, search) => /(^|[#?&])nosplash\b/.test(String(hash) + String(search));
