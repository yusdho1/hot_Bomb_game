import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [
  { key: 'colorGreen', label: 'Green swatch', type: 'color', default: '#4CD137' },
  { key: 'colorPurple', label: 'Purple swatch', type: 'color', default: '#9B59B6' },
  { key: 'colorOrange', label: 'Orange swatch', type: 'color', default: '#FF8C1A' },
  { key: 'colorBlue', label: 'Blue swatch', type: 'color', default: '#2980B9' },
  { key: 'colorYellow', label: 'Yellow swatch', type: 'color', default: '#F1C40F' },
  { key: 'colorPink', label: 'Pink swatch', type: 'color', default: '#E84393' },
  { key: 'colorRed', label: 'Red swatch', type: 'color', default: '#E74C3C' },
  { key: 'colorTeal', label: 'Teal swatch', type: 'color', default: '#1ABC9C' },
  { key: 'colorCount', label: 'Number of colors in rotation (4-8)', type: 'number', default: 6 },
];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('stroop', settingsSchema, difficulty);
  const ALL_COLORS = [
    { name: 'GREEN', hex: settings.colorGreen },
    { name: 'PURPLE', hex: settings.colorPurple },
    { name: 'ORANGE', hex: settings.colorOrange },
    { name: 'BLUE', hex: settings.colorBlue },
    { name: 'TEAL', hex: settings.colorTeal },
    { name: 'YELLOW', hex: settings.colorYellow },
    { name: 'PINK', hex: settings.colorPink },
    { name: 'RED', hex: settings.colorRed },
  ].slice(0, Math.max(4, Math.min(8, settings.colorCount)));

  let destroyed = false;
  let correctAnswer = null;
  let lastWordName = null;
  let lastDisplayColorName = null;

  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';

  const wordEl = document.createElement('div');
  wordEl.className = 'stroop-word';

  const gridEl = document.createElement('div');
  gridEl.className = 'stroop-grid';

  contentEl.appendChild(promptEl);
  contentEl.appendChild(wordEl);
  contentEl.appendChild(gridEl);

  function nextRound() {
    if (destroyed) return;

    const selectByColor = Math.random() < 0.5;

    // 1. Pick word concept (excluding last round's word and display color)
    const validWords = ALL_COLORS.filter(
      (c) => c.name !== lastWordName && c.name !== lastDisplayColorName
    );
    const word = validWords[Math.floor(Math.random() * validWords.length)];

    // 2. Pick display color (excluding current word, last round's word, and last round's display color)
    const validDisplayColors = ALL_COLORS.filter(
      (c) => c.name !== word.name && c.name !== lastWordName && c.name !== lastDisplayColorName
    );
    const displayColor = validDisplayColors[Math.floor(Math.random() * validDisplayColors.length)];

    // Store history for consecutive tracking
    lastWordName = word.name;
    lastDisplayColorName = displayColor.name;

    // 3. Pick 2 additional distinct filler colors to make a 4-button set
    const remainingPool = ALL_COLORS.filter(
      (c) => c.name !== word.name && c.name !== displayColor.name
    );
    const activeFourColors = shuffle([
      word,
      displayColor,
      ...shuffle(remainingPool).slice(0, 2),
    ]);

    // 4. Render UI elements
    promptEl.textContent = selectByColor ? 'SELECT BY COLOR!' : 'SELECT BY TEXT!';
    wordEl.textContent = word.name;
    wordEl.style.color = displayColor.hex;

    correctAnswer = selectByColor ? displayColor.name : word.name;

    gridEl.innerHTML = '';
    activeFourColors.forEach((color) => {
      const btn = document.createElement('button');
      btn.className = 'stroop-btn';
      btn.style.background = color.hex;
      btn.addEventListener('click', () => handleAnswer(color.name));
      gridEl.appendChild(btn);
    });
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
      contentEl.innerHTML = '';
    },
  };
}

export default {
  id: 'stroop',
  titleImg: '/UI/Stroop Title.png',
  tutorialText:
    'Tap the swatch that matches — the prompt tells you whether to match the WORD or the COLOR it\'s printed in.',
  mount,
};