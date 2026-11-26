import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import DitherCard from './DitherCard';
import { useHaptics } from '../hooks/useHaptics';
import useBackHandler from '../hooks/useBackHandler';
import { ASSET, SIZES, titleCase, MON_NAMES } from '../lib/quest';

const MONO = 'var(--font-mono)';
export const FAN_ROW_H = 28; // the row above the cards: group brackets and ⋯
const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ASPECT = 7 / 5, PEEK_MIN = 34, PEEK_MAX = 140, RING = 5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Long names break before an underscore run rather than mid-word, and never leave one character alone.
const parts = (name) => name.replace(/ (?=\S$)/, '\u00a0').split(/(?<=[^_])(?=_)/).map((t, k) => <span key={k}>{k > 0 && <wbr />}{t}</span>);

// The quest favourites as stacked vault cards, all whole 5:7 pictures: the open one on
// top, the rest tucked behind it as strips with their names on the edge that shows.
// Swipe (wraps at the ends) or tap a card to choose; tap the open card for its
// exercises, which grow up over the screen by `grow` px so nothing under them moves.
// `menu`: the ⋯ button, at the end of the group row. `items`: [{ key, name, info, next, g, card, img, rows }], rows one per
// monster: { sprite, lines: [[exercise, target]] }. `index`: the chosen favourite, -1 for none.
export default function QuestFan({ items, index, height, grow, menu, onPick, onPicture }) {
  const haptics = useHaptics();
  const n = items.length;
  const box = useRef(null), bar = useRef(null), els = useRef([]);
  const [list, setList] = useState(false);
  const [open, setOpen] = useState(Math.max(0, index)); // the card that's wide
  // p: position along the fan. e: 0 fan, 1 exercise list. over: pull past an end.
  const s = useRef({ p: Math.max(0, index), to: Math.max(0, index), e: 0, eTo: 0, over: 0, raf: 0, last: 0, shown: -1 }).current;
  const drag = useRef(null), moved = useRef(false);

  const layout = useCallback(() => {
    const W = box.current?.clientWidth;
    if (!W || !n) return;
    const { e, over } = s, H = height + grow * e, q = clamp(s.p, 0, n - 1);
    const mix = (a, b, t) => a + (b - a) * t;
    const big = Math.min(height / ASPECT, W), peek = n > 1 ? clamp((W - big) / (n - 1), PEEK_MIN, PEEK_MAX) : 0;
    const total = big + (n - 1) * peek, mid = q * peek + big / 2;
    const off = (total <= W ? (total - W) / 2 : clamp(mid - W / 2, 0, total - W)) + over * 46;
    // Two cards changing places slide apart to pass, so neither jumps through the other.
    const apart = 34 * Math.sin(Math.PI * (q - Math.floor(q)));
    const pos = items.map((_, i) => {
      const d = i - q, f = Math.max(0, 1 - Math.abs(d));
      return { d, f, x: i * peek - off, w: big, pass: f > 0 && f < 1 ? Math.sign(d) * apart : 0 };
    });
    box.current.style.height = `${H}px`;
    items.forEach((it, i) => {
      const el = els.current[i];
      if (!el) return;
      const { d, f, x, pass } = pos[i], o = Math.max(0, (f - 0.6) / 0.4), name = (1 - e) * Math.max(0, 1 - f * 2.2);
      const w = mix(big, W, e), h = mix(big * ASPECT, H, e), $ = (k) => el.querySelector(`[data-fan="${k}"]`);
      el.style.width = `${w}px`; el.style.zIndex = Math.round(100 - Math.abs(d) * 10);
      el.style.opacity = mix(1, f > 0 ? 1 : 0, e);
      el.style.transform = `translate(${mix(x + pass, d * W, e)}px, ${(H - h) / 2}px)`;
      $('face').style.height = `${h}px`;
      const art = $('art'), aw = Math.max(w, h / ASPECT); // only the list's backdrop ever crops
      art.style.width = `${aw}px`; art.style.height = `${aw * ASPECT}px`; art.style.filter = `brightness(${mix(0.75, 1, f)})`;
      art.style.transform = `translate(${(w - aw) / 2}px, ${(h - aw * ASPECT) / 2}px)`;
      const show = (k, v, on, width) => { const t = $(k); t.style.opacity = v; t.style.visibility = on ? 'visible' : 'hidden'; if (width) t.style.width = width; };
      show('text', o * (1 - e), o > 0.05 && e < 0.95, `${big - 24}px`);
      show('pic', o * (1 - e), o > 0.5 && e < 0.4);
      show('next', o * (1 - e), o > 0.05);
      show('name', name, name > 0);
      $('name').style.left = `${d < 0 ? peek / 2 : big - peek / 2}px`;
      show('list', o * e, o * e > 0.05, `${W}px`);
    });
    if (bar.current) {
      bar.current.style.opacity = 1 - e;
      // A bracket spans only what shows of its cards: one tucked to the left shows up to
      // the next card's edge, one tucked to the right from the previous card's.
      const left = (i) => mix(pos[i].x, i ? pos[i - 1].x + big + RING : 0, clamp(pos[i].d, 0, i ? 1 : 0));
      const right = (i) => mix(pos[i].x + big, i < n - 1 ? pos[i + 1].x - RING : 0, clamp(-pos[i].d, 0, i < n - 1 ? 1 : 0));
      [...bar.current.children].forEach((b) => {
        const from = +b.dataset.from, to = +b.dataset.to;
        if (!pos[to]) return;
        const l = left(from), r = right(to);
        b.style.left = `${l}px`; b.style.width = `${Math.max(0, r - l)}px`;
        const t = b.firstChild, num = t.lastChild;
        t.style.left = `${Math.min((r - l) / 2, Math.max(26, W - 54 - l))}px`; // centred, clear of ⋯
        // The count closes up with the bracket, gone well before it's at its smallest.
        const k = clamp((r - l - 120) / 80, 0, 1);
        num.style.maxWidth = `${k * 4}em`; num.style.opacity = k;
      });
    }
    const now = Math.round(q);
    if (now !== s.shown) { if (s.shown >= 0) haptics.tap(); s.shown = now; setOpen(now); }
  }, [items, n, height, grow]); // eslint-disable-line react-hooks/exhaustive-deps
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const run = () => {
    if (still()) { s.p = s.to; s.over = 0; s.e = s.eTo; layoutRef.current(); return; }
    if (s.raf) return;
    s.last = performance.now();
    const tick = (t) => {
      const k = 1 - Math.exp(-Math.min(0.05, (t - s.last) / 1000 || 0.016) * 13); s.last = t;
      s.p += (s.to - s.p) * k; s.over -= s.over * k; s.e += (s.eTo - s.e) * k;
      const done = Math.abs(s.to - s.p) < 0.002 && Math.abs(s.over) < 0.01 && Math.abs(s.eTo - s.e) < 0.004;
      if (done) { s.p = s.to; s.over = 0; s.e = s.eTo; }
      layoutRef.current();
      s.raf = done ? 0 : requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };
  const stop = () => { cancelAnimationFrame(s.raf); s.raf = 0; };
  const go = (i) => { s.to = clamp(i, 0, n - 1); run(); };
  // A settled choice is the quest that Begin starts.
  const choose = (i) => { const k = clamp(i, 0, n - 1); go(k); onPick(k); };
  const expand = (on) => { s.eTo = on ? 1 : 0; setList(on); haptics.tap(); run(); };
  useBackHandler(list, () => { expand(false); });

  // Follow the choice when it's made elsewhere; a non-favourite leaves the fan where it is.
  useEffect(() => { if (index >= 0 && index !== s.to) go(index); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.to > n - 1) { s.to = n - 1; s.p = Math.min(s.p, n - 1); } }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { layout(); }, [layout]);
  useEffect(() => {
    const ro = new ResizeObserver(() => layoutRef.current());
    ro.observe(box.current);
    return () => { ro.disconnect(); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const down = (ev) => {
    moved.current = false;
    if (ev.button) return;
    drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, p: s.p, lx: ev.clientX, lt: ev.timeStamp, v: 0 };
  };
  const move = (ev) => {
    const d = drag.current;
    if (!d || ev.pointerId !== d.id) return;
    const dx = ev.clientX - d.x;
    if (!moved.current) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(ev.clientY - d.y)) return;
      moved.current = true; box.current.setPointerCapture(d.id); stop();
      d.p = s.p; d.x = ev.clientX;
      return;
    }
    const dt = ev.timeStamp - d.lt;
    if (dt > 0) d.v = 0.7 * (ev.clientX - d.lx) / dt + 0.3 * d.v;
    d.lx = ev.clientX; d.lt = ev.timeStamp;
    const raw = d.p - dx / Math.max(130, box.current.clientWidth * 0.42);
    s.p = clamp(raw, 0, n - 1); s.over = clamp(raw - s.p, -1, 1);
    layout();
  };
  const up = (ev) => {
    const d = drag.current;
    if (!d || ev.pointerId !== d.id) return;
    drag.current = null;
    if (!moved.current) return;
    if (ev.type === 'pointercancel') choose(Math.round(s.p));
    else if (s.over > 0.28) choose(0);
    else if (s.over < -0.28) choose(n - 1);
    else choose(Math.abs(d.v) <= 0.35 ? Math.round(s.p) : d.v < 0 ? Math.ceil(s.p - 0.001) : Math.floor(s.p + 0.001));
  };
  const key = (ev) => {
    const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    ev.preventDefault(); choose((s.to + step + n) % n);
  };

  const groups = [];
  items.forEach((it, i) => {
    const g = groups.at(-1);
    if (it.g && g?.g === it.g) g.to = i; else if (it.g) groups.push({ g: it.g, from: i, to: i });
  });

  return (
    // Under the decode wave's glyph canvas (z 2), or its text decodes out of
    // sight behind the cards and pops on at the end; over the stage (z 2) only
    // while the exercise list grows up across it.
    <div className="relative" style={{ zIndex: list ? 3 : 1 }}>
      <div className="relative flex items-center" style={{ height: FAN_ROW_H }}>
        {groups.length > 0 ? (
          <div ref={bar} className="absolute inset-0 overflow-hidden" aria-hidden="true">
            {groups.map((g) => (
              <div key={g.g} data-from={g.from} data-to={g.to} className="absolute" style={{ top: 13, height: 20, border: '1.5px solid var(--color-text-secondary)', borderBottom: 0, borderRadius: '9px 9px 0 0' }}>
                <span className="absolute bg-bg-0 text-text-secondary whitespace-nowrap px-1.5" style={{ left: '50%', top: -8, transform: 'translateX(-50%)', font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>GROUP<span className="inline-block overflow-hidden whitespace-pre align-bottom">{` · ${g.to - g.from + 1}`}</span></span>
              </div>
            ))}
          </div>
        ) : <span className="text-text-tertiary px-1.5" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>FAVOURITES</span>}
        <div className="absolute right-0 top-0 bottom-0 flex items-center">{menu}</div>
      </div>
      <div style={{ height }} />
      <div ref={box} role="group" aria-label="Favourite quests" onKeyDown={key}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(ev) => { if (moved.current) { ev.stopPropagation(); ev.preventDefault(); moved.current = false; } }}
        className="absolute left-0 right-0 bottom-0 select-none" style={{ height, touchAction: 'pan-y', overflow: 'clip', overflowClipMargin: 14 }}>
        {items.map((it, i) => (
          <div key={it.key} ref={(el) => { els.current[i] = el; }} className="absolute left-0 top-0">
            <div data-fan="face" className="relative overflow-hidden" style={{ borderRadius: 14, background: '#0b0b0b', boxShadow: `0 0 0 ${RING}px var(--color-bg-0)` }}>
            <div data-fan="art" data-ascii="skip" className="absolute left-0 top-0 pointer-events-none">
              {it.card && <DitherCard card={it.card} img={it.img} still={i !== open || list || still()} />}
            </div>
            <button aria-label={i === open ? `${it.name}, show exercises` : it.name} aria-pressed={i === index} className="absolute inset-0 w-full"
              onClick={() => { if (i !== open || i !== index) choose(i); else expand(true); }} />
            <div data-fan="text" className="absolute pointer-events-none" style={{ left: 0, bottom: 0, boxSizing: 'content-box', padding: '36px 12px 12px', color: '#f6ece0', background: 'linear-gradient(to top, rgba(0,0,0,.9) 40%, rgba(0,0,0,0))' }}>
              <div style={{ fontSize: Math.max(...it.name.split(/\s+|(?<=[^_])(?=_)/).map((t) => t.length)) > 9 ? 18 : 21, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1.05, paddingBottom: '0.22em', marginBottom: '-0.22em', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{parts(it.name)}</div>
              <div style={{ marginTop: 3, font: `400 12px/1.3 ${MONO}`, color: '#ffd9b4' }}>{it.info}</div>
              <span className="inline-flex items-center" style={{ marginTop: 8, height: 34, padding: '0 14px', borderRadius: 17, background: '#f6ece0', color: '#1a0303', fontWeight: 800, fontSize: 13 }}>{it.count === 1 ? '1 exercise' : `All ${it.count} exercises`}</span>
            </div>
            <div data-fan="next" className="absolute pointer-events-none" style={{ display: it.next ? undefined : 'none', left: 8, top: 8, padding: '3px 7px', borderRadius: 6, background: 'rgba(0,0,0,.8)', color: '#f6ece0', font: `600 10px ${MONO}`, letterSpacing: '.1em' }}>UP NEXT</div>
            <button data-fan="pic" aria-label={`Change the picture for ${it.name}`} onClick={() => onPicture(i)}
              className="absolute flex items-center justify-center" style={{ right: 0, top: 0, width: 44, height: 44, color: '#f6ece0' }}>
              <span className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(0,0,0,.8)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4-4L6 21" /></svg>
              </span>
            </button>
            <div data-fan="list" className="absolute left-0 top-0 bottom-0 flex flex-col" style={{ background: 'rgba(0,0,0,.84)', color: '#f6ece0' }}>
              <div className="flex items-center gap-2 flex-shrink-0" style={{ padding: '10px 8px 8px 16px' }}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.3 }}>{it.name}</span>
                  <span className="block truncate" style={{ font: `400 12px ${MONO}`, color: '#ffd9b4' }}>{it.info}</span>
                </span>
                <button aria-label="Close the exercise list" onClick={() => expand(false)} className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 44, height: 44, borderRadius: 22, background: '#f6ece0', color: '#1a0303' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 16px 16px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}>
                {it.rows.map((r, k) => {
                  const [w, h] = SIZES[r.sprite] || [16, 16], z = 34 / Math.max(w, h);
                  return (
                    <div key={k} className="flex items-center gap-3" style={{ minHeight: 50, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.14)' }}>
                      <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 34 }}>
                        <img src={`${ASSET}sprites/${r.sprite}_0.png`} alt={titleCase(MON_NAMES[r.sprite] || '')} style={{ width: w * z, height: h * z, imageRendering: 'pixelated' }} />
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col gap-1">
                        {r.lines.map(([name, target], j) => (
                          <span key={j} className="flex items-baseline gap-3">
                            <span className="flex-1 min-w-0" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{name}</span>
                            <span className="flex-shrink-0" style={{ font: `400 12px ${MONO}`, color: '#ffd9b4' }}>{target}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {i === index && <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: 14, boxShadow: 'inset 0 0 0 2px #f6ece0' }} />}
            <span data-fan="name" className="absolute pointer-events-none whitespace-nowrap overflow-hidden"
              style={{ top: 16, maxHeight: '90%', textOverflow: 'ellipsis', writingMode: 'vertical-rl', transform: 'translateX(-50%)', fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: '#f6ece0', textShadow: '0 0 3px #000, 0 0 8px #000, 0 0 12px #000' }}>
              {/* Drawn from CSS so the decode wave fades it in instead: its glyph grid
                  draws upright, so sideways letters would flip round at the end. */}
              <span data-ascii="fade" data-text={it.name} className="fan-edge-name" />
            </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
