// IntroConfig.js — the tunable numbers for the studio intro (copied from the game's Config.js).
// ---- Studio intro splash (js/StudioIntro.js) ----
// Per direct request, a "PARDON MY GAMES / STUDIO PRESENTS..." splash plays before the start menu. All times in
// seconds from the moment the splash opens; every one is a plain literal so the dev tool's Variables tab can edit it.
export const STUDIO_INTRO_START_DELAY_S = 0.25; // pause on the empty dark screen before the first letter launches
export const STUDIO_INTRO_LETTER_STAGGER_S = 0.09; // gap between one letter launching and the next (PARDON -> MY -> GAMES run back to back)
export const STUDIO_INTRO_BLIP_START_S = 0.3; // per direct request the 13 bubble-up blips start sooner than the first landing (0.87s) so the sound leads the picture
export const STUDIO_INTRO_BLIP_INTERVAL_S = 0.15; // ...and play slower than the letters land (0.09s apart), one per letter, each a little higher
export const STUDIO_INTRO_LETTER_FLY_S = 0.62; // one letter's flight from off-screen to its spot, ending in the bouncy overshoot
export const STUDIO_INTRO_FLOAT_RAMP_S = 0.6; // how long a word takes to ease into its hover once its last letter lands
export const STUDIO_INTRO_FLOAT_AMP_PX = 7; // hover height at a 1080px-tall screen (scales with the screen)
export const STUDIO_INTRO_FLOAT_SPEED = 2.2; // hover speed, radians/second
export const STUDIO_INTRO_FLOAT_WORD_PHASE = 1.3; // radians of hover offset between PARDON, MY and GAMES, so the words never move in step
export const STUDIO_INTRO_PRESENTS_DELAY_S = 0.45; // gap between the last word starting to hover and "STUDIO PRESENTS..." appearing
export const STUDIO_INTRO_PRESENTS_CHAR_STAGGER_S = 0.045; // gap between each character of "STUDIO PRESENTS..." sliding up
export const STUDIO_INTRO_PRESENTS_CHAR_FADE_S = 0.4; // one character's slide-up + fade
export const STUDIO_INTRO_HOLD_S = 2.5; // how long the finished screen stays up before it moves on to the start menu by itself
export const STUDIO_INTRO_BURST_COUNT = 56; // sparkles/pixel bits thrown out when "STUDIO PRESENTS..." appears
export const STUDIO_INTRO_AMBIENT_COUNT = 34; // bubbles/stars/hearts drifting around once the burst has gone off
