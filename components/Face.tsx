'use client'
// One round face for a person (9 Nov 2026): their photo, else the avatar they chose, else their initial.
import { parseAvatar, avatarBg } from '@/lib/housemates/avatar'

export default function Face({ name, photoUrl, avatar, size = 48, ring = false }: { name: string; photoUrl?: string | null; avatar?: string | null; size?: number; ring?: boolean }) {
  const a = parseAvatar(avatar)
  const style: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flex: 'none', overflow: 'hidden', display: 'grid', placeItems: 'center', boxShadow: ring ? '0 0 0 3px #fff, 0 0 0 5px rgb(var(--n-200))' : undefined }
  if (photoUrl) return <span style={style}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
  if (a) return <span style={{ ...style, background: avatarBg(a), fontSize: size * 0.55, lineHeight: 1 }} role="img" aria-label={name}>{a.emoji}</span>
  return <span style={{ ...style, background: 'rgb(var(--n-900))', color: '#fff', fontWeight: 700, fontSize: size * 0.42 }} aria-label={name}>{(name || '?').charAt(0).toUpperCase()}</span>
}
