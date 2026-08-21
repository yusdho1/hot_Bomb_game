// Plain HTML5 Audio wrapper — no Phaser dependency, safe to import from anywhere in src/render/.
const SOUND_FILES = {
  passBombMusic: '/Sounds/pass the bomb 10 sec music.wav',
  globalTicking: '/Sounds/clock-ticking-down SFX2.mp3',
  alarm: '/Sounds/Alarm SFX.mp3',
  bombExplode: '/Sounds/bomb explode.wav',
  smallSuccess: '/Sounds/smallsucsses.mp3',
  smallFailed: '/Sounds/small failed.mp3',
  win: '/Sounds/win.wav',
  tap: '/Sounds/bombsound.mp3',
};

const audioCache = {};

function getAudio(key) {
  if (!audioCache[key]) {
    audioCache[key] = new Audio(SOUND_FILES[key]);
  }
  return audioCache[key];
}

function playOneShot(key) {
  const audio = getAudio(key);
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function playLoop(key) {
  const audio = getAudio(key);
  audio.loop = true;
  if (audio.paused) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function stopLoop(key) {
  const audio = getAudio(key);
  audio.pause();
  audio.currentTime = 0;
}

function setRate(key, rate) {
  getAudio(key).playbackRate = rate;
}

let alarmPlayed = false;

export const SoundManager = {
  playPersonalRoundMusic: () => playLoop('passBombMusic'),
  stopPersonalRoundMusic: () => stopLoop('passBombMusic'),

  playGlobalTicking: () => playLoop('globalTicking'),
  stopGlobalTicking: () => stopLoop('globalTicking'),
  setGlobalTickingRate: (rate) => setRate('globalTicking', rate),
  setPersonalMusicRate: (rate) => setRate('passBombMusic', rate),

  // Fires once per match — call resetAlarm() when a new match starts.
  playAlarmOnce: () => {
    if (alarmPlayed) return;
    alarmPlayed = true;
    playOneShot('alarm');
  },
  resetAlarm: () => {
    alarmPlayed = false;
  },

  playBombExplode: () => playOneShot('bombExplode'),
  playSmallSuccess: () => playOneShot('smallSuccess'),
  playSmallFailed: () => playOneShot('smallFailed'),
  playWin: () => playOneShot('win'),
  playTap: () => playOneShot('tap'),
};
