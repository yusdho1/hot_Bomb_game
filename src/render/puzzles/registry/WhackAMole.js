import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [
  { key: 'gridSize', label: 'Number of holes', type: 'number', default: 9 },
  { key: 'moleVisibleMs', label: 'Mole visible time (ms)', type: 'number', default: 1100 },
];

const settings = readPuzzleSettings('whackamole', settingsSchema);

// The CSS grid (.mole-grid) is a fixed 3-column layout — any gridSize wraps into extra rows
// automatically, so this stays visually reasonable without needing matching CSS changes.
const GRID_SIZE = settings.gridSize;
const MOLE_VISIBLE_MS = settings.moleVisibleMs;

// One mole per attempt (adapted from the GDD's simultaneous-moles spec to fit the shared
// "3 attempts in a row" streak model — see the Phase B plan for why).
function mount(contentEl, onAttempt) {
  let destroyed = false;
  let resolved = false;
  let litIndex = -1;
  let moleTimeout = null;

  const gridEl = document.createElement('div');
  gridEl.className = 'mole-grid';

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

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'whackamole',
  titleText: 'WHACK-A-MOLE',
  mount,
};
