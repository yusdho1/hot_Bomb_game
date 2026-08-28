const GRID_SIZE = 5;
const NUM_CHECKPOINTS = 6;
const BRIDGE_PX = 8;
const MAX_CELL_PX = 64;
const MIN_CELL_PX = 32;
const MAX_DFS_STEPS = 200000;

function key(r, c) {
  return `${r},${c}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function neighborsOf(r, c) {
  return shuffle(
    [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].filter(([nr, nc]) => nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE)
  );
}

// Guaranteed-valid fallback: a boustrophedon ("snake") path always covers every cell of any
// rectangular grid exactly once.
function boustrophedonPath() {
  const path = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < GRID_SIZE; c++) path.push([r, c]);
    } else {
      for (let c = GRID_SIZE - 1; c >= 0; c--) path.push([r, c]);
    }
  }
  return path;
}

// Randomized backtracking search for a full-coverage (Hamiltonian) path, so the shape is
// different every turn. Only starts from majority-checkerboard-color cells — on an odd*odd grid
// a full-coverage path can only start/end on that color, so starting elsewhere would force the
// search to exhaustively prove impossibility every time. A step budget plus the deterministic
// fallback above guarantee this always terminates quickly either way.
function generateHamiltonianPath() {
  const total = GRID_SIZE * GRID_SIZE;

  function tryFrom(start) {
    const visited = new Set([key(...start)]);
    const path = [start];
    let steps = 0;

    function dfs(cell) {
      steps++;
      if (steps > MAX_DFS_STEPS) return 'budget';
      if (path.length === total) return true;
      for (const n of neighborsOf(cell[0], cell[1])) {
        const k = key(n[0], n[1]);
        if (visited.has(k)) continue;
        path.push(n);
        visited.add(k);
        const result = dfs(n);
        if (result === true) return true;
        path.pop();
        visited.delete(k);
        if (result === 'budget') return 'budget';
      }
      return false;
    }

    return dfs(start) === true ? path : null;
  }

  const evenCells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if ((r + c) % 2 === 0) evenCells.push([r, c]);
    }
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    const start = evenCells[Math.floor(Math.random() * evenCells.length)];
    const result = tryFrom(start);
    if (result) return result;
  }
  return boustrophedonPath();
}

// Spreads 1..NUM_CHECKPOINTS evenly across the generated path's indices (always index 0 -> "1"
// and the last index -> the top number), so the path itself is one valid solution.
function placeCheckpoints(path) {
  const numbered = new Map();
  const lastIndex = path.length - 1;
  for (let n = 1; n <= NUM_CHECKPOINTS; n++) {
    const idx = Math.round(((n - 1) / (NUM_CHECKPOINTS - 1)) * lastIndex);
    numbered.set(key(...path[idx]), n);
  }
  return numbered;
}

export const ZipPuzzle = {
  mount(containerEl, { onSolved }) {
    containerEl.innerHTML = '';

    const solutionPath = generateHamiltonianPath();
    const numbered = placeCheckpoints(solutionPath);

    let playerPath = [];
    let playerFilled = new Set();
    let nextRequiredNumber = 1;
    let isDragging = false;
    let solved = false;
    let destroyed = false;

    const panel = document.createElement('div');
    panel.className = 'zip-panel';

    const banner = document.createElement('div');
    banner.className = 'zip-banner';
    banner.textContent = 'SNAKE!';
    panel.appendChild(banner);

    const hint = document.createElement('div');
    hint.className = 'zip-hint';
    hint.textContent = `Connect 1→6, fill every tile!`;
    panel.appendChild(hint);

    // Size the grid off the overlay's real available width instead of a fixed constant, so it
    // actually grows to use the extra room a portrait phone gives it rather than staying tiny.
    const containerWidth = containerEl.clientWidth || 320;
    const panelWidth = Math.min(containerWidth * 0.92, 420);
    const gridAvailable = panelWidth - 28; // panel's own left+right padding
    const rawCell = (gridAvailable - (GRID_SIZE - 1) * BRIDGE_PX) / GRID_SIZE;
    const cellPx = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.floor(rawCell)));

    const gridEl = document.createElement('div');
    gridEl.className = 'zip-grid-wrap';
    const tracks = Array.from({ length: 2 * GRID_SIZE - 1 }, (_, i) => `${i % 2 === 0 ? cellPx : BRIDGE_PX}px`).join(
      ' '
    );
    gridEl.style.gridTemplateColumns = tracks;
    gridEl.style.gridTemplateRows = tracks;
    panel.appendChild(gridEl);

    const solvedBanner = document.createElement('div');
    solvedBanner.className = 'zip-solved-banner hidden';
    solvedBanner.textContent = 'Thrown! \u{1F345}';
    panel.appendChild(solvedBanner);

    containerEl.appendChild(panel);

    const cellEls = {};
    const bridgeEls = {};

    function onCellPointerDown(r, c, e) {
      if (solved || destroyed) return;
      const num = numbered.get(key(r, c));

      if (playerPath.length === 0) {
        if (num !== 1) return;
        beginPath(r, c);
      } else {
        const last = playerPath[playerPath.length - 1];
        if (last[0] === r && last[1] === c) {
          // resume dragging from the current end
        } else if (num === 1) {
          resetPath();
          beginPath(r, c);
        } else {
          return;
        }
      }
      isDragging = true;
      gridEl.setPointerCapture(e.pointerId);
    }

    function beginPath(r, c) {
      playerPath = [];
      playerFilled = new Set();
      nextRequiredNumber = 1;
      placeCell(r, c);
    }

    function resetPath() {
      playerPath.forEach(([r, c]) => cellEls[key(r, c)].classList.remove('filled'));
      Object.values(bridgeEls).forEach((el) => el.classList.remove('filled'));
      playerPath = [];
      playerFilled = new Set();
      nextRequiredNumber = 1;
    }

    function placeCell(r, c) {
      const k = key(r, c);
      const last = playerPath[playerPath.length - 1];
      playerPath.push([r, c]);
      playerFilled.add(k);
      const num = numbered.get(k);
      if (num !== undefined) nextRequiredNumber = num + 1;
      cellEls[k].classList.add('filled');
      if (last) bridgeElFor(last, [r, c])?.classList.add('filled');
    }

    function tryVisit(r, c) {
      const k = key(r, c);

      if (playerPath.length >= 2) {
        const prev2 = playerPath[playerPath.length - 2];
        if (prev2[0] === r && prev2[1] === c) {
          undoLast();
          return;
        }
      }
      if (playerFilled.has(k)) return;

      const last = playerPath[playerPath.length - 1];
      if (!last || Math.abs(last[0] - r) + Math.abs(last[1] - c) !== 1) return;

      const num = numbered.get(k);
      if (num !== undefined && num !== nextRequiredNumber) return;

      placeCell(r, c);

      if (playerPath.length === GRID_SIZE * GRID_SIZE) finishSolved();
    }

    function undoLast() {
      if (playerPath.length <= 1) return;
      const [r, c] = playerPath.pop();
      const k = key(r, c);
      playerFilled.delete(k);
      const num = numbered.get(k);
      if (num !== undefined) nextRequiredNumber = num;
      cellEls[k].classList.remove('filled');
      const prev = playerPath[playerPath.length - 1];
      bridgeElFor(prev, [r, c])?.classList.remove('filled');
    }

    function bridgeElFor(a, b) {
      const [r1, c1] = a;
      const [r2, c2] = b;
      const bridgeKey = r1 === r2 ? `h-${r1}-${Math.min(c1, c2)}` : `v-${Math.min(r1, r2)}-${c1}`;
      return bridgeEls[bridgeKey];
    }

    function finishSolved() {
      solved = true;
      solvedBanner.classList.remove('hidden');
      onSolved();
    }

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'zip-cell';
        cellEl.dataset.key = key(r, c);
        cellEl.style.gridColumnStart = 2 * c + 1;
        cellEl.style.gridRowStart = 2 * r + 1;

        const num = numbered.get(key(r, c));
        if (num !== undefined) {
          const badge = document.createElement('span');
          badge.className = 'zip-cell-number';
          badge.textContent = num;
          cellEl.appendChild(badge);
        }

        cellEl.addEventListener('pointerdown', (e) => onCellPointerDown(r, c, e));
        gridEl.appendChild(cellEl);
        cellEls[key(r, c)] = cellEl;
      }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const el = document.createElement('div');
        el.className = 'zip-bridge zip-bridge-h';
        el.style.gridColumnStart = 2 * c + 2;
        el.style.gridRowStart = 2 * r + 1;
        gridEl.appendChild(el);
        bridgeEls[`h-${r}-${c}`] = el;
      }
    }
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const el = document.createElement('div');
        el.className = 'zip-bridge zip-bridge-v';
        el.style.gridColumnStart = 2 * c + 1;
        el.style.gridRowStart = 2 * r + 2;
        gridEl.appendChild(el);
        bridgeEls[`v-${r}-${c}`] = el;
      }
    }

    function onGridPointerMove(e) {
      if (!isDragging || solved || destroyed) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = target && target.closest ? target.closest('.zip-cell') : null;
      if (!cellEl) return;
      const [r, c] = cellEl.dataset.key.split(',').map(Number);
      tryVisit(r, c);
    }
    function onGridPointerUp() {
      isDragging = false;
    }

    gridEl.addEventListener('pointermove', onGridPointerMove);
    gridEl.addEventListener('pointerup', onGridPointerUp);

    return {
      unmount() {
        destroyed = true;
        gridEl.removeEventListener('pointermove', onGridPointerMove);
        gridEl.removeEventListener('pointerup', onGridPointerUp);
      },
    };
  },
};
