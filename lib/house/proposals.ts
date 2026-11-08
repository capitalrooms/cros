// Improvement proposals (7 Nov 2026 — migration 273). The office picks improvement notes that have redesigns, adds an
// optional rough cost per space, and the landlord gets an email with a private page: each space's designs to look
// through, a favourite or "not this one", a spending ceiling and comments. Their answer emails the office. Server-only.
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendEmail'
import { PORTAL_URL, ctaButton } from '@/lib/emailWrapper'

const BUCKET = 'property-documents'
const DAYS = 30
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function createProposal(s: SupabaseClient, o: { propertyId: string; ids: string[]; intro: string; costs: Record<string, string>; emails: string[]; byEmail: string | null; req?: Request | null }) {
  const { data: rows } = await s.from('property_improvements').select('id, note, area, room_id, designs, rooms(name)').in('id', o.ids).eq('property_id', o.propertyId) as { data: any[] | null }
  const spaces = (rows ?? []).filter(r => (r.designs ?? []).length).map(r => ({ improvementId: r.id, label: r.room_id ? r.rooms?.name : r.area, note: r.note, cost: o.costs[r.id]?.trim() || null, designs: r.designs }))
  if (!spaces.length) throw new Error('Choose notes that have redesigns — use “Reimagine from a photo” first')
  const { data: prop } = await s.from('properties').select('name, address').eq('id', o.propertyId).maybeSingle() as { data: any }
  const token = randomBytes(18).toString('base64url')
  const { error } = await s.from('improvement_proposals').insert({ property_id: o.propertyId, token, intro: o.intro.slice(0, 3000), spaces, sent_to: o.emails, sent_by: o.byEmail, expires_at: new Date(Date.now() + DAYS * 86_400_000).toISOString() })
  if (error) throw new Error(/improvement_proposals/.test(error.message) ? 'Proposals need migration 273 running in Supabase first' : error.message)
  const house = String(prop?.address || prop?.name || '').split('\n')[0]
  const body = `${o.intro.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
    <p>We’ve put together ${spaces.length === 1 ? 'some ideas' : `ideas for ${spaces.length} spaces`} at ${esc(house)} — ${spaces.map(x => esc(String(x.label))).join(', ')}. Have a look through, choose the ones you like, and let us know roughly what you’d be happy to spend.</p>
    ${ctaButton('See the ideas', `${PORTAL_URL}/proposal/${token}`)}
    <p style="color:#78716c;font-size:12.5px;text-align:center;margin-top:-10px;">This private link works for ${DAYS} days.</p>`
  const r = await sendEmail(o.emails, `Ideas to refresh ${house}`, body, { req: o.req, kind: 'improvements-proposal' })
  if (!r.ok) { await s.from('improvement_proposals').delete().eq('token', token); throw new Error(`It didn’t send: ${r.error}`) }
  for (const sp of spaces) {
    const { data: cur } = await s.from('property_improvements').select('sent_log, status').eq('id', sp.improvementId).maybeSingle() as { data: any }
    await s.from('property_improvements').update({ status: cur?.status === 'noted' ? 'sent_to_landlord' : cur?.status, sent_log: [...(cur?.sent_log ?? []), { to: o.emails, kind: 'proposal', at: new Date().toISOString(), by: o.byEmail }] }).eq('id', sp.improvementId)
  }
  return { token, spaces: spaces.length }
}

export async function proposalByToken(s: SupabaseClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const { data: p } = await s.from('improvement_proposals').select('*, properties(name, address)').eq('token', token).maybeSingle() as { data: any }
  if (!p || new Date(p.expires_at) < new Date()) return null
  return p
}

/** What the landlord sees — the designs as short-lived links, nothing else from CROS. */
export async function proposalView(s: SupabaseClient, p: any) {
  if (!p.viewed_at) await s.from('improvement_proposals').update({ viewed_at: new Date().toISOString() }).eq('id', p.id)
  const spaces = await Promise.all((p.spaces ?? []).map(async (sp: any) => ({
    id: sp.improvementId, label: sp.label, note: sp.note, cost: sp.cost,
    designs: await Promise.all((sp.designs ?? []).map(async (d: any) => ({ style: d.style, brief: d.brief, items: d.items ?? [], cost: d.cost, url: (await s.storage.from(BUCKET).createSignedUrl(d.path, 3600)).data?.signedUrl ?? null }))),
  })))
  return { house: String(p.properties?.address || p.properties?.name || '').split('\n')[0], intro: p.intro, spaces, answers: p.answers, answeredAt: p.answered_at }
}

export async function answerProposal(s: SupabaseClient, p: any, a: any, req?: Request | null) {
  const answers = {
    spaces: Object.fromEntries((p.spaces ?? []).map((sp: any) => {
      const x = a?.spaces?.[sp.improvementId] ?? {}
      const choice = x.choice === 'none' ? 'none' : Number.isInteger(x.choice) && x.choice >= 0 && x.choice < (sp.designs ?? []).length ? x.choice : null
      return [sp.improvementId, { choice, note: String(x.note ?? '').slice(0, 600) }]
    })),
    budget: String(a?.budget ?? '').slice(0, 60), comments: String(a?.comments ?? '').slice(0, 2000),
  }
  await s.from('improvement_proposals').update({ answers, answered_at: new Date().toISOString() }).eq('id', p.id)
  // each note carries the landlord's answer (shown under it on the house's Improvements) and moves on: a favourite → Approved
  const at = new Date().toISOString()
  for (const sp of (p.spaces ?? []) as any[]) {
    const x = answers.spaces[sp.improvementId]; if (!x) continue
    const style = x.choice === 'none' ? null : x.choice === null ? null : String(sp.designs?.[x.choice]?.style ?? '')
    const { data: cur } = await s.from('property_improvements').select('status, sent_log').eq('id', sp.improvementId).maybeSingle() as { data: any }
    await s.from('property_improvements').update({
      sent_log: [...(cur?.sent_log ?? []), { kind: 'answer', choice: x.choice, style, note: x.note, budget: answers.budget, comments: answers.comments, at }],
      ...(style && ['noted', 'sent_to_landlord'].includes(cur?.status) ? { status: 'approved' } : {}), updated_at: at,
    }).eq('id', sp.improvementId)
  }
  const lines = (p.spaces ?? []).map((sp: any) => { const x = answers.spaces[sp.improvementId]; return `<li><strong>${esc(String(sp.label))}</strong>: ${x.choice === 'none' ? 'not this one' : x.choice === null ? 'no choice' : esc(String(sp.designs[x.choice]?.style ?? ''))}${x.note ? ` — “${esc(x.note)}”` : ''}</li>` }).join('')
  const house = String(p.properties?.address || p.properties?.name || '').split('\n')[0]
  await sendEmail([p.sent_by || 'management@capitalrooms.co.uk'], `Landlord answered the ideas for ${house}`, `<p>The landlord has answered the improvement ideas for <strong>${esc(house)}</strong>.</p><ul>${lines}</ul><p><strong>Spending ceiling:</strong> ${esc(answers.budget || 'not given')}</p>${answers.comments ? `<p><strong>Comments:</strong> ${esc(answers.comments)}</p>` : ''}<p>See it on the house’s Improvements.</p>`, { req, kind: 'office-proposal-answer' })
  return answers
}
