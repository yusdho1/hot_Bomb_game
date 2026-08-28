import Phaser from 'phaser';
import { PeerHost } from './network/PeerHost.js';
import { PeerClient } from './network/PeerClient.js';
import { GameScene } from './render/GameScene.js';
import { mountPuzzleOverlay as createPuzzleOverlay } from './render/puzzles/PuzzleOverlay.js';
import { ZipPuzzle } from './render/puzzles/ZipPuzzle.js';
import { SoundManager } from './render/SoundManager.js';
import { Haptics } from './render/Haptics.js';
import { spawnConfetti, spawnExplosionBurst } from './render/Particles.js';
import { renderAvatar } from './render/AvatarRenderer.js';
import { mountAvatarCreator } from './render/AvatarCreator.js';
import { randomAvatarParts, loadSavedAvatarParts, saveAvatarParts } from './render/avatarOptions.js';
import gameConfig from './config/game.config.json';

const nameInputEl = document.getElementById('name-input');
const entryEl = document.getElementById('entry');
const roomEl = document.getElementById('room');
const roomCodeTextEl = document.getElementById('room-code-text');
const roomCodeCopyBtn = document.getElementById('room-code-copy-btn');
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
const startBtn = document.getElementById('start-btn');
const clientWaitingEl = document.getElementById('client-waiting');
const lobbyStatusEl = document.getElementById('lobby-status');

const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game-container');
const eliminationToastEl = document.getElementById('elimination-toast');
const turnNoticeToastEl = document.getElementById('turn-notice-toast');
const puzzleOverlayEl = document.getElementById('puzzle-overlay');
const throwTomatoBtn = document.getElementById('throw-tomato-btn');
const zipOverlayEl = document.getElementById('zip-overlay');
const zipCancelBtn = document.getElementById('zip-cancel-btn');
const pointsBalanceEl = document.getElementById('points-balance');
const pointsBalanceValueEl = document.getElementById('points-balance-value');
const shopBtn = document.getElementById('shop-btn');
const shopOverlayEl = document.getElementById('shop-overlay');
const shopCancelBtn = document.getElementById('shop-cancel-btn');
const shopBalanceValueEl = document.getElementById('shop-balance-value');
const shopFuseSecondsEl = document.getElementById('shop-fuse-seconds');
const shopBuyBtns = {
  fuseTime: document.getElementById('shop-buy-fuseTime'),
  throwTomato: document.getElementById('shop-buy-throwTomato'),
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
const TOMATO_STAIN_PX = 90;

// One topic per page, stepped through with the prev/next arrows instead of shown all at once.
const HOW_TO_PLAY_PAGES = [
  {
    icon: '/UI/Bomb.png',
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
    title: 'Snake Sabotage',
    text: "While you wait for your turn, solve the Snake puzzle to throw a tomato at whoever's holding the bomb!",
  },
  {
    icon: '/UI/Sprites/IconCoinGold.png',
    title: 'Earning Points',
    text: 'Solving Snake, or finishing a fast streak as the holder, earns you points to spend in the Shop.',
  },
  {
    icon: '/UI/Sprites/IconShop.png',
    title: 'The Shop',
    text: "While you wait for your turn, spend points on extra fuse time for your next turn, an instant tomato throw, or a skip-ahead pass.",
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
let lastTurnNoticeSeq = 0;
let puzzleHandle = null;
let zipHandle = null;
let vibratedThresholds = new Set();
let avatarCreatorHandle = null;
let currentAvatarParts = loadSavedAvatarParts() || randomAvatarParts();
let matchDurationSeconds = 60;
let zipStainDurationSeconds = 1.5;
let streakTarget = 3;
let currentDifficulty = 'medium';
let currentRoomCode = null;

renderAvatar(avatarPreviewEl, currentAvatarParts);

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
  difficultyValue
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

function startGame(matchState) {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  lastMatchState = matchState;
  syncGameContainerSize();

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

  if (scene) scene.applyMatchState(matchState);
  applyEliminationNotice(matchState.eliminationNotice);
  checkZipStain(matchState);
  checkTurnNotice(matchState);

  if (!pointsBalanceEl.classList.contains('hidden')) updatePointsBalanceChip(matchState);
  if (!shopOverlayEl.classList.contains('hidden')) updateShopModal(matchState);

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
    if (matchState.globalTimeRemaining <= 10) SoundManager.playAlarmOnce();
  } else {
    SoundManager.stopGlobalTicking();
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

function submitPuzzleResult(success) {
  if (!success) triggerShake('shake-small');
  if (role === 'host' && host) host.hostSubmitPuzzleResult(success);
  else if (role === 'client' && client) client.sendPuzzleResult(success);
}

// --- Waiting-player actions: Zip sabotage minigame + Shop (alive non-holders only) ---
// Opt-in: becoming a spectator just reveals the "Throw Tomato" / "Shop" buttons, never a puzzle
// or modal outright — those only open once the player actually taps in, and can be backed out of.

function mountWaitingUI() {
  if (!lastMatchState || lastMatchState.phase !== 'active') return;
  const me = lastMatchState.players.find((p) => p.id === localPlayerId);
  if (!me || me.status !== 'alive') return;
  if (lastMatchState.bombHolderId === localPlayerId) return;

  if (lastMatchState.zipEnabled) throwTomatoBtn.classList.remove('hidden');
  shopBtn.classList.remove('hidden');
  pointsBalanceEl.classList.remove('hidden');
  updatePointsBalanceChip(lastMatchState);
}

function unmountWaitingUI() {
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  pointsBalanceEl.classList.add('hidden');
  closeZipPuzzle();
  closeShopModal();
}

function openZipPuzzle() {
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  zipOverlayEl.classList.remove('hidden');
  zipHandle = ZipPuzzle.mount(zipOverlayEl, { onSolved: handleZipSolved });
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
  // Already thrown this turn, so throwTomatoBtn stays hidden until the next one — but they can
  // still visit the Shop in the meantime.
  shopBtn.classList.remove('hidden');
}

throwTomatoBtn.addEventListener('click', () => openZipPuzzle());
zipCancelBtn.addEventListener('click', () => {
  closeZipPuzzle();
  mountWaitingUI(); // re-checks eligibility and shows the buttons again if still valid
});

// --- Shop ---

function openShopModal() {
  throwTomatoBtn.classList.add('hidden');
  shopBtn.classList.add('hidden');
  shopOverlayEl.classList.remove('hidden');
  shopFuseSecondsEl.textContent = gameConfig.settings.points.fuseBonusSeconds;
  ['fuseTime', 'throwTomato', 'skipPass'].forEach((item) => {
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
  const canThrow = matchState.zipEnabled && !isHolder && !!matchState.bombHolderId;

  shopBuyBtns.fuseTime.disabled = isHolder || hasFuseBonus || balance < prices.fuseTime;
  shopBuyBtns.throwTomato.disabled = isHolder || !canThrow || balance < prices.throwTomato;
  shopBuyBtns.skipPass.disabled = isHolder || hasSkipPending || balance < prices.skipPass;
}

// Detects a NEW stain event via its seq number (matchState is re-broadcast every tick, so the
// same event would otherwise re-trigger the visual on every subsequent state_update).
function checkZipStain(matchState) {
  if (!matchState.zipStain || matchState.zipStain.seq === lastZipStainSeq) return;
  lastZipStainSeq = matchState.zipStain.seq;
  if (matchState.zipStain.targetPlayerId === localPlayerId) {
    showTomatoStain(matchState.zipStainDurationSeconds);
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
  // Land it on the puzzle panel itself (what the holder is actually looking at), not anywhere
  // in the letterboxed game-container around it.
  const panelEl = puzzleOverlayEl.querySelector('.puzzle-panel') || gameEl;
  const panelRect = panelEl.getBoundingClientRect();
  const gameRect = gameEl.getBoundingClientRect();
  const offsetX = panelRect.left - gameRect.left;
  const offsetY = panelRect.top - gameRect.top;
  const maxX = Math.max(0, panelRect.width - TOMATO_STAIN_PX);
  const maxY = Math.max(0, panelRect.height - TOMATO_STAIN_PX);

  const stain = document.createElement('img');
  stain.src = '/UI/Sprites/Tomato_Stain.png';
  stain.alt = '';
  stain.className = 'tomato-stain';
  stain.style.left = `${offsetX + Math.random() * maxX}px`;
  stain.style.top = `${offsetY + Math.random() * maxY}px`;
  stain.style.setProperty('--tomato-rot', `${Math.random() * 360}deg`);
  gameEl.appendChild(stain);
  setTimeout(() => stain.remove(), Math.max(200, durationSeconds * 1000));
}

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
  lastTurnNoticeSeq = 0;
  clearTimeout(turnNoticeHideTimeout);
  turnNoticeToastEl.classList.remove('visible');
  vibratedThresholds.clear();
  SoundManager.stopGlobalTicking();
  SoundManager.stopPersonalAlarm();
  SoundManager.stopPersonalRoundMusic();
  SoundManager.resetAlarm();

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
    message.difficulty
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
      message.difficulty
    );
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

hostBtn.addEventListener('click', () => {
  const roomCode = randomRoomCode();
  const name = getLocalName();
  lobbyStatusEl.textContent = 'Starting host...';

  role = 'host';
  host = new PeerHost(roomCode, name, currentAvatarParts);

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
      matchState.difficulty
    );
  host.onMatchStarted = (matchState) => startGame(matchState);
  host.onStateUpdate = (matchState) => applyMatchState(matchState);
  host.onGameOver = (result) => showGameOver(result);
  host.onReturnToLobby = (matchState) => returnToLobby(matchState);
  host.onError = (err) => {
    lobbyStatusEl.textContent = `Host error: ${err.message ?? err.type}`;
  };
});
