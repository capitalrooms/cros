// Content blocks and templates for Publish (13 Nov 2026 — the Mailchimp gap: "drag-and-drop blocks" and "a library of
// designed templates"). Blocks are drawn with tables and inline styles (the only layout every mail app keeps — Gmail,
// Outlook, Apple Mail) and stack on a phone. A template is a starting point: the kind of piece, its blocks, its picture,
// its email look and the writer's tone. Nothing here sends anything.
import type { SupabaseClient } from '@supabase/supabase-js'
import { reportPacks, comparison } from '@/lib/rents/report'

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'button'; label: string; url: string; style?: 'solid' | 'outline' }
  | { type: 'picture'; pic: string; caption?: string }
  | { type: 'columns'; left: { title: string; text: string }; right: { title: string; text: string } }
  | { type: 'quote'; text: string; by?: string }
  | { type: 'divider' }
  | { type: 'figures'; areas?: string[] }
  | { type: 'contact' }

export const BLOCK_TYPES: { type: Block['type']; label: string; make: () => Block }[] = [
  { type: 'heading', label: 'Heading', make: () => ({ type: 'heading', text: 'A heading' }) },
  { type: 'text', label: 'Text', make: () => ({ type: 'text', text: '' }) },
  { type: 'button', label: 'Button', make: () => ({ type: 'button', label: 'Read more', url: 'https://capitalrooms.co.uk', style: 'solid' }) },
  { type: 'picture', label: 'Picture', make: () => ({ type: 'picture', pic: 'illus:terraces', caption: '' }) },
  { type: 'columns', label: 'Two columns', make: () => ({ type: 'columns', left: { title: 'First', text: '' }, right: { title: 'Second', text: '' } }) },
  { type: 'quote', label: 'Quote', make: () => ({ type: 'quote', text: '', by: '' }) },
  { type: 'divider', label: 'Divider', make: () => ({ type: 'divider' }) },
  { type: 'figures', label: 'Market figures', make: () => ({ type: 'figures', areas: [] }) },
  { type: 'contact', label: 'Contact us', make: () => ({ type: 'contact' }) },
]

const SITE = 'https://capitalrooms.co.uk'
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const paras = (t: string, style = '') => String(t ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p style="margin:0 0 14px;${style}">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
const safeUrl = (u: string) => /^(https?:\/\/|mailto:|tel:)/i.test(u.trim()) ? u.trim() : `https://${u.trim().replace(/^\/+/, '')}`

/** A picture key (lib/publish/pictures) as a plain image address. */
export async function pictureUrl(s: SupabaseClient, pic: string): Promise<string | null> {
  const [kind, key] = String(pic ?? '').split('|')[0].split(':')
  if (kind === 'illus') return `${SITE}/publish/illustrations/${key}.png`
  if (kind === 'scene') return `${SITE}/email/insight/${key}.png`
  if (kind === 'photo' && /^[0-9a-f-]{36}$/i.test(key)) {
    const { data } = await s.from('property_photos').select('file_url, file_path').eq('id', key).maybeSingle() as { data: any }
    return data ? (data.file_url || s.storage.from('property-photos').getPublicUrl(String(data.file_path)).data.publicUrl) : null
  }
  return null
}

const button = (label: string, url: string, style: 'solid' | 'outline' = 'solid') => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="border-radius:999px;${style === 'solid' ? 'background:#1F3B2E' : 'border:2px solid #1F3B2E'}"><a href="${esc(safeUrl(url))}" style="display:inline-block;padding:${style === 'solid' ? '14px 28px' : '12px 26px'};border-radius:999px;color:${style === 'solid' ? '#ffffff' : '#1F3B2E'} !important;font-weight:700;font-size:15px;text-decoration:none">${esc(label)}</a></td></tr></table>`

/** The blocks as email HTML. */
export async function blocksHtml(s: SupabaseClient, blocks: Block[] | null | undefined): Promise<string> {
  const out: string[] = []
  for (const b of blocks ?? []) {
    if (b.type === 'heading' && b.text.trim()) out.push(`<p style="margin:26px 0 10px;font-size:20px;font-weight:700;line-height:1.3;color:#1B1A17">${esc(b.text)}</p>`)
    if (b.type === 'text' && b.text.trim()) out.push(paras(b.text, 'line-height:1.65'))
    if (b.type === 'button' && b.label.trim() && b.url.trim()) out.push(button(b.label, b.url, b.style))
    if (b.type === 'picture') { const u = await pictureUrl(s, b.pic); if (u) out.push(`<p style="margin:10px 0 ${b.caption ? '4px' : '20px'}"><img src="${esc(u)}" width="536" alt="${esc(b.caption ?? '')}" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;border:0"></p>${b.caption ? `<p style="margin:0 0 20px;font-size:13px;color:#6B7A70">${esc(b.caption)}</p>` : ''}`) }
    if (b.type === 'columns') {
      const col = (c: { title: string; text: string }) => `<td class="col" width="50%" valign="top" style="padding:0 10px 14px 0;vertical-align:top"><div style="background:#F4F7F3;border-radius:12px;padding:16px 18px">${c.title ? `<p style="margin:0 0 6px;font-weight:700;font-size:16px">${esc(c.title)}</p>` : ''}${paras(c.text, 'font-size:14.5px;line-height:1.6')}</div></td>`
      // two side by side; on a phone each takes the full width (the media query in the wrapper's head is kept by most apps; where it isn't, they stay side by side)
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px"><tr>${col(b.left)}${col(b.right)}</tr></table>`)
    }
    if (b.type === 'quote' && b.text.trim()) out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 22px"><tr><td style="border-left:4px solid #C9A227;padding:6px 0 6px 18px"><p style="margin:0;font-size:18px;line-height:1.5;font-style:italic;color:#1B1A17">“${esc(b.text)}”</p>${b.by ? `<p style="margin:8px 0 0;font-size:13px;color:#6B7A70">— ${esc(b.by)}</p>` : ''}</td></tr></table>`)
    if (b.type === 'divider') out.push(`<hr style="border:0;border-top:1px solid #DCE3DA;margin:26px 0">`)
    if (b.type === 'figures') {
      const packs = await reportPacks(s, b.areas?.length ? b.areas : ['E12000007'])
      const rows = comparison(packs).filter(([l]) => !/our lets/i.test(l)).slice(0, 8)
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 22px;border-collapse:collapse;border-top:2px solid #1F3B2E"><tr><td></td>${packs.map(p => `<td style="padding:8px 8px;text-align:right;font-weight:700;color:#1F3B2E;font-size:13px">${esc(p.name)}</td>`).join('')}</tr>${rows.map(([l, vs], i) => `<tr style="background:${i % 2 ? '#ffffff' : '#F4F7F3'}"><td style="padding:7px 8px;font-size:13px;color:#56665C">${esc(l)}</td>${vs.map(v => `<td style="padding:7px 8px;text-align:right;font-weight:600;font-size:14px">${esc(v)}</td>`).join('')}</tr>`).join('')}</table><p style="margin:-14px 0 20px;font-size:11px;color:#8A8478">Source: ONS Price Index of Private Rents and HM Land Registry (Crown copyright).</p>`)
    }
    if (b.type === 'contact') out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;background:#F4F7F3;border-radius:14px"><tr><td style="padding:18px 20px"><p style="margin:0 0 4px;font-weight:700;font-size:16px">Questions? We’re here.</p><p style="margin:0 0 12px;font-size:14.5px;color:#3B4A41">Call the team on <a href="tel:02071129163" style="color:#1F3B2E;font-weight:700">0207 112 9163</a>, or just reply to this email.</p>${button('Visit our website', SITE, 'outline')}</td></tr></table>`)
  }
  return out.join('\n')
}

/** The blocks for the website post (its markdown). */
export function blocksMarkdown(blocks: Block[] | null | undefined): string {
  return (blocks ?? []).map(b => {
    if (b.type === 'heading') return `## ${b.text}`
    if (b.type === 'text') return b.text
    if (b.type === 'button') return `[${b.label}](${safeUrl(b.url)})`
    if (b.type === 'columns') return `**${b.left.title}** — ${b.left.text}\n\n**${b.right.title}** — ${b.right.text}`
    if (b.type === 'quote') return `> ${b.text}${b.by ? `\n> — ${b.by}` : ''}`
    if (b.type === 'divider') return '---'
    if (b.type === 'contact') return 'Questions? Call the team on 0207 112 9163.'
    return ''
  }).filter(Boolean).join('\n\n')
}

// ── templates: where a new piece starts ───────────────────────────────────────────────────────────────────────────
export interface Template { key: string; name: string; note: string; kind: 'market_update' | 'announcement'; tone: 'friendly' | 'professional' | 'celebratory' | 'important'; look: string; picture: string; blocks: Block[]; title: string; brief: string }
export const TEMPLATES: Template[] = [
  { key: 'newsletter', name: 'Monthly newsletter', note: 'A short round-up: two stories side by side, the figures, a button', kind: 'announcement', tone: 'friendly', look: 'website', picture: 'illus:terraces',
    title: 'Your Capital Rooms update', brief: 'A friendly monthly round-up for our landlords.',
    blocks: [{ type: 'columns', left: { title: 'In the market', text: '' }, right: { title: 'At Capital Rooms', text: '' } }, { type: 'figures', areas: [] }, { type: 'button', label: 'Read more on our website', url: 'https://capitalrooms.co.uk/blogs', style: 'solid' }, { type: 'contact' }] },
  { key: 'announcement', name: 'Announcement', note: 'One clear message and a button', kind: 'announcement', tone: 'professional', look: 'website', picture: 'figures:dark',
    title: 'News from Capital Rooms', brief: '', blocks: [{ type: 'button', label: 'Find out more', url: 'https://capitalrooms.co.uk', style: 'solid' }] },
  { key: 'market', name: 'Market update', note: 'Rents and prices with a commentary — each landlord can get their own areas', kind: 'market_update', tone: 'professional', look: 'website', picture: 'illus:chart', title: '', brief: '', blocks: [{ type: 'contact' }] },
  { key: 'seasonal', name: 'Seasonal greeting', note: 'Christmas or New Year: the festive look, a warm message, office hours', kind: 'announcement', tone: 'celebratory', look: 'christmas', picture: 'scene:editorial-winter',
    title: 'Season’s greetings from Capital Rooms', brief: 'A warm seasonal thank-you to our landlords, with our office hours over the holidays and how emergencies are covered.',
    blocks: [{ type: 'quote', text: 'Thank you for trusting us with your properties this year.', by: 'The Capital Rooms team' }, { type: 'contact' }] },
  { key: 'service', name: 'New service or offer', note: 'A picture, what it is, why it helps, a button', kind: 'announcement', tone: 'friendly', look: 'website', picture: 'illus:keys',
    title: 'Something new from Capital Rooms', brief: '', blocks: [{ type: 'columns', left: { title: 'What it is', text: '' }, right: { title: 'Why it helps you', text: '' } }, { type: 'button', label: 'Talk to us about it', url: 'tel:02071129163', style: 'solid' }] },
  { key: 'notice', name: 'Important notice', note: 'A change in the law or how we work — clear and calm, with what to do', kind: 'announcement', tone: 'important', look: 'website', picture: 'illus:calendar',
    title: 'An important change for landlords', brief: '', blocks: [{ type: 'heading', text: 'What you need to do' }, { type: 'text', text: '' }, { type: 'contact' }] },
]
