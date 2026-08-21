import { StroopPuzzle } from './StroopPuzzle.js';
import { SwipePuzzle } from './SwipePuzzle.js';
import { WhackAMolePuzzle } from './WhackAMolePuzzle.js';
import { SoundManager } from '../SoundManager.js';

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
  const timerEl = document.createElement('span');
  timerEl.className = 'puzzle-timer';
  banner.appendChild(timerEl);
  panel.appendChild(banner);

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
      timerEl.textContent = `${Math.max(0, seconds).toFixed(1)}s`;
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
