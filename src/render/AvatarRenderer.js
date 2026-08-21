// Pure DOM/CSS compositor — no Phaser. Stacks face -> eyes -> mouth over a colored circle.
// Reused for the entry-screen preview, room player-list thumbnails, and the avatar creator's
// live preview. Sizing is controlled by whatever CSS class the caller puts on containerEl
// (e.g. .avatar-preview-lg / .avatar-thumb-sm); this only needs the shared .avatar-stack base
// class (relative positioning + circle clip) to already be applied.
const PLACEHOLDER_COLOR = '#4a4a5e';

export function renderAvatar(containerEl, { face, eyes, mouth, color } = {}) {
  containerEl.innerHTML = '';
  containerEl.classList.add('avatar-stack');
  containerEl.style.background = color || PLACEHOLDER_COLOR;

  [face, eyes, mouth].forEach((src) => {
    if (!src) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.className = 'avatar-layer';
    containerEl.appendChild(img);
  });
}
