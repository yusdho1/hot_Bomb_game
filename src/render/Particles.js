// Plain DOM/CSS particle bursts — no Phaser dependency, safe to import from anywhere in
// src/render/. Each piece is a throwaway <div>, self-removing once its own CSS animation ends.
const CONFETTI_COLORS = ['#ffe066', '#ff8800', '#a685e2', '#ff8fb1', '#5ce1e6', '#6bcb77', '#ffa552'];

export function spawnConfetti(containerEl, count = 36) {
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.setProperty('--fall-duration', `${1.4 + Math.random() * 1.2}s`);
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`);
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.addEventListener('animationend', () => piece.remove());
    containerEl.appendChild(piece);
  }
}

// xPercent/yPercent locate the burst center within containerEl (which must be position:relative
// or position:absolute for percentage-based positioning to land correctly).
export function spawnExplosionBurst(containerEl, xPercent = 50, yPercent = 50, count = 18) {
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'explosion-particle';
    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 70;
    particle.style.left = `${xPercent}%`;
    particle.style.top = `${yPercent}%`;
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    particle.style.animationDelay = `${Math.random() * 0.08}s`;
    particle.addEventListener('animationend', () => particle.remove());
    containerEl.appendChild(particle);
  }
}
