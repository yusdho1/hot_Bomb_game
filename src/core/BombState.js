import gameConfig from '../config/game.config.json';

export const DEFAULT_MATCH_DURATION = gameConfig.settings.matchDurationDefault;
export const PERSONAL_TIMER_SECONDS = gameConfig.settings.personalTimerSeconds;
export const STREAK_TARGET = gameConfig.settings.streakTarget;
export const DEFAULT_ZIP_ENABLED = gameConfig.settings.zipEnabledDefault;
export const DEFAULT_ZIP_STAIN_SECONDS = gameConfig.settings.zipStainSecondsDefault;

const POINTS = gameConfig.settings.points;

// One per player slot (8 max) so no two players in a room ever share a background color.
export const AVATAR_COLORS = [
  '#ff5c5c',
  '#4d96ff',
  '#6bcb77',
  '#ffd93d',
  '#a685e2',
  '#ff8fb1',
  '#5ce1e6',
  '#ffa552',
];

// Picks a color not already held by anyone currently in matchState.players.
function pickUnusedColor(matchState) {
  const used = new Set(matchState.players.map((p) => p.color));
  const available = AVATAR_COLORS.filter((c) => !used.has(c));
  const pool = available.length > 0 ? available : AVATAR_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// phase: 'lobby' | 'active' | 'ended'
export function createMatchState(
  hostId,
  hostName,
  hostAvatar,
  matchDurationSeconds = DEFAULT_MATCH_DURATION,
  zipEnabled = DEFAULT_ZIP_ENABLED,
  zipStainDurationSeconds = DEFAULT_ZIP_STAIN_SECONDS
) {
  const matchState = {
    phase: 'lobby',
    players: [],
    bombHolderId: null,
    bombTimer: PERSONAL_TIMER_SECONDS,
    streakCount: 0,
    globalTimeRemaining: matchDurationSeconds,
    matchDurationSeconds,
    eliminationNotice: null,
    zipEnabled,
    zipStainDurationSeconds,
    zipStain: null,
    zipStainSeq: 0,
    // Host-only bookkeeping (never included in any network snapshot): which alive non-holders
    // have already thrown a tomato this turn. Reset whenever a new holder is assigned.
    _zipThrownThisTurn: new Set(),
    // playerId -> rounds won this room session. Persists across resetToLobby (Next Round) —
    // only ever grows, never cleared, for as long as the room stays open.
    winCounts: {},
    // playerId -> spendable Shop points. Reset every round (unlike winCounts) so nobody can
    // snowball a lead across "Next Round" resets.
    points: {},
    // playerId -> banked fuse-bonus seconds, applied and cleared the next time they become holder.
    pendingFuseBonus: {},
    // At most one player in the whole match may have a skip-ahead pass queued at a time — a
    // single nullable playerId rather than a set, which is what keeps selectNextHolder's
    // consumption logic a one-line addition instead of needing cascade/deadlock handling.
    pendingSkipPass: null,
  };
  matchState.players.push({
    id: hostId,
    name: hostName,
    avatar: hostAvatar,
    color: pickUnusedColor(matchState),
    status: 'alive',
  });
  return matchState;
}

export function addPlayer(matchState, playerId, name, avatar) {
  if (matchState.players.some((p) => p.id === playerId)) return;
  matchState.players.push({
    id: playerId,
    name,
    avatar,
    color: pickUnusedColor(matchState),
    status: 'alive',
  });
}

// Lobby leave removes the player entirely; mid-match disconnect counts as elimination.
export function removePlayer(matchState, playerId) {
  const player = matchState.players.find((p) => p.id === playerId);
  if (!player) return;

  if (matchState.phase === 'lobby') {
    matchState.players = matchState.players.filter((p) => p.id !== playerId);
    return;
  }

  if (player.status === 'alive') {
    player.status = 'eliminated';
    if (matchState.bombHolderId === playerId) matchState.bombHolderId = null;
  }
}

export function setMatchDuration(matchState, matchDurationSeconds) {
  matchState.matchDurationSeconds = matchDurationSeconds;
}

export function setZipSettings(matchState, { enabled, stainDurationSeconds }) {
  if (enabled !== undefined) matchState.zipEnabled = enabled;
  if (stainDurationSeconds !== undefined) matchState.zipStainDurationSeconds = stainDurationSeconds;
}

export function startMatch(matchState) {
  matchState.phase = 'active';
  matchState.globalTimeRemaining = matchState.matchDurationSeconds;
  const alive = alivePlayers(matchState);
  const starter = alive[Math.floor(Math.random() * alive.length)];
  matchState.bombHolderId = starter.id;
  matchState.bombTimer = PERSONAL_TIMER_SECONDS;
  matchState.streakCount = 0;
  matchState.zipStain = null;
  matchState._zipThrownThisTurn = new Set();
}

// Returns { globalExpired, personalExpired }. No-ops outside the active phase.
export function tickTimers(matchState, deltaSeconds) {
  if (matchState.phase !== 'active') {
    return { globalExpired: false, personalExpired: false };
  }

  matchState.globalTimeRemaining = Math.max(0, matchState.globalTimeRemaining - deltaSeconds);
  matchState.bombTimer = Math.max(0, matchState.bombTimer - deltaSeconds);

  return {
    globalExpired: matchState.globalTimeRemaining === 0,
    personalExpired: matchState.bombTimer === 0,
  };
}

// Moves the bomb to the next alive player after afterPlayerId (defaults to the current holder),
// in join order. Sets bombHolderId to null if no alive players remain. afterPlayerId lets the
// Host resume rotation from an already-eliminated player's original slot once bombHolderId has
// already been cleared to null (e.g. during the elimination-notice pause).
export function selectNextHolder(matchState, afterPlayerId = matchState.bombHolderId) {
  const order = matchState.players;
  const currentIndex = order.findIndex((p) => p.id === afterPlayerId);

  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(currentIndex + offset) % order.length];
    if (candidate.status !== 'alive') continue;

    // A queued skip-ahead pass consumes itself and the bomb moves straight past them — safe
    // because this loop only ever runs with 2+ players alive (1-alive already ends the match
    // elsewhere), so there's always another alive candidate later in the same pass.
    if (candidate.id === matchState.pendingSkipPass) {
      matchState.pendingSkipPass = null;
      continue;
    }

    matchState.bombHolderId = candidate.id;
    matchState.bombTimer = PERSONAL_TIMER_SECONDS;
    if (matchState.pendingFuseBonus[candidate.id]) {
      matchState.bombTimer += matchState.pendingFuseBonus[candidate.id];
      delete matchState.pendingFuseBonus[candidate.id];
    }
    matchState.streakCount = 0;
    matchState.zipStain = null;
    matchState._zipThrownThisTurn = new Set();
    return;
  }

  matchState.bombHolderId = null;
  matchState.streakCount = 0;
}

// Marks the current holder eliminated and clears bombHolderId. Returns the eliminated id (or
// null if nobody was holding). Does NOT advance to the next holder — the Host schedules that
// after the elimination-notice pause.
export function eliminateCurrentHolder(matchState) {
  const eliminatedId = matchState.bombHolderId;
  if (!eliminatedId) return null;
  eliminatePlayer(matchState, eliminatedId);
  matchState.bombHolderId = null;
  return eliminatedId;
}

// One correct attempt. Advances the streak; only passes the bomb once STREAK_TARGET is reached
// (selectNextHolder resets the streak for the new holder). Returns true if applied (sender was
// the actual current holder).
export function resolvePuzzleSuccess(matchState, fromId) {
  if (matchState.phase !== 'active' || fromId !== matchState.bombHolderId) return false;
  matchState.streakCount += 1;
  if (matchState.streakCount >= STREAK_TARGET) {
    const bonus = Math.round(matchState.bombTimer * POINTS.perSecondRemaining);
    matchState.points[fromId] = (matchState.points[fromId] || 0) + bonus;
    selectNextHolder(matchState);
  }
  return true;
}

// One wrong attempt. Resets the streak to 0 but does NOT eliminate and does NOT touch
// bombTimer — only running out the full personal timer (tick loop) eliminates.
export function registerPuzzleMiss(matchState, fromId) {
  if (matchState.phase !== 'active' || fromId !== matchState.bombHolderId) return false;
  matchState.streakCount = 0;
  return true;
}

// Pure eligibility check for throwing a tomato — shared by the free (Zip-solve) and paid (Shop)
// throw paths so both stay subject to the exact same rules.
function canThrowZipStain(matchState, throwerId) {
  if (matchState.phase !== 'active' || !matchState.zipEnabled) return false;
  if (!matchState.bombHolderId || throwerId === matchState.bombHolderId) return false;
  const thrower = matchState.players.find((p) => p.id === throwerId);
  if (!thrower || thrower.status !== 'alive') return false;
  if (matchState._zipThrownThisTurn.has(throwerId)) return false;
  return true;
}

// The actual throw, no points awarded — callers decide whether this earns a bonus (only solving
// the puzzle does; paying for it via the Shop does not, since that would double-dip a player who
// bought the effect instead of earning it).
function applyZipThrow(matchState, throwerId) {
  matchState._zipThrownThisTurn.add(throwerId);
  matchState.zipStainSeq += 1;
  matchState.zipStain = {
    targetPlayerId: matchState.bombHolderId,
    throwerId,
    seq: matchState.zipStainSeq,
  };
}

// One alive non-holder "solved" their sabotage minigame. Throws a tomato at the current holder
// and awards the solve bonus, unless that player already threw one this turn (resets whenever a
// new holder is assigned) or the feature is off for this match. Returns true if applied.
export function throwZipStain(matchState, throwerId) {
  if (!canThrowZipStain(matchState, throwerId)) return false;
  applyZipThrow(matchState, throwerId);
  matchState.points[throwerId] = (matchState.points[throwerId] || 0) + POINTS.zipSolveBonus;
  return true;
}

// Spends a player's points on one of the three Shop items. Validates affordability and every
// item-specific precondition BEFORE deducting, so there's never a "deducted but nothing
// happened" state that would need a refund path. Returns true if applied.
export function purchaseShopItem(matchState, playerId, item) {
  if (matchState.phase !== 'active') return false;
  const player = matchState.players.find((p) => p.id === playerId);
  if (!player || player.status !== 'alive' || playerId === matchState.bombHolderId) return false;

  const price = POINTS.prices[item];
  if (price === undefined) return false;
  const balance = matchState.points[playerId] || 0;
  if (balance < price) return false;

  if (item === 'fuseTime') {
    if (matchState.pendingFuseBonus[playerId]) return false;
    matchState.points[playerId] = balance - price;
    matchState.pendingFuseBonus[playerId] = POINTS.fuseBonusSeconds;
    return true;
  }

  if (item === 'throwTomato') {
    if (!canThrowZipStain(matchState, playerId)) return false;
    matchState.points[playerId] = balance - price;
    applyZipThrow(matchState, playerId); // paid for — no solve bonus on top
    return true;
  }

  if (item === 'skipPass') {
    if (matchState.pendingSkipPass) return false;
    matchState.points[playerId] = balance - price;
    matchState.pendingSkipPass = playerId;
    return true;
  }

  return false;
}

// Brings a finished match back to the lobby with the same roster (all revived to 'alive') so the
// Host can start another round without anyone needing to reconnect. Only meant to be called with
// matchState.players already filtered down to currently-connected players by the caller.
export function resetToLobby(matchState) {
  matchState.phase = 'lobby';
  matchState.players.forEach((p) => {
    p.status = 'alive';
  });
  matchState.bombHolderId = null;
  matchState.bombTimer = PERSONAL_TIMER_SECONDS;
  matchState.streakCount = 0;
  matchState.globalTimeRemaining = matchState.matchDurationSeconds;
  matchState.eliminationNotice = null;
  matchState.zipStain = null;
  matchState._zipThrownThisTurn = new Set();
  matchState.points = {};
  matchState.pendingFuseBonus = {};
  matchState.pendingSkipPass = null;
}

function eliminatePlayer(matchState, playerId) {
  const player = matchState.players.find((p) => p.id === playerId);
  if (player) player.status = 'eliminated';
}

function alivePlayers(matchState) {
  return matchState.players.filter((p) => p.status === 'alive');
}

export function countAlivePlayers(matchState) {
  return alivePlayers(matchState).length;
}

// Ends the match. `loserId` must be supplied explicitly by the caller (the holder when the
// global timer expired, or the specific player whose elimination ended the match) — or null if
// nobody in particular loses (e.g. every other player already left). Deliberately does not fall
// back to matchState.bombHolderId: by the time this runs, a personal-timeout elimination has
// already cleared it to null (see eliminateCurrentHolder), so guessing from it silently produces
// the wrong loser.
export function endMatch(matchState, loserId) {
  matchState.phase = 'ended';
  if (loserId) eliminatePlayer(matchState, loserId);
  const winners = alivePlayers(matchState).map((p) => p.id);
  winners.forEach((id) => {
    matchState.winCounts[id] = (matchState.winCounts[id] || 0) + 1;
  });
  matchState.bombHolderId = null;
  return { winners, loserId };
}
