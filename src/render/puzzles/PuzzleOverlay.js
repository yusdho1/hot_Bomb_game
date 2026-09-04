import { REGISTRY } from './registry/index.js';
import { SoundManager } from '../SoundManager.js';
import { PERSONAL_TIMER_SECONDS } from '../../core/BombState.js';
import gameConfig from '../../config/game.config.json';

// Which of the registered minigames are actually active is controlled entirely by
// game.config.json (edited via the mod tool) — this file never needs a per-puzzle edit again.
const ENABLED_IDS = new Set(gameConfig.minigames.filter((m) => m.enabled).map((m) => m.id));
export const PUZZLES = REGISTRY.filter((p) => ENABLED_IDS.has(p.id));

// A real per-player bag of remaining puzzle ids — module-scoped (not exported/reset) since
// puzzle selection happens independently on each player's own device, never synced by the Host.
// Each pick removes that id from the bag; once empty it refills with every enabled id, so a
// player never sees a repeat until they've had every other type at least once. A skipped turn
// never calls pickPuzzle() at all (mountPuzzleOverlay simply isn't invoked that turn), so it
// never touches the bag — nothing to special-case there. Only used for the real match (never in
// practiceMode, which always asks for a specific puzzleId).
let pool = [];
// The refill below excludes this id specifically to prevent it — without that exclusion, the
// last id of one cycle and the first id of the next are picked completely independently, so
// they can (and empirically do, ~4% of turns) land on the same puzzle back to back right at
// that boundary, even though within any single cycle no repeat is possible.
let lastPickedId = null;
// Which id set `pool` was last built from — the Host can narrow matchState.enabledMinigameIds
// per-match from the lobby's Advanced Settings popup, so a bag built for a previous match (or
// before a mid-lobby change) needs rebuilding rather than serving stale/now-disabled ids.
let poolIdsKey = null;

function pickPuzzle(activePuzzles) {
  const idsKey = activePuzzles.map((p) => p.id).join(',');
  if (idsKey !== poolIdsKey) {
    pool = [];
    poolIdsKey = idsKey;
  }
  if (pool.length === 0) {
    pool = activePuzzles.map((p) => p.id);
    if (lastPickedId && pool.length > 1) pool = pool.filter((id) => id !== lastPickedId);
  }
  const idx = Math.floor(Math.random() * pool.length);
  const [id] = pool.splice(idx, 1);
  lastPickedId = id;
  return activePuzzles.find((p) => p.id === id);
}

// Owns the shared chrome around whichever puzzle module is picked. This is a full-page layout,
// not a popup card — the active holder's puzzle is the entire screen while it's up, stacked
// top-to-bottom: title -> fuse timer -> streak dots -> a framed game box (the only part with a
// panel background/border) -> a small footer logo. Two modes:
//
// - Real match (default): title + fuse-timer bar + streak dots, puzzle type chosen once per call
//   (i.e. once per holder turn) from the per-player bag above and reused for every attempt within
//   that turn, per the "N in a row, same type" rule (N = streakTarget, host-configurable 1-4).
//
// - practiceMode (Tutorial Mode's practice loop, and the mod tool's debug preview): title + a
//   short explanation line + ‹ › nav buttons, no timer/dots (neither concept applies — nothing is
//   being timed or counted toward passing anything). Mounts an exact `puzzleId` instead of
//   drawing from the bag (both callers want a *specific* type, not a random one). Prev/Next just
//   invoke the caller's own `onPrev`/`onNext` — this function stays stateless per call, same as
//   every other call site; the caller (main.js) owns "which index" the same way it already does
//   for the How-to-Play carousel.
export function mountPuzzleOverlay(
  containerEl,
  { onAttempt, streakTarget, difficulty, minigameDifficulty, practiceMode, puzzleId, onNext, onPrev, enabledIds }
) {
  containerEl.innerHTML = '';

  // enabledIds is the current match's per-round narrowing (matchState.enabledMinigameIds, set by
  // the Host in the lobby's Advanced Settings popup) — falls back to every mod-tool-enabled
  // puzzle if omitted (practiceMode callers, or a stale/empty list) so this never has zero to pick
  // from.
  const activePuzzles =
    !practiceMode && Array.isArray(enabledIds) && enabledIds.length > 0
      ? PUZZLES.filter((p) => enabledIds.includes(p.id))
      : PUZZLES;
  const chosen = practiceMode
    ? PUZZLES.find((p) => p.id === puzzleId) || PUZZLES[0]
    : pickPuzzle(activePuzzles.length > 0 ? activePuzzles : PUZZLES);

  // practiceMode callers (Tutorial Mode, the mod tool's debug preview) already resolve their own
  // per-game difficulty before calling in — minigameDifficulty is only consulted for a real match
  // turn, where `difficulty` is the round's flat global fallback for a game with no override.
  const effectiveDifficulty = !practiceMode && minigameDifficulty?.[chosen.id] ? minigameDifficulty[chosen.id] : difficulty;

  const page = document.createElement('div');
  page.className = 'puzzle-page';

  const header = document.createElement('div');
  header.className = 'puzzle-banner puzzle-header';
  if (chosen.titleImg) {
    const img = document.createElement('img');
    img.src = chosen.titleImg;
    img.alt = '';
    header.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'puzzle-title-text';
    span.textContent = chosen.titleText;
    header.appendChild(span);
  }
  page.appendChild(header);

  let timerEl = null;
  let fuseBurnt = null;
  let dots = [];

  if (practiceMode) {
    const explanationEl = document.createElement('div');
    explanationEl.className = 'puzzle-prompt puzzle-tutorial-text';
    explanationEl.textContent = chosen.tutorialText || 'Give it a try — no timer, no pressure!';
    page.appendChild(explanationEl);
  } else {
    // Bomb sits fixed at the left; the fuse burns from the far (right) end toward it, so the
    // flame/spark travels right-to-left and reaches the bomb exactly as bombTimer hits 0.
    const fuseRow = document.createElement('div');
    fuseRow.className = 'puzzle-fuse-row';

    const fuseBombIcon = document.createElement('img');
    fuseBombIcon.className = 'puzzle-fuse-bomb';
    fuseBombIcon.src = '/UI/BombNoFuse.png';
    fuseBombIcon.alt = '';
    fuseRow.appendChild(fuseBombIcon);

    const fuseRope = document.createElement('div');
    fuseRope.className = 'puzzle-fuse-rope';
    fuseBurnt = document.createElement('div');
    fuseBurnt.className = 'puzzle-fuse-burnt';
    const fuseSpark = document.createElement('div');
    fuseSpark.className = 'puzzle-fuse-spark';
    fuseBurnt.appendChild(fuseSpark);
    fuseRope.appendChild(fuseBurnt);

    timerEl = document.createElement('span');
    timerEl.className = 'puzzle-timer';
    fuseRope.appendChild(timerEl);

    fuseRow.appendChild(fuseRope);
    page.appendChild(fuseRow);

    const dotsEl = document.createElement('div');
    dotsEl.className = 'puzzle-dots';
    dots = Array.from({ length: streakTarget || 3 }, () => {
      const dot = document.createElement('div');
      dot.className = 'puzzle-dot';
      dotsEl.appendChild(dot);
      return dot;
    });
    page.appendChild(dotsEl);
  }

  const gameBox = document.createElement('div');
  gameBox.className = 'puzzle-game-box';
  const contentEl = document.createElement('div');
  contentEl.className = 'puzzle-content';
  gameBox.appendChild(contentEl);
  page.appendChild(gameBox);

  if (practiceMode) {
    const navEl = document.createElement('div');
    navEl.className = 'puzzle-tutorial-nav';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'puzzle-tutorial-nav-btn';
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', () => onPrev && onPrev());
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'puzzle-tutorial-nav-btn';
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', () => onNext && onNext());
    navEl.append(prevBtn, nextBtn);
    page.appendChild(navEl);
  } else {
    const logo = document.createElement('img');
    logo.className = 'puzzle-footer-logo';
    logo.src = '/UI/Main Title.png';
    logo.alt = '';
    page.appendChild(logo);
  }

  containerEl.appendChild(page);

  // Tracks the current streak's position locally (reset each time mountPuzzleOverlay is called,
  // i.e. once per holder turn) so a correct attempt plays that position's own combo cue instead of
  // the flat smallSuccess sound every time — this fires optimistically off the local tap, same as
  // the plain sound it replaces, rather than waiting on host round-trip confirmation.
  let comboIndex = 0;
  function wrappedOnAttempt(success) {
    if (success) {
      comboIndex += 1;
      SoundManager.playComboSuccess(comboIndex);
    } else {
      comboIndex = 0;
      SoundManager.playSmallFailed();
    }
    onAttempt(success);
  }

  // streakTarget is passed through so a puzzle whose own internal structure already implies a
  // natural "done" point (WordMatch: every pair on the board matched) can report success that
  // many times at once, satisfying the shared streak-to-pass counter in one shot instead of
  // needing multiple separate rounds. Optional — most puzzles ignore it and just report each
  // attempt as it happens (see the contract in DESIGN_GUIDELINES.md).
  const puzzleHandle = chosen.mount(contentEl, wrappedOnAttempt, { difficulty: effectiveDifficulty, streakTarget: streakTarget || 3 });

  return {
    updateTimer(seconds) {
      if (!timerEl) return;
      const clamped = Math.max(0, seconds);
      timerEl.textContent = `${clamped.toFixed(1)}s`;
      const burntPct = (1 - clamped / PERSONAL_TIMER_SECONDS) * 100;
      fuseBurnt.style.width = `${Math.min(100, Math.max(0, burntPct))}%`;
    },
    updateStreak(count) {
      dots.forEach((dot, i) => dot.classList.toggle('filled', i < count));
    },
    unmount() {
      if (puzzleHandle && puzzleHandle.unmount) puzzleHandle.unmount();
      containerEl.innerHTML = '';
    },
  };
}
