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

let alarmPlayed = false;

export const SoundManager = {
  playPersonalRoundMusic: () => playLoop('passBombMusic'),
  stopPersonalRoundMusic: () => stopLoop('passBombMusic'),

  playGlobalTicking: () => playLoop('globalTicking'),
  stopGlobalTicking: () => stopLoop('globalTicking'),
  setGlobalTickingRate: (rate) => setRate('globalTicking', rate),

  // Fires once per match — call resetAlarm() when a new match starts.
  playAlarmOnce: () => {
    if (alarmPlayed) return;
    alarmPlayed = true;
    playOneShot('alarm');
  },
  resetAlarm: () => {
    alarmPlayed = false;
  },

  // Loops for the local holder once their personal fuse hits the last few seconds — a distinct
  // instance from the one-shot `alarm` above so the two never fight over playback state.
  playPersonalAlarm: () => playLoop('personalAlarm'),
  stopPersonalAlarm: () => stopLoop('personalAlarm'),

  playBombExplode: () => playOneShot('bombExplode'),
  // Small ±8% pitch variance so repeated attempts don't sound identical every time.
  playSmallSuccess: () => playOneShot('smallSuccess', 0.08),
  playSmallFailed: () => playOneShot('smallFailed', 0.08),
  playWin: () => playOneShot('win'),
  playTap: () => playOneShot('tap'),
};
