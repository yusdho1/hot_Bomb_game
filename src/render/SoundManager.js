// Plain HTML5 Audio wrapper — no Phaser dependency, safe to import from anywhere in src/render/.
import gameConfig from '../config/game.config.json';

const SOUND_FILES = gameConfig.sounds;

// Each key can list multiple candidate files — a random one is picked per play so repeated cues
// (success/fail especially) don't sound identical every time. Adding a variant is just appending
// another path to that key's "files" array in game.config.json.
function randomFile(key) {
  const files = SOUND_FILES[key]?.files || [];
  return files[Math.floor(Math.random() * files.length)];
}

// One-shots are transient by nature — a fresh Audio per play lets them pick a random variant
// each time and never fight over playback state with themselves.
function playOneShot(key, pitchVariance = 0) {
  const audio = new Audio(randomFile(key));
  audio.playbackRate = pitchVariance > 0 ? 1 + (Math.random() * 2 - 1) * pitchVariance : 1;
  audio.play().catch(() => {});
}

// Loops need a single stable instance across play/pause/rate calls, so each loop key always
// plays its first configured file (variety doesn't apply to a continuously-running track).
const loopAudioCache = {};

function getLoopAudio(key) {
  if (!loopAudioCache[key]) {
    const files = SOUND_FILES[key]?.files || [];
    loopAudioCache[key] = new Audio(files[0]);
  }
  return loopAudioCache[key];
}

function playLoop(key) {
  const audio = getLoopAudio(key);
  audio.loop = true;
  if (audio.paused) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function stopLoop(key) {
  const audio = getLoopAudio(key);
  audio.pause();
  audio.currentTime = 0;
}

function setRate(key, rate) {
  getLoopAudio(key).playbackRate = rate;
}

// Silences/unsilences a loop in place via the element's own `muted` flag — playback (and
// currentTime) keeps advancing underneath, so unmuting resumes exactly where the track already is
// instead of restarting it. Distinct from stopLoop, which is a real pause+rewind for actually
// leaving the context the loop belongs to (e.g. the lobby music toggle button uses this; leaving
// the lobby entirely still uses stopLobbyMusic).
function setLoopMuted(key, muted) {
  getLoopAudio(key).muted = muted;
}

export const SoundManager = {
  // Ambient loop for the entry/lobby/room screens (the whole #lobby container, before a match
  // starts) — separate from passBombMusic below, which is the in-match holder's own loop.
  playLobbyMusic: () => playLoop('lobbyMusic'),
  stopLobbyMusic: () => stopLoop('lobbyMusic'),
  setLobbyMusicMuted: (muted) => setLoopMuted('lobbyMusic', muted),

  playPersonalRoundMusic: () => playLoop('passBombMusic'),
  stopPersonalRoundMusic: () => stopLoop('passBombMusic'),

  playGlobalTicking: () => playLoop('globalTicking'),
  stopGlobalTicking: () => stopLoop('globalTicking'),
  setGlobalTickingRate: (rate) => setRate('globalTicking', rate),

  // Loops for every non-holder once the match clock hits its last stretch (paired with a red
  // screen pulse) — a distinct instance from personalAlarm below so the two never fight over
  // playback state if a player is briefly in both states across a tick.
  playGlobalSiren: () => playLoop('globalSiren'),
  stopGlobalSiren: () => stopLoop('globalSiren'),

  // Loops for the local holder once their personal fuse hits the last few seconds.
  playPersonalAlarm: () => playLoop('personalAlarm'),
  stopPersonalAlarm: () => stopLoop('personalAlarm'),

  playBombExplode: () => playOneShot('bombExplode'),
  // Small ±8% pitch variance so repeated attempts don't sound identical every time.
  playSmallSuccess: () => playOneShot('smallSuccess', 0.08),
  playSmallFailed: () => playOneShot('smallFailed', 0.08),
  // A correct attempt's position within the current streak (1-4, matching streakTarget's own
  // range) plays its own dedicated cue instead of the flat smallSuccess sound — 4 distinct clips
  // that build in energy, so a streak reads as an escalating combo instead of the same ding
  // repeated. Clamped since a puzzle could in principle report more attempts than streakTarget.
  playComboSuccess: (comboIndex) => playOneShot(`smallSuccessCombo${Math.max(1, Math.min(4, comboIndex))}`),
  playWin: () => playOneShot('win'),
  playTap: () => playOneShot('tap'),

  // Tomato sabotage feedback — three separate cues (own config keys, swappable in the mod tool)
  // for the three distinct moments: the swipe-throw itself, a throw landing on the holder, and a
  // throw getting absorbed by the holder's shield.
  playTomatoThrow: () => playOneShot('tomatoThrow'),
  playTomatoSquash: () => playOneShot('tomatoSquash', 0.08),
  playShieldDeflect: () => playOneShot('shieldDeflect'),
};
