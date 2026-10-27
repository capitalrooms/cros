// Line icons in place of emoji (27 Oct 2026, Harry: "remove any old emoji symbols… we want it to look pro"). Emoji
// draw differently on every phone and computer and read as casual; these are thin outline icons in the text colour,
// sized to the text around them (1.15em), so an emoji that sat in a heading or a 3xl bubble becomes the same-sized
// icon. <LineIcon glyph={…} /> takes whatever the screen had: an emoji becomes its icon (an unknown one a quiet dot),
// anything else — words, £, ✓, a React element — is passed through untouched.
import type { ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4" /></>,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.7c1.6.8 2.6 2.6 3 5.3" /></>,
  flame: <path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-1 2-2 3-3 3 0-2-1-4-3-6 0 4-4 6-4 12a7 7 0 0 0 7 7z" />,
  thermo: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /><path d="M12 9v6" /></>,
  box: <><path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  pin: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18" /><path d="M15 12h.01" /></>,
  window: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18M4 12h16" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  money: <path d="M16 6.5a4.5 4.5 0 0 0-8 2.8V13m-2 0h9m-9 6h12M8 13c0 3-1 5-2 6" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  droplet: <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" />,
  wind: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  bed: <path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-8v3M6.5 11.5h.01" />,
  brush: <path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-3-3zM9 15a3 3 0 0 0-3 3c0 1-1 2-3 2 1 1 3 2 5 2a4 4 0 0 0 4-4" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" /></>,
  bug: <><rect x="8" y="6" width="8" height="14" rx="4" /><path d="M12 6V4M5 10h3M16 10h3M5 16h3M16 16h3M9 4l1 2M15 4l-1 2" /></>,
  car: <><path d="M5 17h14v-5l-2-5H7l-2 5z" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /></>,
  tree: <path d="M12 22v-6M7 16h10l-3-4h2l-4-6-4 6h2z" />,
  food: <path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 2-2 6 0 8v12" />,
  wifi: <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01" />,
  link: <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.5" /><path d="M14 10h4M14 14h3" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />,
  snow: <path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7" />,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 13h18" /></>,
  tag: <><path d="M20 12 12 20l-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  book: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM6.5 17H20v4H6.5" />,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />,
}

/** Which icon each emoji becomes. */
const MAP: Record<string, keyof typeof P> = {
  '✅': 'check', '☑': 'check', '🏠': 'home', '🏡': 'home', '🏘': 'home', '🏢': 'building', '🏛': 'building', '🏦': 'building', '🏗': 'building',
  '⚠': 'alert', '🚨': 'alert', '❗': 'alert', '🔴': 'dot', '🟢': 'dot', '⚡': 'bolt', '🔌': 'bolt', '🔧': 'wrench', '🛠': 'wrench', '👷': 'wrench', '🔨': 'wrench',
  '📋': 'clipboard', '📝': 'clipboard', '✍': 'clipboard', '📖': 'book', '🧹': 'spark', '🫧': 'spark', '✨': 'spark', '♻': 'spark', '🎉': 'star', '⭐': 'star', '★': 'star',
  '📄': 'doc', '🧾': 'doc', '📎': 'doc', '📤': 'doc', '📁': 'folder', '📂': 'folder', '🗄': 'folder', '📦': 'box', '🛋': 'box', '🪑': 'box', '🧱': 'box',
  '✉': 'mail', '📧': 'mail', '📨': 'mail', '📬': 'mail', '📭': 'mail', '💼': 'briefcase', '🏷': 'tag',
  '👤': 'user', '👋': 'user', '🙏': 'user', '😔': 'user', '🤔': 'user', '👥': 'people', '🤝': 'people',
  '🔥': 'flame', '🚒': 'shield', '🛡': 'shield', '🌡': 'thermo', '🥶': 'snow', '🧊': 'snow', '📌': 'pin', '📍': 'pin',
  '🔑': 'key', '🔐': 'lock', '🔒': 'lock', '💬': 'chat', '📢': 'chat', '📲': 'phone', '📱': 'phone', '📞': 'phone', '☎': 'phone', '🔔': 'bell', '🔊': 'bell', '🛎': 'bell',
  '🚪': 'door', '🪟': 'window', '🔍': 'search', '🔎': 'search', '👁': 'eye', '👀': 'eye', '💷': 'money', '💰': 'money', '📈': 'chart', '📊': 'chart',
  '⚙': 'gear', '⏳': 'clock', '🕐': 'clock', '📅': 'calendar', '🌙': 'moon', '💧': 'droplet', '🚰': 'droplet', '🚿': 'droplet', '🚽': 'droplet', '🌧': 'droplet', '💨': 'wind',
  '💡': 'spark', '📷': 'camera', '📸': 'camera', '🖼': 'image', '🛌': 'bed', '🎨': 'brush', '➕': 'plus', '❓': 'question', 'ℹ': 'info', '🪲': 'bug', '🐛': 'bug',
  '🚗': 'car', '🌳': 'tree', '🍳': 'food', '🍴': 'food', '🍽': 'food', '📶': 'wifi', '🔗': 'link', '🪪': 'id', '🗑': 'trash',
}

const EMOJI = /^(?:[\u{1F300}-\u{1FAFF}\u{2139}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{23F0}-\u{23FA}\u{231A}\u{231B}]\u{FE0F}?)+$/u

/** The icon for an emoji, or null when `glyph` isn't one. */
export function iconFor(glyph: string): keyof typeof P | null {
  const g = glyph.trim()
  if (!g || !EMOJI.test(g)) return null
  return MAP[g.replace(/️/g, '')] ?? 'dot'
}

export default function LineIcon({ glyph, className = '', size = '1.15em' }: { glyph: unknown; className?: string; size?: string | number }) {
  if (typeof glyph !== 'string') return (glyph ?? null) as ReactNode
  const k = iconFor(glyph)
  if (!k) return <>{glyph}</>
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className={`inline-block shrink-0 align-[-0.15em] ${className}`}>{P[k]}</svg>
  )
}
