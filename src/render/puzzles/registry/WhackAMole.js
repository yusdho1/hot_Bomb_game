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
  const PANEL_GAP_PX = 10; // must match .puzzle-panel's own `gap` in index.html
  const MIN_CELL_PX = 26;
  const MAX_CELL_PX = 72;

  let destroyed = false;
  let resolved = false;
  let litIndex = -1;
  let moleTimeout = null;

  const gridEl = document.createElement('div');
  gridEl.className = 'mole-grid';

  // Real-geometry sizing, same approach ZipPuzzle.js already uses for its own grid: read the
  // panel's actual remaining height (its other children — banner, fuse bar, dots, footer logo —
  // are already in the DOM by the time mount() runs, since PuzzleOverlay builds them first) and
  // the content area's real width, then size cells off whichever of width-per-column or
  // height-per-row is smaller. This is what actually guarantees the grid fits at any gridSize
  // (difficulty presets range 6-12+ holes) without ever needing .puzzle-panel's scrollbar
  // fallback — a fixed aspect-ratio or viewport-relative guess can't account for how much room
  // the OTHER chrome around the grid is actually taking on a given device.
  const panelEl = contentEl.closest('.puzzle-panel');
  const containerWidth = contentEl.clientWidth || 270;
  let availableHeight = ROWS * 60;
  if (panelEl) {
    const siblingsHeight = Array.from(panelEl.children)
      .filter((c) => c !== contentEl)
      .reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);
    const gapCount = panelEl.children.length - 1;
    availableHeight = panelEl.clientHeight - siblingsHeight - gapCount * PANEL_GAP_PX;
  }
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
    img.src = '/UI/Bomb.png';
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
  titleText: 'WHACK-A-MOLE',
  mount,
};
