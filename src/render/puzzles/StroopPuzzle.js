const COLORS = [
  { name: 'GREEN', hex: '#4CD137' },
  { name: 'PURPLE', hex: '#9B59B6' },
  { name: 'ORANGE', hex: '#FF8C1A' },
  { name: 'RED', hex: '#E74C3C' },
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export const StroopPuzzle = {
  mount(contentEl, onAttempt) {
    let destroyed = false;
    let correctAnswer = null;

    const promptEl = document.createElement('div');
    promptEl.className = 'puzzle-prompt';

    const wordEl = document.createElement('div');
    wordEl.className = 'stroop-word';

    const gridEl = document.createElement('div');
    gridEl.className = 'stroop-grid';

    COLORS.forEach((color) => {
      const btn = document.createElement('button');
      btn.className = 'stroop-btn';
      btn.style.background = color.hex;
      btn.addEventListener('click', () => handleAnswer(color.name));
      gridEl.appendChild(btn);
    });

    contentEl.appendChild(promptEl);
    contentEl.appendChild(wordEl);
    contentEl.appendChild(gridEl);

    function nextRound() {
      const selectByColor = Math.random() < 0.5;
      const word = randomColor();
      // Display color must never match the word's own name (no congruent trials) — both are
      // always drawn from the same 4-color pool as the buttons, so both are always valid answers.
      const remainingColors = COLORS.filter((c) => c.name !== word.name);
      const displayColor = remainingColors[Math.floor(Math.random() * remainingColors.length)];

      promptEl.textContent = selectByColor ? 'SELECT BY COLOR!' : 'SELECT BY TEXT!';
      wordEl.textContent = word.name;
      wordEl.style.color = displayColor.hex;

      correctAnswer = selectByColor ? displayColor.name : word.name;
    }

    function handleAnswer(name) {
      if (destroyed) return;
      onAttempt(name === correctAnswer);
      nextRound();
    }

    nextRound();

    return {
      unmount() {
        destroyed = true;
      },
    };
  },
};
