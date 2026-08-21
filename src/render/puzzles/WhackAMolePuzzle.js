const GRID_SIZE = 9;
const MOLE_VISIBLE_MS = 1100;

// One mole per attempt (adapted from the GDD's simultaneous-moles spec to fit the shared
// "3 attempts in a row" streak model — see the Phase B plan for why).
export const WhackAMolePuzzle = {
  mount(contentEl, onAttempt) {
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
  },
};
