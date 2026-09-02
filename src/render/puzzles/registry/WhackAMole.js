import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [
  { key: 'gridSize', label: 'Number of holes', type: 'number', default: 9 },
  { key: 'moleVisibleMs', label: 'Mole visible time (ms)', type: 'number', default: 1100 },
];

// One mole per attempt (adapted from the GDD's simultaneous-moles spec to fit the shared
// "N attempts in a row" streak model — see the Phase B plan for why).
function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('whackamole', settingsSchema, difficulty);
  const GRID_SIZE = settings.gridSize;
  const MOLE_VISIBLE_MS = settings.moleVisibleMs;
  const COLS = 3;
  const ROWS = Math.ceil(GRID_SIZE / COLS);
  const GAP_PX = 8;
  const MIN_CELL_PX = 26;
  // Raised well past the old small-screen-tuned ceiling — the width/height budget below is
  // already real DOM measurement of the actual panel (which itself now scales up on a big
  // desktop window), so cells can keep growing to fill it instead of hitting an arbitrary cap.
  const MAX_CELL_PX = 140;

  let destroyed = false;
  let resolved = false;
  let litIndex = -1;
  let moleTimeout = null;

  const gridEl = document.createElement('div');
  gridEl.className = 'mole-grid';

  // Real-geometry sizing, same approach ZipPuzzle.js already uses for its own grid: read the
  // content area's real width, and a height budget, then size cells off whichever of
  // width-per-column or height-per-row is smaller. This is what actually guarantees the grid fits
  // at any gridSize (difficulty presets range 6-12+ holes) without ever needing .puzzle-panel's
  // scrollbar fallback — a fixed aspect-ratio or viewport-relative guess can't account for how
  // much room the OTHER chrome around the grid is actually taking on a given device.
  //
  // The height budget is measured off .puzzle-game-box (the framed box this content sits inside
  // — see index.html) rather than .puzzle-content's own clientHeight, and rather than the grid
  // itself: .puzzle-game-box's size comes from flex:1 in a page with fixed dimensions, so it's
  // already resolved and non-circular by the time this runs, unlike measuring something that's
  // sized by its own (about-to-be-computed) content.
  const gameBoxEl = contentEl.closest('.puzzle-game-box');
  const containerWidth = contentEl.clientWidth || 270;
  const availableHeight = gameBoxEl ? gameBoxEl.getBoundingClientRect().height * 0.9 : window.innerHeight * 0.4;
  const widthCell = (containerWidth - GAP_PX * (COLS - 1)) / COLS;
  const heightCell = (availableHeight - GAP_PX * (ROWS - 1)) / ROWS;
  const cellPx = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, widthCell, heightCell));

  gridEl.style.gridTemplateColumns = `repeat(${COLS}, ${cellPx}px)`;
  gridEl.style.gridAutoRows = `${cellPx}px`;

  const holes = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    const hole = document.createElement('div');
    hole.className = 'mole-hole';
    hole.addEventListener('click', () => handleTap(i));
    gridEl.appendChild(hole);
    holes.push(hole);
  }

  contentEl.appendChild(gridEl);

  function clearMole() {
    if (litIndex >= 0) holes[litIndex].innerHTML = '';
    litIndex = -1;
  }

  function spawnMole() {
    clearMole();
    resolved = false;
    litIndex = Math.floor(Math.random() * GRID_SIZE);

    const img = document.createElement('img');
    img.src = '/UI/BombFull.png';
    img.alt = '';
    holes[litIndex].appendChild(img);

    moleTimeout = setTimeout(() => {
      if (!destroyed && !resolved) resolve(false);
    }, MOLE_VISIBLE_MS);
  }

  function resolve(success) {
    if (resolved || destroyed) return;
    resolved = true;
    clearTimeout(moleTimeout);
    clearMole();
    onAttempt(success);
    spawnMole();
  }

  function handleTap(i) {
    if (destroyed || resolved) return;
    resolve(i === litIndex);
  }

  spawnMole();

  return {
    unmount() {
      destroyed = true;
      clearTimeout(moleTimeout);
    },
  };
}

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'whackamole',
  titleImg: '/UI/WHACK-A-MOLE.png',
  tutorialText: 'Tap the bomb before it disappears back into its hole.',
  mount,
};
