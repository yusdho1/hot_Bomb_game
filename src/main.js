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
const startBtn = document.getElementById('start-btn');
const clientWaitingEl = document.getElementById('client-waiting');
const lobbyStatusEl = document.getElementById('lobby-status');

const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game-container');
const eliminationToastEl = document.getElementById('elimination-toast');
const puzzleOverlayEl = document.getElementById('puzzle-overlay');
const zipOverlayEl = document.getElementById('zip-overlay');
const gameOverPanelEl = document.getElementById('game-over-panel');
const gameOverLossImgEl = document.getElementById('game-over-loss-img');
const gameOverTitleEl = document.getElementById('game-over-title');
const gameOverWaitingEl = document.getElementById('game-over-waiting');
const gameOverWinsEl = document.getElementById('game-over-wins');
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
const gameOverShieldImgEl = document.getElementById('game-over-shield-img');

const DURATION_STEPS = [30, 60, 90, 120];
const ZIP_DURATION_STEPS = [1, 1.5, 2, 2.5, 3];
const TOMATO_STAIN_PX = 90;

let role = null; // 'host' | 'client'
let host = null;
let client = null;
let localPlayerId = null;
let scene = null;
let phaserGame = null;
let lastMatchState = null;
let lastEliminationNoticeId = undefined;
let lastZipStainSeq = 0;
let puzzleHandle = null;
let zipHandle = null;
let vibratedThresholds = new Set();
let avatarCreatorHandle = null;
let currentAvatarParts = loadSavedAvatarParts() || randomAvatarParts();
let matchDurationSeconds = 60;
let zipStainDurationSeconds = 1.5;
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

function renderLobbyPlayers(players, matchDurationSeconds, zipEnabled, zipDurationSeconds, winCounts) {
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
  clientWaitingEl.textContent = `Waiting for host to start... (Match length: ${matchDurationSeconds}s)`;
  startBtn.disabled = players.length < 2;
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
        unmountZipUI();
      } else {
        unmountPuzzleUI();
        mountZipUI();
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
  puzzleHandle = createPuzzleOverlay(puzzleOverlayEl, { onAttempt: submitPuzzleResult });
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

// --- Zip sabotage minigame (alive non-holders, while waiting for their turn) ---

function mountZipUI() {
  if (!lastMatchState || lastMatchState.phase !== 'active' || !lastMatchState.zipEnabled) return;
  const me = lastMatchState.players.find((p) => p.id === localPlayerId);
  if (!me || me.status !== 'alive') return;
  if (lastMatchState.bombHolderId === localPlayerId) return;

  zipOverlayEl.classList.remove('hidden');
  zipHandle = ZipPuzzle.mount(zipOverlayEl, { onSolved: submitZipSolved });
}

function unmountZipUI() {
  zipOverlayEl.classList.add('hidden');
  if (zipHandle) {
    zipHandle.unmount();
    zipHandle = null;
  }
}

function submitZipSolved() {
  if (role === 'host' && host) host.hostSubmitZipSolved();
  else if (role === 'client' && client) client.sendZipSolved();
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

function showGameOver({ winners, loserId, winCounts }) {
  unmountPuzzleUI();
  unmountZipUI();
  applyEliminationNotice(null);
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
    message.winCounts
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

howToPlayBtn.addEventListener('click', () => howToPlayModalEl.classList.remove('hidden'));
howToPlayXBtn.addEventListener('click', () => howToPlayModalEl.classList.add('hidden'));
howToPlayCloseBtn.addEventListener('click', () => howToPlayModalEl.classList.add('hidden'));

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
      message.winCounts
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
      matchState.winCounts
    );
  host.onMatchStarted = (matchState) => startGame(matchState);
  host.onStateUpdate = (matchState) => applyMatchState(matchState);
  host.onGameOver = (result) => showGameOver(result);
  host.onReturnToLobby = (matchState) => returnToLobby(matchState);
  host.onError = (err) => {
    lobbyStatusEl.textContent = `Host error: ${err.message ?? err.type}`;
  };
});
