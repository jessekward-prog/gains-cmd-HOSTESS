import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import useQuest, { VAULT_START } from '../hooks/useQuest';
import useQuestArt, { saveArt, resetArt } from '../hooks/useQuestArt';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import DitherCard, { effCard } from './DitherCard';
import { CARDS, RAR, PAL, STYLES, prepare, thumb } from '../lib/dither';
import { withDefaults } from '../lib/quest';

const MONO = "'DM Mono', var(--font-mono), monospace";
const ODDS = [['L', 0.04], ['E', 0.13], ['R', 0.28], ['C', 0.55]];
const FILTERS = [['all', 'All'], ['owned', 'Owned'], ['C', 'Common'], ['R', 'Rare'], ['E', 'Epic'], ['L', 'Legendary'], ['fav', '★ Favs']];
const N = CARDS.length;

function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((x) => x + 0.1), 100); return () => clearInterval(id); }, []);
  return t;
}
const frameOf = (c, tick) => (c.rarity === 'L' ? `conic-gradient(from ${tick * 9}deg, #ff5ea8, #fbbf24, #6dff3a, #3aa0ff, #c084fc, #ff5ea8)`
  : c.rarity === 'E' ? '#c084fc' : c.rarity === 'R' ? PAL[c.pal][PAL[c.pal].length - 1] : '#3a3a3a');
const glowOf = (c) => (c.rarity === 'L' ? 'rgba(251,191,36,.3)' : c.rarity === 'E' ? 'rgba(192,132,252,.28)' : 'transparent');
const styleName = (st) => (STYLES.find((x) => x[0] === st) || [0, st])[1];
const checker = (n) => `repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / ${n}px ${n}px`;
const Back = () => (
  <div className="w-full h-full flex items-center justify-center" style={{ borderRadius: 17, background: checker(8) }}>
    <div className="text-center" style={{ padding: '14px 14px 12px', borderRadius: 12, background: '#050505', boxShadow: 'inset 0 0 0 2px #ff2222' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.95 }}>GAINS<br />QUEST</div>
      <div style={{ marginTop: 6, font: `500 9px ${MONO}`, letterSpacing: '.2em', color: '#ff2222' }}>CARD PACK</div>
    </div>
  </div>
);

/** Static thumbnails for the grid (one render per card + art change). */
function useThumbs(ids, art) {
  const [thumbs, setThumbs] = useState({});
  const sig = ids.map((id) => `${id}:${art[id] ? `${art[id].style}${art[id].pal}${art[id].img?.length || 0}` : ''}`).join(',');
  useEffect(() => {
    let live = true;
    (async () => {
      for (const id of ids) {
        const c = effCard(CARDS[id - 1], art[id]);
        const p = await prepare(c, art[id]?.img);
        if (!live) return;
        if (p) { const url = await thumb(c, p); if (live) setThumbs((t) => ({ ...t, [id]: url })); }
      }
    })();
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return thumbs;
}

export default function QuestVault({ onClose }) {
  const { prof, vault } = useQuest();
  const { saveQuest } = useWorkout();
  const { showToast } = useToast();
  const art = useQuestArt();
  const t = useClock();
  const tick = Math.round(t * 10);
  const [filter, setFilter] = useState('all');
  const [ins, setIns] = useState(null);
  const [rev, setRev] = useState(null);
  const [forge, setForge] = useState(null);
  const fileRef = useRef(null);
  useBackHandler(!ins && !rev && !forge, onClose);
  useBackHandler(!!ins, () => setIns(null));
  useBackHandler(!!rev, () => setRev(null));
  useBackHandler(!!forge, () => setForge(null));

  const owned = (id) => !!vault.owned[id];
  const ownedIds = CARDS.filter((c) => owned(c.id)).map((c) => c.id);
  const thumbs = useThumbs(ownedIds, art);
  const list = CARDS.filter((c) => filter === 'all' || (filter === 'owned' ? owned(c.id) : filter === 'fav' ? vault.favs.includes(c.id) : c.rarity === filter));
  const eff = (id) => effCard(CARDS[id - 1], art[id]);

  // One pack = one card, paid for by a quest clear.
  const openPack = () => {
    if (!prof.packs) return;
    const r = Math.random(); let acc = 0, tier = 'C';
    for (const [k, p] of ODDS) { acc += p; if (r < acc) { tier = k; break; } }
    const pool = CARDS.filter((c) => c.rarity === tier), c = pool[Math.floor(Math.random() * pool.length)];
    const n = (vault.owned[c.id] || 0) + 1;
    saveQuest((cur) => {
      const p = withDefaults(cur.profile), v = cur.vault?.owned ? cur.vault : VAULT_START;
      return { ...cur, profile: { ...p, packs: Math.max(0, (p.packs || 0) - 1) }, vault: { ...v, owned: { ...v.owned, [c.id]: (v.owned[c.id] || 0) + 1 } } };
    }).catch((e) => showToast('Error: ' + e.message, 'error'));
    setIns(null);
    setRev({ id: c.id, t0: t, isNew: n === 1, n });
  };
  const toggleFav = () => {
    if (!ins || !owned(ins)) return;
    saveQuest((cur) => {
      const v = cur.vault?.owned ? cur.vault : VAULT_START;
      let favs = v.favs.filter((x) => x !== ins);
      if (favs.length === v.favs.length) favs = [...favs, ins].slice(-3);
      return { ...cur, vault: { ...v, favs } };
    }).catch((e) => showToast('Error: ' + e.message, 'error'));
  };
  const step = (d) => { const i = list.findIndex((c) => c.id === ins); if (list.length) setIns(list[(i + d + list.length) % list.length].id); };
  const forgeSlot = (slot) => { const e = eff(slot); setIns(null); setForge({ slot, name: e.name, style: e.style, pal: e.pal, img: art[slot]?.img || null, err: '' }); };
  const onFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = 360; c.height = 504;
        const x = c.getContext('2d'), k = Math.max(360 / im.width, 504 / im.height);
        x.drawImage(im, (360 - im.width * k) / 2, (504 - im.height * k) / 2, im.width * k, im.height * k);
        setForge((f) => f && { ...f, img: c.toDataURL('image/jpeg', 0.85) });
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  };
  const saveForge = async () => {
    try { await saveArt(forge.slot, { name: forge.name, style: forge.style, pal: forge.pal, img: forge.img }); setForge(null); }
    catch (e) { setForge((f) => f && { ...f, err: e.message }); }
  };

  const panel = { background: '#0e0e0e', borderRadius: 28, padding: 16 };
  const ic = ins ? eff(ins) : null, io = !!ic && owned(ins), isFav = !!ic && vault.favs.includes(ins), icN = ins ? vault.owned[ins] || 0 : 0;
  const rc = rev ? eff(rev.id) : null, dt = rev ? t - rev.t0 : 0;
  let deg = 0, shake = 0;
  if (dt < 0.7) shake = Math.sin(dt * 55) * 5 * Math.min(1, dt / 0.5);
  else if (dt < 1.2) deg = 180 * (1 - Math.pow(1 - (dt - 0.7) / 0.5, 3));
  else deg = 180;
  const infoOp = Math.min(1, Math.max(0, (dt - 1.2) / 0.3));
  const fc = forge ? CARDS[forge.slot - 1] : null;
  const fcard = forge ? { ...fc, name: forge.name, style: forge.style, pal: forge.pal } : null;

  return createPortal(
    <div className="fixed inset-0 z-[220] overflow-y-auto flex justify-center" style={{ background: '#050505', color: '#f0f0f0', fontFamily: "'Manrope', var(--font-display), sans-serif" }}>
      <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: 480, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 14px 32px' }}>
        <div className="flex justify-between items-end gap-3" style={{ padding: '0 6px' }}>
          <div>
            <button onClick={onClose} style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>‹ GAINS QUEST · CARD VAULT</button>
            <div style={{ marginTop: 4, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>Collection</div>
          </div>
          <div className="text-right">
            <div style={{ font: `500 24px ${MONO}`, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{ownedIds.length}/{N}</div>
            <div style={{ marginTop: 4, font: `400 10px ${MONO}`, letterSpacing: '.12em', color: '#666' }}>CARDS FOUND</div>
          </div>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', padding: '0 6px 4px' }}>
          {['C', 'R', 'E', 'L'].map((r) => {
            const all = CARDS.filter((c) => c.rarity === r), have = all.filter((c) => owned(c.id)).length;
            return (
              <div key={r}>
                <div className="overflow-hidden" style={{ height: 4, borderRadius: 2, background: '#222' }}><div className="h-full" style={{ width: `${(have / all.length) * 100}%`, background: RAR[r].col }} /></div>
                <div className="whitespace-nowrap" style={{ marginTop: 5, font: `500 9px ${MONO}`, letterSpacing: '.08em', color: '#999' }}>{RAR[r].name} {have}/{all.length}</div>
              </div>
            );
          })}
        </div>

        <div style={panel}>
          <div className="flex justify-between items-baseline">
            <span style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em', color: '#ff2222' }}>SHOWCASE</span>
            <span style={{ font: `400 10px ${MONO}`, color: '#666' }}>Star up to 3 · the first is your hero card</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 }}>
            {[0, 1, 2].map((i) => {
              const id = vault.favs[i], has = !!id && owned(id), e = has ? eff(id) : null;
              return (
                <button key={i} onClick={() => (has ? setIns(id) : setFilter('owned'))} className="block w-full" style={{ padding: 2, borderRadius: 14, background: has ? frameOf(e, tick) : '#0e0e0e', boxShadow: `0 0 22px ${has ? glowOf(e) : 'transparent'}` }}>
                  <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 12, background: '#0b0b0b' }}>
                    {has ? <DitherCard card={e} img={art[id]?.img} phase={i * 1.7} /> : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ borderRadius: 12, boxShadow: 'inset 0 0 0 1.5px #2a2a2a', color: '#444' }}>
                        <span style={{ fontSize: 20 }}>★</span><span style={{ font: `500 9px ${MONO}`, letterSpacing: '.1em' }}>EMPTY</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button onClick={() => forgeSlot(1)} className="flex-1" style={{ height: 56, borderRadius: 18, background: '#171717', fontWeight: 700, fontSize: 14 }}>Forge art</button>
            <button onClick={openPack} disabled={!prof.packs} className="active:scale-[.98] disabled:opacity-40" style={{ flex: 2, height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>
              {prof.packs ? `Open pack · ${prof.packs}` : 'Clear a quest for a pack'}
            </button>
          </div>
        </div>

        <div style={panel}>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className="flex-shrink-0" style={{ height: 32, padding: '0 11px', borderRadius: 10, background: filter === k ? '#ff2222' : '#171717', color: filter === k ? '#fff' : '#999', font: `500 11px ${MONO}`, letterSpacing: '.06em' }}>{l}</button>
            ))}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 14 }}>
            {list.map((c) => {
              const e = eff(c.id), o = owned(c.id), n = vault.owned[c.id] || 0;
              return (
                <button key={c.id} onClick={() => setIns(c.id)} className="block w-full text-left" style={{ padding: 2, borderRadius: 14, background: o ? frameOf(e, tick) : '#1c1c1c', boxShadow: `0 0 16px ${o ? glowOf(e) : 'transparent'}` }}>
                  <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 12, background: '#0b0b0b' }}>
                    {o ? (
                      <>
                        <div className="absolute inset-0" style={{ backgroundImage: thumbs[c.id] || 'none', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                        <div className="absolute left-0 right-0 bottom-0 flex items-center gap-1" style={{ padding: '5px 7px', background: 'rgba(5,5,5,.85)' }}>
                          <span className="flex-shrink-0" style={{ width: 6, height: 6, borderRadius: '50%', background: RAR[c.rarity].col }} />
                          <span className="min-w-0 truncate" style={{ font: `500 9px ${MONO}` }}>{e.name}</span>
                        </div>
                        {n > 1 && <span className="absolute" style={{ top: 6, right: 6, padding: '2px 5px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 9px ${MONO}` }}>×{n}</span>}
                        {vault.favs.includes(c.id) && <span className="absolute" style={{ top: 5, left: 7, fontSize: 13, color: '#fbbf24', textShadow: '0 1px 0 #050505' }}>★</span>}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: checker(6) }}>
                        <span style={{ font: `500 16px ${MONO}`, color: '#3a3a3a' }}>#{c.num}</span>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: RAR[c.rarity].col, opacity: 0.5 }} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {ic && (
        <div onClick={() => setIns(null)} className="fixed inset-0 z-[230] overflow-y-auto flex justify-center items-start" style={{ background: 'rgba(5,5,5,.94)', padding: '28px 18px' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-3.5" style={{ maxWidth: 330 }}>
            <div style={{ padding: 3, borderRadius: 20, background: io ? frameOf(ic, tick) : '#2a2a2a', boxShadow: `0 0 48px ${io ? glowOf(ic) : 'transparent'}` }}>
              <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 17, background: '#0b0b0b' }}>
                {io ? (
                  <>
                    <DitherCard card={ic} img={art[ins]?.img} style={{ imageRendering: 'pixelated' }} />
                    <div className="absolute" style={{ left: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `600 10px ${MONO}`, letterSpacing: '.14em', color: RAR[ic.rarity].col }}>{RAR[ic.rarity].name}</div>
                    <div className="absolute" style={{ right: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 10px ${MONO}` }}>#{ic.num}</div>
                  </>
                ) : <Back />}
              </div>
            </div>
            <div style={{ padding: '0 4px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{io ? ic.name : `Card #${ic.num}`}</div>
              <div style={{ marginTop: 6, font: `400 11px ${MONO}`, color: '#999' }}>
                {io ? `${RAR[ic.rarity].name} · ${styleName(ic.style).toUpperCase()}${ic.anim ? ' · ANIMATED' : ''}${icN > 1 ? ` · ×${icN}` : ''}` : `Not found yet · ${RAR[ic.rarity].name.toLowerCase()} drop`}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => step(-1)} aria-label="Previous card" style={{ width: 56, height: 56, borderRadius: 18, background: '#171717', font: `500 20px ${MONO}` }}>‹</button>
              <button onClick={toggleFav} className="flex-1" style={{ height: 56, borderRadius: 18, background: isFav ? 'rgba(251,191,36,.14)' : '#ff2222', color: isFav ? '#fbbf24' : '#fff', fontWeight: 800, fontSize: 15, opacity: io ? 1 : 0.35 }}>
                {isFav ? '★ In showcase' : '☆ Add to showcase'}
              </button>
              <button onClick={() => step(1)} aria-label="Next card" style={{ width: 56, height: 56, borderRadius: 18, background: '#171717', font: `500 20px ${MONO}` }}>›</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => forgeSlot(ins)} className="flex-1" style={{ height: 48, borderRadius: 16, background: '#0e0e0e', color: '#999', fontWeight: 700, fontSize: 13 }}>Restyle card</button>
              <button onClick={() => setIns(null)} className="flex-1" style={{ height: 48, borderRadius: 16, background: '#0e0e0e', fontWeight: 700, fontSize: 13 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {rc && (
        <div className="fixed inset-0 z-[240] overflow-y-auto flex flex-col items-center justify-center gap-[18px]" style={{ background: 'rgba(5,5,5,.97)', padding: '24px 18px' }}>
          <div style={{ font: `600 12px ${MONO}`, letterSpacing: '.24em', color: RAR[rc.rarity].col, opacity: infoOp }}>{RAR[rc.rarity].name}</div>
          <div style={{ width: 280, maxWidth: '76vw', perspective: 1000 }}>
            <div className="relative" style={{ aspectRatio: '5 / 7', transformStyle: 'preserve-3d', transform: `translateX(${shake}px) rotateY(${deg}deg)` }}>
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', padding: 3, borderRadius: 20, background: '#2a2a2a' }}><Back /></div>
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', padding: 3, borderRadius: 20, background: frameOf(rc, tick), boxShadow: `0 0 60px ${glowOf(rc)}` }}>
                <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: 17, background: '#0b0b0b' }}>
                  <DitherCard card={rc} img={art[rev.id]?.img} style={{ imageRendering: 'pixelated' }} />
                  <div className="absolute inset-0 pointer-events-none" style={{ background: RAR[rc.rarity].col, opacity: dt > 1.2 ? Math.max(0, 0.85 - (dt - 1.2) * 2.2) : 0 }} />
                </div>
              </div>
            </div>
          </div>
          <div className="text-center" style={{ opacity: infoOp }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, textWrap: 'balance' }}>{rc.name}</div>
            <div style={{ marginTop: 6, font: `400 11px ${MONO}`, color: '#999' }}>{rev.isNew ? `NEW · #${rc.num} added to your vault` : `DUPLICATE · you now have ×${rev.n}`}</div>
          </div>
          <div className="flex gap-2 w-full" style={{ maxWidth: 330, opacity: infoOp }}>
            <button onClick={() => setRev(null)} className="flex-1" style={{ height: 56, borderRadius: 18, background: '#171717', fontWeight: 700, fontSize: 14 }}>Done</button>
            <button onClick={openPack} disabled={!prof.packs} className="disabled:opacity-40" style={{ flex: 2, height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>
              {prof.packs ? `Open another · ${prof.packs}` : 'No packs left'}
            </button>
          </div>
        </div>
      )}

      {forge && (
        <div onClick={() => setForge(null)} className="fixed inset-0 z-[250] overflow-y-auto flex justify-center items-start" style={{ background: 'rgba(5,5,5,.94)', padding: '24px 14px' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-4" style={{ maxWidth: 400, background: '#0e0e0e', borderRadius: 28, padding: 18 }}>
            <div className="flex justify-between items-center gap-2">
              <div>
                <div style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em', color: '#ff2222' }}>FORGE</div>
                <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>Card #{fc.num}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => forgeSlot(fc.id === 1 ? N : fc.id - 1)} aria-label="Previous slot" style={{ width: 44, height: 44, borderRadius: 14, background: '#171717', font: `500 18px ${MONO}` }}>‹</button>
                <button onClick={() => forgeSlot(fc.id === N ? 1 : fc.id + 1)} aria-label="Next slot" style={{ width: 44, height: 44, borderRadius: 14, background: '#171717', font: `500 18px ${MONO}` }}>›</button>
              </div>
            </div>
            <div className="flex gap-3.5">
              <div className="flex-shrink-0" style={{ width: 132, padding: 2, borderRadius: 14, background: frameOf(fcard, tick) }}>
                <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 12, background: '#0b0b0b' }}>
                  <DitherCard card={fcard} img={forge.img} />
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div style={{ font: `600 10px ${MONO}`, letterSpacing: '.14em', color: RAR[fc.rarity].col }}>{RAR[fc.rarity].name}{fc.anim ? ' · ANIMATED' : ''}</div>
                <input value={forge.name} onChange={(e) => setForge({ ...forge, name: e.target.value })} aria-label="Card name"
                  className="w-full outline-none" style={{ height: 44, borderRadius: 12, background: '#171717', color: '#f0f0f0', padding: '0 12px', font: "700 14px 'Manrope', sans-serif" }} />
                <button onClick={() => fileRef.current?.click()} style={{ height: 44, borderRadius: 12, background: '#171717', fontWeight: 700, fontSize: 13 }}>{forge.img ? 'Replace image' : 'Upload image'}</button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                <button onClick={() => resetArt(forge.slot).then(() => forgeSlot(forge.slot)).catch((e) => setForge((f) => f && { ...f, err: e.message }))}
                  style={{ height: 32, borderRadius: 10, color: '#ef4444', font: `500 11px ${MONO}` }}>Reset slot</button>
              </div>
            </div>
            <div>
              <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>EFFECT</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 8 }}>
                {STYLES.map(([k, l]) => (
                  <button key={k} onClick={() => setForge({ ...forge, style: k })} style={{ height: 38, borderRadius: 10, background: forge.style === k ? 'rgba(255,34,34,.12)' : '#171717', boxShadow: `inset 0 0 0 1.5px ${forge.style === k ? '#ff2222' : 'transparent'}`, font: `500 11px ${MONO}` }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>PALETTE</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', marginTop: 8 }}>
                {Object.entries(PAL).map(([k, cs]) => (
                  <button key={k} onClick={() => setForge({ ...forge, pal: k })} aria-label={k}
                    style={{ height: 36, borderRadius: 10, background: `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${(i / cs.length) * 100}% ${((i + 1) / cs.length) * 100}%`).join(', ')})`, boxShadow: `0 0 0 2px ${forge.pal === k ? '#ff2222' : '#2a2a2a'}` }} />
                ))}
              </div>
            </div>
            {forge.err && <div style={{ font: `400 11px ${MONO}`, color: '#ef4444' }}>{forge.err}</div>}
            <div className="flex gap-2">
              <button onClick={() => setForge(null)} className="flex-1" style={{ height: 56, borderRadius: 18, background: '#171717', fontWeight: 700, fontSize: 14 }}>Cancel</button>
              <button onClick={saveForge} style={{ flex: 2, height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>Save card #{fc.num}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
