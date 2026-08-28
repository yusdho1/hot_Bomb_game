// Scaffolded by the mod tool — fill in mount() below, then it's already wired into rotation.
// Contract: mount(contentEl, onAttempt) is called once per turn the local holder is given this
// puzzle. Render your puzzle's DOM into contentEl, and call onAttempt(true|false) every time the
// player makes an attempt (right or wrong — the shared chrome around you owns the streak/timer,
// you just report each attempt). Return { unmount() {...} } to clean up your own listeners/timers
// when the turn ends (success, elimination, or the whole match ending).
function mount(contentEl, onAttempt) {
  let destroyed = false;

  // TODO: build your puzzle's DOM and append it to contentEl.
  const promptEl = document.createElement('div');
  promptEl.className = 'puzzle-prompt';
  promptEl.textContent = 'TODO: replace me with a real prompt';
  contentEl.appendChild(promptEl);

  function nextRound() {
    // TODO: set up the next attempt (new prompt, new correct answer, etc).
  }

  function handleAttempt(success) {
    if (destroyed) return;
    onAttempt(success);
    nextRound();
  }

  nextRound();

  return {
    unmount() {
      destroyed = true;
      // TODO: remove any event listeners / clear any timers you started.
    },
  };
}

// A registered minigame module: { id, titleImg|titleText, mount(contentEl, onAttempt) => {unmount} }
// titleImg points at a banner image under public/UI/ (matches the other puzzles' style); use
// titleText instead for a plain text banner if you don't have art yet.
export default {
  id: '__ID__',
  titleText: '__TITLE__',
  mount,
};
