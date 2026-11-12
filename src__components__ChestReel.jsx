import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ASSET, BORDERS, EPITHETS, PETS, RARITY, borderCss, seeded } from '../lib/quest';

const MONO = 'var(--font-mono)';
const TW = 104, TH = 118, GAP = 8; // a chest tile, and the gap between tiles
const N = 44, LAND = 38; // tiles in the strip; the one that wins
const SPIN = 5.2; // seconds, with a long crawl at the end
const ease = (k) => 1 - Math.pow(1 - k, 5);
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

// What a tile can show, by rarity (0–3), from the chest's real pools.
const chestPets = PETS.filter((p) => !p[2]);
const bordersOf = (r) => BORDERS.filter((b) => b[2] === r && b[0] !== 'plain');
function tileFor(r, rand) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  if (r === 0) return { kind: 'xp', label: `+${150 + Math.floor(rand() * 6) * 50} XP`, r };
  if (r === 1) return rand() < 0.6 ? { kind: 'ep', label: pick(EPITHETS), r } : ((b) => ({ kind: 'border', key: b[0], label: `${b[1]} border`, r }))(pick(bordersOf(1)));
  if (r === 2) return rand() < 0.5 ? ((p) => ({ kind: 'pet', key: p[0], h: p[3], label: p[1], r }))(pick(chestPets)) : ((b) => ({ kind: 'border', key: b[0], label: `${b[1]} border`, r }))(pick(bordersOf(2)));
  return ((b) => ({ kind: 'border', key: b[0], label: `${b[1]} border`, r }))(pick(bordersOf(3)));
}
// The tile for what actually dropped.
function wonTile(loot) {
  const r = Math.max(0, RARITY.findIndex((x) => x[0] === loot.tier));
  if (loot.pet) return { kind: 'pet', key: loot.pet, h: loot.h || 16, label: loot.label, r };
  const b = BORDERS.find((x) => `${x[1]} border` === loot.label);
  if (b) return { kind: 'border', key: b[0], label: loot.label, r };
  return { kind: r === 0 ? 'xp' : 'ep', label: loot.label, r };
}

function Tile({ t, won }) {
  const col = RARITY[t.r][1];
  const [bg, th] = t.kind === 'border' ? borderCss(t.key, 0) : [];
  return (
    <div className="relative flex-shrink-0 flex flex-col items-center overflow-hidden" style={{ width: TW, height: TH, borderRadius: 14, background: `linear-gradient(to top, ${col}38, #111 62%)`, boxShadow: `inset 0 0 0 1.5px ${col}${won ? '' : '66'}` }}>
      <div className="flex-1 w-full flex items-center justify-center">
        {t.kind === 'xp' && <span style={{ font: `800 24px ${MONO}`, color: '#6dff3a', textShadow: '0 0 10px rgba(109,255,58,.5)', letterSpacing: '-0.04em' }}>XP</span>}
        {t.kind === 'ep' && <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: col, fontFamily: 'Georgia, serif' }}>❝</span>}
        {t.kind === 'border' && <div style={{ width: 38, height: 52, padding: th, borderRadius: 8, background: bg }}><div className="w-full h-full" style={{ borderRadius: 5, background: '#050505' }} /></div>}
        {t.kind === 'pet' && <img src={`${ASSET}sprites/pet_${t.key}_0.png`} alt="" draggable={false} style={{ height: (t.h || 16) * 2.6, imageRendering: 'pixelated', filter: `drop-shadow(0 0 6px ${col})` }} />}
      </div>
      <div className="w-full truncate text-center" style={{ padding: '0 6px 8px', font: `500 10px ${MONO}`, color: '#ddd' }}>{t.kind === 'xp' ? 'XP pouch' : t.label}</div>
      <div className="absolute left-0 right-0 bottom-0" style={{ height: 4, background: col }} />
    </div>
  );
}

/**
 * A strip of N tiles (each with r: rarity 0–3) for `buildReel` to fill: random
 * filler, the win at LAND, and a better tile just past it (the near miss).
 */
export function buildReel(seed, won, tileOf) {
  let n = 0; const rand = () => seeded(`${seed}|reel|${n++}`);
  const list = Array.from({ length: N }, () => { const x = rand(); return tileOf(x < 0.05 ? 3 : x < 0.17 ? 2 : x < 0.42 ? 1 : 0, rand); });
  list[LAND] = won;
  list[LAND + 1] = tileOf(Math.min(3, won.r + 1 + (won.r < 2 ? 1 : 0)), rand);
  list[LAND - 1] = tileOf(won.r === 3 ? 2 : 3, rand);
  return list;
}

/** The chest roll: the reel over the chest's real loot pools. */
export default function ChestReel({ loot, seed, skip = false, onLand }) {
  const won = useMemo(() => wonTile(loot), [loot.label]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useMemo(() => buildReel(seed, won, tileFor), [won, seed]);
  return <Reel tiles={tiles} seed={seed} skip={skip} onLand={onLand} render={(t, w) => <Tile t={t} won={w} />} />;
}

/**
 * The reel: `tiles` spin under a pointer, crawl to a stop on tiles[LAND],
 * ticking as each passes, then burst in its rarity's colour (RARITY, unless
 * the tile carries its own `col`/`name`). `skip` jumps straight to the end.
 */
export function Reel({ tiles, seed, skip = false, onLand, render, w: TW = 104, h: TH = 118 }) {
  const STEP = TW + GAP;
  const won = tiles[LAND];
  const wrap = useRef(null), strip = useRef(null), ptr = useRef(null), skipRef = useRef(skip), tilesRef = useRef(tiles);
  skipRef.current = skip; tilesRef.current = tiles;
  const [landed, setLanded] = useState(false);
  const r = won.r, col = won.col || RARITY[r][1], rname = won.name || RARITY[r][0];
  const colOf = (t) => t?.col || RARITY[t?.r || 0][1];

  useEffect(() => {
    let raf, last = -1, t0 = null;
    const off = (seeded(`${seed}|reel|off`) - 0.5) * TW * 0.6; // don't always stop dead centre
    const draw = (now) => {
      if (t0 == null) t0 = now;
      const w = wrap.current?.clientWidth || 340;
      const k = skipRef.current ? 1 : Math.min(1, (now - t0) / 1000 / SPIN);
      // x: the point of the strip under the pointer, from tile 2 to the win (plus a little off-centre)
      const x0 = 2 * STEP + TW / 2, x = x0 + (LAND * STEP + TW / 2 + off - x0) * ease(k);
      if (strip.current) strip.current.style.transform = `translateX(${w / 2 - x}px)`;
      const under = Math.floor(x / STEP);
      if (under !== last) {
        last = under;
        if (k < 1) { vibrate(under > LAND - 6 ? 12 : 4); ptr.current?.animate([{ transform: 'scaleY(1.35)' }, { transform: 'none' }], { duration: 110 }); }
        if (ptr.current) ptr.current.style.setProperty('--pc', colOf(tilesRef.current[Math.min(N - 1, under)]));
      }
      if (k < 1) raf = requestAnimationFrame(draw);
      else { setLanded(true); vibrate(r >= 2 ? [30, 40, 30, 40, 90] : [20, 40, 40]); onLand?.(); }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seed]); // one spin per seed: a parent re-rendering with a fresh tiles array must not restart it

  const shake = [0, 3, 6, 10][r];
  return (
    <div className="relative" style={{ width: 'min(360px, calc(100vw - 32px))', animation: landed && shake ? `qc-shake .5s cubic-bezier(.3,.6,.4,1) both` : 'none', '--s': `${shake}px` }}>
      {/* Light rays behind the strip once it lands */}
      {landed && <div className="absolute pointer-events-none" style={{ left: '50%', top: '50%', width: 520, height: 520, margin: '-260px 0 0 -260px', background: `repeating-conic-gradient(${col}${r >= 2 ? '55' : '30'} 0 8deg, transparent 8deg 22deg)`, WebkitMaskImage: 'radial-gradient(circle, #000 10%, transparent 62%)', maskImage: 'radial-gradient(circle, #000 10%, transparent 62%)', animation: 'qc-spin 9s linear infinite, fx-fade .5s both' }} />}
      <div ref={wrap} className="relative overflow-hidden" style={{ height: TH + 24, WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)' }}>
        <div ref={strip} className="absolute flex" style={{ top: 12, left: 0, gap: GAP, willChange: 'transform' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ transform: landed && i === LAND ? 'scale(1.12)' : 'none', transition: 'transform .35s cubic-bezier(.2,1.6,.4,1)', zIndex: i === LAND ? 1 : 0, filter: landed && i !== LAND ? 'brightness(.35) saturate(.5)' : 'none' }}>
              {render(t, landed && i === LAND)}
            </div>
          ))}
        </div>
      </div>
      {/* The pointer: takes the colour of whatever is under it */}
      <div ref={ptr} className="absolute pointer-events-none" style={{ left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: 'var(--pc, #fbbf24)', boxShadow: '0 0 12px var(--pc, #fbbf24)', opacity: landed ? 0 : 1, transition: 'opacity .3s', '--pc': '#999' }}>
        <div className="absolute" style={{ left: -6, top: -1, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '10px solid var(--pc, #fbbf24)' }} />
        <div className="absolute" style={{ left: -6, bottom: -1, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '10px solid var(--pc, #fbbf24)' }} />
      </div>
      {landed && (
        <>
          {/* On <body>: the shake's transform would otherwise trap a fixed layer inside the reel. */}
          {createPortal(<div className="fixed inset-0 pointer-events-none" style={{ background: r >= 2 ? col : '#fff', animation: 'qc-flash .6s ease-out both', zIndex: 400 }} />, document.body)}
          {Array.from({ length: 10 + r * 8 }, (_, i) => {
            const a = (i / (10 + r * 8)) * Math.PI * 2 + seeded(`${seed}|p${i}`), d = 90 + seeded(`${seed}|d${i}`) * (90 + r * 40);
            return <div key={i} className="absolute pointer-events-none" style={{ left: '50%', top: '50%', width: 6 + (i % 3) * 2, height: 6 + (i % 3) * 2, background: i % 4 ? col : '#fff', boxShadow: `0 0 8px ${col}`,
              '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--r': `${(i % 2 ? 1 : -1) * 260}deg`, animation: `qc-burst ${0.8 + (i % 4) * 0.12}s cubic-bezier(.1,.7,.3,1) both`, zIndex: 3 }} />;
          })}
          <div className="absolute left-0 right-0 text-center pointer-events-none" style={{ top: -22, zIndex: 4 }}>
            <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 8, background: col, color: '#050505', font: `800 ${12 + r * 2}px ${MONO}`, letterSpacing: '.22em', boxShadow: `0 0 ${10 + r * 8}px ${col}`, animation: 'qc-stamp .45s cubic-bezier(.2,1.6,.4,1) both' }}>{rname}{r >= 2 ? '!' : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}
