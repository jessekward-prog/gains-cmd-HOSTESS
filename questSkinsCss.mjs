// The CSS the quest skins need: one variable block per skin, plus the rules
// those variables drive. It lands in src__beta__index.css between the QUEST
// SKINS markers; `node quest.check.mjs` checks the two still agree and
// `node quest.check.mjs --write-skin-css` regenerates it.
//
// Not app code — it takes the skin module as an argument so it can run against
// the flat `src__beta__lib__questSkins.js` without the unfolded layout.

const mix = (c, p, b = 'transparent') => `color-mix(in srgb, ${c} ${p}%, ${b})`;
const decl = (o) => Object.entries(o).filter(([, v]) => v != null)
  .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? `${v}px` : v};`).join('\n');
// React style objects → a CSS declaration body.
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const styleBody = (o, ind = '  ') => Object.entries(o)
  .map(([k, v]) => `${ind}${kebab(k)}: ${typeof v === 'number' ? `${v}px` : v} !important;`).join('\n');

function block(s) {
  const P = s.P;
  return `html.quest-skin-${s.id} {\n${decl({
    '--color-bg-0': P.bg0,
    '--color-bg-1': P.bg1,
    '--color-bg-2': P.bg2,
    '--color-bg-3': P.bg3,
    '--color-bg-4': P.bg3,
    '--color-surface': P.bg1,
    '--color-surface-hover': P.bg2,
    '--color-surface-active': P.bg3,
    '--color-border': P.bg3,
    '--color-border-strong': P.bg3,
    '--color-text-primary': P.tx,
    '--color-text-secondary': P.tx2,
    '--color-text-tertiary': P.tx3,
    '--color-text-muted': P.tx3,
    '--color-accent': P.acc,
    '--color-accent-hover': mix(P.acc, 80, '#fff'),
    '--color-accent-muted': mix(P.acc, 15),
    '--color-accent-glow': mix(P.acc, 40),
    '--color-on-accent': P.on,
    '--color-success': P.ok,
    '--color-error': P.err,
    '--g-ok': P.okFill || mix(P.ok, 42, '#000'),
    '--g-ok-ink': P.okInk || mix(P.ok, 16, '#000'),
    '--g-timer': P.rest,
    '--font-display': P.disp,
    '--theme-meta': P.bg0,
    // Quest-only: the three radii, the card frame, and the chrome accents the
    // rules below pick up. A skin never changes the layout, only these.
    '--q-r-card': P.R,
    '--q-r-btn': P.rb,
    '--q-r-small': P.rs,
    '--q-line': P.line,
    '--q-shadow': P.shadow,
    '--q-label': P.label,
    '--q-battle': P.battle,
    '--q-rest': P.rest,
    '--q-nav-bg': P.navBg,
    '--q-nav-col': P.navCol,
    '--q-lv': s.lvCol,
    '--q-roll': s.roll,
    '--q-head-font': P.serifHead ? "Georgia, 'Times New Roman', serif" : P.disp,
    '--q-head-weight': P.serifHead ? 700 : null,
    '--q-head-case': P.upper ? 'uppercase' : null,
    '--q-bezel': s.st.bezel ? (typeof s.st.bezel === 'string' ? s.st.bezel : '#5b5f6e') : null,
  })}\n}`;
}

// Per-skin button effect. buttonFx() is the same function the stage's tokens
// come from, so the two can't drift.
function fxRule(buttonFx, s) {
  const fx = buttonFx(s.P);
  if (!Object.keys(fx).length) return '';
  return `html.quest-skin-${s.id} .q-cta {\n${styleBody(fx)}\n}`;
}

const STATIC_RULES = `/* The quest screens under a skin: the three radii, the card frame, the
   bezelled stage and the face-button glyphs. Everything else rides the
   variables above, which the existing Tailwind bg- and text- utilities read.
   The html class is only ever set while a quest screen is up (ThemeContext),
   so these need no extra scope of their own. */
html[class*="quest-skin-"] .rounded-\\[28px\\] { border-radius: var(--q-r-card); }
html[class*="quest-skin-"] .rounded-\\[20px\\],
html[class*="quest-skin-"] .rounded-\\[18px\\] { border-radius: var(--q-r-btn); }
html[class*="quest-skin-"] .rounded-\\[14px\\],
html[class*="quest-skin-"] .rounded-\\[12px\\] { border-radius: var(--q-r-small); }
html[class*="quest-skin-"] .q-card { border: var(--q-line); box-shadow: var(--q-shadow); }
html[class*="quest-skin-"] .g-label { color: var(--q-label); }
html[class*="quest-skin-"] .q-head { font-family: var(--q-head-font); font-weight: var(--q-head-weight, 800); text-transform: var(--q-head-case, none); }
html[class*="quest-skin-"] .q-nav { background: var(--q-nav-bg); color: var(--q-nav-col); }
/* The handheld and console skins put the stage behind a moulded bezel. */
html[class*="quest-skin-"] .q-bezel { padding: 8px 8px 4px; border-radius: 10px 10px 30px 10px; background: var(--q-bezel); box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
html[class*="quest-skin-"].scr-roll::before { background: linear-gradient(transparent 0%, var(--q-roll) 50%, transparent 100%); }
/* Console 2000's face buttons: a square tile before the label. */
.q-glyph { display: inline-flex; width: 20px; height: 20px; margin-right: 8px; align-items: center; justify-content: center; vertical-align: middle; background: #0b0b0d; box-shadow: 0 0 0 2px #0b0b0d; font: 700 12px 'Manrope', system-ui, sans-serif; line-height: 1; }
.q-glyph-t { color: #40c890; } .q-glyph-c { color: #ff5a5a; } .q-glyph-x { color: #6a9cff; } .q-glyph-s { color: #f08ad8; }
/* The rubber stamp that replaces the damage number on Field Journal. */
@keyframes qs-stamp { 0% { transform: scale(2.2) rotate(-14deg); opacity: 0; } 60% { transform: scale(.92) rotate(-6deg); opacity: 1; } 100% { transform: scale(1) rotate(-6deg); opacity: 1; } }`;

export function skinCss({ SKINS, buttonFx }) {
  return [
    '/* ============================================',
    '   QUEST SKINS — generated, do not hand-edit',
    '   Source: questSkinsCss.mjs — node quest.check.mjs --write-skin-css',
    '   ============================================ */',
    ...SKINS.map(block),
    ...SKINS.map((s) => fxRule(buttonFx, s)).filter(Boolean),
    STATIC_RULES,
  ].join('\n\n');
}
