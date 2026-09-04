// Deliberately NOT inside registry/ — same reason as ZipPuzzle.js/puzzleSettings.js: the mod tool
// scans that folder assuming every .js file in it is a holder minigame with the streak-based
// mount(contentEl, onAttempt, {difficulty, streakTarget}) contract. This is a sabotage-puzzle
// alternative to ZipPuzzle (see main.js's openZipPuzzle, which now picks randomly between the
// two) — same mount(containerEl, {onSolved, difficulty}) => {unmount} shape, same "earn one
// tomato" reward. Reuses game.config.json's existing "goldrush" settings block (it used to back
// the streak-based version of this game before that got moved here for being too hard under fuse
// pressure) so any tuning already done in the mod tool carries over unchanged.
import { readPuzzleSettings } from './puzzleSettings.js';

export const settingsSchema = [
  { key: 'goldCount', label: 'Tomatoes per round', type: 'number', default: 4 },
  { key: 'bombCount', label: 'Bombs per round', type: 'number', default: 3 },
  { key: 'swingPeriodSeconds', label: 'Full swing cycle (s)', type: 'number', default: 2.4 },
  { key: 'hitRadiusPx', label: 'Claw hit tolerance (px)', type: 'number', default: 19 },
];

const SWING_AMPLITUDE_DEG = 62;
const SURFACE_PX = 28; // matches .goldrush-surface's height — the pivot sits right on this line
const ITEM_PX = 34;
const RETRACTED_LEN_PX = 30;
const FIRE_MS = 240;
const RETRACT_MS = 260;
const GRAB_PAUSE_MS = 200;

export const GoldRushTomato = {
  mount(containerEl, { onSolved, difficulty }) {
    containerEl.innerHTML = '';

    const settings = readPuzzleSettings('goldrush', settingsSchema, difficulty);
    const TOMATO_COUNT = Math.max(1, Math.round(settings.goldCount));
    const BOMB_COUNT = Math.max(0, Math.round(settings.bombCount));
    const SWING_PERIOD_MS = Math.max(400, settings.swingPeriodSeconds * 1000);
    const HIT_RADIUS = Math.max(4, settings.hitRadiusPx);

    let destroyed = false;
    let solved = false;
    let phase = 'swinging'; // 'swinging' | 'busy' (mid fire/grab/retract — taps ignored)
    let rafId = null;
    let swingStartTs = null;
    let currentAngleDeg = 0;
    let items = []; // { type: 'tomato'|'bomb', x, y, el }
    let stageWidth = 0;
    let stageHeight = 0;
    const pivotY = SURFACE_PX;
    let pivotX = 0;

    const panel = document.createElement('div');
    panel.className = 'zip-panel';

    const banner = document.createElement('div');
    banner.className = 'zip-banner';
    const bannerImg = document.createElement('img');
    bannerImg.src = '/UI/TOMATO RUSH.png';
    bannerImg.alt = 'Tomato Rush';
    banner.appendChild(bannerImg);
    panel.appendChild(banner);

    const hint = document.createElement('div');
    hint.className = 'zip-hint';
    hint.textContent = 'Tap to drop the claw — grab a tomato, dodge bombs!';
    panel.appendChild(hint);

    const stageEl = document.createElement('div');
    stageEl.className = 'goldrush-stage';
    panel.appendChild(stageEl);

    const solvedBanner = document.createElement('div');
    solvedBanner.className = 'zip-solved-banner hidden';
    solvedBanner.textContent = 'Got one! \u{1F345}';
    panel.appendChild(solvedBanner);

    containerEl.appendChild(panel);

    const surfaceEl = document.createElement('div');
    surfaceEl.className = 'goldrush-surface';
    stageEl.appendChild(surfaceEl);

    const pivotEl = document.createElement('div');
    pivotEl.className = 'goldrush-pivot';
    stageEl.appendChild(pivotEl);

    const clawEl = document.createElement('div');
    clawEl.className = 'goldrush-claw';
    stageEl.appendChild(clawEl);

    // Same width-driven sizing ZipPuzzle.js's own grid uses (no separate prompt row eating into
    // a height budget here — the banner/hint are outside the stage, same as Zip's banner/hint are
    // outside its grid) — this is a boxed popup, not the full-screen puzzle page, so there's no
    // real vertical budget to measure against; a width-derived aspect ratio is what Zip does too.
    function sizeStage() {
      const containerWidth = containerEl.clientWidth || 320;
      const panelWidth = Math.min(containerWidth * 0.92, 420);
      stageWidth = Math.max(200, panelWidth - 28);
      stageHeight = Math.max(220, Math.min(stageWidth * 1.1, 340));
      stageEl.style.width = `${stageWidth}px`;
      stageEl.style.height = `${stageHeight}px`;
      pivotX = stageWidth / 2;
    }

    function randomItemPosition(existing) {
      const marginX = ITEM_PX;
      const marginTop = SURFACE_PX + 16;
      const marginBottom = ITEM_PX;
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = marginX + Math.random() * (stageWidth - marginX * 2);
        const y = marginTop + Math.random() * (stageHeight - marginTop - marginBottom);
        const tooCloseToItem = existing.some((it) => Math.hypot(it.x - x, it.y - y) < ITEM_PX * 1.3);
        const tooCloseToPivot = Math.hypot(x - pivotX, y - pivotY) < ITEM_PX * 1.2;
        if (!tooCloseToItem && !tooCloseToPivot) return { x, y };
      }
      return {
        x: marginX + Math.random() * (stageWidth - marginX * 2),
        y: marginTop + Math.random() * (stageHeight - marginTop - marginBottom),
      };
    }

    function buildBoard() {
      items.forEach((it) => it.el.remove());
      items = [];
      const types = [...Array(TOMATO_COUNT).fill('tomato'), ...Array(BOMB_COUNT).fill('bomb')];
      types.forEach((type) => {
        const pos = randomItemPosition(items);
        const el = document.createElement('img');
        el.className = `goldrush-item goldrush-item-${type}`;
        el.src = type === 'tomato' ? '/UI/Sprites/Tomato.png' : '/UI/BombFull.png';
        el.alt = '';
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
        stageEl.appendChild(el);
        items.push({ type, x: pos.x, y: pos.y, el });
      });
    }

    function setClawAngle(deg) {
      currentAngleDeg = deg;
      clawEl.style.transform = `rotate(${deg}deg)`;
    }
    function setClawLength(px) {
      clawEl.style.height = `${px}px`;
    }

    function swingTick(ts) {
      if (phase !== 'swinging') return;
      if (swingStartTs === null) swingStartTs = ts;
      const elapsed = ts - swingStartTs;
      setClawAngle(SWING_AMPLITUDE_DEG * Math.sin((2 * Math.PI * elapsed) / SWING_PERIOD_MS));
      rafId = requestAnimationFrame(swingTick);
    }

    function startSwinging() {
      phase = 'swinging';
      swingStartTs = null;
      setClawLength(RETRACTED_LEN_PX);
      rafId = requestAnimationFrame(swingTick);
    }

    function stopSwinging() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function computeFireResult(angleDeg) {
      const angleRad = (angleDeg * Math.PI) / 180;
      // CSS rotate(deg) is clockwise on screen, and clockwise from straight-down (the arm's rest
      // pose) initially swings LEFT, not right — so the x-component needs the negation below or
      // this ray points at the mirror-opposite side of wherever the claw is actually leaning.
      const dirX = -Math.sin(angleRad);
      const dirY = Math.cos(angleRad);

      const wallCandidates = [];
      if (dirX > 0) wallCandidates.push((stageWidth - pivotX) / dirX);
      else if (dirX < 0) wallCandidates.push((0 - pivotX) / dirX);
      if (dirY > 0) wallCandidates.push((stageHeight - pivotY) / dirY);
      const wallDistance = Math.min(...wallCandidates.filter((d) => d > 0));

      let best = { distance: wallDistance, item: null };
      items.forEach((it) => {
        const relX = it.x - pivotX;
        const relY = it.y - pivotY;
        const along = relX * dirX + relY * dirY;
        if (along <= 0 || along >= best.distance) return;
        const perp = Math.abs(relX * dirY - relY * dirX);
        if (perp <= HIT_RADIUS) best = { distance: along, item: it };
      });
      return best;
    }

    function handleFire() {
      if (destroyed || solved || phase !== 'swinging') return;
      stopSwinging();
      phase = 'busy';
      const result = computeFireResult(currentAngleDeg);

      clawEl.classList.add('firing');
      setClawLength(result.distance);

      setTimeout(() => {
        if (destroyed) return;
        clawEl.classList.remove('firing');
        const hitItem = result.item;
        if (hitItem) hitItem.el.classList.add('grabbed');

        setTimeout(
          () => {
            if (destroyed) return;
            clawEl.classList.add('retracting');
            setClawLength(RETRACTED_LEN_PX);
            setTimeout(() => {
              if (destroyed) return;
              clawEl.classList.remove('retracting');
              resolveFire(hitItem);
            }, RETRACT_MS);
          },
          hitItem ? GRAB_PAUSE_MS : 0
        );
      }, FIRE_MS);
    }

    function resolveFire(hitItem) {
      if (!hitItem) {
        // Hit the bare wall — no tomato, no bomb. Just resume swinging on the same board.
        startSwinging();
        return;
      }
      items = items.filter((it) => it !== hitItem);
      hitItem.el.remove();

      if (hitItem.type === 'tomato') {
        finishSolved();
      } else {
        // A bomb only resets the board here — there's no streak/fuse riding on this puzzle (it's
        // opt-in from the waiting screen), so it's just "try again," same as Zip has no fail state.
        buildBoard();
        startSwinging();
      }
    }

    function finishSolved() {
      solved = true;
      solvedBanner.classList.remove('hidden');
      onSolved();
    }

    function nextRound() {
      if (destroyed) return;
      sizeStage();
      buildBoard();
      startSwinging();
    }

    stageEl.addEventListener('click', handleFire);

    nextRound();

    return {
      unmount() {
        destroyed = true;
        stopSwinging();
        containerEl.innerHTML = '';
      },
    };
  },
};
