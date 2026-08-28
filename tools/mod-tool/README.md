# Mod Tool

A standalone admin UI for editing Timeout Panic's minigames, sound effects, avatar assets, and
tunable settings — without hand-editing the game's source for routine additions or removals. It's
a completely separate tool from the game itself: it doesn't ship in the game bundle, and it runs
on its own local server.

**Before writing or editing any minigame's actual gameplay logic, read
[`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md).** This isn't optional polish — an earlier
AI-generated minigame skipped it and shipped using native HTML5 drag-and-drop (broken on touch
devices) and raw emoji (renders differently per OS). The tool can scaffold the file and wire it
into rotation for you, but it can't stop a new puzzle from looking and behaving inconsistently
with everything else if whoever writes the actual logic hasn't seen the conventions.

## Running it

```bash
npm run mod-tool
```

Opens on **http://127.0.0.1:5175**. It's bound to loopback-only (not your LAN), unlike the game's
own `npm run dev` (which deliberately *is* LAN-exposed so phones can join as players) — the mod
tool has file-write endpoints, so it stays local-only on purpose.

You can run it at the same time as `npm run dev` (port 5173) — they don't conflict. If you drop a
new minigame file into `registry/` or change `game.config.json` while the game's dev server is
running, Vite will do a **full page reload** of any open game tab (not a surgical hot-reload, since
these are generated/config files) — that's expected, not a bug, and it'll drop any in-progress test
match on that tab the same way any other file edit during dev would.

After using the tool for anything, the workflow is always the same:

1. Make your changes in the tool.
2. Run `npm run build` to confirm the game still compiles.
3. `git add -A && git commit` — the config changes, any new/removed asset files, and any new
   minigame file all go in **as one commit**, since they're one logical change.

## The minigame contract

Every file in `src/render/puzzles/registry/` must have a **default export** shaped like this:

```js
export default {
  id: 'yourid',              // lowercase, matches the "id" in game.config.json's minigames list
  titleImg: '/UI/Whatever.png',  // OR titleText: 'BANNER TEXT' — pick one, not both
  mount(contentEl, onAttempt) {
    // Build your puzzle's DOM inside contentEl.
    // Call onAttempt(true) or onAttempt(false) every time the player makes an attempt.
    // The shared chrome around you (banner, fuse-timer bar, streak dots) is already handled —
    // you only own the actual puzzle content and reporting attempts.
    return {
      unmount() {
        // Clean up any listeners/timers you started.
      },
    };
  },
};
```

That's the entire contract. Look at `src/render/puzzles/registry/Stroop.js` for a real, simple
example (a 4-color forced-choice puzzle).

`src/render/puzzles/registry/index.js` is a **generated barrel file** — it's just explicit
`import`/`export` statements listing every file in that folder. The mod tool regenerates it
automatically whenever you scaffold or delete a minigame through the UI. Don't hand-edit it; if
you ever add/remove a file by hand outside the tool, just click "Delete file" and re-scaffold, or
manually re-run the regeneration by scaffolding any placeholder and deleting it again (this
re-scans the folder as a side effect).

### Worked example: adding a new minigame from scratch

1. Open the **Minigames** tab, enter an id (e.g. `quickmath`) and a title (e.g. `QUICK MATH`),
   click **Scaffold file**.
2. This creates `src/render/puzzles/registry/QuickMath.js` from a template, regenerates
   `index.js` to import it, and adds `{ "id": "quickmath", "enabled": true }` to
   `game.config.json`'s `minigames` list. At this point it's already live in rotation and
   **actually runnable** — the template is a working (if trivial) "tap the right option" puzzle,
   not a blank TODO, so you can confirm it appears in rotation and functions before changing
   anything.
3. Open `QuickMath.js` and replace the placeholder content-generation with your real puzzle idea —
   keep reusing `.puzzle-option-grid`/`.puzzle-option-btn` (or read
   [`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md) first if your idea needs a different visual or
   a drag/swipe gesture). This part — the actual gameplay logic — is the one thing the tool can't
   do for you.
4. Test it in the game (`npm run dev`), then `npm run build` + commit as described above.

To remove a minigame: toggle it off in the list (non-destructive, the file stays on disk and can
be re-enabled anytime) or click **Delete file** to permanently remove the file and its config
entry.

## Per-game settings

Any minigame can export a `settingsSchema` (see `DESIGN_GUIDELINES.md` for the exact format) —
the mod tool reads it directly from the file (via a live import, so it always reflects what's
actually in the code) and renders an editable form for it in the **Minigames** tab, under a
clearly labeled section for that specific game — so a match-wide numeric setting (Settings tab)
and a single puzzle's own tunable (e.g. Stroop's four swatch colors, or WhackAMole's grid size and
mole visibility time) never get mixed together. Saved values live in `game.config.json`'s
`minigameSettings[id]`, read by the puzzle at module load via `readPuzzleSettings(id, schema)`
from `src/render/puzzles/puzzleSettings.js`. A puzzle with no `settingsSchema` just doesn't get a
section — that's the normal case for a puzzle with nothing worth exposing.

## Sounds

`game.config.json`'s `sounds` section maps a cue key (e.g. `smallSuccess`) to a list of candidate
files — one is picked at random every time that cue plays, so you can add variety to a sound
without any code change. Uploading a file to an *existing* key just adds a variant. Uploading to a
*new* key registers the file, but nothing will ever play it until some code calls
`SoundManager.play<YourNewMethod>()` — wiring a brand-new sound to a game event is the one part of
adding sounds that still needs a source-code change (one line in `src/render/SoundManager.js`,
plus wherever in `src/main.js` the event actually happens).

Removing a file via the "×" only removes it from the config — it does **not** delete the audio
file from `public/Sounds/`.

## Avatars

Each category in `game.config.json`'s `avatarParts.categories` (face, eyes, mouth, and any new
ones you add) is just a label plus a list of image paths. Uploading a PNG to a category adds it to
the pool immediately — the avatar creator's falling-item minigame and the customizer both pick it
up automatically, no code change needed. Adding a whole new category (e.g. "hat") works the same
way — nothing downstream hardcodes the category list, so a new one just shows up as another
option to catch.

## Settings

The **Settings** tab covers the single tunable numbers (fuse timer, streak target, point values,
Shop prices, etc). The *step arrays* used by the lobby's duration/zip-duration steppers
(`matchDurationSteps`, `zipStainSecondsSteps`) aren't exposed in the UI yet — edit those directly
in `src/config/game.config.json` if you need to change them.

## Safety notes

- The server only binds to `127.0.0.1` and only touches files inside this project (`src/config/`,
  `src/render/puzzles/registry/`, `public/Sounds/`, `public/UI/Avatars/`) — it sanitizes every
  uploaded filename to its basename and rejects anything containing `..` or a path separator.
- Config writes are atomic (write to a temp file, then rename over the real one), so an
  interrupted save can't leave `game.config.json` half-written.
- Nothing here talks to the network beyond your own machine — this tool has zero external
  dependencies and zero telemetry.
