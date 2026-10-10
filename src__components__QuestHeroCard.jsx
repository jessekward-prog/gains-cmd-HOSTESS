import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import useQuest from '../hooks/useQuest';
import useQuestArt from '../hooks/useQuestArt';
import DitherCard, { effCard } from './DitherCard';
import QuestVault from './QuestVault';
import { CARDS, RAR, PAL } from '../lib/dither';
import {
  BORDERS, RARITY, PETS, HEROES, borderCss, ownsBorder, ownsPet, equippedBorder, lvTitle, xpMult,
  LV_TITLES,
} from '../lib/quest';

const MONO = "'DM Mono', var(--font-mono), monospace";
const DISPLAY = "'Manrope', var(--font-display), sans-serif";

export function useFrame(ms = 100) {
  const [f, setF] = useState(0);
  useEffect(() => { const id = setInterval(() => setF((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
  return f;
}

/** The starred vault cards the hero card can feature (first = default). */
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
          <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: 'repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / 6px 6px', padding: '16px 14px 60px', font: `400 10px ${MONO}`, color: '#999' }}>Star a card in your vault</div>
        )}
        <div className="absolute left-0 right-0 bottom-0" style={{ padding: '8px 10px 9px', background: 'rgba(5,5,5,.9)' }}>
          <div className="flex justify-between items-baseline gap-1.5">
            <span className="truncate" style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f0f0' }}>{prof.hero.toUpperCase()}</span>
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
  const art = useQuestArt();
  const frame = useFrame();
  const [fi, setFi] = useState(0);
  const [borders, setBorders] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  useBackHandler(open && !vaultOpen, onClose);
  if (!open) return null;

  const lvl = prof.lvl;
  const favs = featuredCards(vault);
  const feat = favs[Math.min(fi, favs.length - 1)];
  const card = feat && effCard(feat, art[feat.id]);
  const bd = equippedBorder(prof, lvl), bc = borderCss(bd[0], frame);
  const title = lvTitle(lvl);
  const petDef = PETS.find((p) => p[0] === prof.pet && ownsPet(prof, lvl, p));
  const ups = [...LV_TITLES.filter((t) => t[0] > lvl).map((t) => [t[0], `TITLE "${t[1].toUpperCase()}"`]), ...PETS.filter((p) => p[2] > lvl).map((p) => [p[2], `${p[1].toUpperCase()} PET`])].sort((a, b) => a[0] - b[0]);
  const nextUp = ups.length ? ups.filter((u) => u[0] === ups[0][0]) : [];
  const owned = BORDERS.filter((x) => ownsBorder(prof, lvl, x));
  const cycle = (seq, cur) => seq[(seq.indexOf(cur) + 1) % seq.length];
  const btn = { height: 48, borderRadius: 16, background: '#0e0e0e', color: '#f0f0f0', font: `500 11px ${MONO}`, padding: '0 10px' };

  // The vault sits outside the backdrop: React events bubble through portals
  // along the component tree, so inside it every tap would close this card.
  return (<>{createPortal(
    <div onClick={onClose} className="fixed inset-0 z-[210] overflow-y-auto flex justify-center items-start" style={{ background: 'rgba(5,5,5,.97)', padding: '20px 18px 32px' }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full flex flex-col gap-3.5" style={{ maxWidth: 340, fontFamily: DISPLAY, color: '#f0f0f0', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex justify-between items-center">
          <span style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', color: '#666' }}>HERO CARD</span>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, marginRight: -10, borderRadius: 14, color: '#999', font: `400 20px ${MONO}` }}>×</button>
        </div>
        <div style={{ padding: bc[1], borderRadius: 18 + bc[1], background: bc[0], boxShadow: `0 0 40px ${bc[2]}` }}>
          <div className="relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 18, background: '#0b0b0b' }}>
            {card ? (
              <>
                <DitherCard card={card} img={art[feat.id]?.img} />
                <div className="absolute" style={{ left: 12, top: 12, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,5,5,.85)', font: `500 9px ${MONO}`, letterSpacing: '.14em', color: RAR[card.rarity].col }}>{RAR[card.rarity].name} · #{card.num}</div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: 'repeating-conic-gradient(#141414 0 25%, #0b0b0b 0 50%) 0 0 / 8px 8px', padding: '32px 24px 120px' }}>
                <div style={{ font: `400 11px ${MONO}`, color: '#999' }}>Star a card in your vault to feature it here.</div>
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
        </div>
        {favs.length > 1 && (
          <div className="flex justify-center gap-0.5" style={{ marginTop: -6 }}>
            {favs.map((c, i) => (
              <button key={c.id} onClick={() => setFi(i)} aria-label={c.name} className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c === feat ? RAR[c.rarity].col : '#3a3a3a' }} />
              </button>
            ))}
          </div>
        )}
        <div className="text-center" style={{ font: `400 10px ${MONO}`, letterSpacing: '.1em', color: '#666' }}>
          {prof.quests} QUEST{prof.quests === 1 ? '' : 'S'} · {prof.vol.toLocaleString()} KG · {prof.crits} CRITS · +{Math.round((xpMult(prof, lvl) - 1) * 100)}% XP
        </div>
        <div className="text-center" style={{ marginTop: -6, font: `400 10px ${MONO}`, letterSpacing: '.1em', color: '#666' }}>
          {nextUp.length ? `NEXT · LV ${nextUp[0][0]} · ${nextUp.map((u) => u[1]).join(' + ')}` : 'EVERY LEVEL REWARD UNLOCKED'}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <button className="min-w-0 truncate" style={btn} onClick={() => updProf((q) => ({ ...q, hero: cycle(Object.keys(HEROES), q.hero) }))}>Hero · {prof.hero}</button>
          <button className="min-w-0 truncate" style={btn} onClick={() => updProf((q) => ({ ...q, pet: cycle([null, ...PETS.filter((x) => ownsPet(q, q.lvl, x)).map((x) => x[0])], q.pet) }))}>
            {petDef ? `Pet · ${petDef[1]} +${petDef[2] ? 5 : 10}%` : 'Pet · none'}
          </button>
          <button className="min-w-0 truncate" style={btn} onClick={() => setBorders((b) => !b)}>Border · {bd[1]}</button>
          {prof.epithets.length > 0 && (
            <button className="min-w-0 truncate" style={btn} onClick={() => updProf((q) => ({ ...q, epithet: cycle([null, ...q.epithets], q.epithet) }))}>
              {prof.epithet ? `Epithet · ${prof.epithet}` : 'Epithet · none'}
            </button>
          )}
          <button className="min-w-0 truncate" style={btn} onClick={() => setVaultOpen(true)}>Vault{vault && prof.packs ? ` · ${prof.packs} pack${prof.packs > 1 ? 's' : ''}` : ''} →</button>
        </div>
        {borders && (
          <div style={{ background: '#0e0e0e', borderRadius: 20, padding: 14 }}>
            <div className="flex justify-between" style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: '#666' }}><span>BORDERS</span><span>{owned.length} / {BORDERS.length}</span></div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: 10 }}>
              {BORDERS.map((x) => {
                const own = ownsBorder(prof, lvl, x), on = own && bd[0] === x[0], b = borderCss(x[0], frame);
                return (
                  <button key={x[0]} onClick={() => own && updProf((q) => ({ ...q, border: x[0] }))}
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
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )}{vaultOpen && <QuestVault onClose={() => setVaultOpen(false)} />}</>);
}
