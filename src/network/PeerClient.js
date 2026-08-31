import Peer from 'peerjs';
import {
  MessageType,
  createPuzzleResultMessage,
  createZipSolvedMessage,
  createThrowTomatoMessage,
  createShopPurchaseMessage,
  createTutorialReadyMessage,
  isValidMessage,
} from './NetworkMessages.js';

// Strictly sends input and renders received state — never mutates matchState locally.
export class PeerClient {
  constructor() {
    this.peer = new Peer();
    this.conn = null;

    this.onConnected = null;
    this.onLobbyUpdate = null;
    this.onTutorialStarted = null;
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

  sendThrowTomato() {
    if (this.conn && this.conn.open) {
      this.conn.send(createThrowTomatoMessage(this.peer.id));
    }
  }

  sendShopPurchase(item) {
    if (this.conn && this.conn.open) {
      this.conn.send(createShopPurchaseMessage(this.peer.id, item));
    }
  }

  sendTutorialReady() {
    if (this.conn && this.conn.open) {
      this.conn.send(createTutorialReadyMessage(this.peer.id));
    }
  }

  // Leave the room entirely (the "Leave Room" button) — closes the connection to the Host (who
  // sees it as a normal disconnect, same as a dropped connection) and tears down the underlying
  // PeerJS peer.
  disconnect() {
    if (this.conn) this.conn.close();
    this.peer.destroy();
  }

  _handleHostMessage(message) {
    if (!isValidMessage(message)) return;

    switch (message.type) {
      case MessageType.LOBBY_UPDATE:
        if (this.onLobbyUpdate) this.onLobbyUpdate(message);
        break;
      case MessageType.TUTORIAL_START:
        if (this.onTutorialStarted) this.onTutorialStarted(message.matchState);
        break;
      case MessageType.START_MATCH:
        if (this.onMatchStarted) this.onMatchStarted(message.matchState);
        break;
      case MessageType.STATE_UPDATE:
        if (this.onStateUpdate) this.onStateUpdate(message.matchState);
        break;
      case MessageType.GAME_OVER:
        if (this.onGameOver)
          this.onGameOver({
            winners: message.winners,
            loserId: message.loserId,
            winCounts: message.winCounts,
            points: message.points,
            tomatoesThrown: message.tomatoesThrown,
          });
        break;
      case MessageType.RETURN_TO_LOBBY:
        if (this.onReturnToLobby) this.onReturnToLobby(message);
        break;
    }
  }
}
