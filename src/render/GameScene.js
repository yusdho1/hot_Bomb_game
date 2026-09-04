import Phaser from 'phaser';
import { AVATAR_CATEGORIES } from './avatarOptions.js';

const HOLDER_RADIUS = 70;
const NEXT_PLAYER_RADIUS = 34;
const BOMB_ICON_SIZE = 60;
const ALIVE_COLOR = 0x4488ff;
const TITLE_FONT = "'Baloo 2', system-ui, sans-serif";

// Every avatar part texture actually in use by this specific roster — not the full category
// library (avatarOptions.js declares ~25+ options across face/eyes/mouth/hair, but a given match
// only ever needs whichever handful its actual players picked). Iterates AVATAR_CATEGORIES rather
// than hardcoding field names so a category added later (e.g. hair) is still covered. Still needs
// every player's textures, not just the current holder's — the holder rotates through the whole
// roster over the match.
function neededAvatarUrls(players) {
  const urls = new Set();
  players.forEach((player) => {
    if (!player.avatar) return;
    AVATAR_CATEGORIES.forEach((c) => {
      const url = player.avatar[c.key];
      if (url) urls.add(url);
    });
  });
  return urls;
}

// Read-only lookahead mirroring BombState.js's own peekNextHolder — who'd get the bomb if the
// current holder passed it right now. Recomputed continuously here (not just at the moment of a
// handoff, unlike the one-shot turnNotice.nextId server-side) since this drives an always-visible
// "up next" preview rather than a transient notification. pendingSkipPass is already part of the
// broadcast matchState, so this needs no new network field.
function computeNextPlayer(matchState) {
  const order = matchState.players;
  const currentIndex = order.findIndex((p) => p.id === matchState.bombHolderId);
  if (currentIndex < 0) return null;
  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(currentIndex + offset) % order.length];
    if (candidate.status !== 'alive') continue;
    if (candidate.id === matchState.pendingSkipPass) continue;
    if (candidate.id === matchState.bombHolderId) return null; // only one alive player left
    return candidate;
  }
  return null;
}

// Renders received matchState only. Never computes timers or eliminations itself.
//
// Spectator board shows ONLY the current bomb holder (not the full roster) — the interesting
// question for anyone watching is always "who's got it right now", and drawing everyone else in a
// circle just gave the fixed-position waiting-action buttons a moving target to collide with. A
// smaller "up next" preview off to the side answers the natural follow-up question.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.localPlayerId = null;
    this.onLocalIsHolder = null;
    this.onSceneReady = null;
    this.holderAvatarImages = [];
    this.holderCircle = null;
    this.holderNameText = null;
    this.holderStatusText = null;
    this.nextAvatarImages = [];
    this.nextCircle = null;
    this.nextLabelText = null;
    this.nextNameText = null;
    this.bombIcon = null;
    this.globalTimerText = null;
    this.personalTimerText = null;
    this._lastHolderId = undefined;
    this._lastNextPlayerId = undefined;
    this._initialPlayers = [];
  }

  init(data) {
    this.localPlayerId = data.localPlayerId;
    this.onLocalIsHolder = data.onLocalIsHolder;
    this.onSceneReady = data.onSceneReady;
    // The final roster for this whole match (nobody can join mid-match), so this is every avatar
    // GameScene will ever need to render here — see neededAvatarUrls above.
    this._initialPlayers = data.players || [];
  }

  preload() {
    this.load.image('bomb', '/UI/BombFull.png');
    this.load.image('logo', '/UI/Main Title.png');
    neededAvatarUrls(this._initialPlayers).forEach((url) => this.load.image(url, url));
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // A gradient backdrop matching the rest of the app's palette (the same top-to-bottom blue ->
    // purple used by #puzzle-overlay/#tutorial-panel) instead of a flat gray fill, plus a few soft
    // translucent circles for the same "atmosphere, not a blank box" texture the CSS dot patterns
    // give every other screen. Drawn once — this scene's logical size is fixed (Phaser.Scale.FIT
    // with a constant width/height in main.js), so there's no resize case to handle.
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3b4cca, 0x3b4cca, 0x7a2fb0, 0x7a2fb0, 1);
    bg.fillRect(0, 0, w, h);
    bg.fillStyle(0xffffff, 0.05);
    [
      [w * 0.12, h * 0.18, 60],
      [w * 0.85, h * 0.15, 46],
      [w * 0.08, h * 0.82, 50],
      [w * 0.9, h * 0.85, 66],
    ].forEach(([cx, cy, r]) => bg.fillCircle(cx, cy, r));

    // The game's actual text logo (same asset as the puzzle screens' footer) rather than just its
    // bomb icon — sized by width since it's a wide wordmark, anchored to the top-left corner.
    const logo = this.add.image(16, 26, 'logo').setOrigin(0, 0.5);
    logo.setDisplaySize(130, 130 * (logo.height / logo.width));

    this.globalTimerText = this.add
      .text(w / 2, 14, '', {
        fontFamily: TITLE_FONT,
        fontSize: '24px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#3a1f6d',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);

    this.personalTimerText = this.add
      .text(w / 2, 46, '', {
        fontFamily: TITLE_FONT,
        fontSize: '17px',
        fontStyle: '700',
        color: '#ffcc66',
        stroke: '#3a1f6d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    this.bombIcon = this.add.image(0, 0, 'bomb').setDisplaySize(BOMB_ICON_SIZE, BOMB_ICON_SIZE).setVisible(false);

    if (this.onSceneReady) this.onSceneReady(this);
  }

  // Called by main.js whenever a new matchState arrives (from Host directly, or via network).
  applyMatchState(matchState) {
    if (!matchState) return;

    if (matchState.bombHolderId !== this._lastHolderId) {
      this._lastHolderId = matchState.bombHolderId;
      const holder = matchState.bombHolderId ? matchState.players.find((p) => p.id === matchState.bombHolderId) : null;
      this._showHolder(holder);
      if (this.onLocalIsHolder) this.onLocalIsHolder(matchState.bombHolderId === this.localPlayerId);
    }

    // Tracked separately from the holder above — a bought skip-ahead pass can change who's next
    // without the current holder changing at all.
    const nextPlayer = matchState.phase === 'active' ? computeNextPlayer(matchState) : null;
    const nextPlayerId = nextPlayer ? nextPlayer.id : null;
    if (nextPlayerId !== this._lastNextPlayerId) {
      this._lastNextPlayerId = nextPlayerId;
      this._showNextPlayer(nextPlayer);
    }

    this.globalTimerText.setText(`Match: ${Math.ceil(matchState.globalTimeRemaining)}s`);

    if (matchState.phase === 'active' && matchState.bombHolderId) {
      this.personalTimerText.setText(`Fuse: ${matchState.bombTimer.toFixed(1)}s`);
    } else {
      this.personalTimerText.setText('');
    }
  }

  // Rebuilds the single centered avatar for whoever currently holds the bomb (or clears it if
  // nobody does, e.g. mid elimination-notice pause). Called only when bombHolderId actually
  // changes, not every tick.
  _showHolder(player) {
    this.holderAvatarImages.forEach((img) => img.destroy());
    this.holderAvatarImages = [];
    if (this.holderCircle) this.holderCircle.destroy();
    if (this.holderNameText) this.holderNameText.destroy();
    if (this.holderStatusText) this.holderStatusText.destroy();
    this.holderCircle = null;
    this.holderNameText = null;
    this.holderStatusText = null;

    if (!player) {
      this.bombIcon.setVisible(false);
      return;
    }

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2 + 20;
    const avatarDiameter = HOLDER_RADIUS * 2;

    const colorInt = player.color ? parseInt(player.color.replace('#', ''), 16) : ALIVE_COLOR;
    this.holderCircle = this.add.circle(centerX, centerY, HOLDER_RADIUS, colorInt);

    if (player.avatar) {
      this.holderAvatarImages = AVATAR_CATEGORIES.map((c) => player.avatar[c.key])
        .filter(Boolean)
        .map((textureKey) => this.add.image(centerX, centerY, textureKey).setDisplaySize(avatarDiameter, avatarDiameter));
    }

    const isLocal = player.id === this.localPlayerId;
    const displayName = player.name || 'Player';
    const labelText = isLocal ? `${displayName} (You)` : displayName;
    this.holderNameText = this.add
      .text(centerX, centerY + HOLDER_RADIUS + 10, labelText, {
        fontFamily: TITLE_FONT,
        fontSize: '16px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#3a1f6d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    // Spells out the same thing the old bottom-of-screen status line used to, just anchored right
    // under the holder's own name instead of floating separately at the bottom of the canvas —
    // that fixed position ended up underneath the waiting-action button bar once that got its own
    // dedicated background.
    this.holderStatusText = this.add
      .text(centerX, centerY + HOLDER_RADIUS + 34, isLocal ? 'YOU ARE HOLDING THE BOMB!' : 'IS HOLDING THE BOMB', {
        fontFamily: TITLE_FONT,
        fontSize: '14px',
        fontStyle: '700',
        color: '#ffcc66',
        stroke: '#3a1f6d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    this.bombIcon.setPosition(centerX, centerY - HOLDER_RADIUS - BOMB_ICON_SIZE / 2 - 4);
    this.bombIcon.setVisible(true);
    this.children.bringToTop(this.bombIcon);
  }

  // Rebuilds the small "up next" preview off to the side (or clears it if there's no meaningful
  // next player, e.g. only one alive player left). Called only when the computed next-player id
  // actually changes, not every tick.
  _showNextPlayer(player) {
    this.nextAvatarImages.forEach((img) => img.destroy());
    this.nextAvatarImages = [];
    if (this.nextCircle) this.nextCircle.destroy();
    if (this.nextLabelText) this.nextLabelText.destroy();
    if (this.nextNameText) this.nextNameText.destroy();
    this.nextCircle = null;
    this.nextLabelText = null;
    this.nextNameText = null;

    if (!player) return;

    const centerX = this.scale.width * 0.8;
    const centerY = this.scale.height / 2 + 20;
    const avatarDiameter = NEXT_PLAYER_RADIUS * 2;

    this.nextLabelText = this.add
      .text(centerX, centerY - NEXT_PLAYER_RADIUS - 24, 'NEXT', {
        fontFamily: TITLE_FONT,
        fontSize: '13px',
        fontStyle: '700',
        color: '#ffdd55',
        stroke: '#3a1f6d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    const colorInt = player.color ? parseInt(player.color.replace('#', ''), 16) : ALIVE_COLOR;
    this.nextCircle = this.add.circle(centerX, centerY, NEXT_PLAYER_RADIUS, colorInt).setAlpha(0.9);

    if (player.avatar) {
      this.nextAvatarImages = AVATAR_CATEGORIES.map((c) => player.avatar[c.key])
        .filter(Boolean)
        .map((textureKey) =>
          this.add.image(centerX, centerY, textureKey).setDisplaySize(avatarDiameter, avatarDiameter).setAlpha(0.9)
        );
    }

    const displayName = player.id === this.localPlayerId ? `${player.name || 'Player'} (You)` : player.name || 'Player';
    this.nextNameText = this.add
      .text(centerX, centerY + NEXT_PLAYER_RADIUS + 8, displayName, {
        fontFamily: TITLE_FONT,
        fontSize: '12px',
        fontStyle: '700',
        color: '#ffffff',
        stroke: '#3a1f6d',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0);
  }
}
