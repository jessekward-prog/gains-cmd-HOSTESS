// Sarah's Theme: a soft blush ring blooms out of the card when something is completed.
// Drawn as a fixed overlay at the card's rect so the card's overflow-hidden can't clip it.

let lastTap = null;
document.addEventListener('pointerdown', (e) => { lastTap = e.target; }, true);

// Classic/beta list cards (exercise, superset, cardio) and beta's Focus card
const CARD = '.max-w-full.border.overflow-hidden, .rounded-\\[28px\\].bg-bg-1';

export function bloom() {
  if (!document.documentElement.classList.contains('theme-sage')) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!lastTap?.isConnected) return;
  petals(lastTap.getBoundingClientRect());
  const card = lastTap.closest(CARD);
  if (!card) return;
  const r = card.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'sage-bloom';
  Object.assign(el.style, {
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    borderRadius: getComputedStyle(card).borderRadius,
  });
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

const PETAL_TONES = [['#fde8e5', '#e9a39c'], ['#fbd9d4', '#dc8b84'], ['#fff3f0', '#efb9b2']];

// A handful of peony petals scatter from the tapped control, drift up and turn as they fade.
function petals(from) {
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  for (let i = 0; i < 16; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6; // mostly upward
    const dist = 90 + Math.random() * 90;
    const size = 12 + Math.random() * 8;
    const [light, deep] = PETAL_TONES[i % PETAL_TONES.length];
    const el = document.createElement('div');
    el.className = 'sage-petal';
    Object.assign(el.style, {
      left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size * 1.25}px`,
      background: `linear-gradient(140deg, ${light}, ${deep})`,
    });
    document.body.appendChild(el);
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    const spin = (Math.random() - 0.5) * 540;
    el.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(0.3)', opacity: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) rotate(${spin * 0.25}deg) scale(1)`, opacity: 0.9, offset: 0.15 },
      { transform: `translate(${dx * 0.85}px, ${dy * 0.85 + 10}px) rotate(${spin * 0.75}deg) scale(0.95)`, opacity: 0.9, offset: 0.7 },
      { transform: `translate(${dx}px, ${dy + 30}px) rotate(${spin}deg) scale(0.8)`, opacity: 0 },
    ], { duration: 2800 + Math.random() * 1000, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', delay: Math.random() * 80 })
      .onfinish = () => el.remove();
  }
}
