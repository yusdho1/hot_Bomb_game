import { AVATAR_CATEGORIES } from './avatarOptions.js';
import { renderAvatar } from './AvatarRenderer.js';
import { SoundManager } from './SoundManager.js';

const SPAWN_INTERVAL_MS = 900;
const FALL_SPEED_PX_PER_SEC = 90;
const ITEM_SIZE = 40;
const BASKET_WIDTH = 64;
const BASKET_HEIGHT = 36;
const BASKET_BOTTOM_OFFSET = 8;

// Drives the falling-item catch minigame inside an already-mounted zoneEl (which must already
// contain a .catch-basket child, per index.html's #avatar-creator-modal markup) and mirrors
// the in-progress draft into previewEl via AvatarRenderer. Returns { save, cancel, unmount } —
// save/cancel just fire the callbacks; the caller (main.js) is responsible for calling unmount()
// once the modal actually closes, on either path.
export function mountAvatarCreator({ zoneEl, previewEl, initialParts, onSave, onCancel }) {
  const basketEl = zoneEl.querySelector('.catch-basket');
  const draft = { ...initialParts };
  let basketX = zoneEl.clientWidth / 2;
  let items = [];
  let spawnTimer = null;
  let rafId = null;
  let lastTs = null;
  let destroyed = false;

  function updatePreview() {
    renderAvatar(previewEl, draft);
  }

  function positionBasket() {
    basketEl.style.left = `${basketX}px`;
  }

  function onPointerMove(e) {
    const rect = zoneEl.getBoundingClientRect();
    basketX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    positionBasket();
  }

  function spawnItem() {
    const category = AVATAR_CATEGORIES[Math.floor(Math.random() * AVATAR_CATEGORIES.length)];
    const variant = category.options[Math.floor(Math.random() * category.options.length)];
    const el = document.createElement('img');
    el.src = variant;
    el.className = 'falling-item';
    const x = Math.random() * Math.max(0, zoneEl.clientWidth - ITEM_SIZE);
    el.style.left = `${x}px`;
    el.style.top = '-40px';
    zoneEl.appendChild(el);
    items.push({ el, x, y: -40, category: category.key, variant });
  }

  function tick(ts) {
    if (destroyed) return;
    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    const zoneHeight = zoneEl.clientHeight;
    const basketTop = zoneHeight - BASKET_BOTTOM_OFFSET - BASKET_HEIGHT;
    const basketLeft = basketX - BASKET_WIDTH / 2;
    const basketRight = basketX + BASKET_WIDTH / 2;

    items = items.filter((item) => {
      item.y += FALL_SPEED_PX_PER_SEC * dt;
      item.el.style.top = `${item.y}px`;

      const overlapsX = item.x + ITEM_SIZE > basketLeft && item.x < basketRight;
      const overlapsY = item.y + ITEM_SIZE >= basketTop;

      if (overlapsX && overlapsY) {
        draft[item.category] = item.variant;
        updatePreview();
        SoundManager.playSmallSuccess();
        item.el.remove();
        return false;
      }

      if (item.y > zoneHeight) {
        item.el.remove();
        return false;
      }
      return true;
    });

    rafId = requestAnimationFrame(tick);
  }

  zoneEl.addEventListener('pointermove', onPointerMove);
  positionBasket();
  updatePreview();
  spawnItem();
  spawnTimer = setInterval(spawnItem, SPAWN_INTERVAL_MS);
  rafId = requestAnimationFrame(tick);

  return {
    save() {
      onSave({ ...draft });
    },
    cancel() {
      onCancel();
    },
    unmount() {
      destroyed = true;
      clearInterval(spawnTimer);
      cancelAnimationFrame(rafId);
      zoneEl.removeEventListener('pointermove', onPointerMove);
      items.forEach((item) => item.el.remove());
      items = [];
    },
  };
}
