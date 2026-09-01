import { readPuzzleSettings } from '../puzzleSettings.js';

// Colors are schema fields (not hardcoded hex) per DESIGN_GUIDELINES.md — defaults match Stroop's
// palette so wires read as visually "the same family" as that puzzle's swatches.
export const settingsSchema = [
  { key: 'colorRed', label: 'Red wire', type: 'color', default: '#f02e19' },
  { key: 'colorBlue', label: 'Blue wire', type: 'color', default: '#1148ee' },
  { key: 'colorYellow', label: 'Yellow wire', type: 'color', default: '#e8d721' },
  { key: 'colorGreen', label: 'Green wire', type: 'color', default: '#3be421' },
  { key: 'colorPurple', label: 'Purple wire', type: 'color', default: '#6e0099' },
  { key: 'colorOrange', label: 'Orange wire', type: 'color', default: '#ffa200' },
  { key: 'wireCount', label: 'Number of wires (3-6)', type: 'number', default: 4 },
  {
    key: 'complexRuleChance',
    label: 'Chance of a position/relational rule vs a plain color rule (0-100)',
    type: 'number',
    default: 50,
  },
];

const ORDINALS = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('wirecut', settingsSchema, difficulty);
  const ALL_COLORS = [
    { name: 'RED', hex: settings.colorRed },
    { name: 'BLUE', hex: settings.colorBlue },
    { name: 'YELLOW', hex: settings.colorYellow },
    { name: 'GREEN', hex: settings.colorGreen },
    { name: 'PURPLE', hex: settings.colorPurple },
    { name: 'ORANGE', hex: settings.colorOrange },
  ];
  const WIRE_COUNT = Math.max(3, Math.min(ALL_COLORS.length, Math.round(settings.wireCount)));
  const COMPLEX_RULE_CHANCE = settings.complexRuleChance;

  let destroyed = false;
  let wires = []; // [{ color }], left to right
  let correctIndex = -1;

  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';

  const rowEl = document.createElement('div');
  rowEl.className = 'wirecut-row';

  contentEl.appendChild(promptEl);
  contentEl.appendChild(rowEl);

  // Height is measured (real leftover space after the prompt), same fix Stroop/Swipe already
  // apply — a fixed cqh percentage has no idea how much of the box the title/timer/dots chrome
  // above already used. Width per wire is left to flexbox (flex:1 + gap + max-width in CSS),
  // which doesn't need JS measurement the way an explicit pixel grid would.
  function sizeRow() {
    const contentRect = contentEl.getBoundingClientRect();
    const promptHeight = promptEl.getBoundingClientRect().height;
    const CONTENT_GAP = 16; // matches .puzzle-content's CSS gap
    const heightBudget = contentRect.height - promptHeight - CONTENT_GAP;
    rowEl.style.height = `${Math.max(120, heightBudget)}px`;
  }

  // Picks a rule that always has exactly one valid wire, by construction:
  // - 'color': name a wire's color directly.
  // - 'position': name its position counting from the left or right edge.
  // - 'relational': name the wire immediately left/right of a (different) named-color wire —
  //   only offered in a direction that wire actually has a neighbor in.
  function pickRule() {
    const useComplex = Math.random() * 100 < COMPLEX_RULE_CHANCE;

    if (!useComplex) {
      const target = Math.floor(Math.random() * wires.length);
      return { targetIndex: target, text: `CUT THE ${wires[target].color.name} WIRE!` };
    }

    if (Math.random() < 0.5) {
      const pos = Math.floor(Math.random() * wires.length);
      const fromRight = Math.random() < 0.5;
      const targetIndex = fromRight ? wires.length - 1 - pos : pos;
      const ordinal = ORDINALS[pos];
      return {
        targetIndex,
        text: `CUT THE ${ordinal} WIRE FROM THE ${fromRight ? 'RIGHT' : 'LEFT'}!`,
      };
    }

    const refIndex = Math.floor(Math.random() * wires.length);
    const canLeft = refIndex > 0;
    const canRight = refIndex < wires.length - 1;
    const goRight = canRight && (!canLeft || Math.random() < 0.5);
    const targetIndex = goRight ? refIndex + 1 : refIndex - 1;
    return {
      targetIndex,
      text: `CUT THE WIRE TO THE ${goRight ? 'RIGHT' : 'LEFT'} OF THE ${wires[refIndex].color.name} ONE!`,
    };
  }

  function nextRound() {
    if (destroyed) return;

    wires = shuffle(ALL_COLORS)
      .slice(0, WIRE_COUNT)
      .map((color) => ({ color }));

    const rule = pickRule();
    correctIndex = rule.targetIndex;
    promptEl.textContent = rule.text;

    rowEl.innerHTML = '';
    sizeRow();
    wires.forEach((wire, i) => {
      const btn = document.createElement('button');
      btn.className = 'wirecut-wire';
      // backgroundColor (longhand), not the `background` shorthand — the shorthand implicitly
      // resets background-image to none, which would silently blank out the shine/shadow layers
      // .wirecut-wire-shine/.wirecut-wire below.
      btn.style.backgroundColor = wire.color.hex;
      const shine = document.createElement('div');
      shine.className = 'wirecut-wire-shine';
      btn.appendChild(shine);
      btn.addEventListener('click', () => handleCut(i));
      rowEl.appendChild(btn);
    });
  }

  function handleCut(index) {
    if (destroyed) return;
    onAttempt(index === correctIndex);
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

// A registered minigame module: { id, titleImg|titleText, tutorialText, mount(contentEl, onAttempt, { difficulty }) => {unmount} }
// See tools/mod-tool/README.md for the full contract this must satisfy.
export default {
  id: 'wirecut',
  titleImg: '/UI/WIRE CUT.png',
  tutorialText: 'Read the rule, then tap the one wire it describes — by color, position, or next to another wire.',
  mount,
};
