import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [
  { key: 'minSwipeDistance', label: 'Minimum swipe distance (px)', type: 'number', default: 30 },
  {
    key: 'complexRuleChance',
    label: 'Chance of a "don\'t"/"opposite" rule vs a plain swipe (0-100)',
    type: 'number',
    default: 50,
  },
];

const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const ARROW = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };

function randomDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('swipe', settingsSchema, difficulty);
  const MIN_SWIPE_DISTANCE = settings.minSwipeDistance;
  const COMPLEX_RULE_CHANCE = settings.complexRuleChance;

  // Returns null if the gesture was too small to count as a real swipe.
  function classifySwipe(dx, dy) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_DISTANCE) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : dy > 0 ? 'DOWN' : 'UP';
  }

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
    const type =
      Math.random() * 100 < COMPLEX_RULE_CHANCE
        ? ['dont', 'opposite'][Math.floor(Math.random() * 2)]
        : 'swipe';
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

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'swipe',
  titleImg: '/UI/Swipe.png',
  tutorialText: 'Swipe the zone in the shown direction — watch for "DON\'T" or "OPPOSITE" twists on the instruction!',
  mount,
};
