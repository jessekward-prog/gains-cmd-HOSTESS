import { useEffect, useState } from 'react';
import BodyMap from './BodyMap';
import useWeeklyBoss from '../hooks/useWeeklyBoss';
import useQuest from '../hooks/useQuest';
import { useHaptics } from '../hooks/useHaptics';
import { useFrame } from './QuestHeroCard';
import { placeLayers } from './QuestScene';
import Ticker from './Ticker';
import { ASSET, BOSS_GROUPS, BOSS_GROUP_SETS, BOSS_SPRITES, BOSS_WORDS, bossSprite } from '../lib/quest';

const MONO = 'var(--font-mono)';
export const BOSS_H = 104; // fixed: nothing on the screen moves when it attacks
// [face x, face y] in the sprite's idle frame, and the close-up's zoom.
const FACE = { dslime: [114, 60, 3], golem: [43, 11, 5], frost: [88, 33, 3], minotaur: [117, 56, 3], necro: [33, 62, 5], cp_enforcer: [59, 9, 4], cp_bruiser: [19, 9, 5] };
const LAIR = { dslime: 'ember', golem: 'cavern', frost: 'cavern', minotaur: 'dunes', necro: 'graves' };
const BACK = ['upperBack', 'hamstring', 'gluteal', 'triceps'];
const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Any CSS colour as [r, g, b], its alpha dropped: the Quest accent is 25% by default.
const rgbOf = (css) => {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d'); g.fillStyle = css; g.fillRect(0, 0, 1, 1);
  return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};
// The sprite in five flat shades of the accent, the way the skins colour the rest of the stage.
const SHADES = [0.12, 0.3, 0.55, 0.85, 1.1]; // above 1 is lightened
const luma = (p, k) => (0.3 * p[k] + 0.59 * p[k + 1] + 0.11 * p[k + 2]) / 255;
const cache = new Map(); // `${sprite}|${anim}|${rgb}` → Promise of frames
const frames = (key, anim, rgb) => {
  const id = `${key}|${anim}|${rgb}`;
  if (!cache.has(id)) cache.set(id, (async () => {
    const raw = await Promise.all(Array.from({ length: BOSS_SPRITES[key].n[anim] }, async (_, i) => {
      const im = new Image(); im.src = `${ASSET}sprites/boss_${key}_${anim}_${i}.png`; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      return { c, g, d: g.getImageData(0, 0, c.width, c.height) };
    }));
    // Levels from the first frame, so a near-black boss uses every shade too.
    const ls = []; { const p = raw[0].d.data; for (let k = 0; k < p.length; k += 4) if (p[k + 3]) ls.push(luma(p, k)); }
    ls.sort((x, y) => x - y);
    const lo = ls[Math.floor(ls.length * 0.04)], hi = Math.max(lo + 0.1, ls[Math.floor(ls.length * 0.95)]);
    return Promise.all(raw.map(async ({ c, g, d }) => {
      const p = d.data;
      for (let k = 0; k < p.length; k += 4) {
        if (!p[k + 3]) continue;
        const s = SHADES[Math.max(0, Math.min(4, Math.floor(((luma(p, k) - lo) / (hi - lo)) * 4.6)))];
        for (let j = 0; j < 3; j++) p[k + j] = s > 1 ? rgb[j] + (255 - rgb[j]) * (s - 1) * 2 : rgb[j] * s;
      }
      g.putImageData(d, 0, 0);
      const out = new Image(); out.src = c.toDataURL(); await out.decode(); // so a swap never blinks
      return out;
    }));
  })());
  return cache.get(id);
};

// The weekly boss: the muscle it has come for, and the boss itself close up in
// the accent colour. It loses a block of HP per fight won. Tap and it attacks
// (beaten, it dies again). `skin` colours the lair behind it like the stage.
export default function BossPanel({ skin }) {
  const { boss, nextAt, beaten } = useWeeklyBoss();
  const { prof } = useQuest();
  const haptics = useHaptics();
  const frame = useFrame();
  const [tapAt, setTapAt] = useState(-1e4); // the frame it was last tapped on
  const [accent, setAccent] = useState('');
  const [art, setArt] = useState({});
  const key = bossSprite(boss?.week || '2026-01-05', prof.theme);
  const act = beaten ? (BOSS_SPRITES[key].n.death ? 'death' : null) : 'atk';
  const slow = Math.floor(frame / 10);
  useEffect(() => { // the accent can change under it: Quest's own theme lands after the first paint
    const a = String(rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#ff2222'));
    if (a !== accent) setAccent(a);
  }, [slow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!accent || !boss) return undefined;
    let live = true;
    const rgb = accent.split(',').map(Number);
    setArt({});
    ['idle', act].filter(Boolean).forEach((a) => frames(key, a, rgb).then((f) => { if (live) setArt((s) => ({ ...s, [a]: f })); }, () => {}));
    return () => { live = false; };
  }, [key, act, accent, !boss]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!boss) return null;
  const spr = BOSS_SPRITES[key], [fx, fy, z] = FACE[key];
  const left = beaten ? 0 : Math.max(0, BOSS_GROUPS - boss.fights.length);
  const wait = nextAt && nextAt > Date.now() ? Math.ceil((nextAt - Date.now()) / 3600e3) : 0;
  const since = frame - tapAt; // frames of 100 ms
  const acting = act && art[act] && since >= 0 && since < spr.n[act] + 2;
  const talking = !beaten && since >= 0 && since < 48;
  const img = acting ? art[act][Math.min(spr.n[act] - 1, since)] : art.idle?.[still || beaten ? 0 : Math.floor(frame / (wait ? 3 : 1.5)) % spr.n.idle];
  const lunge = !still && acting && !beaten ? Math.sin(Math.PI * Math.min(1, since / spr.n.atk)) : 0;
  const shake = !still && acting && !beaten && since > 1 && since < 9 ? (since % 2 ? 3 : -3) : 0;
  const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(frame / 5);
  const full = accent ? `rgb(${accent})` : 'var(--color-accent)';
  const line = beaten ? 'var(--color-success)' : full;
  // The battle screen's own HP bar (QuestStage `bar`), skin and all; the default skin's fill is the accent.
  const hud = skin || {}, hp = left / BOSS_GROUPS, hpCol = !hud.hp || hud.hp === 'classic' ? full : hud.hp;
  const words = BOSS_WORDS[boss.region];
  const cry = boss.cry || `It has come for your ${words}.`;
  const info = beaten ? 'Beaten this week · +1 card pack claimed · A new boss rises on Monday'
    : `“${cry}” · ${words}: ${boss.exercise}, ${BOSS_GROUP_SETS} set to failure · ${wait ? `back in ${wait} h` : 'fight it at the start of your next workout'} · win ${BOSS_GROUPS} fights for a card pack`;
  return (
    <button onClick={() => { setTapAt(frame); haptics.success(); }} aria-label={`Weekly boss: ${boss.name}. ${beaten ? 'Defeated.' : `${left} of ${BOSS_GROUPS} HP left.`} ${info}`}
      className="relative flex items-center w-full text-left overflow-hidden rounded-[22px] bg-bg-1" style={{ height: BOSS_H, transform: shake ? `translateX(${shake}px)` : undefined }}>
      <span data-ascii="skip" className="absolute inset-0 block" aria-hidden="true" style={{ opacity: beaten ? 0.5 : 1 }}>
        <span className="absolute inset-0" style={{ opacity: 0.4, maskImage: 'linear-gradient(90deg, transparent 38%, #000 80%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 38%, #000 80%)' }}>
          {LAIR[key] && skin && placeLayers(LAIR[key], skin).map((l, i) => (
            <span key={i} className="absolute inset-0" style={{ backgroundImage: l.img, backgroundSize: 'auto 160%', backgroundPosition: '62% 100%', imageRendering: 'pixelated' }} />
          ))}
        </span>
        <span className="absolute inset-0" style={{ background: `radial-gradient(circle at calc(100% - 74px) 46%, ${full}, transparent 96px)`, opacity: wait ? 0.1 : 0.16 + 0.1 * pulse + lunge * 0.25 }} />
        {img && <span className="absolute block" style={{
          left: `calc(100% - 74px - ${fx * z}px)`, top: 46 - fy * z, width: spr.w * z, height: spr.h * z, backgroundImage: `url(${img.src})`, backgroundSize: '100% 100%', imageRendering: 'pixelated',
          transformOrigin: `${fx * z}px ${fy * z}px`, transform: `translate(${-lunge * 22}px, ${lunge * 10}px) scale(${1 + lunge * 0.14})`, filter: `brightness(${wait ? 0.5 : 0.68 + lunge * 0.32})`, // full strength only as it attacks
        }} />}
        <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 56%, transparent 82%)' }} />
      </span>
      <span className="relative flex-shrink-0 block" style={{ width: 62, '--boss': full }}>
        <span className="block" style={{ '--color-accent': 'var(--boss)', '--color-bg-3': 'var(--color-border)', '--color-bg-4': 'var(--color-border-strong)' }}>
          <BodyMap heat={{ [boss.region]: 1 }} height={76} sides={[BACK.includes(boss.region) ? 'back' : 'front']} />
        </span>
      </span>
      <span className="relative block min-w-0" style={{ width: 'calc(100% - 62px - 118px)' }}>
        <span className="block whitespace-nowrap" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em', color: line }}>{beaten ? 'BOSS DEFEATED' : wait ? `RECOVERING · ${wait} H` : 'WEEKLY BOSS'}</span>
        <span className="block truncate" style={{ marginTop: 2, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{boss.name}</span>
        {talking ? (
          <span className="block text-text-primary" style={{ marginTop: 2, height: 37, font: `500 12px/1.5 ${MONO}` }}>“{still ? cry : cry.slice(0, since * 3)}{still || since * 3 >= cry.length ? '”' : '_'}</span>
        ) : (
          <span className="block" style={{ marginTop: 2, height: 37 }}>
            <span className="flex text-text-secondary" style={{ font: `400 11px/1.6 ${MONO}` }}><Ticker>{info}</Ticker></span>
            <span className="flex items-center" style={{ marginTop: 6, gap: 6, fontFamily: MONO, maxWidth: 190 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: hud.hpLab, letterSpacing: '.08em' }}>HP</span>
              {hud.seg ? (
                <span className="flex-1 flex" style={{ gap: 2 }}>
                  {Array.from({ length: 10 }, (_, i) => <span key={i} className="flex-1" style={{ height: 8, background: i < Math.ceil(hp * 10) ? hpCol : hud.segOff }} />)}
                </span>
              ) : (
                <span className="flex-1 block overflow-hidden" style={{ height: 6, background: hud.hpTrack, borderRadius: hud.hatch ? 0 : 3, border: hud.hatch ? `1.5px solid ${hud.boxTxt}` : 'none' }}>
                  <span className="block h-full" style={{ width: `${hp * 100}%`, background: hud.hatch ? `repeating-linear-gradient(45deg, ${hpCol} 0 2px, transparent 2px 4px)` : hpCol, transition: 'width .5s cubic-bezier(.2,1,.3,1)' }} />
                </span>
              )}
              <span className="text-text-secondary" style={{ fontSize: 11 }}>{left} / {BOSS_GROUPS}</span>
            </span>
          </span>
        )}
      </span>
      {beaten && <span className="absolute" aria-hidden="true" style={{ right: 26, top: 36, padding: '2px 10px', border: `2px solid ${line}`, color: line, font: `700 17px ${MONO}`, letterSpacing: '.1em', transform: 'rotate(-8deg)', background: 'var(--color-bg-1)' }}>SLAIN</span>}
      <span className="absolute inset-0 rounded-[22px] pointer-events-none" style={{ boxShadow: `inset 0 0 0 1.5px ${line}` }} />
    </button>
  );
}
