const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const ARROW = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };
const MIN_SWIPE_DISTANCE = 30;

function randomDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

// Returns null if the gesture was too small to count as a real swipe.
function classifySwipe(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_DISTANCE) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : dy > 0 ? 'DOWN' : 'UP';
}

function mount(contentEl, onAttempt) {
  let destroyed = false;
  let rule = null; // { type: 'swipe' | 'dont' | 'opposite', dir }
  let startX = 0;
  let startY = 0;

  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';

  const zoneEl = document.createElement('div');
  zoneEl.className = 'swipe-zone';

  contentEl.appendChild(promptEl);
  contentEl.appendChild(zoneEl);

  function correctDirection() {
    if (rule.type === 'swipe') return rule.dir;
    if (rule.type === 'opposite') return OPPOSITE[rule.dir];
    return null; // 'dont' has no single correct direction
  }

  function nextRound() {
    const dir = randomDirection();
    const type = ['swipe', 'dont', 'opposite'][Math.floor(Math.random() * 3)];
    rule = { type, dir };

    if (type === 'swipe') promptEl.textContent = `SWIPE ${dir}!`;
    else if (type === 'dont') promptEl.textContent = `DON'T SWIPE ${dir}!`;
    else promptEl.textContent = `SWIPE OPPOSITE OF ${dir}!`;

    zoneEl.textContent = ARROW[dir];
  }

  function onPointerDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    // Without capture, a mouse drag that exits the zone before button-up never fires
    // pointerup here (touch has implicit capture per spec, mouse does not) — this is why it
    // felt broken on PC but fine on mobile.
    zoneEl.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e) {
    if (destroyed) return;
    const swiped = classifySwipe(e.clientX - startX, e.clientY - startY);
    if (!swiped) return;

    const success = rule.type === 'dont' ? swiped !== rule.dir : swiped === correctDirection();
    onAttempt(success);
    nextRound();
  }

  zoneEl.addEventListener('pointerdown', onPointerDown);
  zoneEl.addEventListener('pointerup', onPointerUp);

  nextRound();

  return {
    unmount() {
      destroyed = true;
      zoneEl.removeEventListener('pointerdown', onPointerDown);
      zoneEl.removeEventListener('pointerup', onPointerUp);
    },
  };
}

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'swipe',
  titleImg: '/UI/Swipe.png',
  mount,
};
