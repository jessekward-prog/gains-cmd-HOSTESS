// ascii-reveal announces its wave on the document (`asciireveal`, detail.active)
// so other effects can stand down. Everything under the wave is hidden behind
// the glyph grid while it runs, so animating it is cost nobody can see — and on
// a phone it's the difference between a smooth decode and a stuttering one.
//
// The flag expires on its own: a missed `active: false` (an unmounted wrapper,
// a thrown listener) would otherwise freeze the stage for good.
let until = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('asciireveal', (e) => { until = e.detail?.active ? Date.now() + 3000 : 0; }, true);
}
export const revealing = () => Date.now() < until;
