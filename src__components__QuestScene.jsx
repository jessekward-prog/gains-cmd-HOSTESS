import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import { PLACES, MEADOW, PW, PH, bakePlace } from '../lib/places';
import { SKIES, SKY_CELL, GRADES, paintSky } from '../lib/skies';
import { colourFns } from '../lib/questSkins';
import { ASSET, RARITY } from '../lib/quest';

const MONO = 'var(--font-mono)';
const urls = new Map();
// A place's layers in a skin's colours, as data URLs: [{ img, sp }].
export function placeLayers(key, skin) {
  const id = `${key}|${skin.id}|${skin.tint}|${skin.theme}`;
  if (!urls.has(id)) {
    const { land } = colourFns(skin);
    urls.set(id, (bakePlace(key) || []).map(({ sp, L, A }) => {
      const c = document.createElement('canvas'); c.width = PW; c.height = PH;
      const g = c.getContext('2d'), d = g.createImageData(PW, PH);
      for (let i = 0; i < L.length; i++) if (A[i]) { const [r, gg, b] = land(L[i]); d.data.set([r, gg, b, 255], i * 4); }
      g.putImageData(d, 0, 0);
      return { img: `url(${c.toDataURL()})`, sp };
    }));
  }
  return urls.get(id);
}

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A sky over the scene behind it. `ground`: the ground line's y, in px. */
export function SkyFx({ sky, frame, ground, height = 340 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = Math.ceil(c.clientWidth / SKY_CELL), h = Math.ceil(height / SKY_CELL);
    if (!w) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    paintSky(g, sky, w, h, Math.floor(ground / SKY_CELL), still ? 2 : (Date.now() / 1000) % 3600);
  }, [sky, still ? 0 : frame, ground, height]);
  const [bg, blend] = GRADES[sky] || [];
  return (
    <>
      <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ height: ground, background: bg, mixBlendMode: blend }} />
      <canvas ref={ref} className="absolute left-0 top-0 w-full pointer-events-none" style={{ height, imageRendering: 'pixelated' }} />
    </>
  );
}

function PlaceThumb({ k, skin }) {
  const ls = useMemo(() => placeLayers(k, skin), [k, skin]);
  return ls.map((l, i) => <span key={i} className="absolute inset-0" style={{ backgroundImage: l.img, backgroundSize: 'auto 100%', imageRendering: 'pixelated' }} />);
}
function SkyThumb({ k }) {
  const ref = useRef(null);
  useEffect(() => { paintSky(ref.current.getContext('2d'), k, 100, 62, 56, k === 'storm' ? 1.0 : 2.4); }, [k]);
  const [bg, blend] = GRADES[k];
  return <><span className="absolute inset-0" style={{ background: 'linear-gradient(#5a3a1c, #a8662c)' }} /><span className="absolute inset-0" style={{ background: bg, mixBlendMode: blend }} /><canvas ref={ref} width="100" height="62" className="absolute inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} /></>;
}

/** Choose where the title hero runs, and the sky over it. */
export default function SceneSheet({ open, onClose, prof, skin, save }) {
  useBackHandler(open, onClose);
  if (!open) return null;
  const places = prof.theme !== 'cyberpunk';
  const owned = prof.skies || [];
  const tile = (key, on, label, sub, col, art, onClick, locked) => (
    <button key={key} aria-pressed={on} disabled={locked} onClick={onClick} className="min-w-0 text-left">
      <span className="block relative overflow-hidden" style={{ aspectRatio: '15 / 8', borderRadius: 12, background: '#0b0b0b', isolation: 'isolate', boxShadow: on ? '0 0 0 3px var(--color-text-primary)' : 'none', filter: locked ? 'grayscale(1) brightness(.4)' : 'none' }}>{art}</span>
      <span className="block truncate font-bold" style={{ marginTop: 6, fontSize: 14 }}>{label}</span>
      <span className="block truncate" style={{ font: `400 11px ${MONO}`, color: col || 'var(--color-text-secondary)' }}>{sub}</span>
    </button>
  );
  const head = (t, r) => <div className="flex justify-between text-text-secondary px-1 pt-2 pb-2.5" style={{ font: `600 12px ${MONO}`, letterSpacing: '.1em' }}><span>{t}</span><span>{r}</span></div>;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end g-root" onClick={onClose} style={{ background: 'rgba(0,0,0,.85)' }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Scene" className="w-full max-h-[80vh] overflow-y-auto bg-bg-1 rounded-t-[28px] p-4 pb-8 border-accent"
        // The accent at full strength: the Quest accent is 25% by default, too faint for a hairline.
        style={{ borderWidth: '1.5px 1.5px 0', borderStyle: 'solid', borderColor: 'rgb(from var(--color-accent) r g b / 1)' }}>
        <div className="flex items-center justify-between px-1">
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>Scene</div>
          <button onClick={onClose} className="h-11 px-3 font-bold text-text-secondary">Close</button>
        </div>
        {head('SKIES', `${owned.length} / ${SKIES.length}`)}
        <div className="grid grid-cols-2 gap-3">
          {tile('none', !prof.sky, 'Clear', 'No filter', null, places && <PlaceThumb k="dunes" skin={skin} />, () => save((p) => ({ ...p, sky: null })))}
          {SKIES.map(([k, name, r, what]) => { const own = owned.includes(k); return tile(k, own && prof.sky === k, name, own ? what : `${RARITY[r][0]} chest`, RARITY[r][1], <SkyThumb k={k} />, () => save((p) => ({ ...p, sky: k })), !own); })}
        </div>
        {places && <>
          <div className="h-3" />
          {head('PLACES', `${PLACES.length + 1}`)}
          <div className="grid grid-cols-2 gap-3">
            {tile('daily', prof.place !== MEADOW && !PLACES.some(([k]) => k === prof.place), 'Travelling', 'A new place each day', null, <PlaceThumb k="ember" skin={skin} />, () => save((p) => ({ ...p, place: 'daily' })))}
            {tile(MEADOW, prof.place === MEADOW, 'The Meadow', 'Where it all began', null, <span className="absolute inset-0" style={{ backgroundImage: `url(${ASSET}sprites/land_mountains.png)`, backgroundSize: 'auto 130%', backgroundPosition: 'bottom', imageRendering: 'pixelated', filter: 'sepia(1) saturate(2)' }} />, () => save((p) => ({ ...p, place: MEADOW })))}
            {PLACES.map(([k, name]) => tile(k, prof.place === k, name, 'Open', null, <PlaceThumb k={k} skin={skin} />, () => save((p) => ({ ...p, place: k }))))}
          </div>
        </>}
      </div>
    </div>, document.body);
}
