// Plain config, no Phaser — categories map to the layered PNGs in UI/Avatars/. Adding a new
// category (e.g. hat, beard) later is just another array here; nothing downstream hardcodes
// the category list.
export const FACE_OPTIONS = [
  '/UI/Avatars/Avatar__0007_Face1.png',
  '/UI/Avatars/Avatar__0008_Face2.png',
  '/UI/Avatars/Avatar__0007_Face3.png',
];

export const EYES_OPTIONS = [
  '/UI/Avatars/Avatar__0002_Eyes1.png',
  '/UI/Avatars/Avatar__0001_Eyes2.png',
  '/UI/Avatars/Avatar__0000_Eyes3.png',
];

export const MOUTH_OPTIONS = [
  '/UI/Avatars/Avatar__0005_Mouth1.png',
  '/UI/Avatars/Avatar__0004_Mouth2.png',
  '/UI/Avatars/Avatar__0003_Mouth3.png',
];

// { category, options } pairs — the avatar creator's falling-item spawner iterates this.
export const AVATAR_CATEGORIES = [
  { key: 'face', options: FACE_OPTIONS },
  { key: 'eyes', options: EYES_OPTIONS },
  { key: 'mouth', options: MOUTH_OPTIONS },
];

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
