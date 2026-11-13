// The pictures a Publish piece can use (13 Nov 2026, Harry: "choose from a list"): the figures graphic in three looks,
// the twelve London scenes (public/email/insight), ten illustrations (public/publish/illustrations, drawn by
// scripts/publish-illustrations.mjs) and the office's own property photos. Stored on the piece as one short key.
export const LOOKS = { dark: { bg: '#1F3B2E', ink: '#F3F0E6', accent: '#C9A227', tile: 'rgba(243,240,230,0.08)' }, light: { bg: '#F3F0E6', ink: '#1B1A17', accent: '#1F3B2E', tile: 'rgba(31,59,46,0.08)' }, gold: { bg: '#C9A227', ink: '#1B1A17', accent: '#1F3B2E', tile: 'rgba(255,255,255,0.35)' } } as const
export const SCENES = ['editorial', 'ink', 'graphic'].flatMap(st => ['winter', 'spring', 'summer', 'autumn'].map(se => `${st}-${se}`))
export const ILLUSTRATIONS: { key: string; label: string }[] = [
  { key: 'chart', label: 'Rents rising' }, { key: 'pounds', label: 'Rent & money' }, { key: 'terraces', label: 'London terraces' }, { key: 'keys', label: 'Keys & front door' },
  { key: 'moving', label: 'Moving in' }, { key: 'inspection', label: 'Inspection' }, { key: 'toolbox', label: 'Maintenance' }, { key: 'calendar', label: 'New rules & dates' },
  { key: 'signing', label: 'Signing an agreement' }, { key: 'map', label: 'Where — a map' },
]
export const seasonNow = (d = new Date()) => (['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'] as const)[d.getMonth()]
// text size and font for the picture (13 Nov 2026, Harry: "options for font or text size providing all sizes are pre
// measured so will always look good"): stored on the end of the picture key — 'illus:keys|large|bold'. Every size is a
// ceiling: a long headline steps down until it fits its space (the picture maker measures it).
export const SIZES = { standard: 1, large: 1.2, larger: 1.4 } as const
export const FONTS = { clean: 'Geist', bold: 'Space Grotesk' } as const
export type SizeKey = keyof typeof SIZES
export type FontKey = keyof typeof FONTS
export function pictureStyle(v: string | null | undefined): { size: SizeKey; font: FontKey } {
  const parts = String(v ?? '').split('|').slice(1)
  return { size: (parts.find(x => x in SIZES) as SizeKey) ?? 'standard', font: (parts.find(x => x in FONTS) as FontKey) ?? 'clean' }
}
export const withStyle = (pic: string, size: SizeKey, font: FontKey) => `${pic.split('|')[0]}${size !== 'standard' ? `|${size}` : ''}${font !== 'clean' ? `|${font}` : ''}`
export function parsePicture(v: string | null | undefined): { kind: 'figures' | 'scene' | 'illus' | 'photo'; key: string } {
  const [kind, ...rest] = String(v ?? '').split('|')[0].split(':'), key = rest.join(':')
  if (kind === 'scene' && SCENES.includes(key)) return { kind, key }
  if (kind === 'illus' && ILLUSTRATIONS.some(i => i.key === key)) return { kind, key }
  if (kind === 'photo' && /^[0-9a-f-]{36}$/i.test(key)) return { kind, key }
  return { kind: 'figures', key: key in LOOKS ? key : 'dark' }
}
