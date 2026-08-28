// Pure DOM/CSS compositor — no Phaser. Stacks every avatar category (face -> eyes -> mouth ->
// hair -> ...) over a colored circle, in whatever order game.config.json declares them. Reused
// for the entry-screen preview, room player-list thumbnails, and the avatar creator's live
// preview. Sizing is controlled by whatever CSS class the caller puts on containerEl
// (e.g. .avatar-preview-lg / .avatar-thumb-sm); this only needs the shared .avatar-stack base
// class (relative positioning + circle clip) to already be applied.
import { AVATAR_CATEGORIES } from './avatarOptions.js';

const PLACEHOLDER_COLOR = '#4a4a5e';

export function renderAvatar(containerEl, parts = {}) {
  containerEl.innerHTML = '';
  containerEl.classList.add('avatar-stack');
  containerEl.style.background = parts.color || PLACEHOLDER_COLOR;

  AVATAR_CATEGORIES.forEach(({ key }) => {
    const src = parts[key];
    if (!src) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.className = 'avatar-layer';
    containerEl.appendChild(img);
  });
}
