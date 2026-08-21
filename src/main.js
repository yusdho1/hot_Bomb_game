import Phaser from 'phaser';
import { PeerHost } from './network/PeerHost.js';
import { PeerClient } from './network/PeerClient.js';
import { GameScene } from './render/GameScene.js';
import { mountPuzzleOverlay as createPuzzleOverlay } from './render/puzzles/PuzzleOverlay.js';
import { SoundManager } from './render/SoundManager.js';
import { Haptics } from './render/Haptics.js';
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
const startBtn = document.getElementById('start-btn');
const clientWaitingEl = document.getElementById('client-waiting');
const lobbyStatusEl = document.getElementById('lobby-status');

const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game-container');
const eliminationToastEl = document.getElementById('elimination-toast');
const puzzleOverlayEl = document.getElementById('puzzle-overlay');
const gameOverPanelEl = document.getElementById('game-over-panel');
const gameOverLossImgEl = document.getElementById('game-over-loss-img');
const gameOverTitleEl = document.getElementById('game-over-title');
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
const gameOverShieldImgEl = document.getElementById('game-over-shield-img');

const DURATION_STEPS = [30, 60, 90, 120];

let role = null; // 'host' | 'client'
let host = null;
let client = null;
let localPlayerId = null;
let scene = null;
let lastMatchState = null;
let lastEliminationNoticeId = undefined;
let puzzleHandle = null;
let vibratedThresholds = new Set();
let avatarCreatorHandle = null;
let currentAvatarParts = loadSavedAvatarParts() || randomAvatarParts();
let matchDurationSeconds = 60;
let currentRoomCode = null;

renderAvatar(avatarPreviewEl, currentAvatarParts);

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

function renderLobbyPlayers(players, matchDurationSeconds) {
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
  clientWaitingEl.textContent = `Waiting for host to start... (Match length: ${matchDurationSeconds}s)`;
  startBtn.disabled = players.length < 2;
}

function setDurationDisplay(seconds) {
  matchDurationSeconds = seconds;
  durationValueEl.textContent = `${seconds}s`;
  durationMinusBtn.disabled = seconds <= DURATION_STEPS[0];
  durationPlusBtn.disabled = seconds >= DURATION_STEPS[DURATION_STEPS.length - 1];
}

function startGame(matchState) {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  lastMatchState = matchState;

  const game = new Phaser.Game({
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

  game.scene.start('GameScene', {
    localPlayerId,
    onLocalIsHolder: (isHolder) => {
      if (isHolder) mountPuzzleUI();
      else unmountPuzzleUI();
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
    const personalUrgency = Math.max(0, Math.min(1, (4 - matchState.bombTimer) / 4));
    SoundManager.setPersonalMusicRate(1 + personalUrgency * 0.6);

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

function showGameOver({ winners, loserId }) {
  unmountPuzzleUI();
  applyEliminationNotice(null);
  SoundManager.stopGlobalTicking();
  gameOverPanelEl.classList.remove('hidden');

  const youWon = winners.includes(localPlayerId);
  gameOverLossImgEl.classList.toggle('hidden', youWon);
  gameOverTitleEl.classList.toggle('hidden', !youWon);
  gameOverShieldImgEl.classList.toggle('hidden', !youWon);

  if (youWon) {
    gameOverTitleEl.textContent = 'YOU SURVIVED! \u{1F3C6}';
    SoundManager.playWin();
  } else if (loserId === localPlayerId) {
    // Only the final (skip-the-pause) elimination reaches here without already having played
    // the explosion via applyEliminationNotice — mid-match eliminations get it from there.
    SoundManager.playBombExplode();
    triggerShake('shake-big');
    Haptics.explode();
  }
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
  client.onLobbyUpdate = (message) => renderLobbyPlayers(message.players, message.matchDurationSeconds);
  client.onMatchStarted = (matchState) => startGame(matchState);
  client.onStateUpdate = (matchState) => applyMatchState(matchState);
  client.onGameOver = (result) => showGameOver(result);
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

playAgainBtn.addEventListener('click', () => location.reload());

function stepDuration(delta) {
  const currentIndex = DURATION_STEPS.indexOf(matchDurationSeconds);
  const nextIndex = Math.max(0, Math.min(DURATION_STEPS.length - 1, currentIndex + delta));
  const nextSeconds = DURATION_STEPS[nextIndex];
  setDurationDisplay(nextSeconds);
  if (role === 'host' && host) host.setMatchDuration(nextSeconds);
}

durationMinusBtn.addEventListener('click', () => stepDuration(-1));
durationPlusBtn.addEventListener('click', () => stepDuration(1));

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
  host.onLobbyUpdate = (matchState) => renderLobbyPlayers(matchState.players, matchState.matchDurationSeconds);
  host.onMatchStarted = (matchState) => startGame(matchState);
  host.onStateUpdate = (matchState) => applyMatchState(matchState);
  host.onGameOver = (result) => showGameOver(result);
  host.onError = (err) => {
    lobbyStatusEl.textContent = `Host error: ${err.message ?? err.type}`;
  };
});
