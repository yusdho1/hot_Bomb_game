export const MessageType = Object.freeze({
  LOBBY_UPDATE: 'lobby_update',
  TUTORIAL_START: 'tutorial_start',
  START_MATCH: 'start_match',
  STATE_UPDATE: 'state_update',
  INPUT_PUZZLE_RESULT: 'input_puzzle_result',
  INPUT_ZIP_SOLVED: 'input_zip_solved',
  INPUT_SHOP_PURCHASE: 'input_shop_purchase',
  INPUT_TUTORIAL_READY: 'input_tutorial_ready',
  GAME_OVER: 'game_over',
  RETURN_TO_LOBBY: 'return_to_lobby',
});

function snapshotPlayer(p) {
  return { id: p.id, name: p.name, avatar: p.avatar, color: p.color, status: p.status };
}

function snapshotMatchState(matchState) {
  return {
    phase: matchState.phase,
    players: matchState.players.map(snapshotPlayer),
    bombHolderId: matchState.bombHolderId,
    bombTimer: matchState.bombTimer,
    streakCount: matchState.streakCount,
    streakTarget: matchState.streakTarget,
    difficulty: matchState.difficulty,
    tutorialEnabled: matchState.tutorialEnabled,
    tutorialReady: matchState.tutorialReady,
    globalTimeRemaining: matchState.globalTimeRemaining,
    matchDurationSeconds: matchState.matchDurationSeconds,
    eliminationNotice: matchState.eliminationNotice,
    zipEnabled: matchState.zipEnabled,
    zipStainDurationSeconds: matchState.zipStainDurationSeconds,
    zipStain: matchState.zipStain,
    turnNotice: matchState.turnNotice,
    winCounts: matchState.winCounts,
    points: matchState.points,
    tomatoesThrown: matchState.tomatoesThrown,
    pendingFuseBonus: matchState.pendingFuseBonus,
    pendingSkipPass: matchState.pendingSkipPass,
  };
}

// Host -> Clients: player list / match duration changed while still in the lobby.
export function createLobbyUpdateMessage(matchState) {
  return {
    type: MessageType.LOBBY_UPDATE,
    players: matchState.players.map(snapshotPlayer),
    matchDurationSeconds: matchState.matchDurationSeconds,
    zipEnabled: matchState.zipEnabled,
    zipStainDurationSeconds: matchState.zipStainDurationSeconds,
    streakTarget: matchState.streakTarget,
    difficulty: matchState.difficulty,
    tutorialEnabled: matchState.tutorialEnabled,
    winCounts: matchState.winCounts,
  };
}

// Host -> Clients: a finished match is back in the lobby with the same roster, ready to start
// another round — same payload shape as lobby_update, distinct type so clients know to switch
// their view back from the game-over screen rather than just refresh an already-visible list.
export function createReturnToLobbyMessage(matchState) {
  return {
    type: MessageType.RETURN_TO_LOBBY,
    players: matchState.players.map(snapshotPlayer),
    matchDurationSeconds: matchState.matchDurationSeconds,
    zipEnabled: matchState.zipEnabled,
    zipStainDurationSeconds: matchState.zipStainDurationSeconds,
    streakTarget: matchState.streakTarget,
    difficulty: matchState.difficulty,
    tutorialEnabled: matchState.tutorialEnabled,
    winCounts: matchState.winCounts,
  };
}

// Host -> Clients: the practice phase has begun instead of the real match (Tutorial Mode was on).
// A one-time phase-transition event, same pattern as createStartMatchMessage/GAME_OVER/
// RETURN_TO_LOBBY each having their own dedicated message.
export function createTutorialStartMessage(matchState) {
  return { type: MessageType.TUTORIAL_START, matchState: snapshotMatchState(matchState) };
}

// Host -> Clients: match has begun, transition out of the lobby (or out of Tutorial Mode's
// practice phase — the tutorial->active transition reuses this exact message).
export function createStartMatchMessage(matchState) {
  return { type: MessageType.START_MATCH, matchState: snapshotMatchState(matchState) };
}

// Host -> Clients: authoritative matchState snapshot.
export function createStateUpdateMessage(matchState) {
  return { type: MessageType.STATE_UPDATE, matchState: snapshotMatchState(matchState) };
}

// Client -> Host: result of the local puzzle attempt for the sender.
export function createPuzzleResultMessage(playerId, success) {
  return { type: MessageType.INPUT_PUZZLE_RESULT, playerId, success };
}

// Client -> Host: sender just solved their background sabotage (Zip) puzzle.
export function createZipSolvedMessage(playerId) {
  return { type: MessageType.INPUT_ZIP_SOLVED, playerId };
}

// Client -> Host: sender wants to spend points on one Shop item ('fuseTime' | 'throwTomato' | 'skipPass').
export function createShopPurchaseMessage(playerId, item) {
  return { type: MessageType.INPUT_SHOP_PURCHASE, playerId, item };
}

// Client -> Host: sender is done practicing and marks themselves ready during Tutorial Mode.
export function createTutorialReadyMessage(playerId) {
  return { type: MessageType.INPUT_TUTORIAL_READY, playerId };
}

// Host -> Clients: global timer hit zero, match is over. points/tomatoesThrown are this round's
// final totals (not yet reset — that happens on the next "Next Round"), used for the game-over
// stats screen.
export function createGameOverMessage(winners, loserId, winCounts, points, tomatoesThrown) {
  return { type: MessageType.GAME_OVER, winners, loserId, winCounts, points, tomatoesThrown };
}

export function isValidMessage(message) {
  return !!message && typeof message.type === 'string' && Object.values(MessageType).includes(message.type);
}
