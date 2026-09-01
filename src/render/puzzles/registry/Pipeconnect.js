import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [{ key: 'gridSize', label: 'Grid size', type: 'number', default: 4 }];

// Sides are named by compass direction; DELTA maps a side to the (row, col) step that crosses it,
// and OPPOSITE is what a neighbor must have open on its own side for the two cells to connect.
const DELTA = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
// Rotating a tile 90° clockwise cycles every open side one step around the compass.
const ROTATE_CW = { N: 'E', E: 'S', S: 'W', W: 'N' };
// Base (0-rotation) open sides per shape — a straight run through W/E, an elbow through N/E.
const BASE_SIDES = { straight: ['W', 'E'], corner: ['N', 'E'] };

function key(r, c) {
  return `${r},${c}`;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rotateSides(baseSides, rotation) {
  return baseSides.map((side) => {
    let s = side;
    for (let i = 0; i < rotation; i++) s = ROTATE_CW[s];
    return s;
  });
}

// Which of the 4 rotations (0-3) of `shape` produces exactly the given pair of open sides.
function rotationFor(shape, sides) {
  const target = new Set(sides);
  for (let r = 0; r < 4; r++) {
    const got = rotateSides(BASE_SIDES[shape], r);
    if (got.length === target.size && got.every((s) => target.has(s))) return r;
  }
  return 0;
}

// Random simple (non-self-crossing) walk from (r0,0) to (r1,gridSize-1) via randomized DFS —
// same shuffle-and-backtrack idea as ZipPuzzle's Hamiltonian search, but much smaller/cheaper
// since it only has to reach the far edge, not cover every cell. Falls back to a guaranteed
// L-shaped route (down/up the entry column, then straight across) if the search ever comes up
// empty, which in practice only matters for pathological grid sizes.
function generatePath(gridSize, entryRow, exitRow) {
  function neighborsOf([r, c]) {
    return shuffle(
      Object.entries(DELTA)
        .map(([, [dr, dc]]) => [r + dr, c + dc])
        .filter(([nr, nc]) => nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize)
    );
  }

  function dfs(path, visited) {
    const current = path[path.length - 1];
    if (current[0] === exitRow && current[1] === gridSize - 1) return path;
    for (const n of neighborsOf(current)) {
      const k = key(...n);
      if (visited.has(k)) continue;
      visited.add(k);
      const result = dfs([...path, n], visited);
      if (result) return result;
      visited.delete(k);
    }
    return null;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const start = [entryRow, 0];
    const result = dfs([start], new Set([key(...start)]));
    if (result) return result;
  }

  const fallback = [];
  for (let r = entryRow; r !== exitRow; r += exitRow > entryRow ? 1 : -1) fallback.push([r, 0]);
  fallback.push([exitRow, 0]);
  for (let c = 1; c < gridSize; c++) fallback.push([exitRow, c]);
  return fallback;
}

function directionBetween([r1, c1], [r2, c2]) {
  if (r2 < r1) return 'N';
  if (r2 > r1) return 'S';
  if (c2 < c1) return 'W';
  return 'E';
}

function mount(contentEl, onAttempt, { difficulty, streakTarget } = {}) {
  const settings = readPuzzleSettings('pipeconnect', settingsSchema, difficulty);
  const gridSize = Math.max(3, Math.min(6, Math.round(settings.gridSize)));
  const passCount = Math.max(1, streakTarget || 3);

  let destroyed = false;
  let grid = []; // grid[r][c] = { shape, rotation, el, shapeEl }
  let entryRow = 0;
  let exitRow = 0;

  contentEl.style.display = 'flex';
  contentEl.style.flexDirection = 'column';
  contentEl.style.alignItems = 'center';
  contentEl.style.justifyContent = 'center';
  contentEl.style.gap = '10px';

  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';
  promptEl.textContent = 'CONNECT THE PIPE!';
  contentEl.appendChild(promptEl);

  const boardRow = document.createElement('div');
  boardRow.className = 'pipe-board-row';
  contentEl.appendChild(boardRow);

  const inletEl = document.createElement('div');
  inletEl.className = 'pipe-io pipe-inlet';
  const gridEl = document.createElement('div');
  gridEl.className = 'pipe-grid';
  const outletEl = document.createElement('div');
  outletEl.className = 'pipe-io pipe-outlet';
  boardRow.append(inletEl, gridEl, outletEl);

  // Real-geometry sizing (measure contentEl's actual leftover space after the prompt text), not
  // a fixed cq* percentage — same fix Stroop.js/Swipe.js already needed: a page-wide percentage
  // has no idea how much of .puzzle-content the prompt above it is already using.
  const IO_STUB_PX = 22;
  function sizeBoard() {
    const contentRect = contentEl.getBoundingClientRect();
    const promptRect = promptEl.getBoundingClientRect();
    const CONTENT_GAP = 10; // matches contentEl's own inline gap
    const heightBudget = contentRect.height - promptRect.height - CONTENT_GAP;
    const widthBudget = contentRect.width - 2 * IO_STUB_PX - 8;
    const boardPx = Math.max(120, Math.min(widthBudget, heightBudget || widthBudget));
    boardRow.style.width = `${boardPx}px`;
    boardRow.style.height = `${boardPx}px`;
  }

  function currentOpenSides(cell) {
    return rotateSides(BASE_SIDES[cell.shape], cell.rotation);
  }

  // Every cell reachable from the entry by following mutually-open sides, starting there only if
  // the entry cell itself is oriented to accept the inlet. Shared by isSolved() (does it reach
  // the exit, correctly oriented?) and updateConnectedVisuals() (which tiles turn blue).
  function computeConnectedSet() {
    const visited = new Set();
    const startCell = grid[entryRow][0];
    if (!currentOpenSides(startCell).includes('W')) return visited;

    visited.add(key(entryRow, 0));
    const stack = [[entryRow, 0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const side of currentOpenSides(grid[r][c])) {
        const [dr, dc] = DELTA[side];
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
        if (visited.has(key(nr, nc))) continue;
        if (!currentOpenSides(grid[nr][nc]).includes(OPPOSITE[side])) continue;
        visited.add(key(nr, nc));
        stack.push([nr, nc]);
      }
    }
    return visited;
  }

  function isSolved() {
    const connected = computeConnectedSet();
    if (!connected.has(key(exitRow, gridSize - 1))) return false;
    return currentOpenSides(grid[exitRow][gridSize - 1]).includes('E');
  }

  // Recolors every tile blue if water actually reaches it from the entry right now, grey
  // otherwise — real-time feedback for how far the current rotations actually connect.
  function updateConnectedVisuals() {
    const connected = computeConnectedSet();
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        grid[r][c].el.classList.toggle('connected', connected.has(key(r, c)));
      }
    }
  }

  function applyTransform(cell) {
    cell.shapeEl.style.transform = `rotate(${cell.rotation * 90}deg)`;
  }

  function buildTileEl(cell) {
    const btn = document.createElement('button');
    btn.className = 'pipe-tile';

    const shapeEl = document.createElement('div');
    shapeEl.className = `pipe-shape pipe-${cell.shape}`;
    ['a', 'b'].forEach((part) => {
      const stub = document.createElement('div');
      stub.className = `pipe-stub pipe-stub-${cell.shape === 'straight' ? (part === 'a' ? 'w' : 'e') : part === 'a' ? 'n' : 'e'}`;
      shapeEl.appendChild(stub);
    });
    const hub = document.createElement('div');
    hub.className = 'pipe-hub';
    shapeEl.appendChild(hub);

    btn.appendChild(shapeEl);
    cell.el = btn;
    cell.shapeEl = shapeEl;
    applyTransform(cell);

    btn.addEventListener('click', () => {
      if (destroyed) return;
      cell.rotation = (cell.rotation + 1) % 4;
      applyTransform(cell);
      updateConnectedVisuals();
      if (isSolved()) handleSolved();
    });

    return btn;
  }

  function handleSolved() {
    for (let i = 0; i < passCount; i++) onAttempt(true);
    nextRound();
  }

  function nextRound() {
    if (destroyed) return;

    entryRow = Math.floor(Math.random() * gridSize);
    exitRow = Math.floor(Math.random() * gridSize);
    const path = generatePath(gridSize, entryRow, exitRow);
    const onPath = new Map(path.map((cell, i) => [key(...cell), i]));

    grid = Array.from({ length: gridSize }, () => new Array(gridSize));
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const pathIndex = onPath.get(key(r, c));
        if (pathIndex === undefined) {
          const shape = Math.random() < 0.5 ? 'straight' : 'corner';
          grid[r][c] = { shape, rotation: Math.floor(Math.random() * 4) };
          continue;
        }

        const prev = pathIndex === 0 ? null : path[pathIndex - 1];
        const next = pathIndex === path.length - 1 ? null : path[pathIndex + 1];
        const sideToPrev = prev ? directionBetween([r, c], prev) : 'W';
        const sideToNext = next ? directionBetween([r, c], next) : 'E';
        const shape = sideToPrev === OPPOSITE[sideToNext] ? 'straight' : 'corner';
        const correctRotation = rotationFor(shape, [sideToPrev, sideToNext]);
        // Starts at a random rotation (occasionally already-correct, which is fine — just one
        // fewer tile the player needs to touch this round) rather than always off-solution.
        grid[r][c] = { shape, rotation: Math.floor(Math.random() * 4), correctRotation };
      }
    }

    sizeBoard();
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        gridEl.appendChild(buildTileEl(grid[r][c]));
      }
    }

    inletEl.style.top = `${((entryRow + 0.5) / gridSize) * 100}%`;
    outletEl.style.top = `${((exitRow + 0.5) / gridSize) * 100}%`;
    updateConnectedVisuals();

    // A round that spawns already-solved (small odds, but real with tiny grids) would never let
    // the player do anything before instantly re-rolling — regenerate instead of accepting it.
    if (isSolved()) nextRound();
  }

  nextRound();

  return {
    unmount() {
      destroyed = true;
      contentEl.innerHTML = '';
    },
  };
}

// A registered minigame module: { id, titleImg|titleText, tutorialText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'pipeconnect',
  titleImg: '/UI/PIPE CONNECT.png',
  tutorialText: 'Tap tiles to rotate them and connect a pipe from the left inlet all the way to the right outlet.',
  mount,
};
