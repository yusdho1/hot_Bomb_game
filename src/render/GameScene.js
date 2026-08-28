import Phaser from 'phaser';
import { AVATAR_CATEGORIES } from './avatarOptions.js';

const PLAYER_RADIUS = 32;
const BOMB_ICON_SIZE = 52;
const ALIVE_COLOR = 0x4488ff;
const ELIMINATED_COLOR = 0x3a3d4a;
// Built from every declared category (not hardcoded to face/eyes/mouth) so a category added
// later — e.g. hair — actually gets preloaded and can show up on the spectator board too. `null`
// entries (a category's "none" option) have no texture to load.
const AVATAR_PART_URLS = AVATAR_CATEGORIES.flatMap((c) => c.options).filter(Boolean);

// Renders received matchState only. Never computes timers or eliminations itself.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.localPlayerId = null;
    this.onLocalIsHolder = null;
    this.onSceneReady = null;
    this.playerShapes = {};
    this.playerLabels = {};
    this.playerAvatarImages = {};
    this.bombIcon = null;
    this.globalTimerText = null;
    this.personalTimerText = null;
    this.statusText = null;
    this._lastHolderId = undefined;
    this._playersOrder = [];
  }

  init(data) {
    this.localPlayerId = data.localPlayerId;
    this.onLocalIsHolder = data.onLocalIsHolder;
    this.onSceneReady = data.onSceneReady;
  }

  preload() {
    this.load.image('bomb', '/UI/Bomb.png');
    // The full avatar part pool is small and fixed (avatarOptions.js) — load it all upfront
    // rather than resolving per-player textures dynamically at runtime.
    AVATAR_PART_URLS.forEach((url) => this.load.image(url, url));
  }

  create() {
    this.add.text(20, 16, 'Hot Bomb', { fontSize: '20px', color: '#ffffff' });

    this.globalTimerText = this.add
      .text(this.scale.width / 2, 14, '', { fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5, 0);

    this.personalTimerText = this.add
      .text(this.scale.width / 2, 44, '', { fontSize: '16px', color: '#ffcc66' })
      .setOrigin(0.5, 0);

    this.statusText = this.add.text(20, this.scale.height - 32, '', {
      fontSize: '15px',
      color: '#aaaaaa',
    });

    this.bombIcon = this.add.image(0, 0, 'bomb').setDisplaySize(BOMB_ICON_SIZE, BOMB_ICON_SIZE).setVisible(false);

    if (this.onSceneReady) this.onSceneReady(this);
  }

  // Called by main.js whenever a new matchState arrives (from Host directly, or via network).
  applyMatchState(matchState) {
    if (!matchState) return;

    const players = matchState.players;
    if (this._playersOrder.join(',') !== players.map((p) => p.id).join(',')) {
      this._layoutPlayers(players);
    }

    players.forEach((player) => {
      const shape = this.playerShapes[player.id];
      if (!shape) return;
      const avatarImages = this.playerAvatarImages[player.id] || [];

      if (player.status === 'eliminated') {
        shape.setFillStyle(ELIMINATED_COLOR);
        shape.setAlpha(0.4);
        avatarImages.forEach((img) => img.setAlpha(0.4));
      } else {
        const colorInt = player.color ? parseInt(player.color.replace('#', ''), 16) : ALIVE_COLOR;
        shape.setFillStyle(colorInt);
        shape.setAlpha(1);
        avatarImages.forEach((img) => img.setAlpha(1));
      }
    });

    const holderShape = matchState.bombHolderId ? this.playerShapes[matchState.bombHolderId] : null;
    if (holderShape) {
      this.bombIcon.setPosition(holderShape.x, holderShape.y - PLAYER_RADIUS - BOMB_ICON_SIZE / 2 - 4);
      this.bombIcon.setVisible(true);
    } else {
      this.bombIcon.setVisible(false);
    }

    this.globalTimerText.setText(`Match: ${Math.ceil(matchState.globalTimeRemaining)}s`);

    const holdingBomb = matchState.bombHolderId === this.localPlayerId;

    if (matchState.phase === 'active' && matchState.bombHolderId) {
      this.personalTimerText.setText(`Fuse: ${matchState.bombTimer.toFixed(1)}s`);
      this.statusText.setText(holdingBomb ? 'YOU have the bomb!' : 'Someone else has the bomb...');
    } else {
      this.personalTimerText.setText('');
      this.statusText.setText('');
    }

    if (this._lastHolderId !== matchState.bombHolderId) {
      this._lastHolderId = matchState.bombHolderId;
      if (this.onLocalIsHolder) this.onLocalIsHolder(holdingBomb);
    }
  }

  _layoutPlayers(players) {
    this._playersOrder = players.map((p) => p.id);

    Object.values(this.playerShapes).forEach((shape) => shape.destroy());
    Object.values(this.playerLabels).forEach((label) => label.destroy());
    Object.values(this.playerAvatarImages).forEach((images) => images.forEach((img) => img.destroy()));
    this.playerShapes = {};
    this.playerLabels = {};
    this.playerAvatarImages = {};

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2 + 20;
    const radius = Math.min(this.scale.width, this.scale.height) * 0.32;
    const count = players.length;
    const avatarDiameter = PLAYER_RADIUS * 2;

    players.forEach((player, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      const colorInt = player.color ? parseInt(player.color.replace('#', ''), 16) : ALIVE_COLOR;
      const circle = this.add.circle(x, y, PLAYER_RADIUS, colorInt);
      this.playerShapes[player.id] = circle;

      if (player.avatar) {
        const layers = AVATAR_CATEGORIES.map((c) => player.avatar[c.key])
          .filter(Boolean)
          .map((textureKey) => this.add.image(x, y, textureKey).setDisplaySize(avatarDiameter, avatarDiameter));
        this.playerAvatarImages[player.id] = layers;
      }

      const displayName = player.name || 'Player';
      const labelText = player.id === this.localPlayerId ? `${displayName} (You)` : displayName;
      const label = this.add
        .text(x, y + PLAYER_RADIUS + 8, labelText, {
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0);

      this.playerLabels[player.id] = label;
    });

    this.children.bringToTop(this.bombIcon);
  }
}
