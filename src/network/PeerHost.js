import Peer from 'peerjs';
import {
  DEFAULT_MATCH_DURATION,
  createMatchState,
  addPlayer,
  removePlayer,
  setMatchDuration,
  setZipSettings,
  setStreakTarget,
  setDifficulty,
  setTutorialEnabled,
  beginTutorial,
  markTutorialReady,
  isTutorialComplete,
  startMatch,
  tickTimers,
  selectNextHolder,
  eliminateCurrentHolder,
  resolvePuzzleSuccess,
  registerPuzzleMiss,
  solveZipPuzzle,
  throwTomatoFromBasket,
  purchaseShopItem,
  countAlivePlayers,
  endMatch,
  resetToLobby,
} from '../core/BombState.js';
import {
  MessageType,
  createLobbyUpdateMessage,
  createTutorialStartMessage,
  createStartMatchMessage,
  createStateUpdateMessage,
  createGameOverMessage,
  createReturnToLobbyMessage,
  isValidMessage,
} from './NetworkMessages.js';

const TICK_MS = 200;
const ELIMINATION_PAUSE_MS = 3000;

// Runs the authoritative game loop for up to 8 players. Only the Host mutates matchState.
export class PeerHost {
  constructor(roomCode, hostName, hostAvatar, matchDurationSeconds = DEFAULT_MATCH_DURATION) {
    this.roomCode = roomCode;
    this.peer = new Peer(`hotbomb-${roomCode}`);
    this.connections = new Map(); // peerId -> DataConnection
    this.matchState = null;
    this._tickHandle = null;
    this._pauseHandle = null;

    // Assign these from outside to react to lifecycle events.
    this.onReady = null;
    this.onLobbyUpdate = null;
    this.onTutorialStarted = null;
    this.onMatchStarted = null;
    this.onStateUpdate = null;
    this.onGameOver = null;
    this.onReturnToLobby = null;
    this.onError = null;

    this.peer.on('open', (id) => {
      this.matchState = createMatchState(id, hostName, hostAvatar, matchDurationSeconds);
      if (this.onReady) this.onReady(id);
      this._emitLobbyUpdate();
    });

    this.peer.on('connection', (conn) => {
      this.connections.set(conn.peer, conn);

      conn.on('open', () => {
        addPlayer(this.matchState, conn.peer, conn.metadata?.name, conn.metadata?.avatar);
        this._emitLobbyUpdate();
      });

      conn.on('data', (message) => this._handleClientMessage(conn.peer, message));

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this._handleDisconnect(conn.peer);
      });
    });

    this.peer.on('error', (err) => {
      console.error('[PeerHost] error', err);
      if (this.onError) this.onError(err);
    });
  }

  // Host-only lobby control.
  setMatchDuration(seconds) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    setMatchDuration(this.matchState, seconds);
    this._emitLobbyUpdate();
  }

  // Host-only lobby control for the tomato-sabotage minigame.
  setZipSettings(settings) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    setZipSettings(this.matchState, settings);
    this._emitLobbyUpdate();
  }

  // Host-only lobby control: how many correct attempts in a row (1-4) pass the bomb.
  setStreakTarget(value) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    setStreakTarget(this.matchState, value);
    this._emitLobbyUpdate();
  }

  // Host-only lobby control: 'easy' | 'medium' | 'hard', tunes each minigame's own difficulty knobs.
  setDifficulty(level) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    setDifficulty(this.matchState, level);
    this._emitLobbyUpdate();
  }

  // Host-only lobby control: whether "Start Game" goes through the untimed practice phase first.
  setTutorialEnabled(enabled) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    setTutorialEnabled(this.matchState, enabled);
    this._emitLobbyUpdate();
  }

  // Host-only: remove a player from the lobby. Just closes their connection — the existing
  // conn.on('close') handler (registered in the constructor) does the actual removePlayer +
  // lobby-update broadcast, same as any other lobby-phase disconnect.
  kickPlayer(playerId) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    if (playerId === this.peer.id) return;
    const conn = this.connections.get(playerId);
    if (conn) conn.close();
  }

  // Host-only: leave the room entirely (the "Leave Room" button) — stops the tick loop, closes
  // every client connection (each side sees its own conn.on('close'), same as any other
  // disconnect), and tears down the underlying PeerJS peer so the room stops existing on the
  // signaling server instead of being left as an orphaned, unreachable room.
  destroy() {
    this._stopLoop();
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.peer.destroy();
  }

  // Host-only: begin the match — or, if Tutorial Mode is on, the untimed practice phase first.
  beginMatch() {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    if (this.matchState.tutorialEnabled) {
      beginTutorial(this.matchState);
      this._broadcast(createTutorialStartMessage(this.matchState));
      if (this.onTutorialStarted) this.onTutorialStarted(this.matchState);
      return;
    }
    startMatch(this.matchState);
    this._broadcast(createStartMatchMessage(this.matchState));
    if (this.onMatchStarted) this.onMatchStarted(this.matchState);
    this._startLoop();
  }

  // Called when the Host's own local player marks themselves ready during Tutorial Mode.
  hostSubmitTutorialReady() {
    this._applyTutorialReady(this.peer.id);
  }

  // Host-only: end the practice phase immediately regardless of who's ready yet.
  skipTutorial() {
    if (!this.matchState || this.matchState.phase !== 'tutorial') return;
    this._finishTutorial();
  }

  _applyTutorialReady(playerId) {
    if (!this.matchState || this.matchState.phase !== 'tutorial') return;
    const applied = markTutorialReady(this.matchState, playerId);
    if (!applied) return;
    if (isTutorialComplete(this.matchState)) {
      this._finishTutorial();
    } else {
      this._broadcastState();
    }
  }

  // Shared tutorial->active transition — reuses startMatch()/START_MATCH exactly as if this were
  // the lobby->active transition, since ending the practice phase (whether by everyone readying up
  // or the Host skipping) is just a delayed match start.
  _finishTutorial() {
    startMatch(this.matchState);
    this._broadcast(createStartMatchMessage(this.matchState));
    if (this.onMatchStarted) this.onMatchStarted(this.matchState);
    this._startLoop();
  }

  // Called when the Host's own local player submits a puzzle result.
  hostSubmitPuzzleResult(success) {
    this._applyPuzzleResult(this.peer.id, success);
  }

  // Called when the Host's own local player solves their background sabotage puzzle.
  hostSubmitZipSolved() {
    this._applyZipSolved(this.peer.id);
  }

  // Called when the Host's own local player throws a banked tomato.
  hostSubmitThrowTomato() {
    this._applyThrowTomato(this.peer.id);
  }

  // Called when the Host's own local player buys a Shop item.
  hostSubmitShopPurchase(item) {
    this._applyShopPurchase(this.peer.id, item);
  }

  // Host-only: reset a finished match back to the lobby with everyone still connected, so the
  // next round can start without anyone reconnecting. Drops anyone who disconnected mid-match
  // (their connection is already gone from this.connections) rather than reviving a ghost.
  playAgain() {
    if (!this.matchState || this.matchState.phase !== 'ended') return;
    this.matchState.players = this.matchState.players.filter(
      (p) => p.id === this.peer.id || this.connections.has(p.id)
    );
    resetToLobby(this.matchState);
    if (this.onReturnToLobby) this.onReturnToLobby(this.matchState);
    this._broadcast(createReturnToLobbyMessage(this.matchState));
  }

  _handleClientMessage(fromPeerId, message) {
    if (!isValidMessage(message) || !this.matchState) return;
    if (message.type === MessageType.INPUT_PUZZLE_RESULT && message.playerId === fromPeerId) {
      this._applyPuzzleResult(fromPeerId, message.success);
    } else if (message.type === MessageType.INPUT_ZIP_SOLVED && message.playerId === fromPeerId) {
      this._applyZipSolved(fromPeerId);
    } else if (message.type === MessageType.INPUT_THROW_TOMATO && message.playerId === fromPeerId) {
      this._applyThrowTomato(fromPeerId);
    } else if (message.type === MessageType.INPUT_SHOP_PURCHASE && message.playerId === fromPeerId) {
      this._applyShopPurchase(fromPeerId, message.item);
    } else if (message.type === MessageType.INPUT_TUTORIAL_READY && message.playerId === fromPeerId) {
      this._applyTutorialReady(fromPeerId);
    }
  }

  _applyZipSolved(playerId) {
    if (!this.matchState || this.matchState.phase !== 'active') return;
    const applied = solveZipPuzzle(this.matchState, playerId);
    if (applied) this._broadcastState();
  }

  _applyThrowTomato(playerId) {
    if (!this.matchState || this.matchState.phase !== 'active') return;
    const applied = throwTomatoFromBasket(this.matchState, playerId);
    if (applied) this._broadcastState();
  }

  _applyShopPurchase(playerId, item) {
    if (!this.matchState || this.matchState.phase !== 'active') return;
    const applied = purchaseShopItem(this.matchState, playerId, item);
    if (applied) this._broadcastState();
  }

  // A wrong attempt only resets the streak (registerPuzzleMiss) — it never eliminates directly.
  // Elimination only happens via the personal timer running out (see _startLoop).
  _applyPuzzleResult(playerId, success) {
    if (!this.matchState || this.matchState.phase !== 'active') return;
    const applied = success
      ? resolvePuzzleSuccess(this.matchState, playerId)
      : registerPuzzleMiss(this.matchState, playerId);
    if (applied) this._broadcastState();
  }

  _handleDisconnect(playerId) {
    if (!this.matchState || this.matchState.phase === 'ended') return;

    if (this.matchState.phase === 'lobby') {
      removePlayer(this.matchState, playerId);
      this._emitLobbyUpdate();
      return;
    }

    if (this.matchState.phase === 'tutorial') {
      removePlayer(this.matchState, playerId);
      // Removing a not-yet-ready player can itself complete the practice phase for everyone left.
      if (isTutorialComplete(this.matchState)) this._finishTutorial();
      else this._broadcastState();
      return;
    }

    const wasHolder = this.matchState.bombHolderId === playerId;
    removePlayer(this.matchState, playerId);

    if (wasHolder) {
      this._handleElimination(playerId);
    } else if (countAlivePlayers(this.matchState) <= 1) {
      // A non-holder leaving dropped us to 1 alive — that survivor never got eliminated, so
      // there's no one to blame; they just win by default.
      this._finishMatch(null);
    } else {
      this._broadcastState();
    }
  }

  // Shared elimination flow for puzzle failure, personal-timer timeout, and disconnects.
  _handleElimination(eliminatedId) {
    const aliveCount = countAlivePlayers(this.matchState);

    if (aliveCount <= 1) {
      this._finishMatch(eliminatedId);
      return;
    }

    const eliminatedPlayer = this.matchState.players.find((p) => p.id === eliminatedId);
    this.matchState.eliminationNotice = {
      eliminatedPlayerId: eliminatedId,
      eliminatedPlayerName: eliminatedPlayer ? eliminatedPlayer.name : null,
    };
    this._broadcastState();

    clearTimeout(this._pauseHandle);
    this._pauseHandle = setTimeout(() => {
      this._pauseHandle = null;
      if (!this.matchState || this.matchState.phase !== 'active') return;
      this.matchState.eliminationNotice = null;
      selectNextHolder(this.matchState, eliminatedId);
      if (this.matchState.bombHolderId === null) {
        // Everyone else was already eliminated during the pause — no single new loser to name.
        this._finishMatch(null);
      } else {
        this._broadcastState();
      }
    }, ELIMINATION_PAUSE_MS);
  }

  _startLoop() {
    if (this._tickHandle) return;
    let last = Date.now();
    this._tickHandle = setInterval(() => {
      const now = Date.now();
      const delta = (now - last) / 1000;
      last = now;

      const { globalExpired, personalExpired } = tickTimers(this.matchState, delta);

      if (personalExpired && this.matchState.bombHolderId) {
        const eliminatedId = eliminateCurrentHolder(this.matchState);
        if (eliminatedId) this._handleElimination(eliminatedId);
        return;
      }

      if (globalExpired) {
        // The global clock ran out — whoever is still holding the bomb loses (bombHolderId is
        // still genuinely set here, unlike the personal-timeout path above).
        this._finishMatch(this.matchState.bombHolderId);
        return;
      }

      this._broadcastState();
    }, TICK_MS);
  }

  _finishMatch(loserId) {
    this._stopLoop();
    const { winners } = endMatch(this.matchState, loserId);
    this._broadcastState();
    const { winCounts, points, tomatoesThrown } = this.matchState;
    if (this.onGameOver) this.onGameOver({ winners, loserId, winCounts, points, tomatoesThrown });
    this._broadcast(createGameOverMessage(winners, loserId, winCounts, points, tomatoesThrown));
  }

  _stopLoop() {
    clearInterval(this._tickHandle);
    this._tickHandle = null;
    clearTimeout(this._pauseHandle);
    this._pauseHandle = null;
  }

  _emitLobbyUpdate() {
    if (this.onLobbyUpdate) this.onLobbyUpdate(this.matchState);
    this._broadcast(createLobbyUpdateMessage(this.matchState));
  }

  _broadcastState() {
    if (this.onStateUpdate) this.onStateUpdate(this.matchState);
    this._broadcast(createStateUpdateMessage(this.matchState));
  }

  _broadcast(message) {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(message);
    }
  }
}
