import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import useQuest, { VAULT_START } from '../hooks/useQuest';
import useQuestArt, { saveArt, resetArt } from '../hooks/useQuestArt';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import DitherCard, { effCard } from './DitherCard';
import { CARDS, RAR, PAL, STYLES, prepare, thumb } from '../lib/dither';
import { withDefaults, FORGE_RIGHTS, RIGHTS_LABEL, editsLeft } from '../lib/quest';

const MONO = "'DM Mono', var(--font-mono), monospace";
const DISPLAY = "'Manrope', var(--font-display), sans-serif";
const ODDS = [['L', 0.04], ['E', 0.13], ['R', 0.28], ['C', 0.55]];
const FILTERS = [['owned', 'Owned'], ['all', 'All'], ['C', 'Common'], ['R', 'Rare'], ['E', 'Epic'], ['L', 'Legendary']];
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
const Back = ({ label = 'CARD PACK' }) => (
  <div className="w-full h-full flex items-center justify-center" style={{ borderRadius: 'inherit', background: checker(8) }}>
    <div className="text-center" style={{ padding: '12px 12px 10px', borderRadius: 12, background: '#050505', boxShadow: 'inset 0 0 0 2px #ff2222' }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 0.95 }}>GAINS<br />QUEST</div>
      <div style={{ marginTop: 6, font: `500 8px ${MONO}`, letterSpacing: '.2em', color: '#ff2222' }}>{label}</div>
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

/**
 * The Card Vault. Packs (earned by clearing quests) up top; tap any card to
 * inspect it, "Use this card" to make it your hero card, or Customise it —
 * one customise per copy you own, and what it can change rises with rarity.
 */
export default function QuestVault({ onClose }) {
  const { prof, vault } = useQuest();
  const { saveQuest } = useWorkout();
  const { showToast } = useToast();
  const art = useQuestArt();
  const t = useClock();
  const tick = Math.round(t * 10);
  const [filter, setFilter] = useState('owned');
  const [ins, setIns] = useState(null);
  const [rev, setRev] = useState(null);
  const [forge, setForge] = useState(null);
  const fileRef = useRef(null);
  useBackHandler(!ins && !rev && !forge, onClose);
  useBackHandler(!!ins && !forge, () => setIns(null));
  useBackHandler(!!rev, () => setRev(null));
  useBackHandler(!!forge, () => setForge(null));

  const owned = (id) => !!vault.owned[id];
  const ownedIds = CARDS.filter((c) => owned(c.id)).map((c) => c.id);
  const heroId = vault.favs?.[0];
  const thumbs = useThumbs(ownedIds, art);
  const list = CARDS.filter((c) => filter === 'all' || (filter === 'owned' ? owned(c.id) : c.rarity === filter));
  const eff = (id) => effCard(CARDS[id - 1], art[id]);
  const fail = (e) => showToast('Not saved: ' + e.message, 'error');
  const updVault = (fn) => saveQuest((cur) => ({ ...cur, vault: fn(cur.vault?.owned ? cur.vault : VAULT_START) })).catch(fail);

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
    }).catch(fail);
    setIns(null);
    setRev({ id: c.id, t0: t, isNew: n === 1, n });
  };
  const pickCard = (id) => updVault((v) => ({ ...v, favs: [id] }));
  const step = (d) => { const i = list.findIndex((c) => c.id === ins); if (list.length) setIns(list[(i + d + list.length) % list.length].id); };
  const startForge = (slot) => { const e = eff(slot); setForge({ slot, name: e.name, style: e.style, pal: e.pal, img: art[slot]?.img || null, err: '' }); };
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
  // Saving spends one customise (one copy's worth) on this card.
  const saveForge = async () => {
    if (!editsLeft(vault, forge.slot)) return;
    try {
      await saveArt(forge.slot, { name: forge.name, style: forge.style, pal: forge.pal, img: forge.img });
      await updVault((v) => ({ ...v, edits: { ...(v.edits || {}), [forge.slot]: ((v.edits || {})[forge.slot] || 0) + 1 } }));
      setForge(null);
      showToast('Card customised', 'success');
    } catch (e) { setForge((f) => f && { ...f, err: e.message }); }
  };

  const panel = { background: '#0e0e0e', borderRadius: 28, padding: 16 };
  const ic = ins ? eff(ins) : null, io = !!ic && owned(ins), icN = ins ? vault.owned[ins] || 0 : 0;
  const left = ins ? editsLeft(vault, ins) : 0;
  const rc = rev ? eff(rev.id) : null, dt = rev ? t - rev.t0 : 0;
  let deg = 0, shake = 0;
  if (dt < 0.7) shake = Math.sin(dt * 55) * 5 * Math.min(1, dt / 0.5);
  else if (dt < 1.2) deg = 180 * (1 - Math.pow(1 - (dt - 0.7) / 0.5, 3));
  else deg = 180;
  const infoOp = Math.min(1, Math.max(0, (dt - 1.2) / 0.3));
  const fc = forge ? CARDS[forge.slot - 1] : null;
  const rights = fc ? FORGE_RIGHTS[fc.rarity] : null;
  const fcard = forge ? { ...fc, name: forge.name, style: forge.style, pal: forge.pal } : null;
  const hero = heroId && owned(heroId) ? eff(heroId) : null;
  const packs = prof.packs || 0;
  const lockTag = (k) => <span style={{ marginLeft: 6, font: `500 8px ${MONO}`, letterSpacing: '.12em', color: '#666' }}>· {RIGHTS_LABEL[k]}</span>;

  return createPortal(
    <div className="fixed inset-0 z-[220] overflow-y-auto flex justify-center items-start" style={{ background: '#050505', color: '#f0f0f0', fontFamily: DISPLAY }}>
      <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: 480, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 14px 32px' }}>
        <div className="flex justify-between items-end gap-3" style={{ padding: '0 6px' }}>
          <div>
            <button onClick={onClose} style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>‹ BACK TO HERO CARD</button>
            <div style={{ marginTop: 4, fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>Card Vault</div>
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

        {/* Packs: the reason to come in here */}
        <div className="relative overflow-hidden" style={{ ...panel, padding: 18, background: packs ? 'radial-gradient(ellipse at 25% 50%, rgba(255,34,34,.18), #0e0e0e 70%)' : '#0e0e0e' }}>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0" style={{ width: 104, height: 140 }}>
              {[-10, 0, 9].map((r, i) => (
                <div key={i} className="absolute inset-0" style={{
                  transform: `rotate(${r}deg) translateY(${packs ? Math.sin(t * 2 + i) * 3 : 0}px)`, borderRadius: 14, padding: 2,
                  background: packs ? '#ff2222' : '#2a2a2a', boxShadow: packs ? `0 0 ${18 + Math.sin(t * 3) * 6}px rgba(255,34,34,.45)` : 'none', opacity: 2 - i < Math.max(1, Math.min(3, packs)) || !packs ? 1 : 0.25 }}>
                  <div className="w-full h-full overflow-hidden" style={{ borderRadius: 12 }}><Back /></div>
                </div>
              ))}
              {packs > 0 && (
                <span className="absolute flex items-center justify-center" style={{ right: -8, top: -8, minWidth: 30, height: 30, padding: '0 8px', borderRadius: 15, background: '#fbbf24', color: '#050505', font: `700 14px ${MONO}`, boxShadow: '0 0 0 3px #0e0e0e' }}>×{packs}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em', color: '#ff2222' }}>CARD PACKS</div>
              <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                {packs ? `${packs} pack${packs > 1 ? 's' : ''} to open` : 'No packs yet'}
              </div>
              <div style={{ marginTop: 6, font: `400 11px ${MONO}`, color: '#999', lineHeight: 1.5 }}>
                {packs ? 'One card each. Doubles add a customise.' : 'Clear a quest to earn one.'}
              </div>
            </div>
          </div>
          <button onClick={openPack} disabled={!packs} className="w-full active:scale-[.98] disabled:opacity-40"
            style={{ marginTop: 16, height: 58, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 16 }}>
            {packs ? 'Open a pack' : 'Clear a quest for a pack'}
          </button>
        </div>

        {hero && (
          <button onClick={() => setIns(heroId)} className="flex items-center gap-3 text-left" style={{ ...panel, padding: 12, borderRadius: 22 }}>
            <div className="flex-shrink-0" style={{ width: 44, padding: 2, borderRadius: 9, background: frameOf(hero, tick) }}>
              <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 7, background: '#0b0b0b' }}>
                <div className="absolute inset-0" style={{ backgroundImage: thumbs[heroId] || 'none', backgroundSize: 'cover' }} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ font: `500 9px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>YOUR HERO CARD</div>
              <div className="truncate" style={{ marginTop: 2, fontSize: 15, fontWeight: 800 }}>{hero.name}</div>
            </div>
            <span style={{ font: `400 10px ${MONO}`, color: '#666' }}>Tap any card to change</span>
          </button>
        )}

        <div style={panel}>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {FILTERS.map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className="flex-shrink-0" style={{ height: 32, padding: '0 11px', borderRadius: 10, background: filter === k ? '#ff2222' : '#171717', color: filter === k ? '#fff' : '#999', font: `500 11px ${MONO}`, letterSpacing: '.06em' }}>{l}</button>
            ))}
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 14 }}>
            {list.map((c) => {
              const e = eff(c.id), o = owned(c.id), n = vault.owned[c.id] || 0, edits = editsLeft(vault, c.id);
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
                        {c.id === heroId && <span className="absolute" style={{ top: 6, left: 6, padding: '2px 5px', borderRadius: 6, background: '#ff2222', color: '#fff', font: `600 8px ${MONO}`, letterSpacing: '.1em' }}>HERO</span>}
                        <span className="absolute flex gap-1" style={{ top: 6, right: 6 }}>
                          {n > 1 && <span style={{ padding: '2px 5px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 9px ${MONO}` }}>×{n}</span>}
                          {edits > 0 && <span style={{ padding: '2px 5px', borderRadius: 6, background: 'rgba(5,5,5,.85)', color: '#fbbf24', font: `500 9px ${MONO}` }}>✎{edits}</span>}
                        </span>
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
          {!list.length && <div className="text-center" style={{ padding: 24, font: `400 12px ${MONO}`, color: '#666' }}>None yet — open a pack.</div>}
        </div>
      </div>

      {ic && !forge && (
        <div onClick={() => setIns(null)} className="fixed inset-0 z-[230] overflow-y-auto flex justify-center items-start" style={{ background: '#050505', padding: '28px 18px' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-3.5" style={{ maxWidth: 330 }}>
            <div style={{ padding: 3, borderRadius: 20, background: io ? frameOf(ic, tick) : '#2a2a2a', boxShadow: `0 0 48px ${io ? glowOf(ic) : 'transparent'}` }}>
              <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 17, background: '#0b0b0b' }}>
                {io ? (
                  <>
                    <DitherCard card={ic} img={art[ins]?.img} style={{ imageRendering: 'pixelated' }} />
                    <div className="absolute" style={{ left: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `600 10px ${MONO}`, letterSpacing: '.14em', color: RAR[ic.rarity].col }}>{RAR[ic.rarity].name}</div>
                    <div className="absolute" style={{ right: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 10px ${MONO}` }}>#{ic.num}</div>
                  </>
                ) : <Back label={`CARD #${ic.num}`} />}
              </div>
            </div>
            <div style={{ padding: '0 4px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{io ? ic.name : `Card #${ic.num}`}</div>
              <div style={{ marginTop: 6, font: `400 11px ${MONO}`, color: '#999' }}>
                {io ? `${RAR[ic.rarity].name} · ${styleName(ic.style).toUpperCase()}${ic.anim ? ' · ANIMATED' : ''} · ×${icN} owned` : `Not found yet · ${RAR[ic.rarity].name.toLowerCase()} drop`}
              </div>
            </div>
            {io && (
              ins === heroId ? (
                <div className="flex items-center justify-center" style={{ height: 56, borderRadius: 18, background: 'rgba(255,34,34,.1)', boxShadow: 'inset 0 0 0 1.5px #ff2222', color: '#ff2222', fontWeight: 800, fontSize: 15 }}>✓ Your hero card</div>
              ) : (
                <button onClick={() => pickCard(ins)} style={{ height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 16 }}>Use this card</button>
              )
            )}
            {io && (
              <button onClick={() => left && startForge(ins)} disabled={!left} className="disabled:opacity-50" style={{ height: 48, borderRadius: 16, background: '#171717', fontWeight: 700, fontSize: 13 }}>
                {left ? `Customise · ${left} left` : 'Customised · find a double for another'}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => step(-1)} aria-label="Previous card" style={{ width: 56, height: 48, borderRadius: 16, background: '#0e0e0e', font: `500 20px ${MONO}` }}>‹</button>
              <button onClick={() => setIns(null)} className="flex-1" style={{ height: 48, borderRadius: 16, background: '#0e0e0e', fontWeight: 700, fontSize: 13 }}>Close</button>
              <button onClick={() => step(1)} aria-label="Next card" style={{ width: 56, height: 48, borderRadius: 16, background: '#0e0e0e', font: `500 20px ${MONO}` }}>›</button>
            </div>
          </div>
        </div>
      )}

      {rc && (
        <div className="fixed inset-0 z-[240] overflow-y-auto flex flex-col items-center justify-center gap-[18px]" style={{ background: '#050505', padding: '24px 18px' }}>
          <div style={{ font: `600 12px ${MONO}`, letterSpacing: '.24em', color: RAR[rc.rarity].col, opacity: infoOp }}>{RAR[rc.rarity].name}</div>
          <div style={{ width: 280, maxWidth: '76vw', perspective: 1000 }}>
            <div className="relative" style={{ aspectRatio: '5 / 7', transformStyle: 'preserve-3d', transform: `translateX(${shake}px) rotateY(${deg}deg)` }}>
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', padding: 3, borderRadius: 20, background: '#2a2a2a' }}><div className="w-full h-full overflow-hidden" style={{ borderRadius: 17 }}><Back /></div></div>
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
            <div style={{ marginTop: 6, font: `400 11px ${MONO}`, color: '#999' }}>{rev.isNew ? `NEW · #${rc.num} added to your vault` : `DOUBLE · ×${rev.n} owned · +1 customise`}</div>
          </div>
          <div className="flex flex-col gap-2 w-full" style={{ maxWidth: 330, opacity: infoOp }}>
            <button onClick={() => { pickCard(rev.id); setRev(null); }} style={{ height: 52, borderRadius: 18, background: '#171717', boxShadow: 'inset 0 0 0 1.5px #ff2222', fontWeight: 800, fontSize: 14 }}>Use this card</button>
            <div className="flex gap-2">
              <button onClick={() => setRev(null)} className="flex-1" style={{ height: 56, borderRadius: 18, background: '#171717', fontWeight: 700, fontSize: 14 }}>Done</button>
              <button onClick={openPack} disabled={!packs} className="disabled:opacity-40" style={{ flex: 2, height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>
                {packs ? `Open another · ${packs}` : 'No packs left'}
              </button>
            </div>
          </div>
        </div>
      )}

      {forge && (
        <div onClick={() => setForge(null)} className="fixed inset-0 z-[250] overflow-y-auto flex justify-center items-start" style={{ background: '#050505', padding: '24px 14px' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-4" style={{ maxWidth: 400, background: '#0e0e0e', borderRadius: 28, padding: 18 }}>
            <div>
              <div style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em', color: '#ff2222' }}>CUSTOMISE · {editsLeft(vault, forge.slot)} LEFT</div>
              <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>Card #{fc.num}</div>
              <div style={{ marginTop: 4, font: `400 11px ${MONO}`, color: '#999', lineHeight: 1.5 }}>
                Saving uses one customise. {RAR[fc.rarity].name[0] + RAR[fc.rarity].name.slice(1).toLowerCase()} cards can change {Object.keys(rights).filter((k) => rights[k]).map((k) => ({ pal: 'palette', style: 'effect', name: 'name', img: 'image' }[k])).join(', ')}.
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
                <input value={forge.name} disabled={!rights.name} onChange={(e) => setForge({ ...forge, name: e.target.value })} aria-label="Card name"
                  className="w-full outline-none disabled:opacity-40" style={{ height: 44, borderRadius: 12, background: '#171717', color: '#f0f0f0', padding: '0 12px', font: `700 14px ${DISPLAY}` }} />
                {!rights.name && <div style={{ marginTop: -4, font: `500 8px ${MONO}`, letterSpacing: '.12em', color: '#666' }}>NAME · {RIGHTS_LABEL.name}</div>}
                <button onClick={() => rights.img && fileRef.current?.click()} disabled={!rights.img} className="disabled:opacity-40" style={{ height: 44, borderRadius: 12, background: '#171717', fontWeight: 700, fontSize: 13 }}>
                  {rights.img ? (forge.img ? 'Replace image' : 'Upload your image') : 'Own image · Legendary'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                {art[forge.slot] && (
                  <button onClick={() => resetArt(forge.slot).then(() => startForge(forge.slot)).catch((e) => setForge((f) => f && { ...f, err: e.message }))}
                    style={{ height: 32, borderRadius: 10, color: '#ef4444', font: `500 11px ${MONO}` }}>Back to original</button>
                )}
              </div>
            </div>
            <div style={{ opacity: rights.style ? 1 : 0.4 }}>
              <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}>EFFECT{!rights.style && lockTag('style')}</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 8 }}>
                {STYLES.map(([k, l]) => (
                  <button key={k} disabled={!rights.style} onClick={() => setForge({ ...forge, style: k })} style={{ height: 38, borderRadius: 10, background: forge.style === k ? 'rgba(255,34,34,.12)' : '#171717', boxShadow: `inset 0 0 0 1.5px ${forge.style === k ? '#ff2222' : 'transparent'}`, font: `500 11px ${MONO}` }}>{l}</button>
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
              <button onClick={saveForge} style={{ flex: 2, height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>Save · use 1 customise</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
