import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export const THEMES = [
  { id: 'default', name: 'Default', desc: 'Clean dark with red accent', mode: 'dark',
    preview: { bg: '#050505', surface: '#111111', accent: '#ff2222', text: '#f0f0f0' } },
  { id: 'cmd', name: 'CMD Terminal', desc: 'Black + red, monospace hacker aesthetic', mode: 'dark',
    preview: { bg: '#000000', surface: '#0f0f0f', accent: '#cc0000', text: '#e0e0e0' } },
  { id: 'blood', name: 'Blood & Iron', desc: 'Deep crimson, powerlifting dungeon', mode: 'dark',
    preview: { bg: '#050000', surface: '#120808', accent: '#8b0000', text: '#e8d8d8' } },
  { id: 'concrete', name: 'Concrete', desc: 'Grey + orange, utilitarian gym floor', mode: 'dark',
    preview: { bg: '#1a1a1a', surface: '#2a2a2a', accent: '#ff6b35', text: '#f5f5f5' } },
  { id: 'ember', name: 'Ember', desc: 'Warm dark + deep orange, like hot coals', mode: 'dark',
    preview: { bg: '#0f0a08', surface: '#211815', accent: '#ff4500', text: '#f0e6e0' } },
  { id: 'synthwave', name: 'Synthwave', desc: 'Neon pink + purple, retro grid', mode: 'dark',
    preview: { bg: '#0a0a1a', surface: '#14142e', accent: '#ff2eaa', text: '#eeddff' } },
  { id: 'matrix', name: 'Matrix', desc: 'Green on black, digital rain', mode: 'dark',
    preview: { bg: '#000800', surface: '#001800', accent: '#00ff00', text: '#33ff33' } },
  { id: 'ice', name: 'Ice Protocol', desc: 'Cool blue, precision engineering', mode: 'dark',
    preview: { bg: '#040810', surface: '#0c1822', accent: '#00bcd4', text: '#d0e8f0' } },
  { id: 'amber', name: 'Amber CRT', desc: 'Warm amber, vintage terminal', mode: 'dark',
    preview: { bg: '#0a0800', surface: '#1a1600', accent: '#ffaa00', text: '#ffcc00' } },
  { id: 'phosphor', name: 'Phosphor', desc: 'Burnt orange CRT — macro-cmd style', mode: 'dark',
    preview: { bg: '#0d0a06', surface: '#1a130a', accent: '#ff9a3c', text: '#ff9a3c' } },
  { id: 'bit32', name: '32-Bit Night', desc: 'PS1-era menus: bevelled windows, pixel type, dithered dusk', mode: 'dark',
    preview: { bg: '#05040c', surface: '#1a1740', accent: '#e8338f', text: '#eceaff' } },
  { id: 'void', name: 'Void Purple', desc: 'Deep space purple with cyan accents', mode: 'dark',
    preview: { bg: '#0a0a12', surface: '#141420', accent: '#a855f7', text: '#e0daf0' } },
  { id: 'paper', name: 'Paper Lite', desc: 'Warm parchment, serif headers, burnt-orange accent', mode: 'light',
    preview: { bg: '#f7f2e7', surface: '#faf6ec', accent: '#c1440e', text: '#241c0a' } },
  { id: 'brutalist', name: 'Brutalist', desc: 'Stark black on white, raw mono', mode: 'light',
    preview: { bg: '#ffffff', surface: '#f0f0f0', accent: '#ff0000', text: '#000000' } },
  { id: 'clean', name: 'Clean White', desc: 'Apple-style minimal, blue accent', mode: 'light',
    preview: { bg: '#fafafa', surface: '#f5f5f5', accent: '#3b82f6', text: '#1a1a1a' } },
  { id: 'leather', name: 'Leather Journal', desc: 'Warm browns, oxblood accent, physical logbook feel', mode: 'light',
    preview: { bg: '#f6efe4', surface: '#ece2d0', accent: '#7a1f2b', text: '#2e2414' } },
  { id: 'citrus', name: 'Citrus', desc: 'Bright cream, vivid tangerine — energetic', mode: 'light',
    preview: { bg: '#fffdf6', surface: '#fffbf0', accent: '#ff6d00', text: '#1f1400' } },
  { id: 'bubblegum', name: 'Bubblegum', desc: 'Playful pink, hot magenta pop', mode: 'light',
    preview: { bg: '#fff6fb', surface: '#fff0f8', accent: '#d6006e', text: '#2b0a20' } },
  { id: 'mint', name: 'Mint Fresh', desc: 'Clean white, vivid emerald accent', mode: 'light',
    preview: { bg: '#f3fffa', surface: '#edfff5', accent: '#00b871', text: '#04241a' } },
  { id: 'blush', name: 'Blush', desc: 'Soft rose pink, warm and gentle', mode: 'light',
    preview: { bg: '#fff5f7', surface: '#ffeef2', accent: '#e8578a', text: '#3a1524' } },
  { id: 'lavender', name: 'Lavender Dream', desc: 'Pale lavender, soft violet accent', mode: 'light',
    preview: { bg: '#f8f5ff', surface: '#f1ebfe', accent: '#9b6dd6', text: '#2c2140' } },
  { id: 'sage', name: 'Sage Garden', desc: 'Muted sage green, calm and fresh', mode: 'light',
    preview: { bg: '#f4f8f2', surface: '#eaf2e6', accent: '#6b9080', text: '#1e2b22' } },
  { id: 'peach', name: 'Peach Fuzz', desc: 'Warm peach, soft coral accent', mode: 'light',
    preview: { bg: '#fff8f2', surface: '#ffefe2', accent: '#ff8a65', text: '#3a2416' } },
  { id: 'rosegold', name: 'Rose Gold', desc: 'Blush + gold, elegant serif headers', mode: 'light',
    preview: { bg: '#fdf3f0', surface: '#f9e6e0', accent: '#c98a6b', text: '#3a2620' } },
  { id: 'lilac', name: 'Lilac Mist', desc: 'Pale lilac-grey, muted plum accent', mode: 'light',
    preview: { bg: '#f6f4fa', surface: '#ece7f4', accent: '#8b7fb8', text: '#2a2438' } },
  { id: 'skywhisper', name: 'Sky Whisper', desc: 'Pale baby blue, soft and airy', mode: 'light',
    preview: { bg: '#f2f9fd', surface: '#e4f2fa', accent: '#5fb0d9', text: '#12303e' } },
  { id: 'vanilla', name: 'Vanilla Cream', desc: 'Warm cream, soft caramel accent', mode: 'light',
    preview: { bg: '#fffaf3', surface: '#fbf0e0', accent: '#d9a066', text: '#3a2c16' } },
];

export const ACCENT_COLORS = [
  { id: 'red', hex: '#ff0000' }, { id: 'blue', hex: '#2196F3' },
  { id: 'green', hex: '#4CAF50' }, { id: 'purple', hex: '#9C27B0' },
  { id: 'orange', hex: '#FF9800' }, { id: 'pink', hex: '#E91E63' },
  { id: 'cyan', hex: '#00BCD4' }, { id: 'yellow', hex: '#FFC107' },
];

export const FONTS = [
  { id: 'default',    name: 'Manrope',          desc: 'Modern sans (default)',   display: "'Manrope', system-ui, sans-serif",               url: null },
  { id: 'space-grotesk', name: 'Space Grotesk', desc: 'The original sans',       display: "'Space Grotesk', system-ui, sans-serif",         url: null },
  { id: 'courier',    name: 'Courier New',       desc: 'Classic terminal',        display: "'Courier New', Courier, monospace",               url: null },
  { id: 'ibm-plex',  name: 'IBM Plex Mono',     desc: 'Modern monospace',        display: "'IBM Plex Mono', ui-monospace, monospace",        url: null },
  { id: 'orbitron',  name: 'Orbitron',           desc: 'Sci-fi / futuristic',     display: "'Orbitron', sans-serif",                          url: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap' },
  { id: 'vt323',     name: 'VT323',              desc: 'Retro CRT terminal',      display: "'VT323', monospace",                              url: 'https://fonts.googleapis.com/css2?family=VT323&display=swap' },
  { id: 'share-tech',name: 'Share Tech Mono',   desc: 'Hacker terminal',         display: "'Share Tech Mono', monospace",                    url: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap' },
  { id: 'rajdhani',  name: 'Rajdhani',           desc: 'Sporty / tech',           display: "'Rajdhani', sans-serif",                          url: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap' },
  { id: 'exo2',      name: 'Exo 2',              desc: 'Modern sci-fi',           display: "'Exo 2', sans-serif",                             url: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;700&display=swap' },
  { id: 'quicksand', name: 'Quicksand',          desc: 'Soft, rounded, friendly', display: "'Quicksand', sans-serif",                         url: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap' },
  { id: 'poppins',   name: 'Poppins',            desc: 'Clean geometric sans',    display: "'Poppins', sans-serif",                           url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { id: 'nunito',    name: 'Nunito',             desc: 'Rounded and warm',        display: "'Nunito', sans-serif",                            url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap' },
  { id: 'comfortaa', name: 'Comfortaa',          desc: 'Playful rounded display', display: "'Comfortaa', sans-serif",                         url: 'https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&display=swap' },
  { id: 'playfair',  name: 'Playfair Display',   desc: 'Elegant serif',           display: "'Playfair Display', serif",                       url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap' },
  { id: 'georgia',   name: 'Georgia',            desc: 'Classic book serif',      display: "Georgia, 'Times New Roman', serif",               url: null },
  { id: 'dancing',   name: 'Dancing Script',     desc: 'Flowing script',          display: "'Dancing Script', cursive",                       url: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap' },
];

const ThemeContext = createContext(null);

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
}

function applyAccentOverride(hex, intensity) {
  const root = document.documentElement;
  const { r, g, b } = hexToRgb(hex);
  const a = intensity / 100;
  root.style.setProperty('--color-accent', `rgba(${r},${g},${b},${a})`);
  root.style.setProperty('--color-accent-hover', `rgba(${Math.min(r+40,255)},${Math.min(g+40,255)},${Math.min(b+40,255)},${Math.min(a+0.15,1)})`);
  root.style.setProperty('--color-accent-muted', `rgba(${r},${g},${b},${0.15*a})`);
  root.style.setProperty('--color-accent-glow', `rgba(${r},${g},${b},${0.4*a})`);
}

function clearAccentOverride() {
  const root = document.documentElement;
  ['--color-accent','--color-accent-hover','--color-accent-muted','--color-accent-glow'].forEach(p => root.style.removeProperty(p));
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => { try { return localStorage.getItem('gains-cmd-theme') || 'default'; } catch { return 'default'; } });
  const [accentColorId, setAccentColorId] = useState(() => { try { return localStorage.getItem('gains-cmd-accent') || null; } catch { return null; } });
  const [accentIntensity, setAccentIntensity] = useState(() => { try { return parseInt(localStorage.getItem('gains-cmd-intensity')) || 100; } catch { return 100; } });
  const [fontId, setFontId] = useState(() => { try { return localStorage.getItem('gains-cmd-font') || 'default'; } catch { return 'default'; } });
  const [textSizeId, setTextSizeId] = useState(() => { try { return localStorage.getItem('gains-cmd-text-size') || 'medium'; } catch { return 'medium'; } });
  const [bannerEnabled, setBannerEnabledState] = useState(() => { try { return localStorage.getItem('gains-cmd-banner-enabled') !== 'false'; } catch { return true; } });
  const [bannerText, setBannerTextState] = useState(() => { try { return localStorage.getItem('gains-cmd-banner-text') || 'Gains_CMD'; } catch { return 'Gains_CMD'; } });

  const [uiScale, setUiScaleState] = useState(() => {
    try {
      const saved = localStorage.getItem('gains-cmd-scale-px');
      if (saved) return parseInt(saved);
      const cls = localStorage.getItem('gains-cmd-scale');
      if (cls === 'compact') return 14;
      if (cls === 'large') return 18;
      return 16;
    } catch { return 16; }
  });

  const isInitialMount = useRef(true);

  // Apply UI scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale}px`;
    try { localStorage.setItem('gains-cmd-scale-px', String(uiScale)); } catch {}
  }, [uiScale]);

  // Apply theme class, persist, and reload if user changed it
  useEffect(() => {
    const root = document.documentElement;
    [...root.classList].forEach(cls => { if (cls.startsWith('theme-')) root.classList.remove(cls); });
    if (themeId !== 'default') root.classList.add(`theme-${themeId}`);
    root.classList.toggle('mode-light', THEMES.find(t => t.id === themeId)?.mode === 'light');
    try { localStorage.setItem('gains-cmd-theme', themeId); } catch {}

    // Android's status/notification bar reads meta[theme-color] — keep it on the theme's page background
    const bg = getComputedStyle(root).getPropertyValue('--color-bg-0').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);

    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      // Save current tab so App can restore it after reload
      try {
        const currentTab = sessionStorage.getItem('gains-cmd-active-tab');
        if (!currentTab) sessionStorage.setItem('gains-cmd-active-tab', 'settings');
      } catch {}
      const timer = setTimeout(() => window.location.reload(), 50);
      return () => clearTimeout(timer);
    }
  }, [themeId]);

  // Apply accent colour override
  useEffect(() => {
    if (accentColorId) {
      const c = ACCENT_COLORS.find(c => c.id === accentColorId);
      if (c) applyAccentOverride(c.hex, accentIntensity);
    } else {
      clearAccentOverride();
    }
    try {
      if (accentColorId) localStorage.setItem('gains-cmd-accent', accentColorId);
      else localStorage.removeItem('gains-cmd-accent');
      localStorage.setItem('gains-cmd-intensity', String(accentIntensity));
    } catch {}
  }, [accentColorId, accentIntensity, themeId]);

  // Apply text size class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
    root.classList.add(`text-size-${textSizeId}`);
    try { localStorage.setItem('gains-cmd-text-size', textSizeId); } catch {}
  }, [textSizeId]);

  // Apply font
  useEffect(() => {
    const font = FONTS.find(f => f.id === fontId) || FONTS[0];
    if (font.url) {
      const id = `gfont-${font.id}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet'; link.href = font.url;
        document.head.appendChild(link);
      }
    }
    // Default leaves the theme's own font in charge (Manrope unless the theme sets one).
    if (font.id === 'default') document.documentElement.style.removeProperty('--font-display');
    else document.documentElement.style.setProperty('--font-display', font.display);
    try { localStorage.setItem('gains-cmd-font', fontId); } catch {}
  }, [fontId]);

  const setFont = useCallback((id) => { if (FONTS.find(f => f.id === id)) setFontId(id); }, []);
  const setTextSize = useCallback((id) => { if (['small','medium','large'].includes(id)) setTextSizeId(id); }, []);
  const setBannerEnabled = useCallback((v) => {
    setBannerEnabledState(v);
    try { localStorage.setItem('gains-cmd-banner-enabled', String(v)); } catch {}
  }, []);
  const setBannerText = useCallback((v) => {
    setBannerTextState(v);
    try { localStorage.setItem('gains-cmd-banner-text', v); } catch {}
  }, []);
  const setScale = useCallback((v) => setUiScaleState(Math.max(12, Math.min(24, v))), []);

  const setTheme = useCallback((id) => {
    if (THEMES.find(t => t.id === id)) {
      setThemeId(id);
      setAccentColorId(null);
    }
  }, []);

  const setAccent = useCallback((id) => setAccentColorId(id), []);
  const setIntensity = useCallback((v) => setAccentIntensity(Math.max(10, Math.min(100, v))), []);
  const currentTheme = THEMES.find(t => t.id === themeId) || THEMES[0];

  return (
    <ThemeContext.Provider value={{ themeId, setTheme, themes: THEMES, currentTheme, accentColorId, setAccent, accentColors: ACCENT_COLORS, accentIntensity, setIntensity, uiScale, setScale, fontId, setFont, fonts: FONTS, textSizeId, setTextSize, bannerEnabled, setBannerEnabled, bannerText, setBannerText }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
