import { readPuzzleSettings } from '../puzzleSettings.js';

export const settingsSchema = [
  { key: 'targetSizePercent', label: 'Green zone size (%)', type: 'number', default: 20 },
  { key: 'pointerSpeed', label: 'Pointer speed (duration in sec)', type: 'number', default: 1.5 },
  { key: 'requiredStreak', label: 'Success streak needed', type: 'number', default: 3 },
  { key: 'edgeMarginPercent', label: 'Edge margin (%)', type: 'number', default: 5 },
];

function mount(contentEl, onAttempt, { difficulty } = {}) {
  const settings = readPuzzleSettings('reflexrunner', settingsSchema, difficulty);
  let destroyed = false;
  let currentStreak = 0;
  let animFrameId = null;

  // Pointer position tracking (0 to 1)
  let pointerPos = 0;
  let pointerDir = 1;
  let lastTimestamp = null;

  // Target green zone parameters (0 to 1 range)
  let greenStart = 0;
  let greenEnd = 0;

  const targetSize = Math.max(1, Math.min(90, settings.targetSizePercent)) / 100;
  const edgeMargin = Math.max(0, Math.min(40, settings.edgeMarginPercent)) / 100;
  const targetStreak = Math.max(1, settings.requiredStreak);
  const speed = Math.max(0.2, settings.pointerSpeed);

  // UI Setup
  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';
  promptEl.textContent = `STOP IN GREEN! (${currentStreak}/${targetStreak})`;

  const trackContainer = document.createElement('div');
  trackContainer.style.position = 'relative';
  trackContainer.style.width = '100%';
  trackContainer.style.height = '36px';
  trackContainer.style.backgroundColor = 'var(--panel-bg, #2b2830)';
  trackContainer.style.border = '3px solid var(--panel-border, #4a4060)';
  trackContainer.style.borderRadius = '12px';
  trackContainer.style.overflow = 'hidden';
  trackContainer.style.margin = '16px 0';

  const greenZoneEl = document.createElement('div');
  greenZoneEl.style.position = 'absolute';
  greenZoneEl.style.top = '0';
  greenZoneEl.style.bottom = '0';
  greenZoneEl.style.backgroundColor = '#28a745';
  greenZoneEl.style.borderRadius = '4px';

  const pointerEl = document.createElement('div');
  pointerEl.style.position = 'absolute';
  pointerEl.style.top = '0';
  pointerEl.style.bottom = '0';
  pointerEl.style.width = '6px';
  pointerEl.style.backgroundColor = 'var(--accent-orange-top, #ff8800)';
  pointerEl.style.boxShadow = '0 0 6px #ffffff';
  pointerEl.style.transform = 'translateX(-50%)';

  trackContainer.appendChild(greenZoneEl);
  trackContainer.appendChild(pointerEl);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'puzzle-option-grid';
  buttonContainer.style.gridTemplateColumns = '1fr';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'puzzle-option-btn';
  stopBtn.textContent = 'STOP!';
  stopBtn.style.fontSize = '1.2rem';
  stopBtn.style.padding = '12px';
  stopBtn.addEventListener('click', handleStop);

  buttonContainer.appendChild(stopBtn);

  contentEl.appendChild(promptEl);
  contentEl.appendChild(trackContainer);
  contentEl.appendChild(buttonContainer);

  function resetGreenZone() {
    const minStart = edgeMargin;
    const maxStart = 1 - edgeMargin - targetSize;
    
    if (maxStart <= minStart) {
      greenStart = minStart;
    } else {
      greenStart = minStart + Math.random() * (maxStart - minStart);
    }
    greenEnd = greenStart + targetSize;

    greenZoneEl.style.left = `${greenStart * 100}%`;
    greenZoneEl.style.width = `${targetSize * 100}%`;
  }

  function updateAnimation(timestamp) {
    if (destroyed) return;

    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    // Move pointer back and forth across 0..1
    pointerPos += pointerDir * (deltaTime / speed);

    if (pointerPos >= 1) {
      pointerPos = 1;
      pointerDir = -1;
    } else if (pointerPos <= 0) {
      pointerPos = 0;
      pointerDir = 1;
    }

    pointerEl.style.left = `${pointerPos * 100}%`;

    animFrameId = requestAnimationFrame(updateAnimation);
  }

  function handleStop() {
    if (destroyed) return;

    const isHit = pointerPos >= greenStart && pointerPos <= greenEnd;

    if (isHit) {
      currentStreak++;
      promptEl.textContent = `STOP IN GREEN! (${currentStreak}/${targetStreak})`;

      if (currentStreak >= targetStreak) {
        onAttempt(true);
      } else {
        resetGreenZone();
      }
    } else {
      currentStreak = 0;
      promptEl.textContent = `STOP IN GREEN! (${currentStreak}/${targetStreak})`;
      onAttempt(false);
      resetGreenZone();
    }
  }

  resetGreenZone();
  animFrameId = requestAnimationFrame(updateAnimation);

  return {
    unmount() {
      destroyed = true;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
      }
    },
  };
}

export default {
  id: 'reflexrunner',
  titleText: 'REFLEX RUNNER',
  tutorialText: 'Tap the button when the moving marker is inside the green zone!',
  mount,
};