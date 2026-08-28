# Design Guidelines — Timeout Panic minigames

Read this before writing a new minigame — especially if an AI is writing it. Every rule here
exists because breaking it produced a real bug at some point in this project's history. The
clearest example: an earlier AI-generated minigame ("Emoji Match") used native HTML5
drag-and-drop and raw system emoji, ignoring every convention below — it silently didn't work on
touch devices at all, and looked different on every player's OS. It's been replaced (see
`src/render/puzzles/registry/WordMatch.js` for what the fix looks like in practice).

## Colors

All color tokens live as CSS custom properties on `:root` in `index.html`. Use them — never a raw
hex value for anything structural.

| Token | Meaning |
|---|---|
| `--font-display` | Baloo 2 — the only display font. Every heading, button, prompt, and label uses it. |
| `--panel-bg` / `--panel-border` | The dark-purple gradient panel background used by every modal and puzzle card. |
| `--accent-orange-top` / `--accent-orange-bottom` / `--accent-orange-border` | The primary CTA gradient — buttons, banners, the fuse bar, anything that should read as "the main interactive thing." |
| `--text-outline` | A dark-red multi-directional `text-shadow` that keeps light text readable over the busy gradient backgrounds. Apply it to any headline-weight text sitting directly on a panel background. |

Puzzle-specific colors (like Stroop's four swatches) are **not** hardcoded — they're declared in
each minigame's `settingsSchema` (see below) so a host can retheme them from the mod tool without
touching code. If your puzzle needs its own color(s), do the same: expose them as `type: 'color'`
schema fields rather than baking in hex literals.

## Typography

- **Baloo 2** (`var(--font-display)`) for everything with visual weight: titles, prompts, buttons,
  banners. Never system fonts, never a second display font.
- Font-weight is almost always `700` or `800` — this game doesn't use light/regular display text.
- Apply `var(--text-outline)`-based text-shadow to anything sitting on the gradient panel
  background (see `.puzzle-title-text` or `.stroop-word` in `index.html` for the exact shadow
  recipe) — plain text with no outline gets lost against the busy background.

## Panels, buttons, shapes

- Border radius: 10–20px depending on element size (small buttons ~10-12px, full panels ~20px).
  Never sharp corners.
- Solid borders, 2–3px, in `--panel-border` or `--accent-orange-border` — never a 1px hairline.
- A **generic "pick one of N" grid already exists**: `.puzzle-option-grid` /
  `.puzzle-option-btn` in `index.html`. If your puzzle is "show a prompt, tap the right answer
  out of a few options," reuse these classes — don't invent your own button styling. See
  `WordMatch.js` for the reference usage.
- If you genuinely need a different visual (not a plain option grid), stay inside the existing
  palette/font/radius rules above rather than introducing a new one-off look.

## Iconography — no raw emoji, no third-party icon fonts

Use one of, in order of preference:

1. **An existing sprite** from `public/UI/Sprites/` or `public/UI/Avatars/` — check what's already
   there via the mod tool's Avatars tab or `ls public/UI/Sprites` before assuming you need a new
   asset.
2. **Plain CSS** — a colored `div`, a shape, text. Fully controllable, zero asset weight, renders
   identically everywhere.
3. **A new PNG you add via the mod tool** — only if 1 and 2 genuinely can't express the idea.

**Never use raw Unicode emoji characters (💣🔥🎨 etc.) as game content.** They render as a
completely different picture on every OS/browser (Windows, macOS, iOS, and Android all ship
different emoji art), they're not stylable (can't recolor, can't guarantee they fit their
container), and this is a cross-platform party game where players are frequently on different
devices in the *same match* — an emoji-based puzzle looks different to every player simultaneously.

## Interaction patterns — the part that's easy to get wrong

This game runs on phones and on desktop in the same match, often simultaneously. Every
interaction pattern below has already been solved once — reuse the solution, don't reinvent it.

### Tap / click only (no drag)

If the whole interaction is "tap the right thing," a plain `click` listener is all you need — it
already fires correctly and identically on mouse and touch. **This is the default. Reach for
anything more only if the puzzle genuinely requires a drag or swipe gesture.**

Reference: `Stroop.js`, `WhackAMole.js`, `WordMatch.js`.

### Drag / swipe gestures

**Never use native HTML5 drag-and-drop** (`draggable="true"`, `dragstart`/`dragover`/`drop`,
`DataTransfer`). It does not fire reliably for touch-initiated gestures on mobile browsers without
extra polyfilling — a drag puzzle built this way is silently broken on phones, which is most of
this game's audience.

Use **Pointer Events** instead, with explicit pointer capture:

```js
zoneEl.addEventListener('pointerdown', (e) => {
  startX = e.clientX;
  startY = e.clientY;
  // Touch has implicit pointer capture per spec; mouse does not. Without this, a fast mouse
  // drag that exits the zone before button-up never fires pointerup here — it works fine on
  // touch and silently breaks on desktop.
  zoneEl.setPointerCapture(e.pointerId);
});
zoneEl.addEventListener('pointerup', (e) => {
  // compute the gesture from (e.clientX - startX, e.clientY - startY)
});
```

Reference: `Swipe.js` (a directional swipe) and `src/render/puzzles/ZipPuzzle.js` (a multi-cell
drag path) — both use exactly this pattern, nothing more.

### Timed / disappearing targets

A target that must be hit before it vanishes (à la whack-a-mole) is a plain `setTimeout` that
resolves the attempt as a miss if nothing happened in time — no special input handling needed
beyond a normal `click`. Reference: `WhackAMole.js`.

## Sizing and containment

- Any image or icon inside a fixed-size container needs `object-fit: contain` and explicit
  width/height — never let content size dictate the container's size mid-round (a bigger emoji or
  longer word appearing on a later attempt must not resize the puzzle around it).
- Text content should be tested with your longest realistic string, not just your first example —
  a word or label that's fine at 6 characters can overflow a button sized for that.

## The puzzle contract (recap)

```js
export const settingsSchema = [ /* optional — see below */ ];

function mount(contentEl, onAttempt, { difficulty }) {
  // Build your puzzle's DOM inside contentEl. Call onAttempt(true|false) on every attempt.
  // The shared chrome (banner, fuse-timer bar, streak dots) is already handled for you.
  // difficulty is 'easy' | 'medium' | 'hard' — the Host's choice for this match. Only read it
  // (via readPuzzleSettings, below) if your puzzle actually has a difficulty-tunable field.
  function nextRound() { /* set up the next attempt */ }
  nextRound();
  return { unmount() { /* stop timers, nothing else usually needed for click-only puzzles */ } };
}

export default { id: 'yourid', titleImg: '/UI/Whatever.png', mount }; // or titleText instead of titleImg
```

## Per-game settings (`settingsSchema`)

Any minigame can export a `settingsSchema` — an array describing tunable values the mod tool will
render as an editable form, grouped under that minigame's own section so it's clear which setting
belongs to which game:

```js
export const settingsSchema = [
  { key: 'roundTimeMs', label: 'Time per round (ms)', type: 'number', default: 1500 },
  { key: 'promptText', label: 'Prompt text', type: 'string', default: 'GO!' },
  { key: 'accentColor', label: 'Accent color', type: 'color', default: '#ff8800' },
];
```

Supported `type`s: `number`, `string`, `color`. Read the saved values **inside `mount()`**, not at
module load — see "Difficulty presets" below for why:

```js
import { readPuzzleSettings } from '../puzzleSettings.js';

function mount(contentEl, onAttempt, { difficulty }) {
  const settings = readPuzzleSettings('yourid', settingsSchema, difficulty);
  // ...use settings.roundTimeMs etc. from here down.
}
```

`readPuzzleSettings` merges whatever the host saved in the mod tool over your declared defaults,
so the puzzle works correctly even before anyone's touched its settings.

Don't force a schema onto a puzzle that doesn't need one — it's entirely valid to export none, as
`WordMatch.js` does.

## Difficulty presets

The Host picks a match-wide difficulty — Easy, Medium, or Hard — in the lobby. Any
`settingsSchema` field on any minigame can have a **per-level override** for that field, editable
from the mod tool's Minigames tab right below that game's base settings (three sub-blocks, one per
level). A level's override is optional per field: leave it blank in the tool and that field just
falls back to the base value for every difficulty — you only override the fields that actually
matter for difficulty.

This is why settings must be read **inside `mount()`** and not at module load: difficulty is a
per-match, host-chosen value (it can change between rounds, or even between two matches without
reloading the page), so `readPuzzleSettings(id, schema, difficulty)` has to be called fresh every
time a turn starts, using whatever difficulty the current match is set to — a module-top-level
`const settings = readPuzzleSettings(...)` would freeze in whatever difficulty happened to be
active the moment the page first loaded.

**Worked example** — `Stroop.js` exposes `colorCount` (how many of its 8 defined color swatches are
actually in rotation this turn) as a difficulty knob:

```js
export const settingsSchema = [
  // ...the 8 color fields...
  { key: 'colorCount', label: 'Number of colors in rotation (4-8)', type: 'number', default: 6 },
];

function mount(contentEl, onAttempt, { difficulty }) {
  const settings = readPuzzleSettings('stroop', settingsSchema, difficulty);
  const ACTIVE_COLORS = ALL_EIGHT_COLORS.slice(0, settings.colorCount);
  // Easy might set colorCount=4 in the mod tool, Hard might set it to 8 — Medium (and any turn
  // played before anyone's touched the presets) just uses the base value of 6.
}
```

No new export or file convention is needed to make a field difficulty-tunable — it's just a
regular `settingsSchema` field that the puzzle's own code happens to read per-turn. `WhackAMole.js`
does the same with its existing `gridSize` field (no new field needed at all), and `Swipe.js` adds
a `complexRuleChance` field to weight how often a harder ("don't"/"opposite") rule shows up vs a
plain swipe.

## Quick checklist before you're done

- [ ] Uses `.puzzle-option-grid`/`.puzzle-option-btn` (or another existing class) rather than
      one-off inline styles
- [ ] No raw emoji, no third-party icon font, no new image asset unless 1–2 above genuinely don't
      cover it
- [ ] Drag/swipe (if any) uses Pointer Events + `setPointerCapture`, never HTML5 drag-and-drop
- [ ] Has a `.puzzle-prompt` (or equivalent) telling the player what to do
- [ ] Tested with the longest realistic content string/value, not just the first example
- [ ] `npm run build` still passes
