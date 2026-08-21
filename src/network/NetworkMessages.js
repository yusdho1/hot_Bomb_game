export const MessageType = Object.freeze({
  LOBBY_UPDATE: 'lobby_update',
  START_MATCH: 'start_match',
  STATE_UPDATE: 'state_update',
  INPUT_PUZZLE_RESULT: 'input_puzzle_result',
  GAME_OVER: 'game_over',
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
    globalTimeRemaining: matchState.globalTimeRemaining,
    matchDurationSeconds: matchState.matchDurationSeconds,
    eliminationNotice: matchState.eliminationNotice,
  };
}

// Host -> Clients: player list / match duration changed while still in the lobby.
export function createLobbyUpdateMessage(matchState) {
  return {
    type: MessageType.LOBBY_UPDATE,
    players: matchState.players.map(snapshotPlayer),
    matchDurationSeconds: matchState.matchDurationSeconds,
  };
}

// Host -> Clients: match has begun, transition out of the lobby.
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

// Host -> Clients: global timer hit zero, match is over.
export function createGameOverMessage(winners, loserId) {
  return { type: MessageType.GAME_OVER, winners, loserId };
}

export function isValidMessage(message) {
  return !!message && typeof message.type === 'string' && Object.values(MessageType).includes(message.type);
}
