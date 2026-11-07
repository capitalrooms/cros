// The Email hub (6 Nov 2026 — lib/email/themes, lib/email/registry). Administrators only (in no access area).
//   GET                         → { look, themes, kinds }
//   GET ?preview=<theme>[&kind] → that email in that theme (HTML): its latest real copy (lib/email/samples), or a
//                                 stand-in until one has been sent
//   POST { look }               → saves which theme is used: for all, on dates, per email
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { buildEmail } from '@/lib/emailWrapper'
import { THEMES, themeByKey, currentLook, forgetLook, LOOK_SETTING, type EmailLook } from '@/lib/email/themes'
import { EMAIL_KINDS, AUDIENCES, kindByKey } from '@/lib/email/registry'
import { samplesFor } from '@/lib/email/samples'
import { wordingFor, rewrite, adopt, addRequest, requests } from '@/lib/email/wording'
import { previewFromTemplate, HAS_TEMPLATE } from '@/lib/email/previews'
import { SENDERS } from '@/lib/email/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ISO = /^\d{4}-\d{2}-\d{2}$/

function sample(kindName: string | null): string {
  return `<p>Dear Mr Spalding,</p>
    <p>${kindName ? `This is how <strong>${kindName}</strong> looks in this theme.` : 'This is how an everyday email from Capital Rooms looks in this theme.'} The words, the details and any tables keep their own layout — the theme dresses everything around them.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0 18px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e7e4dd;color:#78716c;font-size:13px;width:140px;">Property</td><td style="padding:8px 0;border-bottom:1px solid #e7e4dd;font-size:13px;font-weight:600;">Room 1, 95 Rope Street</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e7e4dd;color:#78716c;font-size:13px;">Start date</td><td style="padding:8px 0;border-bottom:1px solid #e7e4dd;font-size:13px;font-weight:600;">29 October 2026</td></tr>
    </table>
    <p>Should you need anything further, please do not hesitate to contact us.</p>
    <p>Kind regards,</p>`
}

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  // ?wording=<kind> → its stored wording (current + earlier versions), or that it's built in code
  if (q.get('wording')) {
    const kind = kindByKey(String(q.get('wording')))
    if (!kind) return NextResponse.json({ error: 'Unknown email' }, { status: 404 })
    const s = createServiceClient()
    return NextResponse.json({ stored: kind.slugs?.length ? await wordingFor(s as any, kind.slugs) : [], requests: (await requests(s as any)).filter(r => r.kind === kind.key).slice(0, 10) })
  }
  const preview = q.get('preview')
  if (preview) {
    const kind = q.get('kind') ? kindByKey(String(q.get('kind'))) : null
    // its own template with example details first; then its latest real copy; then a stand-in
    const fromTemplate = kind ? await previewFromTemplate(kind.key, themeByKey(preview)) : null
    if (fromTemplate) return new NextResponse(fromTemplate, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
    const real = kind ? (await samplesFor([kind.key]))[kind.key] : null
    const html = await buildEmail(real ? real.body : sample(kind?.name ?? null), { req, theme: themeByKey(preview), hero: real?.hero ?? undefined })
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const real = await samplesFor().catch(() => ({} as Record<string, any>))
  return NextResponse.json({ senders: SENDERS, templates: [...HAS_TEMPLATE], examples: Object.fromEntries(Object.entries(real).map(([k, v]) => [k, v.updated_at])), look: await currentLook(), themes: THEMES.map(t => ({ key: t.key, name: t.name, from: t.from, bar: t.bar, page: t.page, rule: t.rule, band: t.band?.bg ?? null })), kinds: EMAIL_KINDS, audiences: AUDIENCES })
}

export async function POST(req: NextRequest) {
  const who = await requireAdministrator(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  // wording: { action: 'rewrite', kind, slug, instruction, n } → versions · 'adopt' → saved as the new default · 'request' → logged
  if (b.action === 'rewrite' || b.action === 'adopt' || b.action === 'request') {
    const kind = kindByKey(String(b.kind ?? ''))
    if (!kind) return NextResponse.json({ error: 'Unknown email' }, { status: 404 })
    const s = createServiceClient()
    try {
      if (b.action === 'request') { if (!String(b.instruction ?? '').trim()) return NextResponse.json({ error: 'Say what to change' }, { status: 400 }); await addRequest(s as any, kind.key, String(b.instruction), who.email); return NextResponse.json({ ok: true }) }
      if (!kind.slugs?.includes(String(b.slug))) return NextResponse.json({ error: 'That wording isn’t stored for this email' }, { status: 400 })
      if (b.action === 'adopt') { await adopt(s as any, b.slug, { subject_line: String(b.subject_line ?? ''), template_text: String(b.template_text ?? '') }); return NextResponse.json({ ok: true }) }
      const cur = (await wordingFor(s as any, [b.slug]))[0]?.current
      if (!cur) return NextResponse.json({ error: 'No stored wording yet' }, { status: 400 })
      const versions = await rewrite(cur, String(b.instruction ?? '').slice(0, 1500) || 'Tidy it up and make it read better', b.n === 5 ? 5 : 1)
      if (!versions.length) return NextResponse.json({ error: 'The new versions dropped some of the details that get filled in — try again' }, { status: 502 })
      return NextResponse.json({ versions })
    } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 }) }
  }
  const keys = new Set(THEMES.map(t => t.key))
  const l = b.look ?? {}
  const look: EmailLook = {
    default: keys.has(l.default) ? l.default : 'house',
    schedule: (Array.isArray(l.schedule) ? l.schedule : []).filter((x: any) => keys.has(x?.theme) && ISO.test(x?.from) && ISO.test(x?.to) && x.from <= x.to).slice(0, 12)
      .map((x: any) => ({ theme: x.theme, from: x.from, to: x.to })),
    perEmail: Object.fromEntries(Object.entries(l.perEmail ?? {}).filter(([k, v]) => kindByKey(k) && keys.has(String(v))).map(([k, v]) => [k, String(v)])),
  }
  const { error } = await createServiceClient().from('system_settings').upsert({ key: LOOK_SETTING, value: JSON.stringify(look), updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  forgetLook()
  return NextResponse.json({ ok: true, look })
}
