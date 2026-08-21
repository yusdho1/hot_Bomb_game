# CLAUDE.md - Modular Host-Client Web Game Architecture

## Tech Stack

* Frontend: Phaser 3 (Canvas/WebGL Rendering)
* Networking: PeerJS (WebRTC DataChannels for Host-Client P2P)
* Bundler: Vite
* Language: JavaScript ES6 / Modules

## Core Project Constraints

* **$0 Infrastructure & Hosting Cost**: No dedicated backend servers, databases, or paid cloud relays. PeerJS's free public signaling server handles connection bootstrapping only; all game traffic flows P2P over WebRTC DataChannels.
* **Low Technical Complexity**: Modular, clean, self-contained code. Avoid complex build setups, obscure frameworks, or heavy external npm packages.
* **Host-Authoritative Architecture**: The room Host runs the game loop, bomb timer logic, and collision detection. Clients strictly send input and render received state updates.

## Strict Architecture Rules

1. **Core Logic Decoupling**: Never import Phaser inside `src/core/` or `src/network/`. These directories must remain engine-independent (plain JS, testable without a renderer).
2. **Host Authority**: Only the player running `PeerHost.js` updates `bombTimer` and calculates collisions. Clients strictly render received states — they never mutate authoritative game state locally.
3. **Network Messages**: All P2P packets must strictly follow schema definitions in `NetworkMessages.js`. No ad-hoc message shapes.

## Directory Structure

```
hot_Bomb_game/
├── index.html              # Entry HTML: lobby DOM, puzzle-overlay + game-over DOM layers, mounts the Phaser canvas
├── package.json
├── vite.config.js
├── CLAUDE.md
└── src/
    ├── main.js              # Entry point: boots host or client mode, wires network -> render, mounts puzzle overlays
    ├── core/                # Engine-independent game state & rules (NO Phaser imports)
    │   └── BombState.js     # matchState: players/status, bombHolderId, bombTimer (personal), globalTimeRemaining
    ├── network/             # PeerJS connection handling (NO Phaser imports)
    │   ├── PeerHost.js      # Hosts a room, supports 2-8 connections, authoritative dual-timer loop, broadcasts state
    │   ├── PeerClient.js    # Joins a room via 4-letter code, sends puzzle results, receives state
    │   └── NetworkMessages.js  # Canonical message schema/types shared by host & client
    └── render/              # Phaser 3 scenes / rendering (the only layer allowed to import Phaser)
        ├── GameScene.js     # Spectator board: draws player avatars in a circle, timers, eliminated state
        ├── SoundManager.js  # Plain HTML5 Audio wrapper (no Phaser dependency) - music/SFX play/stop helpers
        ├── Haptics.js       # navigator.vibrate() wrapper (no Phaser dependency) - safe no-op if unsupported
        ├── avatarOptions.js # Category asset lists (UI/Avatars/*.png), random/localStorage helpers - no Phaser
        ├── AvatarRenderer.js # Pure DOM/CSS compositor: stacks face/eyes/mouth over a colored circle
        ├── AvatarCreator.js # Falling-item catch minigame that builds an avatar draft (DOM overlay, no Phaser)
        └── puzzles/         # One module per mini-game + the shared chrome that wraps them
            ├── PuzzleOverlay.js    # Banner/timer/streak-dots chrome; mounts one of the 3 games below
            ├── StroopPuzzle.js
            ├── SwipePuzzle.js
            └── WhackAMolePuzzle.js
```

Mini-game puzzles (the thing the current bomb holder solves to pass the bomb) are plain **DOM overlays**
positioned above the Phaser canvas (`#puzzle-overlay` in `index.html`, mounted/unmounted by `main.js`), not
Phaser scenes — touch buttons and swipe capture are simpler and more reliable as real DOM elements than
canvas hit-testing, and this keeps `GameScene.js` focused solely on the spectator view. Each puzzle module
only renders one attempt and calls back `onAttempt(success)`; `PuzzleOverlay.js` owns the shared banner/timer/
streak-dots chrome and picks which of the 3 games to mount (once per turn, reused for all 3 attempts in a
streak).

## Variable Naming Conventions

* `bombHolderId` — the `peerId` (string) of the player currently holding the bomb.
* `bombTimer` — the **personal fuse** timer (seconds, default 10s): the current holder has this long to complete a streak of `STREAK_TARGET` (3) correct puzzle attempts of the *same* mini-game type before elimination. A wrong attempt resets `streakCount` to 0 but does **not** reset `bombTimer` — only the timer itself running out eliminates. Owned and mutated only by the Host.
* `streakCount` — how many correct attempts in a row (0 to `STREAK_TARGET`) the current holder has landed this turn; reset to 0 whenever a new holder is assigned or a wrong attempt is registered (`registerPuzzleMiss`). Reaching `STREAK_TARGET` passes the bomb (`resolvePuzzleSuccess`).
* `globalTimeRemaining` — the **match clock** (seconds, host-configurable 30–120s at match start): when it hits 0, the current holder is eliminated and every other alive player wins.
* `matchDurationSeconds` — the match length chosen by the Host in the lobby before `beginMatch()`.
* `matchState` — the full serializable object broadcast from Host to Clients: `{ phase, players, bombHolderId, bombTimer, streakCount, globalTimeRemaining, matchDurationSeconds, eliminationNotice }`. This is the shape that must match `NetworkMessages.js`.
* `phase` — `'lobby' | 'active' | 'ended'`; drives which DOM/Phaser view is shown.
* `playerStatus` — per-player `'alive' | 'eliminated'`, stored in `matchState.players[].status`.
* `players[].name` — the display name a player chose in the lobby (sent by Clients via PeerJS connection `metadata`, by the Host via its own constructor arg); never trust it beyond display purposes.
* `players[].avatar` — `{ face, eyes, mouth }`, each a path into `UI/Avatars/`; chosen client-side (`avatarOptions.js`, persisted to `localStorage`) and threaded through exactly like `name` — the Host never interprets it, just stores and rebroadcasts.
* `players[].color` — hex string, the avatar's background circle; assigned by the Host (`pickUnusedColor` in `BombState.js`) from the fixed `AVATAR_COLORS` palette so no two players in the same room ever match. Not player-chosen.
* `eliminationNotice` — `{ eliminatedPlayerId, eliminatedPlayerName } | null`; set by the Host for a fixed 3s pause after an elimination (bomb held by nobody, personal timer not running) so all clients can show who was blown up before the bomb moves on. If that elimination leaves only one player alive, the Host skips the pause entirely and ends the match immediately instead.
* `roomCode` — the 4-letter (uppercase) code players use to connect; maps to the Host's PeerJS `peerId`.
* `playerId` — a connected peer's `peerId`, used as the key for tracking player state.

## UI Style Guidelines

All styling lives in `index.html`'s single `<style>` block — this documents what's already established there so new UI stays consistent rather than drifting.

**Tokens** (CSS custom properties on `:root`): `--font-display` (Baloo 2, headings/buttons/banners), `--panel-bg`/`--panel-border` (the dark-purple gradient panel used by every modal), `--accent-orange-top`/`--accent-orange-bottom`/`--accent-orange-border` (primary button + banner gradient), `--text-outline` (the dark-red multi-shadow outline on light text over busy backgrounds). Add new colors as tokens, not one-off hex values, so a future palette shift is a one-line change.

**Buttons** — every interactive button needs all four states, not just default+disabled:
- `.btn-primary` — the orange CTA gradient (Host/Join/Save/Start/etc.). Has `:hover` (brighter gradient + deeper shadow), `:active` (press down via `translateY`), `:disabled` (dimmed, no transform).
- `.btn-secondary` — subdued panel-bordered style for non-primary actions (Random/Customize/Cancel). Same `:hover`/`:active`/`:disabled` contract, just a quieter default look.
- `:hover` styles are pure CSS and simply never trigger on touch-only devices — no JS/feature-detection needed to support both input types.

**Modals/overlays** — one shared pattern: a `.modal-overlay` (fixed, full-viewport, dark backdrop) containing a `.puzzle-panel` (the gradient-bordered card — reused verbatim for the join popup and avatar creator rather than inventing new panel chrome per modal) with a `pop-in` entrance.

**Avatars**: `.avatar-stack` (relative + circular clip + colored background) wrapping stacked `.avatar-layer` images (`renderAvatar()` in `AvatarRenderer.js` builds this); size is controlled purely by whichever sizing class the caller adds (`.avatar-preview-lg` for the big entry/creator preview, `.avatar-thumb-sm` for player-list rows) — never inline dimensions.

**Animation timing conventions**: `pop-in` 0.35s (panels/game-over entrance), `shake-small` 0.2s (wrong puzzle attempt), `shake-big` 0.45s (elimination) — keep new feedback animations in this rough range rather than something jarringly longer/shorter.

DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:
Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.
Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character
Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
