import { StroopPuzzle } from './StroopPuzzle.js';
import { SwipePuzzle } from './SwipePuzzle.js';
import { WhackAMolePuzzle } from './WhackAMolePuzzle.js';
import { SoundManager } from '../SoundManager.js';
import { PERSONAL_TIMER_SECONDS } from '../../core/BombState.js';

const PUZZLES = [
  { titleImg: '/UI/Stroop Title.png', mount: StroopPuzzle.mount },
  { titleImg: '/UI/Swipe.png', mount: SwipePuzzle.mount },
  { titleText: 'WHACK-A-MOLE', mount: WhackAMolePuzzle.mount },
];

// Owns the shared chrome (banner, timer, streak dots, footer logo) around whichever puzzle
// module is picked. The puzzle type is chosen once per call (i.e. once per holder turn) and
// reused for every attempt within that turn, per the "3 in a row, same type" rule.
export function mountPuzzleOverlay(containerEl, { onAttempt }) {
  containerEl.innerHTML = '';

  const chosen = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];

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
  const dots = [0, 1, 2].map(() => {
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

  const puzzleHandle = chosen.mount(contentEl, wrappedOnAttempt);

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
