import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import useQuest from '../hooks/useQuest';
import useQuestArt from '../hooks/useQuestArt';
import DitherCard, { effCard } from './DitherCard';
import QuestVault from './QuestVault';
import { CARDS, RAR, PAL } from '../lib/dither';
import { useToast } from '../context/ToastContext';
import {
  BORDERS, RARITY, PETS, HEROES, ASSET, borderCss, ownsBorder, ownsPet, equippedBorder, lvTitle, xpMult,
  LV_TITLES,
} from '../lib/quest';

const MONO = "'DM Mono', var(--font-mono), monospace";
const DISPLAY = "'Manrope', var(--font-display), sans-serif";

export function useFrame(ms = 100) {
  const [f, setF] = useState(0);
  useEffect(() => { const id = setInterval(() => setF((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
  return f;
}

/** The vault card chosen as the hero card (Use this card), if still owned. */
export function featuredCards(vault) {
  return (vault.favs || []).filter((id) => vault.owned[id] && CARDS[id - 1]).map((id) => CARDS[id - 1]);
}
const rarFrame = (c, frame) => (!c ? '#2a2a2a' : c.rarity === 'L' ? `conic-gradient(from ${frame * 9}deg, #ff5ea8, #fbbf24, #6dff3a, #3aa0ff, #c084fc, #ff5ea8)`
  : c.rarity === 'E' ? '#c084fc' : c.rarity === 'R' ? PAL[c.pal][PAL[c.pal].length - 1] : '#3a3a3a');

/** Mini hero card for the title stage: top/right 14px, 14px clear of the ground. */
export function MiniHeroCard({ onOpen }) {
  const { prof, vault } = useQuest();
  const art = useQuestArt();
  const frame = useFrame();
  const feat = featuredCards(vault)[0];
  const card = feat && effCard(feat, art[feat.id]);
  const bc = borderCss(equippedBorder(prof, prof.lvl)[0], frame);
  const pad = Math.max(1, Math.round(bc[1] * 0.6));
  return (
    <button onClick={onOpen} aria-label="Open hero card" className="absolute block z-[6]"
      style={{ right: 14, top: 14, bottom: 100, aspectRatio: '5 / 7', padding: pad, borderRadius: 12 + pad, background: bc[0], boxShadow: `0 0 24px ${bc[2]}` }}>
      <div className="relative h-full overflow-hidden text-left" style={{ borderRadius: 12, background: '#0b0b0b' }}>
        {card ? <DitherCard card={card} img={art[feat.id]?.img} /> : (
          <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: 'repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / 6px 6px', padding: '16px 14px 60px', font: `400 10px ${MONO}`, color: '#999' }}>Pick a card in your vault</div>
        )}
        <div className="absolute left-0 right-0 bottom-0" style={{ padding: '8px 10px 9px', background: 'rgba(5,5,5,.9)' }}>
          <div className="flex justify-between items-baseline gap-1.5">
            <span className="truncate" style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f0f0' }}>{card ? card.name : 'No card yet'}</span>
            <span className="flex-shrink-0" style={{ font: `500 10px ${MONO}`, color: '#f0f0f0' }}>LV {prof.lvl}</span>
          </div>
          <div style={{ marginTop: 6, height: 2, background: '#2a2a2a' }}><div className="h-full" style={{ width: `${prof.xp / 10}%`, background: card ? RAR[card.rarity].col : '#f0f0f0' }} /></div>
        </div>
      </div>
    </button>
  );
}

/** Full-screen Hero Card: featured art in the equipped border, stats, pet/border/epithet/hero, vault. */
export default function QuestHeroCard({ open, onClose }) {
  const { prof, vault, updProf } = useQuest();
  const { showToast } = useToast();
  const art = useQuestArt();
  const frame = useFrame();
  const [panel, setPanel] = useState(null); // 'hero' | 'pet' | 'border'
  const toggle = (k) => setPanel((p) => (p === k ? null : k));
  // Every pick saves straight to the account; this just says so if it fails.
  const save = (fn) => updProf(fn).catch((e) => showToast('Not saved: ' + e.message, 'error'));
  const [vaultOpen, setVaultOpen] = useState(false);
  useBackHandler(open && !vaultOpen, onClose);
  if (!open) return null;

  const lvl = prof.lvl;
  const favs = featuredCards(vault);
  const feat = favs[0]; // the vault's chosen card (Use this card)
  const card = feat && effCard(feat, art[feat.id]);
  const bd = equippedBorder(prof, lvl), bc = borderCss(bd[0], frame);
  const title = lvTitle(lvl);
  const petDef = PETS.find((p) => p[0] === prof.pet && ownsPet(prof, lvl, p));
  const ups = [...LV_TITLES.filter((t) => t[0] > lvl).map((t) => [t[0], `TITLE "${t[1].toUpperCase()}"`]), ...PETS.filter((p) => p[2] > lvl).map((p) => [p[2], `${p[1].toUpperCase()} PET`])].sort((a, b) => a[0] - b[0]);
  const nextUp = ups.length ? ups.filter((u) => u[0] === ups[0][0]) : [];
  const owned = BORDERS.filter((x) => ownsBorder(prof, lvl, x));

  // The vault sits outside the backdrop: React events bubble through portals
  // along the component tree, so inside it every tap would close this card.
  return (<>{createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[210] overflow-y-auto flex justify-center items-start" style={{ background: '#050505', padding: '20px 18px 32px' }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-3.5" style={{ maxWidth: 340, fontFamily: DISPLAY, color: '#f0f0f0', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex justify-between items-center">
          <span style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', color: '#666' }}>HERO CARD</span>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, marginRight: -10, borderRadius: 14, color: '#999', font: `400 20px ${MONO}` }}>×</button>
        </div>
        <button onClick={() => setVaultOpen(true)} aria-label="Change card" className="block w-full text-left" style={{ padding: bc[1], borderRadius: 18 + bc[1], background: bc[0], boxShadow: `0 0 40px ${bc[2]}` }}>
          <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 18, background: '#0b0b0b' }}>
            {card ? (
              <>
                <DitherCard card={card} img={art[feat.id]?.img} />
                <div className="absolute" style={{ left: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 9px ${MONO}`, letterSpacing: '.14em', color: RAR[card.rarity].col }}>{RAR[card.rarity].name} · #{card.num}</div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: 'repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / 8px 8px', padding: '32px 24px 120px' }}>
                <div style={{ font: `400 11px ${MONO}`, color: '#999' }}>Tap here to pick a card from your vault.</div>
              </div>
            )}
            <div className="absolute left-0 right-0 bottom-0" style={{ padding: '14px 14px 16px', background: 'rgba(5,5,5,.9)' }}>
              <div className="flex justify-between items-baseline gap-2.5">
                <span className="truncate" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{prof.hero.toUpperCase()}</span>
                <span className="flex-shrink-0" style={{ font: `500 12px ${MONO}` }}>LV {lvl}</span>
              </div>
              <div className="truncate" style={{ marginTop: 5, font: `400 11px ${MONO}`, color: '#999' }}>{prof.epithet ? `${title}, ${prof.epithet}` : title}</div>
              <div className="overflow-hidden" style={{ marginTop: 10, height: 3, borderRadius: 2, background: '#2a2a2a' }}>
                <div className="h-full" style={{ width: `${prof.xp / 10}%`, background: card ? RAR[card.rarity].col : '#f0f0f0' }} />
              </div>
            </div>
          </div>
        </button>
        <button onClick={() => setVaultOpen(true)} className="self-center" style={{ marginTop: -4, font: `500 11px ${MONO}`, letterSpacing: '.08em', color: '#ff9a3c' }}>Change card in the vault ›</button>
        <div className="text-center" style={{ font: `400 10px ${MONO}`, letterSpacing: '.1em', color: '#666' }}>
          {prof.quests} QUEST{prof.quests === 1 ? '' : 'S'} · {prof.vol.toLocaleString()} KG · {prof.crits} CRITS · +{Math.round((xpMult(prof, lvl) - 1) * 100)}% XP
        </div>
        <div className="text-center" style={{ marginTop: -6, font: `400 10px ${MONO}`, letterSpacing: '.1em', color: '#666' }}>
          {nextUp.length ? `NEXT · LV ${nextUp[0][0]} · ${nextUp.map((u) => u[1]).join(' + ')}` : 'EVERY LEVEL REWARD UNLOCKED'}
        </div>
        {/* Each option is a tile like the Card Vault one; its picker opens right under it. */}
        <OptionRow open={panel === 'hero'} onClick={() => toggle('hero')} title="Hero" sub={`${prof.hero} · ${Object.keys(HEROES).length} to choose from`}
          icon={<SpriteIcon src={`${ASSET}sprites/${HEROES[prof.hero]?.[0] || 'warrior'}_idle_0.png`} h={HEROES[prof.hero] || HEROES.Warlord} />} />
        {panel === 'hero' && (
          <Picker title="HERO" count={`${Object.keys(HEROES).length}`}>
            {Object.entries(HEROES).map(([name, h]) => (
              <Tile key={name} on={prof.hero === name} onClick={() => save((q) => ({ ...q, hero: name }))}
                img={`${ASSET}sprites/${h[0]}_idle_0.png`} frame={{ w: h[1], h: h[2], cx: h[4] }} name={name} sub={prof.hero === name ? 'CHOSEN' : ''} />
            ))}
          </Picker>
        )}

        <OptionRow open={panel === 'pet'} onClick={() => toggle('pet')} title="Pet"
          sub={petDef ? `${petDef[1]} · +${petDef[2] ? 5 : 10}% XP` : `None · ${PETS.filter((p) => ownsPet(prof, lvl, p)).length} of ${PETS.length} found`}
          icon={petDef ? <img src={`${ASSET}sprites/pet_${petDef[0]}_0.png`} alt="" style={{ height: 40, imageRendering: 'pixelated' }} /> : <EmptyIcon />} />
        {panel === 'pet' && (
          <Picker title="PETS" count={`${PETS.filter((p) => ownsPet(prof, lvl, p)).length} / ${PETS.length}`}>
            <Tile on={!petDef} onClick={() => save((q) => ({ ...q, pet: null }))} name="None" sub={!petDef ? 'CHOSEN' : ''} />
            {PETS.map((p) => {
              const own = ownsPet(prof, lvl, p), on = own && prof.pet === p[0];
              return (
                <Tile key={p[0]} on={on} locked={!own} onClick={() => own && save((q) => ({ ...q, pet: p[0] }))}
                  img={`${ASSET}sprites/pet_${p[0]}_0.png`} name={own ? p[1] : '???'}
                  sub={on ? 'CHOSEN' : own ? (p[2] ? '+5% XP' : '+10% XP') : p[2] ? `LV ${p[2]}` : 'CHEST'} />
              );
            })}
          </Picker>
        )}

        <OptionRow open={panel === 'border'} onClick={() => toggle('border')} title="Border" sub={`${bd[1]} · ${owned.length} of ${BORDERS.length} unlocked`}
          icon={<div style={{ width: 34, height: 46, padding: Math.max(1, Math.round(bc[1] / 2)), borderRadius: 8, background: bc[0], boxShadow: `0 0 12px ${bc[2]}` }}><div className="w-full h-full" style={{ borderRadius: 6, background: '#0b0b0b' }} /></div>} />
        {panel === 'border' && (
          <Picker title="BORDERS" count={`${owned.length} / ${BORDERS.length}`}>
            {BORDERS.map((x) => {
              const own = ownsBorder(prof, lvl, x), on = own && bd[0] === x[0], b = borderCss(x[0], frame);
              return (
                <button key={x[0]} onClick={() => own && save((q) => ({ ...q, border: x[0] }))}
                  className="flex flex-col items-center justify-end gap-1"
                  style={{ height: 104, borderRadius: 14, background: on ? 'rgba(255,34,34,.1)' : '#171717', boxShadow: `inset 0 0 0 1.5px ${on ? '#ff2222' : 'transparent'}`, color: '#f0f0f0', padding: '8px 2px' }}>
                  <div style={{ width: 34, height: 46, padding: Math.max(1, Math.round(b[1] / 2)), borderRadius: 8, background: b[0], boxShadow: `0 0 12px ${own ? b[2] : 'transparent'}`, opacity: own ? 1 : 0.3 }}>
                    <div className="w-full h-full" style={{ borderRadius: 6, background: '#0b0b0b' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{x[1]}</span>
                  <span style={{ font: `500 8px ${MONO}`, letterSpacing: '.08em', color: on ? '#ff2222' : own ? RARITY[x[2]][1] : '#666' }}>
                    {on ? 'EQUIPPED' : own ? RARITY[x[2]][0] : x[3] > 0 ? `LV ${x[3]}` : 'CHEST'}
                  </span>
                </button>
              );
            })}
          </Picker>
        )}

        <OptionRow open={panel === 'epithet'} onClick={() => prof.epithets.length && toggle('epithet')} title="Epithet"
          sub={prof.epithets.length ? `${prof.epithet || 'None'} · ${prof.epithets.length} won` : 'Win one from a Rare chest'}
          dim={!prof.epithets.length} icon={<FeatherIcon />} />
        {panel === 'epithet' && (
          <Picker title="EPITHETS" count={`${prof.epithets.length} / 8`} wrap>
            {[null, ...prof.epithets].map((e) => (
              <button key={e || 'none'} onClick={() => save((q) => ({ ...q, epithet: e }))}
                style={{ height: 38, padding: '0 12px', borderRadius: 12, background: prof.epithet === e ? 'rgba(255,34,34,.1)' : '#171717', boxShadow: `inset 0 0 0 1.5px ${prof.epithet === e ? '#ff2222' : 'transparent'}`, font: `500 11px ${MONO}` }}>
                {e || 'None'}
              </button>
            ))}
          </Picker>
        )}

        <button onClick={() => setVaultOpen(true)} className="flex items-center gap-3.5 text-left"
          style={{ padding: 14, borderRadius: 20, background: prof.packs ? 'radial-gradient(ellipse at 15% 50%, rgba(255,34,34,.2), #0e0e0e 70%)' : '#0e0e0e', boxShadow: `inset 0 0 0 1.5px ${prof.packs ? '#ff2222' : '#2a2a2a'}` }}>
          <span className="relative flex-shrink-0" style={{ width: 40, height: 52 }}>
            {[-9, 7].map((r) => <span key={r} className="absolute inset-0" style={{ borderRadius: 7, background: '#141414', boxShadow: 'inset 0 0 0 1.5px #ff2222', transform: `rotate(${r}deg)` }} />)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Card Vault</span>
            <span className="block truncate" style={{ marginTop: 2, font: `400 11px ${MONO}`, color: '#999' }}>
              {prof.packs ? `${prof.packs} pack${prof.packs > 1 ? 's' : ''} to open · ` : ''}{Object.keys(vault.owned).length} cards · change your card
            </span>
          </span>
          <span style={{ font: `500 18px ${MONO}`, color: prof.packs ? '#ff2222' : '#666' }}>›</span>
        </button>

        <button onClick={onClose} style={{ height: 56, borderRadius: 18, background: '#ff2222', color: '#fff', fontWeight: 800, fontSize: 15 }}>Save card</button>
        <div className="text-center" style={{ marginTop: -6, font: `400 10px ${MONO}`, color: '#666' }}>Every change is saved to your account as you make it.</div>
      </div>
    </div>,
    document.body,
  )}{vaultOpen && <QuestVault onClose={() => setVaultOpen(false)} />}</>);
}

// Opens below the big card, so it scrolls itself into view.
function Picker({ title, count, wrap, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  return (
    <div ref={ref} style={{ background: '#0e0e0e', borderRadius: 20, padding: 14, scrollMarginBottom: 16 }}>
      <div className="flex justify-between" style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}><span>{title}</span><span>{count}</span></div>
      <div className={wrap ? 'flex flex-wrap gap-1.5' : 'grid gap-1.5'} style={{ gridTemplateColumns: wrap ? undefined : 'repeat(4, minmax(0, 1fr))', marginTop: 10 }}>{children}</div>
    </div>
  );
}

// A sprite tile: the first idle frame, pixel-crisp; locked ones are silhouettes.
// `frame` (heroes): sprite size and the x of the body in it, so the hero is
// centred in the tile however the frame is padded.
function Tile({ on, locked, onClick, img, frame, name, sub }) {
  const k = frame && Math.min(2.2, 56 / frame.h);
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-end gap-1 min-w-0"
      style={{ height: 104, borderRadius: 14, background: on ? 'rgba(255,34,34,.1)' : '#171717', boxShadow: `inset 0 0 0 1.5px ${on ? '#ff2222' : 'transparent'}`, color: '#f0f0f0', padding: '8px 2px' }}>
      <div className="flex-1 w-full flex items-end justify-center overflow-hidden">
        {img && frame && (
          <div className="w-full" style={{ height: frame.h * k, backgroundImage: `url(${img})`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
            backgroundSize: `${frame.w * k}px ${frame.h * k}px`, backgroundPosition: `calc(50% - ${(frame.cx - frame.w / 2) * k}px) bottom` }} />
        )}
        {img && !frame && <img src={img} alt="" style={{ height: 40, imageRendering: 'pixelated', filter: locked ? 'brightness(0)' : 'none', opacity: locked ? 0.6 : 1 }} />}
      </div>
      <span className="truncate max-w-full" style={{ fontSize: 11, fontWeight: 700 }}>{name}</span>
      <span style={{ font: `500 8px ${MONO}`, letterSpacing: '.08em', color: on ? '#ff2222' : locked ? '#666' : '#999', minHeight: 10 }}>{sub}</span>
    </button>
  );
}

// A Hero Card option as a tile (same shape as the Card Vault tile).
function OptionRow({ icon, title, sub, open, onClick, dim }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3.5 text-left"
      style={{ padding: 14, borderRadius: 20, background: '#0e0e0e', boxShadow: `inset 0 0 0 1.5px ${open ? '#ff2222' : '#2a2a2a'}`, opacity: dim ? 0.55 : 1 }}>
      <span className="flex-shrink-0 flex items-end justify-center overflow-hidden" style={{ width: 40, height: 52 }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</span>
        <span className="block truncate" style={{ marginTop: 2, font: `400 11px ${MONO}`, color: '#999' }}>{sub}</span>
      </span>
      <span className="inline-block transition-transform" style={{ font: `500 18px ${MONO}`, color: open ? '#ff2222' : '#666', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
    </button>
  );
}

// The chosen hero's first idle frame, centred on its body like the picker tiles.
function SpriteIcon({ src, h }) {
  const k = Math.min(1.6, 50 / h[2]);
  return <div className="w-full" style={{ height: h[2] * k, backgroundImage: `url(${src})`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated',
    backgroundSize: `${h[1] * k}px ${h[2] * k}px`, backgroundPosition: `calc(50% - ${(h[4] - h[1] / 2) * k}px) bottom` }} />;
}
const EmptyIcon = () => <div style={{ width: 30, height: 30, marginBottom: 10, borderRadius: 8, boxShadow: 'inset 0 0 0 1.5px #3a3a3a', background: 'repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / 6px 6px' }} />;
// Lucide "feather" (an epithet is a flourish on your title).
const FeatherIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 11 }}>
    <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
    <path d="M16 8 2 22" /><path d="M17.5 15H9" />
  </svg>
);
