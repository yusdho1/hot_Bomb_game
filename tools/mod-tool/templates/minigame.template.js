// Scaffolded by the mod tool. This is a WORKING example (a trivial "tap the matching option"
// puzzle), not a blank stub — replace the content generation and answer logic with your own
// idea, but keep reusing the same building blocks (settingsSchema, .puzzle-option-grid, plain
// click listeners). Read ../DESIGN_GUIDELINES.md before changing the visual approach —
// particularly: no raw emoji, no HTML5 drag-and-drop, reuse the existing color/font tokens.
import { readPuzzleSettings } from '../puzzleSettings.js';

// Optional — delete this whole block if your puzzle has nothing worth exposing to hosts. Anything
// listed here shows up as an editable field in the mod tool, grouped under this puzzle's own
// section (including a per-difficulty Easy/Medium/Hard override for any field, automatically —
// see the "Difficulty presets" section of DESIGN_GUIDELINES.md). Supported types: 'number',
// 'string', 'color'.
export const settingsSchema = [{ key: 'promptText', label: 'Prompt text', type: 'string', default: 'TODO: replace me' }];

// Settings must be read INSIDE mount(), not at module load — difficulty is chosen per match by
// the Host, so this has to be re-resolved every time a turn starts, using whatever difficulty
// that match is currently set to.
function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('__ID__', settingsSchema, difficulty);
  let destroyed = false;
  let correctAnswer = null;

  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';

  // A reusable "pick one of N" grid — see DESIGN_GUIDELINES.md. Plain click listeners work
  // identically on mouse and touch; only reach for Pointer Events + setPointerCapture if this
  // puzzle genuinely needs a drag/swipe gesture instead (see Swipe.js for that pattern).
  const gridEl = document.createElement('div');
  gridEl.className = 'puzzle-option-grid';

  const buttons = [0, 1, 2, 3].map(() => {
    const btn = document.createElement('button');
    btn.className = 'puzzle-option-btn';
    btn.addEventListener('click', () => handleAnswer(btn));
    gridEl.appendChild(btn);
    return btn;
  });

  contentEl.appendChild(promptEl);
  contentEl.appendChild(gridEl);

  function nextRound() {
    promptEl.textContent = settings.promptText;

    // TODO: replace with real content generation. This placeholder just labels the 4 buttons
    // 1-4 and picks one as correct, purely so the scaffold is runnable out of the box.
    const correctIndex = Math.floor(Math.random() * 4);
    buttons.forEach((btn, i) => {
      btn.textContent = String(i + 1);
    });
    correctAnswer = buttons[correctIndex];
  }

  function handleAnswer(btn) {
    if (destroyed) return;
    onAttempt(btn === correctAnswer);
    nextRound();
  }

  nextRound();

  return {
    unmount() {
      destroyed = true;
      // TODO: clear any timers/listeners you added beyond the button clicks above (those are
      // garbage-collected with the buttons automatically once contentEl is cleared by the caller).
    },
  };
}

// A registered minigame module: { id, titleImg|titleText, tutorialText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// titleImg points at a banner image under public/UI/ (matches the other puzzles' style); use
// titleText instead for a plain text banner if you don't have art yet. tutorialText is shown in
// Tutorial Mode's practice loop and the mod tool's debug preview, in place of the timer/streak
// chrome (neither applies there) — one sentence, imperative, no jargon.
export default {
  id: '__ID__',
  titleText: '__TITLE__',
  tutorialText: 'TODO: one sentence telling a new player what to do here.',
  mount,
};
