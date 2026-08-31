import { readPuzzleSettings } from '../puzzleSettings.js';

// 20 paired emoji concepts. Deliberately real emoji (not text) — a project-owner-approved,
// narrow exception to the "no raw emoji" rule documented in ../../../tools/mod-tool/
// DESIGN_GUIDELINES.md (see the note there for why this one puzzle is the exception).
const CONCEPT_PAIRS = [
  { a: '\u{1F4A3}', b: '\u{1F4A5}' }, // bomb / boom
  { a: '\u{1F6A8}', b: '\u{1F694}' }, // siren / police car
  { a: '\u{1F930}', b: '\u{1F476}' }, // pregnant / baby
  { a: '\u{1F327}\u{FE0F}', b: '\u{2602}\u{FE0F}' }, // rain / umbrella
  { a: '\u{1F525}', b: '\u{1F9EF}' }, // fire / extinguisher
  { a: '\u{1F355}', b: '\u{1F964}' }, // pizza / soda
  { a: '\u{1F41D}', b: '\u{1F36F}' }, // bee / honey
  { a: '\u{1F680}', b: '\u{1F319}' }, // rocket / moon
  { a: '\u{1F3A8}', b: '\u{1F58C}\u{FE0F}' }, // artist palette / brush
  { a: '\u{1F511}', b: '\u{1F512}' }, // key / lock
  { a: '\u{1F3A3}', b: '\u{1F41F}' }, // fishing / fish
  { a: '\u{1F3F9}', b: '\u{1F3AF}' }, // bow / target
  { a: '\u{1F47B}', b: '\u{1F3F0}' }, // ghost / castle
  { a: '\u{1F37F}', b: '\u{1F3AC}' }, // popcorn / movie
  { a: '\u{1F577}\u{FE0F}', b: '\u{1F578}\u{FE0F}' }, // spider / web
  { a: '\u{1F528}', b: '\u{1FAB5}' }, // hammer / wood
  { a: '\u{26BD}', b: '\u{1F945}' }, // soccer ball / goal
  { a: '\u{1F934}', b: '\u{1F451}' }, // king / crown
  { a: '\u{1F382}', b: '\u{1F56F}\u{FE0F}' }, // cake / candle
  { a: '\u{1F697}', b: '\u{26FD}' }, // car / gas pump
];

export const settingsSchema = [
  { key: 'pairsPerRound', label: 'Pairs per round', type: 'number', default: 4 },
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
  const settings = readPuzzleSettings('wordmatch', settingsSchema, difficulty);
  const pairsPerRound = Math.max(2, settings.pairsPerRound);
  const cols = Math.min(pairsPerRound, 4);

  let destroyed = false;
  let activePointer = null;
  let remainingPairIds = new Set();
  let cardEls = {};
  let targetEls = {};

  const GAP_PX = 10;

  // .puzzle-content now fills .puzzle-game-box's real height (see index.html), so this box has
  // genuine, non-circular geometry to measure — same idea as WhackAMole.js. The board is sized to
  // its own content (cards sized to fit, not stretched) and centered in whatever room is left,
  // rather than stretched to fill it — a big empty .puzzle-game-box just reads as calm page
  // background now that it's no longer a floating popup card.
  contentEl.style.display = 'flex';
  contentEl.style.flexDirection = 'column';
  contentEl.style.alignItems = 'center';
  contentEl.style.justifyContent = 'center';
  // border-box matters here: contentEl's height:100% comes from the .puzzle-content CSS class,
  // and without border-box this padding would be added on TOP of that 100% (content-box is the
  // default), silently overflowing the box by exactly the padding amount.
  contentEl.style.boxSizing = 'border-box';
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

  // Puzzle board layout — natural height (sized to its cards), not stretched to fill the box.
  const boardEl = document.createElement('div');
  boardEl.style.display = 'flex';
  boardEl.style.flexDirection = 'column';
  boardEl.style.gap = `${GAP_PX}px`;
  boardEl.style.width = '100%';
  boardEl.style.marginTop = '10px';
  contentEl.appendChild(boardEl);

  const topRow = document.createElement('div');
  const bottomRow = document.createElement('div');

  [topRow, bottomRow].forEach((row) => {
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    row.style.justifyItems = 'center';
    row.style.alignItems = 'center';
    row.style.gap = `${GAP_PX}px`;
    row.style.width = '100%';
    boardEl.appendChild(row);
  });

  // Cards are square tap targets sized to fit their emoji, not stretched to fill leftover space:
  // read the content area's real rendered geometry (width per column, and the vertical room left
  // over once the prompt/margins/gap are subtracted — measured while the rows are still empty, so
  // this is a real top-down budget, not circular) and take whichever of width/height is tighter,
  // same approach as WhackAMole.js. Font-size then scales directly off that square's own size.
  function computeCardPx() {
    const contentRect = contentEl.getBoundingClientRect();
    const promptRect = promptEl.getBoundingClientRect();
    const rowWidth = topRow.getBoundingClientRect().width || contentRect.width;
    const widthPerCard = (rowWidth - GAP_PX * (cols - 1)) / cols;
    const verticalChrome = promptRect.height + 10 /* boardEl marginTop */ + GAP_PX /* gap between rows */;
    const heightPerCard = (contentRect.height - verticalChrome) / 2;
    return Math.max(36, Math.min(widthPerCard, heightPerCard || widthPerCard));
  }

  function baseCellStyle(el, cardPx) {
    el.style.width = `${cardPx}px`;
    el.style.height = `${cardPx}px`;
    el.style.fontSize = `${Math.round(cardPx * 0.5)}px`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.borderRadius = '12px';
    el.style.boxSizing = 'border-box';
  }

  // A correct drop removes just that one pair from the board — the round only fully reshuffles
  // (nextRound()) once every pair currently shown has been matched, instead of discarding the
  // rest of the board on the very first attempt.
  function resolveMatch(pairId) {
    cardEls[pairId]?.remove();
    targetEls[pairId]?.remove();
    delete cardEls[pairId];
    delete targetEls[pairId];
    remainingPairIds.delete(pairId);
    onAttempt(true);
    if (remainingPairIds.size === 0) nextRound();
  }

  function handleWrongAttempt() {
    if (destroyed) return;
    onAttempt(false);
    // Board stays as-is — the dragged card already snapped back to its start position in
    // handlePointerEnd, so the player just retries against the same set.
  }

  function nextRound() {
    if (destroyed) return;

    topRow.innerHTML = '';
    bottomRow.innerHTML = '';
    cardEls = {};
    targetEls = {};

    // Measured while both rows are still empty — see computeCardPx's comment above for why
    // that's required for this to be a real (non-circular) measurement.
    const cardPx = computeCardPx();

    const selectedPairs = shuffle(CONCEPT_PAIRS).slice(0, pairsPerRound);
    remainingPairIds = new Set(selectedPairs.map((_, index) => index));

    const topItems = selectedPairs.map((pair, index) => ({ text: pair.a, pairId: index }));
    const bottomItems = shuffle(selectedPairs.map((pair, index) => ({ text: pair.b, pairId: index })));

    // Create Top Row items (Draggable cards using Pointer Events)
    topItems.forEach((data) => {
      const card = document.createElement('div');
      card.textContent = data.text;
      baseCellStyle(card, cardPx);
      card.style.backgroundColor = 'var(--panel-bg)';
      card.style.border = '2px solid var(--accent-orange-border)';
      card.style.cursor = 'grab';
      card.style.position = 'relative';
      card.style.zIndex = '1';
      cardEls[data.pairId] = card;

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
          if (draggedPairId === targetPairId) resolveMatch(draggedPairId);
          else handleWrongAttempt();
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
      baseCellStyle(target, cardPx);
      target.style.backgroundColor = 'var(--panel-bg)';
      target.style.border = '2px dashed var(--panel-border)';
      targetEls[data.pairId] = target;

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

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'wordmatch',
  titleText: 'EMOJI MATCH',
  tutorialText: 'Drag each top card down onto the matching emoji below it.',
  mount,
};
