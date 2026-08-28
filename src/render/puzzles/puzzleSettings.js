// Deliberately NOT inside registry/ — the mod tool scans that folder assuming every .js file in
// it is a minigame module with a default export, and would try to treat this one as a puzzle too.
import gameConfig from '../../config/game.config.json';

// Reads one minigame's tunable settings, merging saved values (edited via the mod tool, stored in
// game.config.json's minigameSettings[id]) over each field's declared default from its schema.
// See tools/mod-tool/DESIGN_GUIDELINES.md for the settingsSchema convention.
export function readPuzzleSettings(id, schema) {
  const stored = gameConfig.minigameSettings?.[id] || {};
  const result = {};
  schema.forEach((field) => {
    result[field.key] = stored[field.key] !== undefined ? stored[field.key] : field.default;
  });
  return result;
}
