export default function NavIcon({ id, size = 20, className = '' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    className,
  };

  switch (id) {
    // Custom SVG — sharp square-cap lines
    case 'programs':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="14" y2="17" />
        </svg>
      );

    // Custom SVG — barbell
    case 'workout':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <rect x="6" y="6" width="4" height="12" />
          <rect x="14" y="8" width="4" height="8" />
        </svg>
      );

    // Lucide-style — calendar
    case 'history':
      return (
        <svg {...props} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );

    // Lucide-style — trending up
    case 'recommendations':
      return (
        <svg {...props} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );

    // Custom SVG — bar chart in box
    case 'aggression':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <rect x="4" y="4" width="16" height="16" />
          <line x1="8" y1="8" x2="8" y2="16" />
          <line x1="12" y1="10" x2="12" y2="16" />
          <line x1="16" y1="6" x2="16" y2="16" />
        </svg>
      );

    // Custom SVG — shield with dash
    case 'coach':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <path d="M4 4 L12 2 L20 4 L20 12 L12 22 L4 12Z" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      );

    // Custom SVG — sliders
    case 'settings':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="4" y1="8" x2="20" y2="8" />
          <line x1="4" y1="16" x2="20" y2="16" />
          <circle cx="9" cy="8" r="2" fill="currentColor" />
          <circle cx="15" cy="16" r="2" fill="currentColor" />
        </svg>
      );

    // Plus — replaces "+"
    case 'plus':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );

    // Minus — replaces "−"
    case 'minus':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );

    // Star outline — replaces ★
    case 'star':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );

    // Speech bubble — replaces 🤖 (AI notes)
    case 'notes':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square" strokeLinejoin="round">
          <path d="M4 4h16v12H8l-4 4V4z" />
        </svg>
      );

    // X — replaces ✕
    case 'remove':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      );

    // Swap arrows — replaces 🔄
    case 'swap':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <path d="M4 8h12l-4-4" />
          <path d="M20 16H8l4 4" />
        </svg>
      );

    // Clock — replaces ⏱️
    case 'clock':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <circle cx="12" cy="13" r="8" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="13" x2="15" y2="13" />
          <line x1="12" y1="2" x2="12" y2="5" />
        </svg>
      );

    // Diamond plus — replaces 🔮
    case 'analyze':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <path d="M12 2L2 12l10 10 10-10z" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );

    // Checkmark — replaces ✅
    case 'check':
      return (
        <svg {...props} strokeWidth="2.5" strokeLinecap="square">
          <polyline points="4 12 10 18 20 6" />
        </svg>
      );

    // Up arrow — replaces 🔶
    case 'arrow-up':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <polyline points="4 18 12 6 20 18" />
        </svg>
      );

    // Save/disk — replaces 💾
    case 'save':
      return (
        <svg {...props} strokeWidth="2" strokeLinecap="square">
          <rect x="3" y="3" width="18" height="18" />
          <rect x="7" y="13" width="10" height="5" />
          <line x1="7" y1="3" x2="7" y2="8" />
          <line x1="17" y1="3" x2="17" y2="8" />
        </svg>
      );

    default:
      return null;
  }
}
