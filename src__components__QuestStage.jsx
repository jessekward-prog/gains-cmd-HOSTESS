import { useEffect, useState } from 'react';
import useQuestSprites from '../hooks/useQuestSprites';
import { TINTS, LANDS, SIZES, PETS, heroOf } from '../lib/quest';

const MONO = "'DM Mono', var(--font-mono), monospace";
const BLANK = 'none';
const DT = 100; // one animation frame, as in the handoff (DT = 0.1s)

function useFrame() {
  const [f, setF] = useState(0);
  useEffect(() => { const id = setInterval(() => setF((n) => n + 1), DT); return () => clearInterval(id); }, []);
  return f;
}

// Typewriter: ~2 chars a frame, restarting whenever the text changes.
function useTyped(text, frame) {
  const [s, setS] = useState({ text, at: frame });
  if (s.text !== text) setS({ text, at: frame });
  return text.slice(0, Math.max(0, (frame - s.at) * 2));
}

/**
 * The quest scene (340px stage). Everything it shows comes from props; it only
 * keeps its own animation clock. `phase` is title | walk | encounter | battle |
 * attack | rest | victory; `start` is when that phase began (ms epoch, 0 = long ago),
 * so the stage times its own entrances and hits on its 100ms clock.
 *
 * monster: monsterOf() result · hit: { dmg, crit } for the attack float ·
 * area: index into LANDS · lvl/xp: shown on the hero box · msg: dialogue line.
 */
export default function QuestStage({ phase, start = 0, monster, hit, area = 0, heroName = 'Warlord', petKey = null, lvl, xp, tint = 'amber', scanlines = true, msg = '', goFlash = false, title, card }) {
  const frame = useFrame();
  const t = start ? Math.max(0, (Date.now() - start) / 1000) : 9;
  const [wf, setWf] = useState(0);
  const walking = phase === 'walk' || phase === 'title';
  useEffect(() => { if (walking) setWf((w) => w + 1); }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const hex = TINTS[tint]?.[1] || TINTS.amber[1];
  const [hk, hw, hh, hn, hcx, hws, hbs] = heroOf(heroName);
  const pet = PETS.find((p) => p[0] === petKey);
  const jobs = [
    ...['idle', 'run', 'atk'].filter((a) => hn[a]).map((a) => [`${hk}_${a}`, hn[a]]),
    ...(monster ? [[monster.sprite, 4]] : []),
    ...(pet ? [[`pet_${pet[0]}`, 4]] : []),
  ];
  const { sprites, lands, strip } = useQuestSprites(hex, jobs);
  const typed = useTyped(msg, frame);

  const isBattle = ['battle', 'attack', 'rest', 'victory'].includes(phase);
  const gy = phase === 'title' ? 50 : 0; // the title screen's ground sits 50px lower
  const land = LANDS[Math.min(area, LANDS.length - 1)];
  const glow = `drop-shadow(0 0 6px ${hex}88)`;

  // encounter: shake → "!" → strobe → bar wipe in; battle entry: bars wipe out, monster slides in
  let flashOp = 0, wipe = 0;
  if (phase === 'encounter') {
    if (t >= 0.9 && t < 1.7) flashOp = Math.floor(t * 10) % 2 ? 0.9 : 0;
    if (t >= 1.7) wipe = Math.min(1, (t - 1.7) / 0.7);
  }
  const entryT = phase === 'battle' ? t : 9;
  if (isBattle && entryT < 0.5) wipe = 1 - entryT / 0.5;
  const ent = Math.min(1, Math.max(0, (entryT - 0.2) / 0.6));
  const shake = phase === 'encounter' && t < 0.9 ? `translateX(${frame % 2 ? 3 : -3}px)` : 'none';

  let monX = (1 - ent) * 240, monY = 0, monOp = 1, hitFlash = false;
  if (phase === 'battle') monY = frame % 12 < 6 ? 0 : 1;
  if (phase === 'attack' && t >= 0.3 && t < 0.9) { monX += frame % 2 ? 6 : -6; hitFlash = frame % 2 === 1; }
  if (phase === 'rest') monY = frame % 16 < 8 ? 0 : 2;
  if (phase === 'victory') { const k = Math.min(1, t / 0.8); monY = k * 46; monOp = 1 - k; }
  let heroX = (1 - ent) * -200;
  if (phase === 'attack') heroX += t < 0.25 ? (t / 0.25) * 34 : t < 0.6 ? 34 * (1 - (t - 0.25) / 0.35) : 0;

  const S = (key) => sprites[key];
  const frameOf = (key, i, white) => { const s = S(key); return s ? ((white ? s.hit : s.tint)[i] || s.tint[0] || BLANK) : BLANK; };
  const heroWalk = walking ? frameOf(`${hk}_run`, wf % hn.run) : frameOf(`${hk}_idle`, Math.floor(frame / 1.2) % hn.idle);
  const heroBattle = phase === 'attack' && t < 0.7
    ? (hn.atk ? frameOf(`${hk}_atk`, Math.min(hn.atk - 1, Math.floor((t / 0.7) * hn.atk))) : frameOf(`${hk}_run`, frame % hn.run))
    : frameOf(`${hk}_idle`, Math.floor(frame / 1.2) % hn.idle, phase === 'victory');
  const monSrc = monster ? frameOf(monster.sprite, Math.floor(frame / (phase === 'rest' ? 4 : 2)) % 4, hitFlash) : BLANK;
  const petSrc = pet ? frameOf(`pet_${pet[0]}`, Math.floor(frame / 2) % 4) : BLANK;
  const petH = pet ? pet[3] : 16;
  const hpFrac = monster && monster.max ? monster.hp / monster.max : 0;
  const dk = Math.max(0, t - 0.3);

  const layers = land.strip
    ? [{ img: strip || BLANK, size: '1536px 352px', pos: `${-wf * 6}px 0px`, op: 1 }]
    : land.layers.map(([n, sp]) => ({ img: lands?.[n] || BLANK, size: 'auto 290px', pos: `${-wf * 6 * sp}px ${gy - 40}px`, op: land.dim || 1 }));
  const box = { background: '#171717', borderRadius: 14 };

  return (
    <div className="relative flex-shrink-0 overflow-hidden" style={{ height: 340, background: '#0e0e0e', borderRadius: 28, fontFamily: MONO, color: '#f0f0f0' }}>
      <div className="absolute inset-0" style={{ background: '#050505', transform: shake }}>
        {layers.map((l, i) => (
          <div key={i} className="absolute inset-0" style={{ backgroundImage: l.img, backgroundSize: l.size, backgroundRepeat: 'repeat-x', backgroundPosition: l.pos, imageRendering: 'pixelated', opacity: l.op, transition: 'background-position .1s linear' }} />
        ))}
        {!land.strip && <div className="absolute left-0 right-0 bottom-0" style={{ top: 204 + gy, background: '#070604', boxShadow: `inset 0 2px 0 ${hex}` }} />}
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 60%, transparent 45%, rgba(0,0,0,.6) 100%)' }} />

      {(phase === 'walk' || phase === 'title') && (
        <div className="absolute z-[5]" style={{ top: 14, left: 14, padding: '5px 9px', borderRadius: 8, background: 'rgba(5,5,5,.75)', font: `500 10px ${MONO}`, letterSpacing: '.14em' }}>
          AREA {Math.min(area, LANDS.length - 1) + 1} · {land.name.toUpperCase()}
        </div>
      )}
      {phase === 'title' && title && (
        <div className="absolute z-[5] text-center pointer-events-none" style={{ top: 56, left: 0, width: '52%' }}>
          <div style={{ fontFamily: "'Manrope', var(--font-display), sans-serif", fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.95, textShadow: '0 2px 0 #050505, 0 0 18px rgba(0,0,0,.8)' }}>GAINS<br />QUEST</div>
          <div className="inline-block" style={{ marginTop: 10, padding: '4px 9px', borderRadius: 8, background: 'rgba(5,5,5,.75)', font: `500 10px ${MONO}`, letterSpacing: '.14em', color: title.color }}>{title.line}</div>
        </div>
      )}
      {phase === 'title' && card}

      {(phase === 'walk' || phase === 'title' || phase === 'encounter') && (
        <>
          <div className="absolute" style={{ left: 62, top: 200 + gy, width: 44, height: 10, borderRadius: '50%', background: 'rgba(0,0,0,.5)' }} />
          {pet && <div className="absolute" style={{ left: 18, top: 206 + gy - petH * 2.4 + (walking && wf % 4 < 2 ? -3 : 0), width: 16 * 2.4, height: petH * 2.4, backgroundImage: petSrc, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow }} />}
          <div className="absolute" style={{ left: 84 - hcx * hws, top: 206 + gy - hh * hws, width: hw * hws, height: hh * hws, backgroundImage: heroWalk, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow }} />
          {phase === 'encounter' && t < 1.7 && <div className="absolute" style={{ left: 70, top: 186 - hh * hws, background: '#ff2222', color: '#fff', font: `500 12px ${MONO}`, padding: '1px 6px', borderRadius: 4 }}>!</div>}
        </>
      )}

      {isBattle && monster && (
        <>
          <div className="absolute" style={{ top: 14, left: 14, width: 172, padding: '10px 12px', ...box, opacity: ent }}>
            <div className="flex justify-between items-baseline gap-1.5">
              <span className="truncate" style={{ fontFamily: "'Manrope', var(--font-display), sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{monster.name}</span>
              <span className="flex-shrink-0" style={{ fontSize: 10, color: '#999' }}>Lv{monster.lv}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 9, letterSpacing: '.14em', color: '#666' }}>{monster.species}</div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: '#f59e0b', letterSpacing: '.08em' }}>HP</span>
              <div className="flex-1 overflow-hidden" style={{ height: 6, background: '#222', borderRadius: 3 }}>
                <div className="h-full" style={{ width: `${hpFrac * 100}%`, background: hpFrac > 0.5 ? '#22c55e' : hpFrac > 0.2 ? '#f59e0b' : '#ef4444', transition: 'width .5s cubic-bezier(.2,1,.3,1), background .3s' }} />
              </div>
            </div>
            <div className="text-right" style={{ marginTop: 4, fontSize: 10, color: '#999', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(monster.hp).toLocaleString()} / {monster.max.toLocaleString()}
            </div>
          </div>

          <div className="absolute flex flex-col items-center" style={{ top: 18, right: 12, transform: `translate(${monX}px, ${monY}px)`, opacity: monOp }}>
            <div className="flex items-end justify-center" style={{ height: 112, paddingRight: 8 }}>
              <div style={{ backgroundImage: monSrc, backgroundSize: '100% 100%', width: SIZES[monster.sprite][0] * monster.scale, height: SIZES[monster.sprite][1] * monster.scale, imageRendering: 'pixelated', filter: `${glow} brightness(${phase === 'rest' ? 0.7 : 1})` }} />
            </div>
            <div style={{ width: 96, height: 14, marginTop: -6, borderRadius: '50%', background: 'rgba(0,0,0,.55)' }} />
          </div>

          {phase === 'attack' && t >= 0.3 && hit && (
            <div className="absolute text-center pointer-events-none" style={{ top: 46, right: 64, transform: `translateY(${-dk * 40}px)`, opacity: Math.max(0, 1 - dk / 1.2) }}>
              <div style={{ font: `500 22px ${MONO}`, color: '#ff2222', fontVariantNumeric: 'tabular-nums' }}>−{hit.dmg.toLocaleString()}</div>
              {hit.crit && <div style={{ font: `500 9px ${MONO}`, letterSpacing: '.14em', color: '#fbbf24' }}>SUPER EFFECTIVE</div>}
            </div>
          )}

          {pet && <div className="absolute" style={{ left: 4, bottom: 74, width: 16 * 2.4, height: petH * 2.4, backgroundImage: petSrc, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow, transform: `translateX(${heroX}px)` }} />}
          <div className="absolute" style={{ left: 32, bottom: 74, width: 76, height: 14, marginBottom: -6, borderRadius: '50%', background: 'rgba(0,0,0,.55)', transform: `translateX(${heroX}px)` }} />
          <div className="absolute" style={{ left: 70 - hcx * hbs, bottom: 74, transform: `translateX(${heroX}px)` }}>
            <div style={{ backgroundImage: heroBattle, backgroundSize: '100% 100%', width: hw * hbs, height: hh * hbs, imageRendering: 'pixelated', filter: glow }} />
          </div>

          <div className="absolute" style={{ right: 14, bottom: 82, width: 150, padding: '10px 12px', ...box }}>
            <div className="flex justify-between items-baseline">
              <span style={{ fontFamily: "'Manrope', var(--font-display), sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>HERO</span>
              <span style={{ fontSize: 10, color: '#999' }}>Lv{lvl}</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: '#60a5fa', letterSpacing: '.08em' }}>XP</span>
              <div className="flex-1 overflow-hidden" style={{ height: 4, background: '#222', borderRadius: 2 }}>
                <div className="h-full" style={{ width: `${xp / 10}%`, background: '#60a5fa', transition: 'width .8s cubic-bezier(.2,1,.3,1)' }} />
              </div>
            </div>
            <div className="text-right" style={{ marginTop: 4, fontSize: 10, color: '#999', fontVariantNumeric: 'tabular-nums' }}>{xp} / 1000</div>
          </div>
        </>
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ background: '#f0f0f0', opacity: flashOp }} />
      {wipe > 0 && Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="absolute pointer-events-none" style={{ top: `${i * 12.5}%`, height: '12.6%', width: `${wipe * 100}%`, ...(i % 2 ? { right: 0 } : { left: 0 }), background: '#050505' }} />
      ))}
      {goFlash && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ background: '#ff2222', animation: 'fx-flash-bg .8s ease both' }}>
          <span style={{ fontFamily: "'Manrope', var(--font-display), sans-serif", color: '#fff', fontSize: 96, fontWeight: 800, letterSpacing: '-0.05em', animation: 'fx-flash .8s cubic-bezier(.2,1.2,.3,1) both' }}>GO</span>
        </div>
      )}

      <div className="absolute z-10 flex gap-1.5 items-start" style={{ left: 12, right: 12, bottom: 12, minHeight: 52, padding: '10px 14px', background: '#050505', borderRadius: 16, boxShadow: 'inset 0 0 0 1px #2a2a2a', font: `500 13px/1.45 ${MONO}` }}>
        <span style={{ color: '#ff2222', opacity: 0.7 }}>&gt;</span>
        <span className="flex-1 min-w-0" style={{ textWrap: 'pretty' }}>{typed}<span style={{ color: '#ff2222', opacity: frame % 10 < 5 ? 1 : 0 }}>_</span></span>
      </div>

      {scanlines && <div className="absolute inset-0 z-30 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)' }} />}
    </div>
  );
}
