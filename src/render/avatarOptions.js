// Plain config, no Phaser — categories map to the layered PNGs in UI/Avatars/. The category list
// itself now lives in game.config.json (edited via the mod tool, see tools/mod-tool/README.md):
// adding a new category (e.g. hat, beard) is just another entry there; nothing downstream
// hardcodes the category list.
import gameConfig from '../config/game.config.json';

const CATEGORIES = gameConfig.avatarParts.categories;

function categoryOptions(key) {
  return CATEGORIES.find((c) => c.key === key)?.options || [];
}

export const FACE_OPTIONS = categoryOptions('face');
export const EYES_OPTIONS = categoryOptions('eyes');
export const MOUTH_OPTIONS = categoryOptions('mouth');

// { key, options } pairs — the avatar creator's falling-item spawner iterates this.
export const AVATAR_CATEGORIES = CATEGORIES.map(({ key, options }) => ({ key, options }));

function randomOf(options) {
  return options[Math.floor(Math.random() * options.length)];
}

export function randomAvatarParts() {
  return {
    face: randomOf(FACE_OPTIONS),
    eyes: randomOf(EYES_OPTIONS),
    mouth: randomOf(MOUTH_OPTIONS),
  };
}

const STORAGE_KEY = 'hotbomb-avatar-parts';

export function loadSavedAvatarParts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.face && parsed.eyes && parsed.mouth) return parsed;
  } catch {
    // corrupt/unavailable storage — just fall back to a fresh random avatar
  }
  return null;
}

export function saveAvatarParts(parts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
  } catch {
    // storage unavailable (private browsing etc.) — not worth failing over
  }
}
