import { SoundManager } from './SoundManager.js';
import { Haptics } from './Haptics.js';

const MIN_SWIPE_DISTANCE = 40; // px
const MIN_SWIPE_SPEED = 0.6; // px/ms, upward
const THROW_ANIM_MS = 500; // must match .tomato-throw-sprite.thrown's CSS transition duration

// Short swipe-up throwing mini-interaction shown when a player spends a tomato from their basket.
// Not a registered minigame (no onAttempt/streakTarget) — a self-contained overlay module mirroring
// ZipPuzzle's mount(containerEl, opts) => {unmount} shape. Chains automatically: as long as the
// player still has tomatoes left, a fresh one spawns right after each throw lands.
export const TomatoThrow = {
  mount(containerEl, { initialCount, onThrow, onClose }) {
    containerEl.innerHTML = '';

    let destroyed = false;
    let count = Math.max(0, initialCount || 0);
    let activePointer = null;

    const panel = document.createElement('div');
    panel.className = 'zip-panel tomato-throw-panel';
    containerEl.appendChild(panel);

    const banner = document.createElement('div');
    banner.className = 'zip-banner';
    banner.textContent = 'THROW THE TOMATO!';
    panel.appendChild(banner);

    const hint = document.createElement('div');
    hint.className = 'zip-hint';
    hint.textContent = 'Drag it up and let go fast to throw';
    panel.appendChild(hint);

    const countEl = document.createElement('div');
    countEl.className = 'tomato-throw-count';
    panel.appendChild(countEl);

    const stage = document.createElement('div');
    stage.className = 'tomato-throw-stage';
    panel.appendChild(stage);

    function updateCount() {
      countEl.textContent = `${count} left`;
    }

    function spawnTomato() {
      if (destroyed) return;
      const img = document.createElement('img');
      img.src = '/UI/Sprites/Tomato.png';
      img.alt = '';
      img.draggable = false;
      img.className = 'tomato-throw-sprite';
      stage.appendChild(img);
      wireDrag(img);
    }

    function wireDrag(img) {
      img.addEventListener('pointerdown', (e) => {
        if (activePointer || destroyed) return;
        activePointer = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startTime: performance.now() };
        img.setPointerCapture(e.pointerId);
        img.classList.add('dragging');
      });

      img.addEventListener('pointermove', (e) => {
        if (!activePointer || activePointer.pointerId !== e.pointerId) return;
        const dx = e.clientX - activePointer.startX;
        const dy = e.clientY - activePointer.startY;
        img.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
      });

      const handleEnd = (e) => {
        if (!activePointer || activePointer.pointerId !== e.pointerId) return;
        const dx = e.clientX - activePointer.startX;
        const dy = e.clientY - activePointer.startY;
        const dt = Math.max(1, performance.now() - activePointer.startTime);
        const distance = Math.hypot(dx, dy);
        const upwardSpeed = -dy / dt; // px/ms, positive = moving up
        img.releasePointerCapture(e.pointerId);
        img.classList.remove('dragging');
        activePointer = null;

        if (dy < 0 && distance >= MIN_SWIPE_DISTANCE && upwardSpeed >= MIN_SWIPE_SPEED) {
          launchTomato(img, dx);
        } else {
          snapBack(img);
        }
      };

      img.addEventListener('pointerup', handleEnd);
      img.addEventListener('pointercancel', handleEnd);
    }

    function snapBack(img) {
      SoundManager.playTap();
      img.style.transform = 'translate(-50%, 0)';
    }

    function launchTomato(img, dx) {
      SoundManager.playTomatoThrow();
      Haptics.pulseLow();
      onThrow();
      count -= 1;
      updateCount();

      img.classList.add('thrown');
      img.style.pointerEvents = 'none';
      const spin = dx >= 0 ? 540 : -540;
      img.style.transform = `translate(calc(-50% + ${dx * 2}px), -140vh) rotate(${spin}deg)`;

      // A timeout matched to the CSS transition duration, not transitionend — more robust than
      // relying on the event firing (e.g. if the tab is backgrounded mid-throw), and this chain
      // step (spawn the next tomato / close the screen) is core control flow, not just cleanup.
      setTimeout(() => {
        img.remove();
        if (destroyed) return;
        if (count > 0) spawnTomato();
        else onClose();
      }, THROW_ANIM_MS);
    }

    updateCount();
    if (count > 0) spawnTomato();
    else setTimeout(() => { if (!destroyed) onClose(); }, 0);

    return {
      unmount() {
        destroyed = true;
        activePointer = null;
        containerEl.innerHTML = '';
      },
    };
  },
};
