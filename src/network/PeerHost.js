import Peer from 'peerjs';
import {
  DEFAULT_MATCH_DURATION,
  createMatchState,
  addPlayer,
  removePlayer,
  setMatchDuration,
  setZipSettings,
  startMatch,
  tickTimers,
  selectNextHolder,
  eliminateCurrentHolder,
  resolvePuzzleSuccess,
  registerPuzzleMiss,
  throwZipStain,
  countAlivePlayers,
  endMatch,
  resetToLobby,
} from '../core/BombState.js';
import {
  MessageType,
  createLobbyUpdateMessage,
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

  // Host-only: remove a player from the lobby. Just closes their connection — the existing
  // conn.on('close') handler (registered in the constructor) does the actual removePlayer +
  // lobby-update broadcast, same as any other lobby-phase disconnect.
  kickPlayer(playerId) {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
    if (playerId === this.peer.id) return;
    const conn = this.connections.get(playerId);
    if (conn) conn.close();
  }

  // Host-only: begin the match.
  beginMatch() {
    if (!this.matchState || this.matchState.phase !== 'lobby') return;
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
    }
  }

  _applyZipSolved(playerId) {
    if (!this.matchState || this.matchState.phase !== 'active') return;
    const applied = throwZipStain(this.matchState, playerId);
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
    if (this.onGameOver) this.onGameOver({ winners, loserId });
    this._broadcast(createGameOverMessage(winners, loserId));
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
