import { REGISTRY } from './registry/index.js';
import { SoundManager } from '../SoundManager.js';
import { PERSONAL_TIMER_SECONDS } from '../../core/BombState.js';
import gameConfig from '../../config/game.config.json';

// Which of the registered minigames are actually active is controlled entirely by
// game.config.json (edited via the mod tool) — this file never needs a per-puzzle edit again.
const ENABLED_IDS = new Set(gameConfig.minigames.filter((m) => m.enabled).map((m) => m.id));
const PUZZLES = REGISTRY.filter((p) => ENABLED_IDS.has(p.id));

// A real per-player bag of remaining puzzle ids — module-scoped (not exported/reset) since
// puzzle selection happens independently on each player's own device, never synced by the Host.
// Each pick removes that id from the bag; once empty it refills with every enabled id, so a
// player never sees a repeat until they've had every other type at least once. A skipped turn
// never calls pickPuzzle() at all (mountPuzzleOverlay simply isn't invoked that turn), so it
// never touches the bag — nothing to special-case there.
let pool = [];

function pickPuzzle() {
  if (pool.length === 0) pool = PUZZLES.map((p) => p.id);
  const idx = Math.floor(Math.random() * pool.length);
  const [id] = pool.splice(idx, 1);
  return PUZZLES.find((p) => p.id === id);
}

// Owns the shared chrome (banner, timer, streak dots, footer logo) around whichever puzzle
// module is picked. The puzzle type is chosen once per call (i.e. once per holder turn) and
// reused for every attempt within that turn, per the "N in a row, same type" rule (N =
// streakTarget, host-configurable 1-4). Draws from the per-player bag above, so it never repeats
// a type until every other type has come up at least once.
export function mountPuzzleOverlay(containerEl, { onAttempt, streakTarget, difficulty }) {
  containerEl.innerHTML = '';

  const chosen = pickPuzzle();

  const panel = document.createElement('div');
  panel.className = 'puzzle-panel';

  const banner = document.createElement('div');
  banner.className = 'puzzle-banner';
  if (chosen.titleImg) {
    const img = document.createElement('img');
    img.src = chosen.titleImg;
    img.alt = '';
    banner.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'puzzle-title-text';
    span.textContent = chosen.titleText;
    banner.appendChild(span);
  }
  panel.appendChild(banner);

  // Bomb sits fixed at the left; the fuse burns from the far (right) end toward it, so the
  // flame/spark travels right-to-left and reaches the bomb exactly as bombTimer hits 0.
  const fuseRow = document.createElement('div');
  fuseRow.className = 'puzzle-fuse-row';

  const fuseBombIcon = document.createElement('img');
  fuseBombIcon.className = 'puzzle-fuse-bomb';
  fuseBombIcon.src = '/UI/Bomb.png';
  fuseBombIcon.alt = '';
  fuseRow.appendChild(fuseBombIcon);

  const fuseRope = document.createElement('div');
  fuseRope.className = 'puzzle-fuse-rope';
  const fuseBurnt = document.createElement('div');
  fuseBurnt.className = 'puzzle-fuse-burnt';
  const fuseSpark = document.createElement('div');
  fuseSpark.className = 'puzzle-fuse-spark';
  fuseBurnt.appendChild(fuseSpark);
  fuseRope.appendChild(fuseBurnt);

  const timerEl = document.createElement('span');
  timerEl.className = 'puzzle-timer';
  fuseRope.appendChild(timerEl);

  fuseRow.appendChild(fuseRope);
  panel.appendChild(fuseRow);

  const dotsEl = document.createElement('div');
  dotsEl.className = 'puzzle-dots';
  const dots = Array.from({ length: streakTarget || 3 }, () => {
    const dot = document.createElement('div');
    dot.className = 'puzzle-dot';
    dotsEl.appendChild(dot);
    return dot;
  });
  panel.appendChild(dotsEl);

  const contentEl = document.createElement('div');
  contentEl.className = 'puzzle-content';
  panel.appendChild(contentEl);

  const logo = document.createElement('img');
  logo.className = 'puzzle-footer-logo';
  logo.src = '/UI/Main Title.png';
  logo.alt = '';
  panel.appendChild(logo);

  containerEl.appendChild(panel);

  function wrappedOnAttempt(success) {
    if (success) SoundManager.playSmallSuccess();
    else SoundManager.playSmallFailed();
    onAttempt(success);
  }

  const puzzleHandle = chosen.mount(contentEl, wrappedOnAttempt, { difficulty });

  return {
    updateTimer(seconds) {
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
