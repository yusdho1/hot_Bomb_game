import { PeerHost } from './network/PeerHost.js';
import { PeerClient } from './network/PeerClient.js';
import { mountPuzzleOverlay as createPuzzleOverlay, PUZZLES } from './render/puzzles/PuzzleOverlay.js';
import { ZipPuzzle } from './render/puzzles/ZipPuzzle.js';
import { GoldRushTomato } from './render/puzzles/GoldRushTomato.js';
import { TomatoThrow } from './render/TomatoThrow.js';
import { SoundManager } from './render/SoundManager.js';
import { Haptics } from './render/Haptics.js';
import { spawnConfetti, spawnExplosionBurst } from './render/Particles.js';
import { renderAvatar } from './render/AvatarRenderer.js';
import { mountAvatarCreator } from './render/AvatarCreator.js';
import { randomAvatarParts, loadSavedAvatarParts, saveAvatarParts } from './render/avatarOptions.js';
import gameConfig from './config/game.config.json';

// Mod-tool-editable speed for the slow diagonal drift on the small dotted background textures
// (#lobby, .puzzle-panel, .puzzle-game-box, .zip-panel/.shop-panel — see their shared
// @keyframes bg-dots-drift-a/b). A CSS custom property read by all of them, set once here rather
// than duplicating the value in every rule.
document.documentElement.style.setProperty('--bg-dots-drift-seconds', `${gameConfig.settings.bgDotsDriftSeconds}s`);

// Same idea for the page-wide diagonal crosshatch lines behind everything (body's own background —
// see @keyframes bg-lines-drift near it) — a separate speed/property so the lines can drift at a
// different pace than the dot textures above for a subtle parallax feel, not because they're
// otherwise related.
document.documentElement.style.setProperty('--bg-lines-drift-seconds', `${gameConfig.settings.bgLinesDriftSeconds}s`);

// Which way each pattern drifts — swaps in one of several pre-authored @keyframes per pattern via
// animation-name (browsers resolve a var() used as animation-name fine, same as any other
// property value). Dots are a simple tiled texture, so all 4 true diagonals are equally valid and
// seamless. The crosshatch LINES are two crossing repeating-linear-gradient layers (45deg/-45deg)
// — each one only loops seamlessly moving along its OWN gradient axis. Up/Down/Left/Right move
// BOTH line layers together (one of the 4 valid sign combinations between them, netting a cardinal
// drift rather than a true diagonal); the 4 diagonal options instead move only whichever single
// layer's own axis already points that exact diagonal, leaving the other layer still — see
// @keyframes bg-lines-drift-* for the actual math. Falls back to the pre-existing default
// direction if the config value doesn't match a known option (e.g. an old config file from before
// this setting existed).
const DOTS_DIRECTION_SUFFIX = { 'down-right': 'dr', 'down-left': 'dl', 'up-right': 'ur', 'up-left': 'ul' };
const LINES_DIRECTION_SUFFIX = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  'up-right': 'up-right',
  'down-left': 'down-left',
  'up-left': 'up-left',
  'down-right': 'down-right',
};
const dotsDirSuffix = DOTS_DIRECTION_SUFFIX[gameConfig.settings.bgDotsDriftDirection] || 'dr';
const linesDirSuffix = LINES_DIRECTION_SUFFIX[gameConfig.settings.bgLinesDriftDirection] || 'down';
document.documentElement.style.setProperty('--bg-dots-drift-a-name', `bg-dots-drift-a-${dotsDirSuffix}`);
document.documentElement.style.setProperty('--bg-dots-drift-b-name', `bg-dots-drift-b-${dotsDirSuffix}`);
document.documentElement.style.setProperty('--bg-lines-drift-name', `bg-lines-drift-${linesDirSuffix}`);

// Belt-and-suspenders against mobile double-tap-to-zoom: the CSS touch-action:manipulation on
// <html> should already suppress this per spec, but it's not honored consistently across every
// real mobile browser (notably some iOS Safari / Android WebView versions), and a fast double-tap
// mid-match zooms the viewport and breaks the layout. This is the standard vanilla-JS fallback —
// swallow the second touchend of a tap pair that's both fast (<350ms apart) AND close together
// (<30px), which is exactly what the native double-tap-zoom gesture detector itself looks for, so
// legitimate fast taps on two different targets (e.g. two different Whack-a-Mole holes) are left
// alone entirely.
(function preventDoubleTapZoom() {
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_PX = 30;
  let lastTouchEnd = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const touch = e.changedTouches[0];
      const now = Date.now();
      if (touch) {
        const dx = touch.clientX - lastTouchX;
        const dy = touch.clientY - lastTouchY;
        if (now - lastTouchEnd <= DOUBLE_TAP_MS && Math.hypot(dx, dy) < DOUBLE_TAP_PX) {
          e.preventDefault();
        }
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
})();

const nameInputEl = document.getElementById('name-input');
const entryEl = document.getElementById('entry');
const roomEl = document.getElementById('room');
const roomCodeTextEl = document.getElementById('room-code-text');
const roomCodeCopyBtn = document.getElementById('room-code-copy-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const playerListEl = document.getElementById('player-list');
const hostControlsEl = document.getElementById('host-controls');
const durationMinusBtn = document.getElementById('duration-minus-btn');
const durationPlusBtn = document.getElementById('duration-plus-btn');
const durationValueEl = document.getElementById('duration-value');
const zipEnabledCheckbox = document.getElementById('zip-enabled-checkbox');
const zipDurationMinusBtn = document.getElementById('zip-duration-minus-btn');
const zipDurationPlusBtn = document.getElementById('zip-duration-plus-btn');
const zipDurationValueEl = document.getElementById('zip-duration-value');
const streakMinusBtn = document.getElementById('streak-minus-btn');
const streakPlusBtn = document.getElementById('streak-plus-btn');
const streakValueEl = document.getElementById('streak-value');
const difficultySelectorEl = document.getElementById('difficulty-selector');
const difficultyBtns = Array.from(difficultySelectorEl.querySelectorAll('button'));
const tutorialEnabledCheckbox = document.getElementById('tutorial-enabled-checkbox');
const advancedSettingsBtn = document.getElementById('advanced-settings-btn');
const advancedSettingsModalEl = document.getElementById('advanced-settings-modal');
const advancedSettingsXBtn = document.getElementById('advanced-settings-x-btn');
const advancedSettingsDoneBtn = document.getElementById('advanced-settings-done-btn');
const minigameToggleListEl = document.getElementById('minigame-toggle-list');
const tutorialPanelEl = document.getElementById('tutorial-panel');
const tutorialPuzzleMountEl = document.getElementById('tutorial-puzzle-mount');
const tutorialReadyCountEl = document.getElementById('tutorial-ready-count');
const tutorialReadyBtn = document.getElementById('tutorial-ready-btn');
const tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
const startBtn = document.getElementById('start-btn');
const clientWaitingEl = document.getElementById('client-waiting');
const lobbyStatusEl = document.getElementById('lobby-status');
const matchCountdownOverlayEl = document.getElementById('match-countdown-overlay');
const matchCountdownNumberEl = document.getElementById('match-countdown-number');
const lobbyMusicToggleBtn = document.getElementById('lobby-music-toggle-btn');
const lobbyMusicToggleIconEl = document.getElementById('lobby-music-toggle-icon');

const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game-container');
const eliminationToastEl = document.getElementById('elimination-toast');
const turnNoticeToastEl = document.getElementById('turn-notice-toast');
const puzzleOverlayEl = document.getElementById('puzzle-overlay');
const shieldPulseOverlayEl = document.getElementById('shield-pulse-overlay');
const globalDangerOverlayEl = document.getElementById('global-danger-overlay');
const solveZipBtn = document.getElementById('solve-zip-btn');
const throwTomatoBtn = document.getElementById('throw-tomato-btn');
const throwTomatoCountEl = document.getElementById('throw-tomato-count');
const zipOverlayEl = document.getElementById('zip-overlay');
const zipCancelBtn = document.getElementById('zip-cancel-btn');
const tomatoThrowOverlayEl = document.getElementById('tomato-throw-overlay');
const tomatoThrowCancelBtn = document.getElementById('tomato-throw-cancel-btn');
const pointsBalanceEl = document.getElementById('points-balance');
const pointsBalanceValueEl = document.getElementById('points-balance-value');
const shopBtn = document.getElementById('shop-btn');
const shopOverlayEl = document.getElementById('shop-overlay');
const shopCancelBtn = document.getElementById('shop-cancel-btn');
const shopBalanceValueEl = document.getElementById('shop-balance-value');
const shopFuseSecondsEl = document.getElementById('shop-fuse-seconds');
const shopShieldChargesEl = document.getElementById('shop-shield-charges');
const shopBuyBtns = {
  fuseTime: document.getElementById('shop-buy-fuseTime'),
  throwTomato: document.getElementById('shop-buy-throwTomato'),
  antiTomatoShield: document.getElementById('shop-buy-antiTomatoShield'),
  skipPass: document.getElementById('shop-buy-skipPass'),
};
const gameOverPanelEl = document.getElementById('game-over-panel');
const gameOverLossImgEl = document.getElementById('game-over-loss-img');
const gameOverTitleEl = document.getElementById('game-over-title');
const gameOverWaitingEl = document.getElementById('game-over-waiting');
const gameOverWinsEl = document.getElementById('game-over-wins');
const gameOverStatsEl = document.getElementById('game-over-stats');
const playAgainBtn = document.getElementById('play-again-btn');

const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');

const avatarPreviewEl = document.getElementById('avatar-preview');
const avatarRandomBtn = document.getElementById('avatar-random-btn');
const avatarCustomizeBtn = document.getElementById('avatar-customize-btn');

const joinModalEl = document.getElementById('join-modal');
const joinCodeInput = document.getElementById('join-code');
const joinConfirmBtn = document.getElementById('join-confirm-btn');
const joinModalStatusEl = document.getElementById('join-modal-status');
const joinModalCloseBtn = document.getElementById('join-modal-close-btn');

const avatarCreatorModalEl = document.getElementById('avatar-creator-modal');
const avatarCreatorPreviewEl = document.getElementById('avatar-creator-preview');
const catchZoneEl = document.getElementById('catch-zone');
const avatarSaveBtn = document.getElementById('avatar-save-btn');
const avatarCancelBtn = document.getElementById('avatar-cancel-btn');
const joinModalXBtn = document.getElementById('join-modal-x-btn');
const avatarCreatorXBtn = document.getElementById('avatar-creator-x-btn');
const howToPlayBtn = document.getElementById('how-to-play-btn');
const howToPlayModalEl = document.getElementById('how-to-play-modal');
const howToPlayXBtn = document.getElementById('how-to-play-x-btn');
const howToPlayCloseBtn = document.getElementById('how-to-play-close-btn');
const rulePageEl = document.getElementById('rule-page');
const howToPlayDotsEl = document.getElementById('how-to-play-dots');
const howToPlayPrevBtn = document.getElementById('how-to-play-prev-btn');
const howToPlayNextBtn = document.getElementById('how-to-play-next-btn');
const gameOverShieldImgEl = document.getElementById('game-over-shield-img');

const DURATION_STEPS = [30, 60, 90, 120];
const ZIP_DURATION_STEPS = [1, 1.5, 2, 2.5, 3];
const STREAK_STEPS = [1, 2, 3, 4];
const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'];
// Friendly display names for the Advanced Settings per-match minigame toggles — same names as the
// README's mini-games table. Falls back to a capitalized id for any future puzzle not listed here.
const MINIGAME_LABELS = {
  stroop: 'Stroop',
  swipe: 'Swipe',
  whackamole: 'Whack-a-Mole',
  wordmatch: 'Emoji Match',
  reflexrunner: 'Reflex Runner',
  wirecut: 'Wire Cut',
  pipeconnect: 'Pipe Connect',
};

// One topic per page, stepped through with the prev/next arrows instead of shown all at once.
const HOW_TO_PLAY_PAGES = [
  {
    icon: '/UI/BombFull.png',
    title: 'Pass the Bomb',
    text: "Whoever's holding it must solve puzzles of the same type in a row before their fuse runs out.",
  },
  {
    emoji: '⏱️',
    title: 'Two Timers',
    text: 'Your personal fuse eliminates YOU if it hits zero. The match clock ends the whole game — whoever\'s holding the bomb when it runs out loses.',
  },
  {
    icon: '/UI/Sprites/IconCloseXRed.png',
    title: 'Wrong Answer',
    text: "Resets your streak back to 0, but your fuse keeps ticking either way — don't panic, just keep going.",
  },
  {
    icon: '/UI/Sprites/Tomato_Stain.png',
    title: 'Sabotage',
    text: "While you wait for your turn, tap Earn Tomato for a quick puzzle (once per turn) to earn a tomato for your basket. Throw them at whoever's holding the bomb whenever you want, as many as you've got!",
  },
  {
    icon: '/UI/Sprites/IconCoinGold.png',
    title: 'Earning Points',
    text: 'Earning a tomato, or finishing a fast streak as the holder, earns you points to spend in the Shop.',
  },
  {
    icon: '/UI/Sprites/IconShop.png',
    title: 'The Shop',
    text: "While you wait for your turn, spend points on extra fuse time for your next turn, more tomatoes for your basket, an Anti-Tomato Shield, or a skip-ahead pass.",
  },
  {
    icon: '/UI/Sprites/Sheild.png',
    title: 'Last One Standing',
    text: 'Survive to win the round.',
  },
  {
    emoji: '📱',
    title: 'Playing on Phones',
    text: "If the colors look off, turn off your phone's night mode or blue-light filter while playing.",
  },
];
let howToPlayPageIndex = 0;

let role = null; // 'host' | 'client'
let host = null;
let client = null;
let localPlayerId = null;
let scene = null;
let phaserGame = null;
let lastMatchState = null;
let lastEliminationNoticeId = undefined;
let lastZipStainSeq = 0;
let lastTomatoDeflectSeq = 0;
let lastTurnNoticeSeq = 0;
let puzzleHandle = null;
let tutorialPuzzleHandle = null;
let tutorialPuzzleIndex = 0;
let zipHandle = null;
let tomatoThrowHandle = null;
let vibratedThresholds = new Set();
let avatarCreatorHandle = null;
let currentAvatarParts = loadSavedAvatarParts() || randomAvatarParts();
let matchDurationSeconds = 60;
let zipStainDurationSeconds = 1.5;
let streakTarget = 3;
let currentDifficulty = 'medium';
let enabledMinigameIds = PUZZLES.map((p) => p.id);
let currentRoomCode = null;
const LOBBY_MUSIC_MUTED_KEY = 'hotbomb-lobby-music-muted';
let lobbyMusicMuted = (() => {
  try {
    return localStorage.getItem(LOBBY_MUSIC_MUTED_KEY) === 'true';
  } catch {
    return false;
  }
})();

renderAvatar(avatarPreviewEl, currentAvatarParts);

// --- Mod-tool debug/scenario preview ---
// ?debugPuzzle=<id>&difficulty=<easy|medium|hard> bypasses the entry/lobby screens and all
// PeerJS/networking entirely — pure local preview of one puzzle. Two families of id, matching the
// two puzzle contracts in this codebase: an id from PUZZLES (the streak-based pass-the-bomb
// rotation) reuses practiceMode, the exact same mount Tutorial Mode uses; an id from
// DEBUG_SABOTAGE_PUZZLES (Zip, Gold Rush — the "Earn Tomato" alternatives, which live outside that
// registry entirely) mounts directly via their own mount(containerEl, {onSolved, difficulty})
// contract into the same popup overlay the real game uses for them.
const DEBUG_SABOTAGE_PUZZLES = { zip: ZipPuzzle, goldrush: GoldRushTomato };
const debugParams = new URLSearchParams(window.location.search);
const debugPuzzleId = debugParams.get('debugPuzzle');
if (debugPuzzleId) {
  entryEl.classList.add('hidden');
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');

  const debugDifficulty = debugParams.get('difficulty') || 'medium';

  if (DEBUG_SABOTAGE_PUZZLES[debugPuzzleId]) {
    zipOverlayEl.classList.remove('hidden');
    DEBUG_SABOTAGE_PUZZLES[debugPuzzleId].mount(zipOverlayEl, {
      onSolved: () => {},
      difficulty: debugDifficulty,
    });
  } else {
    puzzleOverlayEl.classList.remove('hidden');
    let debugIndex = Math.max(
      0,
      PUZZLES.findIndex((p) => p.id === debugPuzzleId)
    );
    let debugHandle = null;

    const mountDebugPuzzle = () => {
      if (debugHandle) debugHandle.unmount();
      const puzzle = PUZZLES[debugIndex];
      debugHandle = createPuzzleOverlay(puzzleOverlayEl, {
        onAttempt: () => {},
        practiceMode: true,
        puzzleId: puzzle.id,
        difficulty: debugDifficulty,
        onNext: () => {
          debugIndex = (debugIndex + 1) % PUZZLES.length;
          mountDebugPuzzle();
        },
        onPrev: () => {
          debugIndex = (debugIndex - 1 + PUZZLES.length) % PUZZLES.length;
          mountDebugPuzzle();
        },
      });
    };
    mountDebugPuzzle();
  }
}

// Drives #game-container's real pixel size on portrait phones via JS rather than trusting CSS
// viewport units alone (dvh support/behavior is inconsistent across mobile browsers — when it
// silently fails, the whole height rule is dropped and the container collapses to its content
// size, which is exactly the "small floating box" bug). Phaser's FIT scale mode reads the
// parent's size to fit its fixed 800x500 canvas into, so this needs to run — and Phaser needs to
// re-fit — every time the real viewport changes (resize, rotation, mobile address-bar show/hide).
const MOBILE_PORTRAIT_QUERY = window.matchMedia('(max-width: 700px) and (orientation: portrait)');

function syncGameContainerSize() {
  if (MOBILE_PORTRAIT_QUERY.matches) {
    const vv = window.visualViewport;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;
    gameEl.style.width = `${width}px`;
    gameEl.style.height = `${height}px`;
  } else {
    gameEl.style.width = '';
    gameEl.style.height = '';
  }
  if (phaserGame) phaserGame.scale.refresh();
}

window.addEventListener('resize', syncGameContainerSize);
window.addEventListener('orientationchange', syncGameContainerSize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncGameContainerSize);
}

function triggerShake(className) {
  gameEl.classList.remove('shake-small', 'shake-big');
  void gameEl.offsetWidth; // reflow so the animation restarts even if the same class re-applies
  gameEl.classList.add(className);
}

function randomRoomCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

function getLocalName() {
  const typed = nameInputEl.value.trim().slice(0, 14);
  return typed || `Player${Math.floor(Math.random() * 90 + 10)}`;
}

function enterRoom(roomCode, isHost) {
  entryEl.classList.add('hidden');
  roomEl.classList.remove('hidden');
  currentRoomCode = roomCode;
  roomCodeTextEl.textContent = `Room Code: ${roomCode}`;
  hostControlsEl.classList.toggle('hidden', !isHost);
  clientWaitingEl.classList.toggle('hidden', isHost);
}

function resetToEntry(message) {
  clearMatchCountdown();
  roomEl.classList.add('hidden');
  entryEl.classList.remove('hidden');
  lobbyStatusEl.textContent = message || '';
  role = null;
  host = null;
  client = null;
  localPlayerId = null;
  currentRoomCode = null;
}

function renderLobbyPlayers(
  players,
  matchDurationSeconds,
  zipEnabled,
  zipDurationSeconds,
  winCounts,
  streakTargetValue,
  difficultyValue,
  tutorialEnabledValue,
  enabledMinigameIdsValue,
  minigameDifficultyValue
) {
  playerListEl.innerHTML = '';
  players.forEach((player) => {
    const li = document.createElement('li');

    const thumb = document.createElement('div');
    thumb.className = 'avatar-stack avatar-thumb-sm';
    renderAvatar(thumb, { ...(player.avatar || {}), color: player.color });
    li.appendChild(thumb);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-name';
    const displayName = player.name || 'Player';
    nameSpan.textContent = player.id === localPlayerId ? `${displayName} (You)` : displayName;
    li.appendChild(nameSpan);

    const wins = winCounts ? winCounts[player.id] || 0 : 0;
    if (wins > 0) {
      const winBadge = document.createElement('span');
      winBadge.className = 'player-win-badge';
      winBadge.textContent = `\u{1F3C6} ${wins}`;
      winBadge.title = `${wins} round${wins === 1 ? '' : 's'} won this session`;
      li.appendChild(winBadge);
    }

    if (role === 'host' && player.id !== localPlayerId) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'player-kick-btn';
      kickBtn.type = 'button';
      kickBtn.title = 'Kick player';
      kickBtn.addEventListener('click', () => {
        if (host) host.kickPlayer(player.id);
      });
      li.appendChild(kickBtn);
    }

    playerListEl.appendChild(li);
  });

  setDurationDisplay(matchDurationSeconds);
  if (zipEnabled !== undefined) zipEnabledCheckbox.checked = zipEnabled;
  if (zipDurationSeconds !== undefined) setZipDurationDisplay(zipDurationSeconds);
  if (streakTargetValue !== undefined) setStreakDisplay(streakTargetValue);
  if (difficultyValue !== undefined) setDifficultyDisplay(difficultyValue);
  if (tutorialEnabledValue !== undefined) tutorialEnabledCheckbox.checked = tutorialEnabledValue;
  if (enabledMinigameIdsValue !== undefined) setEnabledMinigameIdsDisplay(enabledMinigameIdsValue);
  setMinigameDifficultyDisplay(minigameDifficultyValue);
  clientWaitingEl.textContent =
    `Waiting for host to start... (Match length: ${matchDurationSeconds}s, ` +
    `streak: ${streakTarget}, difficulty: ${capitalize(currentDifficulty)})`;
  startBtn.disabled = players.length < 2;
}

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function setDurationDisplay(seconds) {
  matchDurationSeconds = seconds;
  durationValueEl.textContent = `${seconds}s`;
  durationMinusBtn.disabled = seconds <= DURATION_STEPS[0];
  durationPlusBtn.disabled = seconds >= DURATION_STEPS[DURATION_STEPS.length - 1];
}

function setZipDurationDisplay(seconds) {
  zipStainDurationSeconds = seconds;
  zipDurationValueEl.textContent = `${seconds}s`;
  zipDurationMinusBtn.disabled = seconds <= ZIP_DURATION_STEPS[0];
  zipDurationPlusBtn.disabled = seconds >= ZIP_DURATION_STEPS[ZIP_DURATION_STEPS.length - 1];
}

function stepZipDuration(delta) {
  const currentIndex = ZIP_DURATION_STEPS.indexOf(zipStainDurationSeconds);
  const nextIndex = Math.max(0, Math.min(ZIP_DURATION_STEPS.length - 1, currentIndex + delta));
  const nextSeconds = ZIP_DURATION_STEPS[nextIndex];
  setZipDurationDisplay(nextSeconds);
  if (role === 'host' && host) host.setZipSettings({ stainDurationSeconds: nextSeconds });
}

function setStreakDisplay(value) {
  streakTarget = value;
  streakValueEl.textContent = String(value);
  streakMinusBtn.disabled = value <= STREAK_STEPS[0];
  streakPlusBtn.disabled = value >= STREAK_STEPS[STREAK_STEPS.length - 1];
}

function stepStreak(delta) {
  const nextValue = Math.max(STREAK_STEPS[0], Math.min(STREAK_STEPS[STREAK_STEPS.length - 1], streakTarget + delta));
  setStreakDisplay(nextValue);
  if (role === 'host' && host) host.setStreakTarget(nextValue);
}

function setDifficultyDisplay(level) {
  currentDifficulty = level;
  difficultyBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.level === level));
}

// Built once — PUZZLES itself never changes at runtime, only which of its ids are currently
// enabled (and each one's own difficulty) does. Each row pairs an enable/disable checkbox with a
// per-game difficulty <select> that overrides the round's global Difficulty selector just for
// that one puzzle. The checkbox's `change` handler reads the full current selection back out (not
// just its own toggled state) so a Host flipping several boxes in a row always sends the complete
// list, matching how setEnabledMinigameIds/matchState.enabledMinigameIds are meant to be used.
const minigameToggleCheckboxes = new Map(); // id -> <input>
const minigameDifficultySelects = new Map(); // id -> <select>
PUZZLES.forEach((puzzle) => {
  const row = document.createElement('div');
  row.className = 'minigame-toggle-row';

  const label = document.createElement('label');
  label.className = 'minigame-toggle-item';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.addEventListener('change', () => {
    const selected = PUZZLES.map((p) => p.id).filter((id) => minigameToggleCheckboxes.get(id).checked);
    if (selected.length === 0) {
      // Refuse to leave zero games enabled — revert this box and keep whatever was active before.
      checkbox.checked = true;
      return;
    }
    setEnabledMinigameIdsDisplay(selected);
    if (role === 'host' && host) host.setEnabledMinigameIds(selected);
  });
  label.appendChild(checkbox);
  label.append(MINIGAME_LABELS[puzzle.id] || capitalize(puzzle.id));

  const select = document.createElement('select');
  select.className = 'minigame-difficulty-select';
  DIFFICULTY_LEVELS.forEach((level) => {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = capitalize(level);
    select.appendChild(option);
  });
  select.value = 'medium';
  select.addEventListener('change', () => {
    if (role === 'host' && host) host.setMinigameDifficulty(puzzle.id, select.value);
  });

  row.append(label, select);
  minigameToggleListEl.appendChild(row);
  minigameToggleCheckboxes.set(puzzle.id, checkbox);
  minigameDifficultySelects.set(puzzle.id, select);
});

function setEnabledMinigameIdsDisplay(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  enabledMinigameIds = ids;
  minigameToggleCheckboxes.forEach((checkbox, id) => {
    checkbox.checked = ids.includes(id);
  });
}

function setMinigameDifficultyDisplay(map) {
  if (!map) return;
  minigameDifficultySelects.forEach((select, id) => {
    if (map[id]) select.value = map[id];
  });
}

// --- Match countdown (falling-bomb popup between "Start Game" and the real match/tutorial) ---

let countdownIntervalHandle = null;

// Ticks a local 5→1 countdown off a single Host broadcast (see createMatchCountdownMessage) —
// each client runs its own timer rather than the Host re-broadcasting every second. Purely
// cosmetic, so the small clock drift that implies is harmless; the actual phase transition still
// only happens when the real START_MATCH/TUTORIAL_START message arrives (startGame/startTutorial
// below both call clearMatchCountdown() defensively on entry).
function showMatchCountdown(totalSeconds) {
  clearMatchCountdown();
  matchCountdownOverlayEl.classList.remove('hidden');
  let remaining = totalSeconds;
  setCountdownNumber(remaining);
  SoundManager.playTap();
  countdownIntervalHandle = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearMatchCountdown();
      return;
    }
    setCountdownNumber(remaining);
    SoundManager.playTap();
  }, 1000);
}

function setCountdownNumber(n) {
  matchCountdownNumberEl.textContent = String(n);
  // Force @keyframes countdown-number-pop to replay on every tick — reapplying the same
  // animation value is a no-op without this reset-and-reflow.
  matchCountdownNumberEl.style.animation = 'none';
  void matchCountdownNumberEl.offsetWidth;
  matchCountdownNumberEl.style.animation = '';
}

function clearMatchCountdown() {
  clearInterval(countdownIntervalHandle);
  countdownIntervalHandle = null;
  matchCountdownOverlayEl.classList.add('hidden');
}

// --- Lobby music ---

function updateLobbyMusicIcon() {
  lobbyMusicToggleIconEl.src = lobbyMusicMuted ? '/UI/Sprites/AccentSwoosh2_No.png' : '/UI/Sprites/AccentSwoosh2.png';
  lobbyMusicToggleBtn.title = lobbyMusicMuted ? 'Unmute lobby music' : 'Mute lobby music';
}
updateLobbyMusicIcon();

// The track actually keeps playing (and advancing) the whole time we're in the lobby, muted or
// not — the toggle button only flips SoundManager.setLobbyMusicMuted, never play/stop, so
// unmuting picks the track back up wherever it already is instead of restarting it from 0:00.
function enterLobbyMusic() {
  SoundManager.playLobbyMusic();
  SoundManager.setLobbyMusicMuted(lobbyMusicMuted);
}

// Browsers block audio with sound until the page has seen a user gesture — the very first
// pointerdown anywhere (entry screen typing/clicking included) is as early as this can start,
// rather than waiting for a specific button.
document.addEventListener('pointerdown', enterLobbyMusic, { once: true });

lobbyMusicToggleBtn.addEventListener('click', () => {
  lobbyMusicMuted = !lobbyMusicMuted;
  try {
    localStorage.setItem(LOBBY_MUSIC_MUTED_KEY, String(lobbyMusicMuted));
  } catch {
    // storage unavailable (private browsing etc.) — the toggle still works for this tab/session
  }
  updateLobbyMusicIcon();
  SoundManager.setLobbyMusicMuted(lobbyMusicMuted);
});

// Phaser (and GameScene.js, which imports it) is only ever needed once a match actually starts —
// the entry/lobby screens are plain DOM/CSS. Dynamic-importing both here instead of a static
// top-of-file import lets Vite split Phaser into its own chunk, fetched only at this point instead
// of blocking the very first paint every player sees.
async function startGame(matchState) {
  clearMatchCountdown();
  SoundManager.stopLobbyMusic();
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  unmountTutorial();
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  lastMatchState = matchState;
  syncGameContainerSize();

  const [{ default: Phaser }, { GameScene }] = await Promise.all([import('phaser'), import('./render/GameScene.js')]);

  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 800,
      height: 500,
    },
    backgroundColor: '#1d1f27',
    parent: 'game-container',
    scene: [GameScene],
  });

  phaserGame.scene.start('GameScene', {
    localPlayerId,
    // The final roster for this whole match — nobody can join mid-match, so this is everyone
    // GameScene will ever need avatar textures for. Lets it preload only those, not every
    // possible option across every category.
    players: matchState.players,
    onLocalIsHolder: (isHolder) => {
      if (isHolder) {
        mountPuzzleUI();
        unmountWaitingUI();
      } else {
        unmountPuzzleUI();
        mountWaitingUI();
      }
    },
    onSceneReady: (sceneInstance) => {
      scene = sceneInstance;
      if (lastMatchState) scene.applyMatchState(lastMatchState);
    },
  });
}

function applyMatchState(matchState) {
  const previousHolderId = lastMatchState ? lastMatchState.bombHolderId : undefined;
  lastMatchState = matchState;

  if (matchState.phase === 'tutorial') updateTutorialReadyCount(matchState);

  if (scene) scene.applyMatchState(matchState);
  applyEliminationNotice(matchState.eliminationNotice);
  checkZipStain(matchState);
  checkTomatoDeflect(matchState);
  checkTurnNotice(matchState);

  if (!pointsBalanceEl.classList.contains('hidden')) updatePointsBalanceChip(matchState);
  if (!shopOverlayEl.classList.contains('hidden')) updateShopModal(matchState);
  updateThrowTomatoButton(matchState);

  if (puzzleHandle) {
    puzzleHandle.updateTimer(matchState.bombTimer);
    puzzleHandle.updateStreak(matchState.streakCount);
  }

  // Detect "I just successfully passed the bomb" (was holder, still alive, no longer holder).
  if (previousHolderId === localPlayerId && matchState.bombHolderId !== localPlayerId) {
    const me = matchState.players.find((p) => p.id === localPlayerId);
    if (me && me.status === 'alive') SoundManager.playWin();
  }
  if (previousHolderId !== localPlayerId && matchState.bombHolderId === localPlayerId) {
    vibratedThresholds.clear();
  }

  if (matchState.phase === 'active') {
    SoundManager.playGlobalTicking();
    const globalUrgency = Math.max(0, Math.min(1, (15 - matchState.globalTimeRemaining) / 15));
    SoundManager.setGlobalTickingRate(1 + globalUrgency);

    // Last stretch of the match clock: a siren + pulsing red screen for everyone EXCEPT the
    // current holder, who already has their own personal-fuse alarm/urgency cues going and
    // doesn't need a second, unrelated danger signal competing for their attention while solving.
    const isFinalCountdown = matchState.globalTimeRemaining <= 10;
    const isHolder = matchState.bombHolderId === localPlayerId;
    if (isFinalCountdown && !isHolder) {
      SoundManager.playGlobalSiren();
      globalDangerOverlayEl.classList.add('active');
    } else {
      SoundManager.stopGlobalSiren();
      globalDangerOverlayEl.classList.remove('active');
    }
  } else {
    SoundManager.stopGlobalTicking();
    SoundManager.stopGlobalSiren();
    globalDangerOverlayEl.classList.remove('active');
  }

  if (matchState.phase === 'active' && matchState.bombHolderId === localPlayerId) {
    if (matchState.bombTimer <= 4) SoundManager.playPersonalAlarm();
    else SoundManager.stopPersonalAlarm();

    [
      [3, Haptics.pulseLow],
      [2, Haptics.pulseMid],
      [1, Haptics.pulseHigh],
    ].forEach(([threshold, pulse]) => {
      if (matchState.bombTimer <= threshold && !vibratedThresholds.has(threshold)) {
        vibratedThresholds.add(threshold);
        pulse();
      }
    });
  } else {
    SoundManager.stopPersonalAlarm();
  }
}

function applyEliminationNotice(notice) {
  const noticeId = notice ? notice.eliminatedPlayerId : null;
  if (noticeId === lastEliminationNoticeId) return;
  lastEliminationNoticeId = noticeId;

  if (notice) {
    const name = notice.eliminatedPlayerName || 'A player';
    eliminationToastEl.textContent = `${name} got blown up! \u{1F4A5}`;
    eliminationToastEl.classList.add('visible');
    SoundManager.playBombExplode();
    triggerShake('shake-big');
    spawnExplosionBurst(gameEl, 50, 50);
    if (notice.eliminatedPlayerId === localPlayerId) Haptics.explode();
  } else {
    eliminationToastEl.classList.remove('visible');
  }
}

function mountPuzzleUI() {
  puzzleOverlayEl.classList.remove('hidden');
  puzzleHandle = createPuzzleOverlay(puzzleOverlayEl, {
    onAttempt: submitPuzzleResult,
    streakTarget: lastMatchState ? lastMatchState.streakTarget : 3,
    difficulty: lastMatchState ? lastMatchState.difficulty : 'medium',
    minigameDifficulty: lastMatchState ? lastMatchState.minigameDifficulty : undefined,
    enabledIds: lastMatchState ? lastMatchState.enabledMinigameIds : undefined,
  });
  if (lastMatchState) {
    puzzleHandle.updateTimer(lastMatchState.bombTimer);
    puzzleHandle.updateStreak(lastMatchState.streakCount);
  }
  SoundManager.playPersonalRoundMusic();
}

function unmountPuzzleUI() {
  puzzleOverlayEl.classList.add('hidden');
  if (puzzleHandle) {
    puzzleHandle.unmount();
    puzzleHandle = null;
  }
  SoundManager.stopPersonalRoundMusic();
}

// --- Tutorial Mode ---

// Tutorial Mode only previews whichever minigames this room's match actually has enabled (the
// README promises "a practice round through each enabled mini-game") — not every mod-tool-enabled
// puzzle, which is the full PUZZLES list used elsewhere (e.g. the mod tool's own debug preview,
// via practiceMode without a matchState at all).
function getTutorialPuzzles() {
  const ids = lastMatchState && lastMatchState.enabledMinigameIds;
  if (!ids || ids.length === 0) return PUZZLES;
  const filtered = PUZZLES.filter((p) => ids.includes(p.id));
  return filtered.length > 0 ? filtered : PUZZLES;
}

function mountTutorialPuzzle() {
  if (tutorialPuzzleHandle) tutorialPuzzleHandle.unmount();
  const tutorialPuzzles = getTutorialPuzzles();
  const puzzle = tutorialPuzzles[tutorialPuzzleIndex];
  tutorialPuzzleHandle = createPuzzleOverlay(tutorialPuzzleMountEl, {
    onAttempt: (success) => {
      if (!success) triggerShake('shake-small');
    },
    practiceMode: true,
    puzzleId: puzzle.id,
    difficulty:
      (lastMatchState && lastMatchState.minigameDifficulty && lastMatchState.minigameDifficulty[puzzle.id]) ||
      (lastMatchState ? lastMatchState.difficulty : 'medium'),
    onNext: () => {
      tutorialPuzzleIndex = (tutorialPuzzleIndex + 1) % tutorialPuzzles.length;
      mountTutorialPuzzle();
    },
    onPrev: () => {
      tutorialPuzzleIndex = (tutorialPuzzleIndex - 1 + tutorialPuzzles.length) % tutorialPuzzles.length;
      mountTutorialPuzzle();
    },
  });
}

function updateTutorialReadyCount(matchState) {
  const total = matchState.players.length;
  const readyCount = Object.keys(matchState.tutorialReady || {}).length;
  tutorialReadyCountEl.textContent = `${readyCount}/${total} ready`;
  const alreadyReady = !!matchState.tutorialReady[localPlayerId];
  tutorialReadyBtn.disabled = alreadyReady;
  tutorialReadyBtn.textContent = alreadyReady ? '✅ Waiting for others...' : "✅ I'm Ready!";
}

function startTutorial(matchState) {
  clearMatchCountdown();
  SoundManager.stopLobbyMusic();
  lobbyEl.classList.add('hidden');
  tutorialPanelEl.classList.remove('hidden');
  lastMatchState = matchState;
  tutorialPuzzleIndex = 0;
  mountTutorialPuzzle();
  updateTutorialReadyCount(matchState);
  tutorialSkipBtn.classList.toggle('hidden', role !== 'host');
}

function unmountTutorial() {
  tutorialPanelEl.classList.add('hidden');
  if (tutorialPuzzleHandle) {
    tutorialPuzzleHandle.unmount();
    tutorialPuzzleHandle = null;
  }
}

tutorialReadyBtn.addEventListener('click', () => {
  if (role === 'host' && host) host.hostSubmitTutorialReady();
  else if (role === 'client' && client) client.sendTutorialReady();
});
tutorialSkipBtn.addEventListener('click', () => {
  if (role === 'host' && host) host.skipTutorial();
});
tutorialEnabledCheckbox.addEventListener('change', () => {
  if (role === 'host' && host) host.setTutorialEnabled(tutorialEnabledCheckbox.checked);
});

function submitPuzzleResult(success) {
  if (!success) triggerShake('shake-small');
  if (role === 'host' && host) host.hostSubmitPuzzleResult(success);
  else if (role === 'client' && client) client.sendPuzzleResult(success);
}

// --- Waiting-player actions: Zip sabotage minigame + tomato basket + Shop (alive non-holders
// only) --- Opt-in: becoming a spectator just reveals the action buttons, never a puzzle or modal
// outright — those only open once the player actually taps in, and can be backed out of.
//
// Two separate tomato actions: "Earn Tomato" opens the Snake puzzle (once per turn, same cadence
// the old instant-throw had — solving banks one tomato instead of throwing it immediately).
// "Throw" spends one banked tomato at the current holder — NOT turn-gated, so it stays visible
// and clickable as many times as the basket allows, any time they're not holding the bomb.

function mountWaitingUI() {
  if (!lastMatchState || lastMatchState.phase !== 'active') return;
  const me = lastMatchState.players.find((p) => p.id === localPlayerId);
  if (!me || me.status !== 'alive') return;
  if (lastMatchState.bombHolderId === localPlayerId) return;

  if (lastMatchState.zipEnabled) solveZipBtn.classList.remove('hidden');
  shopBtn.classList.remove('hidden');
  pointsBalanceEl.classList.remove('hidden');
  updatePointsBalanceChip(lastMatchState);
  updateThrowTomatoButton(lastMatchState);
}

function unmountWaitingUI() {
  solveZipBtn.classList.add('hidden');
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  pointsBalanceEl.classList.add('hidden');
  closeZipPuzzle();
  closeShopModal();
  closeTomatoThrowScreen();
}

// Shows/hides and updates the "Throw <N>" button based on the current basket count — called on
// mount and on every subsequent state_update while waiting, so it reacts live to solving the
// puzzle, buying a tomato in the Shop, or spending the basket down to 0.
function updateThrowTomatoButton(matchState) {
  if (!matchState || matchState.phase !== 'active') return;
  const me = matchState.players.find((p) => p.id === localPlayerId);
  if (!me || me.status !== 'alive' || matchState.bombHolderId === localPlayerId) return;

  const count = matchState.tomatoBasket?.[localPlayerId] || 0;
  if (matchState.zipEnabled && count > 0) {
    throwTomatoBtn.classList.remove('hidden');
    throwTomatoCountEl.textContent = count;
  } else {
    throwTomatoBtn.classList.add('hidden');
  }
}

// "Earn Tomato" picks randomly between the two sabotage-puzzle alternatives each time it's
// opened — both share the exact same mount(containerEl, {onSolved, difficulty}) => {unmount}
// contract, so the swap is a one-line array pick. Names/ids throughout this file (zipHandle,
// closeZipPuzzle, hostSubmitZipSolved, ...) still say "zip" for historical reasons — they mean
// "the current sabotage puzzle," not literally Zip specifically.
const SABOTAGE_PUZZLES = [ZipPuzzle, GoldRushTomato];

function openZipPuzzle() {
  solveZipBtn.classList.add('hidden');
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  zipOverlayEl.classList.remove('hidden');
  const puzzle = SABOTAGE_PUZZLES[Math.floor(Math.random() * SABOTAGE_PUZZLES.length)];
  zipHandle = puzzle.mount(zipOverlayEl, {
    onSolved: handleZipSolved,
    difficulty: lastMatchState ? lastMatchState.difficulty : 'medium',
  });
  zipOverlayEl.appendChild(zipCancelBtn);
}

function closeZipPuzzle() {
  zipOverlayEl.classList.add('hidden');
  if (zipHandle) {
    zipHandle.unmount();
    zipHandle = null;
  }
}

function handleZipSolved() {
  if (role === 'host' && host) host.hostSubmitZipSolved();
  else if (role === 'client' && client) client.sendZipSolved();
  closeZipPuzzle();
  // Already solved this turn, so solveZipBtn stays hidden until the next one — but they can
  // still throw what they've banked, or visit the Shop, in the meantime.
  shopBtn.classList.remove('hidden');
  if (lastMatchState) updateThrowTomatoButton(lastMatchState);
}

solveZipBtn.addEventListener('click', () => openZipPuzzle());
throwTomatoBtn.addEventListener('click', () => openTomatoThrowScreen());
zipCancelBtn.addEventListener('click', () => {
  closeZipPuzzle();
  mountWaitingUI(); // re-checks eligibility and shows the buttons again if still valid
});

// Swipe-up throw mini-interaction: opened by the "Throw" button instead of sending the network
// message directly, so throwing a tomato is a real little action for the thrower rather than a
// flat click. Each successful swipe fires the real network call immediately (onThrow) and, if the
// basket still has more, spawns another tomato right away so throwing several in a row stays
// fluid; running out (or hitting Cancel) closes the screen and shows the waiting buttons again.
function openTomatoThrowScreen() {
  solveZipBtn.classList.add('hidden');
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  tomatoThrowOverlayEl.classList.remove('hidden');
  const initialCount = lastMatchState?.tomatoBasket?.[localPlayerId] || 0;
  tomatoThrowHandle = TomatoThrow.mount(tomatoThrowOverlayEl, {
    initialCount,
    onThrow: () => {
      if (role === 'host' && host) host.hostSubmitThrowTomato();
      else if (role === 'client' && client) client.sendThrowTomato();
    },
    onClose: () => {
      closeTomatoThrowScreen();
      mountWaitingUI();
    },
  });
  tomatoThrowOverlayEl.appendChild(tomatoThrowCancelBtn);
}

function closeTomatoThrowScreen() {
  tomatoThrowOverlayEl.classList.add('hidden');
  if (tomatoThrowHandle) {
    tomatoThrowHandle.unmount();
    tomatoThrowHandle = null;
  }
}

tomatoThrowCancelBtn.addEventListener('click', () => {
  closeTomatoThrowScreen();
  mountWaitingUI(); // re-checks eligibility and shows the buttons again if still valid
});

// --- Shop ---

function openShopModal() {
  solveZipBtn.classList.add('hidden');
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  shopOverlayEl.classList.remove('hidden');
  shopFuseSecondsEl.textContent = gameConfig.settings.points.fuseBonusSeconds;
  shopShieldChargesEl.textContent = gameConfig.settings.points.antiTomatoShieldCharges;
  ['fuseTime', 'throwTomato', 'antiTomatoShield', 'skipPass'].forEach((item) => {
    document.getElementById(`shop-price-${item}`).textContent = gameConfig.settings.points.prices[item];
  });
  if (lastMatchState) updateShopModal(lastMatchState);
}

function closeShopModal() {
  shopOverlayEl.classList.add('hidden');
}

shopBtn.addEventListener('click', () => openShopModal());
shopCancelBtn.addEventListener('click', () => {
  closeShopModal();
  mountWaitingUI();
});

Object.entries(shopBuyBtns).forEach(([item, btn]) => {
  btn.addEventListener('click', () => {
    if (role === 'host' && host) host.hostSubmitShopPurchase(item);
    else if (role === 'client' && client) client.sendShopPurchase(item);
  });
});

function updatePointsBalanceChip(matchState) {
  pointsBalanceValueEl.textContent = matchState.points?.[localPlayerId] || 0;
}

// Keeps the open Shop modal's balance + affordability + "already queued" state in sync with
// every incoming state_update — a no-op cost when the modal is hidden.
function updateShopModal(matchState) {
  const balance = matchState.points?.[localPlayerId] || 0;
  shopBalanceValueEl.textContent = balance;

  const prices = gameConfig.settings.points.prices;
  const isHolder = matchState.bombHolderId === localPlayerId;
  const hasFuseBonus = !!matchState.pendingFuseBonus?.[localPlayerId];
  const hasSkipPending = !!matchState.pendingSkipPass;
  const hasActiveShield = !!matchState.shieldCharges?.[localPlayerId];

  shopBuyBtns.fuseTime.disabled = isHolder || hasFuseBonus || balance < prices.fuseTime;
  shopBuyBtns.antiTomatoShield.disabled =
    isHolder || !matchState.zipEnabled || hasActiveShield || balance < prices.antiTomatoShield;
  shopBuyBtns.throwTomato.disabled = isHolder || !matchState.zipEnabled || balance < prices.throwTomato;
  shopBuyBtns.skipPass.disabled = isHolder || hasSkipPending || balance < prices.skipPass;
}

// Detects a NEW stain event via its seq number (matchState is re-broadcast every tick, so the
// same event would otherwise re-trigger the visual on every subsequent state_update).
function checkZipStain(matchState) {
  if (!matchState.zipStain || matchState.zipStain.seq === lastZipStainSeq) return;
  lastZipStainSeq = matchState.zipStain.seq;
  const { targetPlayerId, throwerId } = matchState.zipStain;
  if (targetPlayerId === localPlayerId) {
    showTomatoStain(matchState.zipStainDurationSeconds);
    SoundManager.playTomatoSquash();
  }
  if (throwerId === localPlayerId) {
    SoundManager.playTomatoSquash();
  }
}

// Same seq-based new-event detection as checkZipStain, but for a throw the holder's shield
// absorbed — fires instead of zipStain (see throwTomatoFromBasket), so a blocked throw still
// gives both players real feedback instead of silently doing nothing.
function checkTomatoDeflect(matchState) {
  if (!matchState.tomatoDeflect || matchState.tomatoDeflect.seq === lastTomatoDeflectSeq) return;
  lastTomatoDeflectSeq = matchState.tomatoDeflect.seq;
  const { targetPlayerId, throwerId } = matchState.tomatoDeflect;
  if (targetPlayerId === localPlayerId) {
    showShieldPulse();
    SoundManager.playShieldDeflect();
  }
  if (throwerId === localPlayerId) {
    SoundManager.playShieldDeflect();
  }
}

// Detects a NEW "bomb changed hands" event via its seq number, same pattern as checkZipStain —
// fires for every player, every time selectNextHolder actually assigns a new holder (a normal
// streak-completion pass or a purchased skip-ahead pass consuming itself).
let turnNoticeHideTimeout = null;
function checkTurnNotice(matchState) {
  const notice = matchState.turnNotice;
  if (!notice || notice.seq === lastTurnNoticeSeq) return;
  lastTurnNoticeSeq = notice.seq;

  const toName = notice.toName || 'someone';
  const message =
    notice.skipped && notice.skipped.length > 0
      ? `${notice.skipped.map((p) => p.name).join(', ')} skipped their turn — bomb went to ${toName}!`
      : `Bomb passed to ${toName}!`;

  turnNoticeToastEl.textContent = message;
  turnNoticeToastEl.classList.add('visible');
  clearTimeout(turnNoticeHideTimeout);
  turnNoticeHideTimeout = setTimeout(() => turnNoticeToastEl.classList.remove('visible'), 2500);
}

function showTomatoStain(durationSeconds) {
  // Lands on the actual puzzle game box — the surface the holder is staring at while solving —
  // appended onto #puzzle-overlay itself. That overlay is a full-screen fixed layer that covers
  // #game-container entirely while the holder's own puzzle is up, so appending onto #game-container
  // (the old approach, back when the puzzle was a boxed-in popup rather than full-screen) landed
  // the splat behind what the holder was actually looking at — it was never visible to them.
  const panelEl = puzzleOverlayEl.querySelector('.puzzle-game-box') || puzzleOverlayEl;
  const panelRect = panelEl.getBoundingClientRect();
  const overlayRect = puzzleOverlayEl.getBoundingClientRect();
  const offsetX = panelRect.left - overlayRect.left;
  const offsetY = panelRect.top - overlayRect.top;
  const stainSize = gameConfig.settings.tomatoStainSizePx || 90;
  const maxX = Math.max(0, panelRect.width - stainSize);
  const maxY = Math.max(0, panelRect.height - stainSize);

  const stain = document.createElement('img');
  stain.src = '/UI/Sprites/Tomato_Stain.png';
  stain.alt = '';
  stain.className = 'tomato-stain';
  stain.style.width = `${stainSize}px`;
  stain.style.height = `${stainSize}px`;
  stain.style.left = `${offsetX + Math.random() * maxX}px`;
  stain.style.top = `${offsetY + Math.random() * maxY}px`;
  stain.style.setProperty('--tomato-rot', `${Math.random() * 360}deg`);
  puzzleOverlayEl.appendChild(stain);
  setTimeout(() => stain.remove(), Math.max(200, durationSeconds * 1000));
}

// A brief pulsing soft-blue glow around the screen edge — tells the holder their Anti-Tomato
// Shield just absorbed an incoming throw. Fixed/full-viewport (not scoped to #puzzle-overlay)
// since it's a screen-wide "something happened to you" cue, not tied to the puzzle surface itself.
function showShieldPulse() {
  shieldPulseOverlayEl.classList.remove('active');
  void shieldPulseOverlayEl.offsetWidth; // restart the animation if it fires again mid-pulse
  shieldPulseOverlayEl.classList.add('active');
}
shieldPulseOverlayEl.addEventListener('animationend', () => shieldPulseOverlayEl.classList.remove('active'));

function showGameOver({ winners, loserId, winCounts, points, tomatoesThrown }) {
  unmountPuzzleUI();
  unmountWaitingUI();
  applyEliminationNotice(null);
  clearTimeout(turnNoticeHideTimeout);
  turnNoticeToastEl.classList.remove('visible');
  SoundManager.stopGlobalTicking();
  SoundManager.stopPersonalAlarm();
  gameOverPanelEl.classList.remove('hidden');

  const youWon = winners.includes(localPlayerId);
  gameOverLossImgEl.classList.toggle('hidden', youWon);
  gameOverTitleEl.classList.toggle('hidden', !youWon);
  gameOverShieldImgEl.classList.toggle('hidden', !youWon);

  // Only the Host can start the next round — everyone else just waits for it.
  playAgainBtn.classList.toggle('hidden', role !== 'host');
  gameOverWaitingEl.classList.toggle('hidden', role === 'host');

  renderWinTally(winCounts);
  renderMatchStats(points, tomatoesThrown);

  if (youWon) {
    gameOverTitleEl.textContent = 'YOU SURVIVED! \u{1F3C6}';
    SoundManager.playWin();
    spawnConfetti(gameEl);
  } else if (loserId === localPlayerId) {
    // Only the final (skip-the-pause) elimination reaches here without already having played
    // the explosion via applyEliminationNotice — mid-match eliminations get it from there.
    SoundManager.playBombExplode();
    triggerShake('shake-big');
    spawnExplosionBurst(gameEl, 50, 50);
    Haptics.explode();
  }
}

function renderWinTally(winCounts) {
  gameOverWinsEl.innerHTML = '';
  if (!winCounts || !lastMatchState) {
    gameOverWinsEl.classList.add('hidden');
    return;
  }
  const entries = lastMatchState.players
    .map((p) => ({ name: p.name || 'Player', wins: winCounts[p.id] || 0 }))
    .filter((e) => e.wins > 0)
    .sort((a, b) => b.wins - a.wins);

  if (entries.length === 0) {
    gameOverWinsEl.classList.add('hidden');
    return;
  }
  entries.forEach(({ name, wins }) => {
    const chip = document.createElement('span');
    chip.className = 'win-tally-chip';
    chip.textContent = `${name}: \u{1F3C6}${wins}`;
    gameOverWinsEl.appendChild(chip);
  });
  gameOverWinsEl.classList.remove('hidden');
}

// Finds the player with the highest value in a {playerId: number} map. Ties just keep whichever
// was found first in player order.
function topScorer(tallies) {
  if (!tallies || !lastMatchState) return null;
  let best = null;
  lastMatchState.players.forEach((p) => {
    const value = tallies[p.id] || 0;
    if (value > 0 && (!best || value > best.value)) best = { name: p.name || 'Player', value };
  });
  return best;
}

function renderMatchStats(points, tomatoesThrown) {
  gameOverStatsEl.innerHTML = '';
  const lines = [];

  const topThrower = topScorer(tomatoesThrown);
  if (topThrower) lines.push(`\u{1F345} Most tomatoes thrown: ${topThrower.name} (${topThrower.value})`);

  const topEarner = topScorer(points);
  if (topEarner) lines.push(`\u{1FA99} Most points earned: ${topEarner.name} (${topEarner.value})`);

  if (lines.length === 0) {
    gameOverStatsEl.classList.add('hidden');
    return;
  }
  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'match-stat-row';
    row.textContent = line;
    gameOverStatsEl.appendChild(row);
  });
  gameOverStatsEl.classList.remove('hidden');
}

// Brings a finished match back to the room screen with the same connected players, so the Host
// can start another round without anyone reconnecting.
function returnToLobby(message) {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  scene = null;
  lastMatchState = null;
  lastEliminationNoticeId = undefined;
  lastZipStainSeq = 0;
  lastTomatoDeflectSeq = 0;
  lastTurnNoticeSeq = 0;
  clearTimeout(turnNoticeHideTimeout);
  turnNoticeToastEl.classList.remove('visible');
  globalDangerOverlayEl.classList.remove('active');
  vibratedThresholds.clear();
  SoundManager.stopGlobalTicking();
  SoundManager.stopGlobalSiren();
  SoundManager.stopPersonalAlarm();
  SoundManager.stopPersonalRoundMusic();
  enterLobbyMusic();

  gameOverPanelEl.classList.add('hidden');
  gameEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  entryEl.classList.add('hidden');
  roomEl.classList.remove('hidden');
  hostControlsEl.classList.toggle('hidden', role !== 'host');
  clientWaitingEl.classList.toggle('hidden', role === 'host');

  renderLobbyPlayers(
    message.players,
    message.matchDurationSeconds,
    message.zipEnabled,
    message.zipStainDurationSeconds,
    message.winCounts,
    message.streakTarget,
    message.difficulty,
    message.tutorialEnabled,
    message.enabledMinigameIds,
    message.minigameDifficulty
  );
}

// --- Avatar: random / customize ---

avatarRandomBtn.addEventListener('click', () => {
  currentAvatarParts = randomAvatarParts();
  saveAvatarParts(currentAvatarParts);
  renderAvatar(avatarPreviewEl, currentAvatarParts);
});

function closeAvatarCreatorModal() {
  avatarCreatorModalEl.classList.add('hidden');
  if (avatarCreatorHandle) {
    avatarCreatorHandle.unmount();
    avatarCreatorHandle = null;
  }
}

avatarCustomizeBtn.addEventListener('click', () => {
  avatarCreatorModalEl.classList.remove('hidden');
  avatarCreatorHandle = mountAvatarCreator({
    zoneEl: catchZoneEl,
    previewEl: avatarCreatorPreviewEl,
    initialParts: currentAvatarParts,
    onSave: (parts) => {
      currentAvatarParts = parts;
      saveAvatarParts(parts);
      renderAvatar(avatarPreviewEl, parts);
      closeAvatarCreatorModal();
    },
    onCancel: () => closeAvatarCreatorModal(),
  });
});

avatarSaveBtn.addEventListener('click', () => {
  if (avatarCreatorHandle) avatarCreatorHandle.save();
});

avatarCancelBtn.addEventListener('click', () => {
  if (avatarCreatorHandle) avatarCreatorHandle.cancel();
});

avatarCreatorXBtn.addEventListener('click', () => {
  if (avatarCreatorHandle) avatarCreatorHandle.cancel();
});

// --- How to Play ---

function renderHowToPlayPage(index) {
  howToPlayPageIndex = index;
  const page = HOW_TO_PLAY_PAGES[index];

  rulePageEl.innerHTML = '';
  if (page.icon) {
    const img = document.createElement('img');
    img.className = 'rule-page-icon';
    img.src = page.icon;
    img.alt = '';
    rulePageEl.appendChild(img);
  } else {
    const emojiEl = document.createElement('div');
    emojiEl.className = 'rule-page-icon-emoji';
    emojiEl.textContent = page.emoji;
    rulePageEl.appendChild(emojiEl);
  }
  const titleEl = document.createElement('div');
  titleEl.className = 'rule-page-title';
  titleEl.textContent = page.title;
  rulePageEl.appendChild(titleEl);
  const textEl = document.createElement('div');
  textEl.className = 'rule-page-text';
  textEl.textContent = page.text;
  rulePageEl.appendChild(textEl);

  howToPlayDotsEl.innerHTML = '';
  HOW_TO_PLAY_PAGES.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'puzzle-dot';
    if (i === index) dot.classList.add('filled');
    howToPlayDotsEl.appendChild(dot);
  });
}

function showPrevHowToPlayPage() {
  renderHowToPlayPage((howToPlayPageIndex - 1 + HOW_TO_PLAY_PAGES.length) % HOW_TO_PLAY_PAGES.length);
}
function showNextHowToPlayPage() {
  renderHowToPlayPage((howToPlayPageIndex + 1) % HOW_TO_PLAY_PAGES.length);
}

howToPlayBtn.addEventListener('click', () => {
  renderHowToPlayPage(0);
  howToPlayModalEl.classList.remove('hidden');
});
howToPlayXBtn.addEventListener('click', () => howToPlayModalEl.classList.add('hidden'));
howToPlayCloseBtn.addEventListener('click', () => howToPlayModalEl.classList.add('hidden'));
howToPlayPrevBtn.addEventListener('click', showPrevHowToPlayPage);
howToPlayNextBtn.addEventListener('click', showNextHowToPlayPage);

// Phone users can swipe left/right across the page content to move between topics, on top of
// (not instead of) the tap arrows — same threshold/pointer-capture approach as Swipe.js.
const HOW_TO_PLAY_MIN_SWIPE_PX = 40;
let howToPlaySwipeStart = null;
rulePageEl.addEventListener('pointerdown', (e) => {
  howToPlaySwipeStart = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  rulePageEl.setPointerCapture(e.pointerId);
});
rulePageEl.addEventListener('pointerup', (e) => {
  if (!howToPlaySwipeStart || howToPlaySwipeStart.pointerId !== e.pointerId) return;
  const dx = e.clientX - howToPlaySwipeStart.x;
  const dy = e.clientY - howToPlaySwipeStart.y;
  howToPlaySwipeStart = null;
  if (Math.abs(dx) < HOW_TO_PLAY_MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
  if (dx < 0) showNextHowToPlayPage();
  else showPrevHowToPlayPage();
});

// --- Room code copy ---

let copyResetTimeout = null;
roomCodeCopyBtn.addEventListener('click', async () => {
  if (!currentRoomCode) return;
  try {
    await navigator.clipboard.writeText(currentRoomCode);
  } catch {
    // Clipboard API can be unavailable (insecure context, denied permission) — nothing to
    // recover here, the button just won't show the "copied" confirmation.
    return;
  }
  roomCodeCopyBtn.textContent = '✅';
  roomCodeCopyBtn.classList.add('copied');
  clearTimeout(copyResetTimeout);
  copyResetTimeout = setTimeout(() => {
    roomCodeCopyBtn.textContent = '📋';
    roomCodeCopyBtn.classList.remove('copied');
  }, 1200);
});

// --- Leave room ---

leaveRoomBtn.addEventListener('click', () => {
  if (role === 'host' && host) {
    host.destroy();
  } else if (role === 'client' && client) {
    // Clear the callback first — disconnect() closes the connection, which would otherwise also
    // fire onDisconnected and stomp the clean "Left the room." message below with the generic
    // unexpected-drop one.
    client.onDisconnected = null;
    client.disconnect();
  }
  resetToEntry('Left the room.');
});

// --- Join popup ---

joinBtn.addEventListener('click', () => {
  joinModalStatusEl.textContent = '';
  joinCodeInput.value = '';
  joinModalEl.classList.remove('hidden');
  joinCodeInput.focus();
});

joinModalCloseBtn.addEventListener('click', () => {
  joinModalEl.classList.add('hidden');
});

joinModalXBtn.addEventListener('click', () => {
  joinModalEl.classList.add('hidden');
});

joinConfirmBtn.addEventListener('click', () => {
  const roomCode = joinCodeInput.value.trim().toUpperCase();
  if (roomCode.length !== 4) {
    joinModalStatusEl.textContent = 'Enter a 4-letter room code.';
    return;
  }
  const name = getLocalName();
  joinModalStatusEl.textContent = `Connecting to ${roomCode}...`;

  role = 'client';
  client = new PeerClient();

  client.onConnected = (id) => {
    localPlayerId = id;
    joinModalEl.classList.add('hidden');
    enterRoom(roomCode, false);
  };
  client.onLobbyUpdate = (message) =>
    renderLobbyPlayers(
      message.players,
      message.matchDurationSeconds,
      message.zipEnabled,
      message.zipStainDurationSeconds,
      message.winCounts,
      message.streakTarget,
      message.difficulty,
      message.tutorialEnabled,
      message.enabledMinigameIds,
      message.minigameDifficulty
    );
  client.onMatchCountdown = (seconds) => showMatchCountdown(seconds);
  client.onTutorialStarted = (matchState) => startTutorial(matchState);
  client.onMatchStarted = (matchState) => startGame(matchState);
  client.onStateUpdate = (matchState) => applyMatchState(matchState);
  client.onGameOver = (result) => showGameOver(result);
  client.onReturnToLobby = (message) => returnToLobby(message);
  client.onDisconnected = () => {
    // Only relevant while still in the lobby (e.g. host kicked us) — a mid-match drop is
    // already handled by the host's own elimination-on-disconnect logic.
    if (!gameEl.classList.contains('hidden')) return;
    resetToEntry('Disconnected from the host.');
  };
  client.onError = (err) => {
    joinModalStatusEl.textContent = `Connection failed: ${err.message ?? err.type}`;
  };

  client.connect(roomCode, name, currentAvatarParts);
});

// --- Lobby / room ---

playAgainBtn.addEventListener('click', () => {
  if (role === 'host' && host) host.playAgain();
});

function stepDuration(delta) {
  const currentIndex = DURATION_STEPS.indexOf(matchDurationSeconds);
  const nextIndex = Math.max(0, Math.min(DURATION_STEPS.length - 1, currentIndex + delta));
  const nextSeconds = DURATION_STEPS[nextIndex];
  setDurationDisplay(nextSeconds);
  if (role === 'host' && host) host.setMatchDuration(nextSeconds);
}

durationMinusBtn.addEventListener('click', () => stepDuration(-1));
durationPlusBtn.addEventListener('click', () => stepDuration(1));

zipDurationMinusBtn.addEventListener('click', () => stepZipDuration(-1));
zipDurationPlusBtn.addEventListener('click', () => stepZipDuration(1));

zipEnabledCheckbox.addEventListener('change', () => {
  if (role === 'host' && host) host.setZipSettings({ enabled: zipEnabledCheckbox.checked });
});

streakMinusBtn.addEventListener('click', () => stepStreak(-1));
streakPlusBtn.addEventListener('click', () => stepStreak(1));

difficultyBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const level = btn.dataset.level;
    setDifficultyDisplay(level);
    if (role === 'host' && host) host.setDifficulty(level);
  });
});

startBtn.addEventListener('click', () => {
  if (role === 'host' && host) host.beginMatch();
});

advancedSettingsBtn.addEventListener('click', () => {
  advancedSettingsModalEl.classList.remove('hidden');
});
advancedSettingsXBtn.addEventListener('click', () => {
  advancedSettingsModalEl.classList.add('hidden');
});
advancedSettingsDoneBtn.addEventListener('click', () => {
  advancedSettingsModalEl.classList.add('hidden');
});

hostBtn.addEventListener('click', () => {
  const roomCode = randomRoomCode();
  const name = getLocalName();
  lobbyStatusEl.textContent = 'Starting host...';

  role = 'host';
  host = new PeerHost(roomCode, name, currentAvatarParts, undefined, PUZZLES.map((p) => p.id));

  host.onReady = (id) => {
    localPlayerId = id;
    lobbyStatusEl.textContent = '';
    enterRoom(roomCode, true);
  };
  host.onLobbyUpdate = (matchState) =>
    renderLobbyPlayers(
      matchState.players,
      matchState.matchDurationSeconds,
      matchState.zipEnabled,
      matchState.zipStainDurationSeconds,
      matchState.winCounts,
      matchState.streakTarget,
      matchState.difficulty,
      matchState.tutorialEnabled,
      matchState.enabledMinigameIds,
      matchState.minigameDifficulty
    );
  host.onMatchCountdown = (seconds) => showMatchCountdown(seconds);
  host.onTutorialStarted = (matchState) => startTutorial(matchState);
  host.onMatchStarted = (matchState) => startGame(matchState);
  host.onStateUpdate = (matchState) => applyMatchState(matchState);
  host.onGameOver = (result) => showGameOver(result);
  host.onReturnToLobby = (matchState) => returnToLobby(matchState);
  host.onError = (err) => {
    lobbyStatusEl.textContent = `Host error: ${err.message ?? err.type}`;
  };
});
