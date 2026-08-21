import Peer from 'peerjs';
import { MessageType, createPuzzleResultMessage, createZipSolvedMessage, isValidMessage } from './NetworkMessages.js';

// Strictly sends input and renders received state — never mutates matchState locally.
export class PeerClient {
  constructor() {
    this.peer = new Peer();
    this.conn = null;

    this.onConnected = null;
    this.onLobbyUpdate = null;
    this.onMatchStarted = null;
    this.onStateUpdate = null;
    this.onGameOver = null;
    this.onReturnToLobby = null;
    this.onDisconnected = null;
    this.onError = null;

    this.peer.on('error', (err) => {
      console.error('[PeerClient] error', err);
      if (this.onError) this.onError(err);
    });
  }

  connect(roomCode, localName, localAvatar) {
    this.peer.on('open', () => {
      this.conn = this.peer.connect(`hotbomb-${roomCode}`, {
        metadata: { name: localName, avatar: localAvatar },
      });

      this.conn.on('open', () => {
        if (this.onConnected) this.onConnected(this.peer.id);
      });

      this.conn.on('data', (message) => this._handleHostMessage(message));

      this.conn.on('close', () => {
        if (this.onDisconnected) this.onDisconnected();
      });

      this.conn.on('error', (err) => {
        console.error('[PeerClient] connection error', err);
        if (this.onError) this.onError(err);
      });
    });
  }

  sendPuzzleResult(success) {
    if (this.conn && this.conn.open) {
      this.conn.send(createPuzzleResultMessage(this.peer.id, success));
    }
  }

  sendZipSolved() {
    if (this.conn && this.conn.open) {
      this.conn.send(createZipSolvedMessage(this.peer.id));
    }
  }

  _handleHostMessage(message) {
    if (!isValidMessage(message)) return;

    switch (message.type) {
      case MessageType.LOBBY_UPDATE:
        if (this.onLobbyUpdate) this.onLobbyUpdate(message);
        break;
      case MessageType.START_MATCH:
        if (this.onMatchStarted) this.onMatchStarted(message.matchState);
        break;
      case MessageType.STATE_UPDATE:
        if (this.onStateUpdate) this.onStateUpdate(message.matchState);
        break;
      case MessageType.GAME_OVER:
        if (this.onGameOver) this.onGameOver({ winners: message.winners, loserId: message.loserId });
        break;
      case MessageType.RETURN_TO_LOBBY:
        if (this.onReturnToLobby) this.onReturnToLobby(message);
        break;
    }
  }
}
