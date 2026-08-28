// Plain config, no Phaser — categories map to the layered PNGs in UI/Avatars/. The category list
// itself now lives in game.config.json (edited via the mod tool, see tools/mod-tool/README.md):
// adding a new category (e.g. hat, beard) is just another entry there; nothing downstream
// hardcodes the category list.
import gameConfig from '../config/game.config.json';

const CATEGORIES = gameConfig.avatarParts.categories;

// { key, options } pairs — every consumer (the avatar creator's falling-item spawner, the DOM
// compositor, the Phaser spectator board, random/saved avatar generation) iterates this instead
// of hardcoding a face/eyes/mouth field list, so a category added later just works everywhere.
export const AVATAR_CATEGORIES = CATEGORIES.map(({ key, options }) => ({ key, options }));

function randomOf(options) {
  return options[Math.floor(Math.random() * options.length)];
}

// Built generically from whatever categories game.config.json declares (not hardcoded to
// face/eyes/mouth) — so a category added later (e.g. hair) is picked here too, same as it
// already was for the AvatarCreator's falling-item minigame via AVATAR_CATEGORIES.
export function randomAvatarParts() {
  const parts = {};
  CATEGORIES.forEach(({ key, options }) => {
    parts[key] = randomOf(options);
  });
  return parts;
}

const STORAGE_KEY = 'hotbomb-avatar-parts';

export function loadSavedAvatarParts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Backfill any category missing from an older saved avatar (e.g. one saved before a new
    // category like hair existed) with a fresh random pick, rather than rejecting it outright.
    CATEGORIES.forEach(({ key, options }) => {
      if (!(key in parsed)) parsed[key] = randomOf(options);
    });
    return parsed;
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
