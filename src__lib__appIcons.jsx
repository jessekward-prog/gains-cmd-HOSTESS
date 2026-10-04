// Shared app icon library — used in SettingsPage picker and AppHeader renderer.
// Each icon is a function returning an <svg> so it inherits className/style from the caller.

const ico = (content, fill = true) => ({ viewBox: '0 0 24 24', fill: fill ? 'currentColor' : 'none', stroke: fill ? 'none' : 'currentColor', strokeWidth: fill ? '0' : '1.6', content });

export const APP_ICONS = {
  skull: {
    label: 'Skull',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M12 2C7.03 2 3 5.92 3 10.75c0 2.88 1.38 5.47 3.53 7.14V19.5c0 .83.67 1.5 1.5 1.5h7.94c.83 0 1.5-.67 1.5-1.5v-1.61C19.62 16.22 21 13.63 21 10.75 21 5.92 16.97 2 12 2zM9.5 14.5a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5zm5 0a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5zM8.5 19.5v1h2v-1h-2zm5 0v1h2v-1h-2z"/>
      </svg>
    ),
  },
  dumbbell: {
    label: 'Dumbbell',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z"/>
      </svg>
    ),
  },
  barbell: {
    label: 'Barbell',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <rect x="1" y="10.5" width="3" height="3" rx="0.5"/>
        <rect x="1" y="8" width="2" height="8" rx="0.5"/>
        <rect x="20" y="10.5" width="3" height="3" rx="0.5"/>
        <rect x="22" y="8" width="2" height="8" rx="0.5"/>
        <rect x="4" y="11" width="16" height="2" rx="0.5"/>
        <rect x="6" y="9" width="2" height="6" rx="0.5"/>
        <rect x="16" y="9" width="2" height="6" rx="0.5"/>
      </svg>
    ),
  },
  flame: {
    label: 'Flame',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
      </svg>
    ),
  },
  lightning: {
    label: 'Lightning',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
      </svg>
    ),
  },
  target: {
    label: 'Target',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={cls}>
        <circle cx="12" cy="12" r="9.5"/>
        <circle cx="12" cy="12" r="5.5"/>
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
        <line x1="12" y1="2" x2="12" y2="4.5" strokeWidth="1.8"/>
        <line x1="12" y1="19.5" x2="12" y2="22" strokeWidth="1.8"/>
        <line x1="2" y1="12" x2="4.5" y2="12" strokeWidth="1.8"/>
        <line x1="19.5" y1="12" x2="22" y2="12" strokeWidth="1.8"/>
      </svg>
    ),
  },
  shield: {
    label: 'Shield',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
      </svg>
    ),
  },
  crown: {
    label: 'Crown',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z"/>
      </svg>
    ),
  },
  sword: {
    label: 'Sword',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M6.92 11.5L2 16.42 3.58 18l1.5-1.5 1.42 1.42-1.5 1.5L6.58 21l4.92-4.92-4.58-4.58zM20 2H13l-2.44 2.44 2.12 2.12L14 6l3 3-.44.44 2.12 2.12L21 9V2h-1zm-9.58 8.83L4.34 16.9l2.76 2.76L13.17 13.6l-2.75-2.77z"/>
      </svg>
    ),
  },
  diamond: {
    label: 'Diamond',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={cls}>
        <path d="M2.7 9.5L12 22l9.3-12.5L17 2H7L2.7 9.5z"/>
        <path d="M7 2l2.5 7.5h5L17 2"/>
        <path d="M2.7 9.5h18.6"/>
        <line x1="12" y1="9.5" x2="12" y2="22"/>
      </svg>
    ),
  },
  hex: {
    label: 'Hex',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls}>
        <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zm0 2.31L5.34 8v8l6.66 3.69L18.66 16V8L12 4.31z"/>
        <path d="M12 7l4.33 2.5v5L12 17l-4.33-2.5v-5L12 7zm0 1.73L9.17 10.5v3L12 15.27l2.83-1.77v-3L12 8.73z"/>
      </svg>
    ),
  },
  circuit: {
    label: 'Circuit',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={cls}>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M19 9h2M3 15h2M19 15h2"/>
        <circle cx="9" cy="9" r="1.8" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="9" r="1.8" fill="currentColor" stroke="none"/>
        <circle cx="9" cy="15" r="1.8" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="15" r="1.8" fill="currentColor" stroke="none"/>
        <path d="M9 9h6M9 15h6M9 9v6M15 9v6" strokeWidth="1"/>
      </svg>
    ),
  },
  chip: {
    label: 'Chip',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={cls}>
        <rect x="6" y="6" width="12" height="12" rx="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" stroke="none"/>
        <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4"/>
      </svg>
    ),
  },
  terminal: {
    label: 'Terminal',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={cls}>
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M6 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 15h5" strokeLinecap="round"/>
      </svg>
    ),
  },
  atom: {
    label: 'Atom',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className={cls}>
        <ellipse cx="12" cy="12" rx="10" ry="3.5"/>
        <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(60 12 12)"/>
        <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(120 12 12)"/>
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  infinity: {
    label: 'Infinity',
    svg: (cls) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cls}>
        <path d="M12 12c-2-2.5-4-4-6-4a4 4 0 000 8c2 0 4-1.5 6-4zm0 0c2 2.5 4 4 6 4a4 4 0 000-8c-2 0-4 1.5-6 4z"/>
      </svg>
    ),
  },
};

// Renders the icon for a given key at a specific size/class.
// Falls back to rendering the raw string (emoji backward compat).
export function renderAppIcon(iconKey, className = 'w-5 h-5') {
  if (iconKey && APP_ICONS[iconKey]) {
    return APP_ICONS[iconKey].svg(className);
  }
  // Emoji / unknown string fallback
  return <span style={{ fontSize: className.includes('w-4') ? 14 : 18, lineHeight: 1 }}>{iconKey || '💪'}</span>;
}
