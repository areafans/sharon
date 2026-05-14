const Icon = ({ d, size = 18, fill = 'none', stroke = 'currentColor', strokeWidth = 1.5, children, viewBox = '0 0 24 24', ...rest }) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Library:      (p) => <Icon {...p}><path d="M3 5h18M3 12h18M3 19h18"/></Icon>,
  Grid:         (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  List:         (p) => <Icon {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Icon>,
  Sparkle:      (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></Icon>,
  Bulb:         (p) => <Icon {...p}><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1.1 1.3 1.1 2.1h4.8c0-.8.4-1.6 1.1-2.1A6 6 0 0012 3z"/></Icon>,
  Activity:     (p) => <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>,
  Upload:       (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></Icon>,
  Search:       (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>,
  Send:         (p) => <Icon {...p}><path d="M5 12l14-7-3 14-4-6-7-1z"/></Icon>,
  Close:        (p) => <Icon {...p}><path d="M18 6L6 18M6 6l12 12"/></Icon>,
  Plus:         (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Share:        (p) => <Icon {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></Icon>,
  ChevronDown:  (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>,
  ChevronRight: (p) => <Icon {...p}><path d="M9 18l6-6-6-6"/></Icon>,
  ChevronLeft:  (p) => <Icon {...p}><path d="M15 18l-9-6 9-6"/></Icon>,
  Eye:          (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></Icon>,
  Comment:      (p) => <Icon {...p}><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z"/></Icon>,
  Bookmark:     (p) => <Icon {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></Icon>,
  Link:         (p) => <Icon {...p}><path d="M10 13a5 5 0 007.5.5L21 10a5 5 0 00-7-7l-1.5 1.5M14 11a5 5 0 00-7.5-.5L3 14a5 5 0 007 7l1.5-1.5"/></Icon>,
  Copy:         (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Icon>,
  Download:     (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></Icon>,
  PanelRight:   (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></Icon>,
  Github:       (p) => <Icon {...p}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9c0-1 .1-1.5-.5-2C18.7 14.7 21 13.4 21 9.7A4 4 0 0019.9 7c.4-1 .4-2 0-3 0 0-1.2-.5-3.9 1.5a13 13 0 00-7 0C6.3 3.5 5.1 4 5.1 4c-.6 1.4-.5 2.6.1 3.7C4.3 8.4 4 9.7 4 11c0 4 2 4.7 4.5 5.4-.4.4-.7 1-.8 1.6V22"/></Icon>,
  File:         (p) => <Icon {...p}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7"/></Icon>,
  Star:         ({ size = 14, filled = true, ...p }) => <Icon size={size} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.4} {...p}><path d="M12 2l3 7 7 .8-5.2 4.7 1.5 7L12 17.8 5.7 21.5l1.5-7L2 9.8 9 9z"/></Icon>,
  Deck:         (p) => <Icon {...p}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 9h20M7 5v14"/></Icon>,
  Video:        (p) => <Icon {...p}><path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/></Icon>,
  Demo:         (p) => <Icon {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></Icon>,
  Doc:          (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></Icon>,
  Code:         (p) => <Icon {...p}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></Icon>,
  Filter:       (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></Icon>,
  Settings:     (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></Icon>,
  LogOut:       (p) => <Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></Icon>,
  Lock:         (p) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></Icon>,
  Clock:        (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Icon>,
  Check:        (p) => <Icon {...p}><path d="M20 6L9 17l-5-5"/></Icon>,
  CheckCircle:  (p) => <Icon {...p}><path d="M22 11.1V12a10 10 0 11-5.9-9.1"/><path d="M22 4L12 14l-3-3"/></Icon>,
  ExternalLink: (p) => <Icon {...p}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></Icon>,
  Sun:          (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Icon>,
  Moon:         (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></Icon>,
  Refresh:      (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.8-3.3L23 10M1 14l4.7 4.3A9 9 0 0020.5 15"/></Icon>,
  Trash:        (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></Icon>,
  Edit:         (p) => <Icon {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>,
  BarChart:     (p) => <Icon {...p}><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></Icon>,
};

export default Icons;
