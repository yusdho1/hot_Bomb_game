// Deliberately NOT inside registry/ — the mod tool scans that folder assuming every .js file in
// it is a minigame module with a default export, and would try to treat this one as a puzzle too.
import gameConfig from '../../config/game.config.json';

// Reads one minigame's tunable settings for the given match difficulty ('easy'|'medium'|'hard').
// Resolution order per field: schema default -> saved base value (game.config.json's
// minigameSettings[id][key], edited via the mod tool) -> that difficulty's preset override
// (minigameSettings[id].difficultyPresets[difficulty][key], only if present — an unset preset
// field simply inherits the base value). Difficulty is a per-match, host-chosen value, so any
// puzzle that wants to react to it must call this from inside mount(), not at module load time —
// see tools/mod-tool/DESIGN_GUIDELINES.md for the full settingsSchema/difficulty convention.
export function readPuzzleSettings(id, schema, difficulty) {
  const stored = gameConfig.minigameSettings?.[id] || {};
  const preset = stored.difficultyPresets?.[difficulty] || {};
  const result = {};
  schema.forEach((field) => {
    if (preset[field.key] !== undefined) result[field.key] = preset[field.key];
    else if (stored[field.key] !== undefined) result[field.key] = stored[field.key];
    else result[field.key] = field.default;
  });
  return result;
}
