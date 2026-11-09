// A tenant's avatar (9 Nov 2026, Harry: "profile photos or they can choose a memoji or something"): instead of a
// photo, a friendly emoji on a colour, chosen in the tenant app or the move-in pack. Stored as "🦊|sage" in
// tenant_icebreakers.answers.avatar. Shared by the browser and the server.
export const AVATAR_EMOJI = ['🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🐙', '🦄', '🐶', '🐱', '🐰', '🦔', '🐢', '🐳', '😎', '🤓', '🥳', '😇', '🤠', '🤖', '👻', '👽', '🌻', '🌵', '🍀', '🍕', '🍩', '☕', '🎧', '🎸', '⚽', '🎨', '📚', '🚲', '🌈', '🌙'] as const
export const AVATAR_COLOURS: Record<string, string> = { sage: '#DCE8D6', mint: '#CDEBDD', sky: '#D3E6F5', lilac: '#E4DAF3', blush: '#F6D9DC', peach: '#F8DEC8', sun: '#F7EBB8', stone: '#E6E2DA' }
export type Avatar = { emoji: string; colour: string }

export function parseAvatar(v: unknown): Avatar | null {
  const [emoji, colour] = String(v ?? '').split('|')
  if (!emoji || !(AVATAR_EMOJI as readonly string[]).includes(emoji)) return null
  return { emoji, colour: AVATAR_COLOURS[colour] ? colour : 'sage' }
}
export const avatarValue = (a: Avatar) => `${a.emoji}|${a.colour}`
export const avatarBg = (a: Avatar | null) => (a && AVATAR_COLOURS[a.colour]) || AVATAR_COLOURS.sage
