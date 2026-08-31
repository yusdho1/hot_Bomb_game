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

  // Square zone sized to whatever room is actually left after the prompt text — not a fixed cqh
  // percentage of the whole page, which has no idea how much the title/timer/dots/logo chrome
  // above and below the game box are already using (see Stroop.js's identical fix for the bug
  // this caused: on a short window the zone could end up taller than the box, clipping the
  // prompt off the top).
  function sizeZone() {
    const contentRect = contentEl.getBoundingClientRect();
    const promptHeight = promptEl.getBoundingClientRect().height;
    const CONTENT_GAP = 16; // matches .puzzle-content's CSS gap
    const heightBudget = contentRect.height - promptHeight - CONTENT_GAP;
    const zonePx = Math.max(90, Math.min(contentRect.width, heightBudget || contentRect.width));
    zoneEl.style.width = `${zonePx}px`;
    zoneEl.style.height = `${zonePx}px`;
    zoneEl.style.fontSize = `${Math.round(zonePx * 0.35)}px`;
  }

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

    sizeZone();
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
