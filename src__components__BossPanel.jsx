import { useEffect, useState } from 'react';
import useWeeklyBoss from '../hooks/useWeeklyBoss';
import useQuest from '../hooks/useQuest';
import { useHaptics } from '../hooks/useHaptics';
import { useFrame } from './QuestHeroCard';
import { preloadBoss } from './QuestStage';
import { placeLayers } from './QuestScene';
import Ticker from './Ticker';
import { ASSET, BOSS_GROUPS, BOSS_GROUP_SETS, BOSS_SPRITES, BOSS_WORDS, bossSprite } from '../lib/quest';

const MONO = 'var(--font-mono)';
export const BOSS_H = 104; // fixed: nothing on the screen moves when it roars
// [face x, face y] in the sprite's idle frame, and the close-up's zoom.
const FACE = { dslime: [114, 60, 3], golem: [43, 11, 5], frost: [88, 33, 3], minotaur: [117, 56, 3], necro: [33, 62, 5], cp_enforcer: [59, 9, 4], cp_bruiser: [19, 9, 5] };
const LAIR = { dslime: 'ember', golem: 'cavern', frost: 'cavern', minotaur: 'dunes', necro: 'graves' };
const EMBERS = Array.from({ length: 9 }, (_, i) => [30 + (i * 37) % 68, (i * 53) % 40 / 10, 2.6 + (i % 4) * 0.5, i % 3 ? 2 : 3]);
const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The weekly boss in its lair, close up: it glares until you fight it, loses a
// block of HP per fight won, and hangs dead once it's beaten. Tap and it attacks
// (beaten, it dies again). `skin` colours the lair like the stage.
export default function BossPanel({ skin }) {
  const { boss, wk, nextAt, beaten } = useWeeklyBoss();
  const { prof } = useQuest();
  const haptics = useHaptics();
  const frame = useFrame();
  const [tapAt, setTapAt] = useState(-1e4); // the frame it was last tapped on
  const key = bossSprite(wk, prof.theme);
  const [ready, setReady] = useState(false); // its action's frames are decoded, so it never blinks out mid-swing
  const act = beaten ? (BOSS_SPRITES[key].n.death ? 'death' : null) : 'atk';
  useEffect(() => {
    preloadBoss(key);
    if (!act) return undefined;
    let live = true;
    const ims = Array.from({ length: BOSS_SPRITES[key].n[act] }, (_, i) => { const im = new Image(); im.src = `${ASSET}sprites/boss_${key}_${act}_${i}.png`; return im; });
    Promise.all(ims.map((im) => im.decode())).then(() => { if (live) setReady(ims); }, () => {});
    return () => { live = false; setReady(false); };
  }, [key, act]);
  if (!boss) return null;
  const spr = BOSS_SPRITES[key], [fx, fy, z] = FACE[key];
  const left = Math.max(0, BOSS_GROUPS - boss.fights.length);
  const wait = nextAt && nextAt > Date.now() ? Math.ceil((nextAt - Date.now()) / 3600e3) : 0;
  const since = frame - tapAt; // frames of 100 ms
  const acting = act && ready && since >= 0 && since < spr.n[act] + 2;
  const talking = !beaten && since >= 0 && since < 48;
  const src = (a, i) => `url(${ASSET}sprites/boss_${key}_${a}_${i}.png)`;
  const img = acting ? src(act, Math.min(spr.n[act] - 1, since)) : src('idle', still || beaten ? 0 : Math.floor(frame / (wait ? 3 : 1.5)) % spr.n.idle);
  const lunge = !still && acting && !beaten ? Math.sin(Math.PI * Math.min(1, since / spr.n.atk)) : 0;
  const shake = !still && acting && !beaten && since > 1 && since < 9 ? (since % 2 ? 4 : -4) : 0;
  const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(frame / 5);
  const line = beaten ? 'var(--color-success)' : '#ff2222';
  const cry = boss.cry || `It has come for your ${BOSS_WORDS[boss.region]}.`;
  const words = BOSS_WORDS[boss.region];
  const info = beaten ? 'Beaten this week · +1 card pack claimed · A new boss rises on Monday'
    : `${words[0].toUpperCase()}${words.slice(1)}: ${boss.exercise}, ${BOSS_GROUP_SETS} set to failure · ${wait ? `Back in ${wait} h` : 'Fight it at the start of your next workout'} · Win ${BOSS_GROUPS} fights for a card pack`;
  return (
    <button onClick={() => { setTapAt(frame); haptics.success(); }} aria-label={`Weekly boss: ${boss.name}. ${beaten ? 'Defeated.' : `${left} of ${BOSS_GROUPS} HP left.`} ${info}`}
      className="relative block w-full text-left overflow-hidden rounded-[22px]" style={{ height: BOSS_H, background: '#050202', color: '#f6ece0', transform: shake ? `translateX(${shake}px)` : undefined }}>
      <span data-ascii="skip" className="absolute inset-0 block" aria-hidden="true">
        {LAIR[key] && skin && placeLayers(LAIR[key], skin).map((l, i) => (
          <span key={i} className="absolute inset-0" style={{ backgroundImage: l.img, backgroundSize: 'auto 160%', backgroundPosition: '62% 100%', imageRendering: 'pixelated' }} />
        ))}
        <span className="absolute inset-0" style={{ background: beaten ? 'rgba(0,0,0,.35)' : 'rgba(120,0,0,.62)', mixBlendMode: beaten ? 'normal' : 'multiply' }} />
        {!beaten && <span className="absolute inset-0" style={{ background: `radial-gradient(circle at calc(100% - 86px) 46%, ${spr.glow}, transparent 120px)`, opacity: 0.55 + 0.45 * pulse + lunge * 0.5 }} />}
        <span className="absolute block" style={{
          left: `calc(100% - 86px - ${fx * z}px)`, top: 46 - fy * z, width: spr.w * z, height: spr.h * z, backgroundImage: img, backgroundSize: '100% 100%', imageRendering: 'pixelated',
          transformOrigin: `${fx * z}px ${fy * z}px`, transform: `translate(${-lunge * 26}px, ${lunge * 10}px) scale(${1 + lunge * 0.16})`,
          filter: beaten ? `grayscale(1) brightness(${acting ? 1.7 : 1.4})` : `drop-shadow(0 0 2px ${spr.glow}) drop-shadow(0 0 ${7 + pulse * 7}px ${spr.glow}) brightness(${wait ? 0.6 : 1.25 + lunge * 0.5})`,
        }} />
        {!beaten && !still && EMBERS.map(([x, d, t, s], i) => <span key={i} className="boss-ember absolute" style={{ left: `${x}%`, width: s, height: s, animationDelay: `${-d}s`, animationDuration: `${t}s` }} />)}
        <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(5,2,2,.95) 30%, rgba(5,2,2,.78) 54%, rgba(5,2,2,0) 74%)' }} />
      </span>
      <span className="absolute flex flex-col justify-center" style={{ left: 16, top: 0, bottom: 0, width: 'min(60%, calc(100% - 146px))' }}>
        <span className="flex items-center gap-1.5 whitespace-nowrap" style={{ font: `600 11px ${MONO}`, letterSpacing: '.1em', color: beaten ? line : '#ff6a5c' }}>
          {!beaten && !wait && <span style={{ width: 7, height: 7, background: '#ff2222', opacity: 0.35 + 0.65 * pulse }} />}
          {beaten ? 'BOSS DEFEATED' : wait ? `RECOVERING · ${wait} H` : 'WEEKLY BOSS'}
        </span>
        <span className="block truncate" style={{ marginTop: 3, fontSize: 23, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15, textShadow: '0 2px 0 #000' }}>{boss.name}</span>
        {talking ? (
          <span className="block" style={{ marginTop: 4, minHeight: 38, fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: '#ffd2a6', textShadow: '0 1px 4px #000' }}>“{still ? cry : cry.slice(0, since * 3)}{still || since * 3 >= cry.length ? '”' : '_'}</span>
        ) : (
          <span className="block" style={{ marginTop: 6, minHeight: 36 }}>
            <span className="flex items-center gap-2" style={{ font: `700 11px ${MONO}` }}>
              <span style={{ color: '#f59e0b' }}>HP</span>
              <span className="flex flex-1 gap-1" style={{ maxWidth: 150 }}>
                {Array.from({ length: BOSS_GROUPS }, (_, i) => (
                  <span key={i} className="flex-1" style={{ height: 9, background: i < left && !beaten ? 'linear-gradient(#ff7a5c 0 34%, #ff2222 34% 72%, #b40f0f 72%)' : '#2a1010', boxShadow: '0 0 0 1.5px #000, 0 0 0 2.5px rgba(246,236,224,.4)' }} />
                ))}
              </span>
            </span>
            <span className="flex" style={{ marginTop: 8, font: `400 12px ${MONO}`, color: '#ffd2a6' }}><Ticker>{info}</Ticker></span>
          </span>
        )}
      </span>
      {beaten && <span className="absolute" aria-hidden="true" style={{ right: 18, top: 56, padding: '3px 10px', border: '2.5px solid #fbbf24', color: '#fbbf24', fontSize: 19, fontWeight: 800, letterSpacing: '.02em', transform: 'rotate(-9deg)', background: 'rgba(0,0,0,.55)' }}>SLAIN</span>}
      <span className="absolute inset-0 rounded-[22px] pointer-events-none" style={{ boxShadow: `inset 0 0 0 1.5px ${line}${beaten ? '' : `, inset 0 0 ${14 + pulse * 10}px rgba(255,34,34,.28)`}` }} />
    </button>
  );
}
