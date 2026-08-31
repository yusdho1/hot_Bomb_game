import { readPuzzleSettings } from '../puzzleSettings.js';
import { SoundManager } from '../../SoundManager.js';

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

function mount(contentEl, onAttempt, { difficulty, streakTarget } = {}) {
  const settings = readPuzzleSettings('wordmatch', settingsSchema, difficulty);
  const pairsPerRound = Math.max(2, settings.pairsPerRound);
  const cols = Math.min(pairsPerRound, 4);
  const passCount = Math.max(1, streakTarget || 3);

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
  //
  // Passing the bomb requires clearing every pair in the round, not just landing streakTarget
  // individual matches in a row (which could — and did — pass the bomb mid-board on an easy
  // 2-pair round while leaving the rest of a 6-pair hard round unsolved). So an individual match
  // doesn't call onAttempt at all; only finishing the whole board does, firing onAttempt(true)
  // passCount times in a row to satisfy the shared streak-to-pass counter in one shot.
  function resolveMatch(pairId) {
    cardEls[pairId]?.remove();
    targetEls[pairId]?.remove();
    delete cardEls[pairId];
    delete targetEls[pairId];
    remainingPairIds.delete(pairId);
    // Immediate positive feedback per pair, played directly rather than through onAttempt (which
    // would prematurely advance the shared streak-to-pass counter — see the note above).
    SoundManager.playSmallSuccess();
    if (remainingPairIds.size === 0) {
      for (let i = 0; i < passCount; i++) onAttempt(true);
      nextRound();
    }
  }

  function handleWrongAttempt() {
    if (destroyed) return;
    onAttempt(false);
    // Board stays as-is — the dragged card already snapped back to its start position in
    // handlePointerEnd, so the player just retries against the same set.
  }

  // Every card is both draggable AND a valid drop target (data-drop-pair-id), so the player can
  // drag either direction — a top card down onto its bottom match, or a bottom card up onto its
  // top match. The two rows only differ visually (solid vs dashed border, purely a "these are the
  // two groups" cue) — behaviorally there's no source/target distinction any more.
  function createCard(text, pairId, cardPx, dashed) {
    const card = document.createElement('div');
    card.textContent = text;
    card.dataset.dropPairId = pairId;
    baseCellStyle(card, cardPx);
    card.style.backgroundColor = 'var(--panel-bg)';
    card.style.border = dashed ? '2px dashed var(--panel-border)' : '2px solid var(--accent-orange-border)';
    card.style.cursor = 'grab';
    card.style.position = 'relative';
    card.style.zIndex = '1';

    card.addEventListener('pointerdown', (e) => {
      if (activePointer) return;
      activePointer = {
        pointerId: e.pointerId,
        pairId,
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

      const draggedCard = activePointer.card;
      draggedCard.releasePointerCapture(e.pointerId);
      draggedCard.style.transform = 'translate(0px, 0px)';
      draggedCard.style.opacity = '1';
      draggedCard.style.zIndex = '1';

      // Find drop target under current pointer location
      draggedCard.style.pointerEvents = 'none';
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      draggedCard.style.pointerEvents = 'auto';

      const dropZone = targetEl ? targetEl.closest('[data-drop-pair-id]') : null;
      const draggedPairId = activePointer.pairId;
      activePointer = null;

      // dropZone !== draggedCard guards against a card releasing over itself (it's now a drop
      // target too, unlike before when only the bottom row carried data-drop-pair-id) — same
      // pairId as itself would otherwise read as a false "match".
      if (dropZone && dropZone !== draggedCard) {
        const targetPairId = parseInt(dropZone.dataset.dropPairId, 10);
        if (draggedPairId === targetPairId) resolveMatch(draggedPairId);
        else handleWrongAttempt();
      }
    };

    card.addEventListener('pointerup', handlePointerEnd);
    card.addEventListener('pointercancel', handlePointerEnd);

    return card;
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

    topItems.forEach((data) => {
      const card = createCard(data.text, data.pairId, cardPx, false);
      cardEls[data.pairId] = card;
      topRow.appendChild(card);
    });

    bottomItems.forEach((data) => {
      const card = createCard(data.text, data.pairId, cardPx, true);
      targetEls[data.pairId] = card;
      bottomRow.appendChild(card);
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
  titleImg: '/UI/EMOJI MATCH.png',
  tutorialText: 'Drag each card onto its matching emoji, from either row, until the whole board is cleared.',
  mount,
};
