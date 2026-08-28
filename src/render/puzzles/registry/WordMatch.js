// 20 paired word/concept pairs (replacing raw Unicode emojis for cross-platform visual consistency)
const CONCEPT_PAIRS = [
  { a: 'BOMB', b: 'BOOM' },
  { a: 'POLICE', b: 'COP CAR' },
  { a: 'PREGNANT', b: 'BABY' },
  { a: 'RAIN', b: 'UMBRELLA' },
  { a: 'FIRE', b: 'EXTINGUISHER' },
  { a: 'PIZZA', b: 'SODA' },
  { a: 'BEE', b: 'HONEY' },
  { a: 'ROCKET', b: 'MOON' },
  { a: 'ARTIST', b: 'BRUSH' },
  { a: 'KEY', b: 'LOCK' },
  { a: 'FISHING', b: 'FISH' },
  { a: 'BOW', b: 'TARGET' },
  { a: 'GHOST', b: 'CASTLE' },
  { a: 'POPCORN', b: 'MOVIE' },
  { a: 'SPIDER', b: 'WEB' },
  { a: 'HAMMER', b: 'WOOD' },
  { a: 'SOCCER', b: 'GOAL' },
  { a: 'KING', b: 'CROWN' },
  { a: 'CAKE', b: 'CANDLE' },
  { a: 'CAR', b: 'GAS PUMP' },
];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mount(contentEl, onAttempt) {
  let destroyed = false;
  let activePointer = null;

  // Root container styling matching system guidelines. No fixed/100% height here — contentEl
  // already carries the shared .puzzle-content class, which shrinks to fit .puzzle-panel's
  // available space; forcing height:100% against that flex-auto-sized ancestor did nothing
  // useful and masked the real fix (the fixed-px card heights below).
  contentEl.style.display = 'flex';
  contentEl.style.flexDirection = 'column';
  contentEl.style.justifyContent = 'space-between';
  contentEl.style.alignItems = 'center';
  contentEl.style.padding = '10px 0';
  contentEl.style.userSelect = 'none';
  contentEl.style.touchAction = 'none';

  // Instruction Prompt
  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';
  promptEl.textContent = 'DRAG TO MATCH COUPLINGS';
  promptEl.style.fontFamily = 'var(--font-display)';
  promptEl.style.fontWeight = '800';
  promptEl.style.fontSize = '1.2rem';
  promptEl.style.color = '#ffffff';
  promptEl.style.textShadow = 'var(--text-outline)';
  contentEl.appendChild(promptEl);

  // Puzzle board layout
  const boardEl = document.createElement('div');
  boardEl.style.display = 'flex';
  boardEl.style.flexDirection = 'column';
  boardEl.style.justifyContent = 'space-between';
  boardEl.style.width = '100%';
  boardEl.style.flex = '1';
  boardEl.style.marginTop = '10px';
  contentEl.appendChild(boardEl);

  const topRow = document.createElement('div');
  const bottomRow = document.createElement('div');

  [topRow, bottomRow].forEach((row) => {
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'repeat(4, 1fr)';
    row.style.gap = '8px';
    row.style.width = '100%';
    boardEl.appendChild(row);
  });

  function handleAttempt(success) {
    if (destroyed) return;
    onAttempt(success);
    nextRound();
  }

  function nextRound() {
    if (destroyed) return;

    topRow.innerHTML = '';
    bottomRow.innerHTML = '';

    // Pick 4 random pairs each round
    const selectedPairs = shuffle(CONCEPT_PAIRS).slice(0, 4);

    const topItems = selectedPairs.map((pair, index) => ({ text: pair.a, pairId: index }));
    const bottomItems = shuffle(selectedPairs.map((pair, index) => ({ text: pair.b, pairId: index })));

    // Create Top Row items (Draggable cards using Pointer Events)
    topItems.forEach((data) => {
      const card = document.createElement('div');
      card.textContent = data.text;
      card.style.fontFamily = 'var(--font-display)';
      card.style.fontWeight = '700';
      card.style.fontSize = '0.9rem';
      card.style.color = '#ffffff';
      card.style.textShadow = 'var(--text-outline)';
      card.style.backgroundColor = 'var(--panel-bg)';
      card.style.border = '2px solid var(--accent-orange-border)';
      card.style.borderRadius = '12px';
      card.style.display = 'flex';
      card.style.alignItems = 'center';
      card.style.justifyContent = 'center';
      card.style.height = 'clamp(36px, 8vh, 60px)';
      card.style.cursor = 'grab';
      card.style.position = 'relative';
      card.style.zIndex = '1';

      card.addEventListener('pointerdown', (e) => {
        if (activePointer) return;
        activePointer = {
          pointerId: e.pointerId,
          pairId: data.pairId,
          card,
          startX: e.clientX,
          startY: e.clientY,
        };

        // Pointer capture prevents loss of dragging events on fast mouse movements
        card.setPointerCapture(e.pointerId);
        card.style.zIndex = '10';
        card.style.opacity = '0.8';
      });

      card.addEventListener('pointermove', (e) => {
        if (!activePointer || activePointer.pointerId !== e.pointerId) return;
        const dx = e.clientX - activePointer.startX;
        const dy = e.clientY - activePointer.startY;
        card.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      const handlePointerEnd = (e) => {
        if (!activePointer || activePointer.pointerId !== e.pointerId) return;

        card.releasePointerCapture(e.pointerId);
        card.style.transform = 'translate(0px, 0px)';
        card.style.opacity = '1';
        card.style.zIndex = '1';

        // Find drop target under current pointer location
        card.style.pointerEvents = 'none';
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        card.style.pointerEvents = 'auto';

        const dropZone = targetEl ? targetEl.closest('[data-drop-pair-id]') : null;
        const draggedPairId = activePointer.pairId;
        activePointer = null;

        if (dropZone) {
          const targetPairId = parseInt(dropZone.dataset.dropPairId, 10);
          handleAttempt(draggedPairId === targetPairId);
        }
      };

      card.addEventListener('pointerup', handlePointerEnd);
      card.addEventListener('pointercancel', handlePointerEnd);

      topRow.appendChild(card);
    });

    // Create Bottom Row items (Drop targets)
    bottomItems.forEach((data) => {
      const target = document.createElement('div');
      target.textContent = data.text;
      target.dataset.dropPairId = data.pairId;

      target.style.fontFamily = 'var(--font-display)';
      target.style.fontWeight = '700';
      target.style.fontSize = '0.9rem';
      target.style.color = '#ffffff';
      target.style.textShadow = 'var(--text-outline)';
      target.style.backgroundColor = 'var(--panel-bg)';
      target.style.border = '2px dashed var(--panel-border)';
      target.style.borderRadius = '12px';
      target.style.display = 'flex';
      target.style.alignItems = 'center';
      target.style.justifyContent = 'center';
      target.style.height = 'clamp(36px, 8vh, 60px)';

      bottomRow.appendChild(target);
    });
  }

  nextRound();

  return {
    unmount() {
      destroyed = true;
      activePointer = null;
      contentEl.innerHTML = '';
    },
  };
}

export default {
  id: 'wordmatch',
  titleText: 'MATCH PAIRS',
  mount,
};