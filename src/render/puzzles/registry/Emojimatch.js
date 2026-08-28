function mount(contentEl, onAttempt) {
  let destroyed = false;
  let draggedId = null;

  // 20 paired concept emojis
  const EMOJI_PAIRS = [
    { a: '💣', b: '💥' },
    { a: '👮', b: '🚔' },
    { a: '🤰', b: '👶' },
    { a: '🌧️', b: '☔' },
    { a: '🔥', b: '🧯' },
    { a: '🍔', b: '🍟' },
    { a: '🐝', b: '🍯' },
    { a: '🚀', b: '🌙' },
    { a: '🎨', b: '🖌️' },
    { a: '🔑', b: '🔒' },
    { a: '🎣', b: '🐟' },
    { a: '🏹', b: '🎯' },
    { a: '👻', b: '🏰' },
    { a: '🍿', b: '🎬' },
    { a: '🕷️', b: '🕸️' },
    { a: '🔨', b: '🪵' },
    { a: '⚽', b: '🥅' },
    { a: '👑', b: '🏰' },
    { a: '🎂', b: '🕯️' },
    { a: '🚗', b: '⛽' },
  ];

  // DOM Container Layout
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.justifyContent = 'space-evenly';
  container.style.alignItems = 'center';
  container.style.height = '100%';
  container.style.userSelect = 'none';

  const topRow = document.createElement('div');
  const bottomRow = document.createElement('div');

  [topRow, bottomRow].forEach((row) => {
    row.style.display = 'flex';
    row.style.gap = '16px';
  });

  container.appendChild(topRow);
  container.appendChild(bottomRow);
  contentEl.appendChild(container);

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function handleAttempt(success) {
    if (destroyed) return;
    onAttempt(success); // Report attempt result to shared chrome[cite: 2]
    nextRound();
  }

  function nextRound() {
    if (destroyed) return;

    topRow.innerHTML = '';
    bottomRow.innerHTML = '';

    // Pick 4 random pairs each round
    const selectedPairs = shuffle(EMOJI_PAIRS).slice(0, 4);

    const topItems = selectedPairs.map((pair, index) => ({ emoji: pair.a, id: index }));
    const bottomItems = shuffle(selectedPairs.map((pair, index) => ({ emoji: pair.b, id: index })));

    // Top Row: Drag sources
    topItems.forEach((itemData) => {
      const el = document.createElement('div');
      el.textContent = itemData.emoji;
      el.draggable = true;
      el.style.fontSize = '2.5rem';
      el.style.padding = '10px';
      el.style.border = '2px solid #555';
      el.style.borderRadius = '10px';
      el.style.cursor = 'grab';
      el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';

      el.addEventListener('dragstart', (e) => {
        draggedId = itemData.id;
        e.dataTransfer.setData('text/plain', itemData.id);
        el.style.opacity = '0.4';
      });

      el.addEventListener('dragend', () => {
        el.style.opacity = '1';
        draggedId = null;
      });

      topRow.appendChild(el);
    });

    // Bottom Row: Drop targets
    bottomItems.forEach((itemData) => {
      const el = document.createElement('div');
      el.textContent = itemData.emoji;
      el.style.fontSize = '2.5rem';
      el.style.padding = '10px';
      el.style.border = '2px dashed #aaa';
      el.style.borderRadius = '10px';
      el.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.style.transform = 'scale(1.1)';
      });

      el.addEventListener('dragleave', () => {
        el.style.transform = 'scale(1)';
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.transform = 'scale(1)';
        if (draggedId === null) return;

        const isMatch = draggedId === itemData.id;
        handleAttempt(isMatch);
      });

      bottomRow.appendChild(el);
    });
  }

  nextRound();

  return {
    unmount() {
      destroyed = true;
      contentEl.innerHTML = ''; // Clean up listeners and DOM[cite: 2]
    },
  };
}

export default {
  id: 'emojimatch',
  titleText: 'EMOJI MATCH',
  mount,
};