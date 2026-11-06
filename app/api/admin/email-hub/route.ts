// The Email hub (6 Nov 2026 — lib/email/themes, lib/email/registry). Administrators only (in no access area).
//   GET                         → { look, themes, kinds }
//   GET ?preview=<theme>[&kind] → the sample email in that theme (HTML), for the gallery
//   POST { look }               → saves which theme is used: for all, on dates, per email
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { buildEmail } from '@/lib/emailWrapper'
import { THEMES, themeByKey, currentLook, forgetLook, LOOK_SETTING, type EmailLook } from '@/lib/email/themes'
import { EMAIL_KINDS, AUDIENCES, kindByKey } from '@/lib/email/registry'

export const dynamic = 'force-dynamic'

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
  const preview = q.get('preview')
  if (preview) {
    const kind = q.get('kind') ? kindByKey(String(q.get('kind'))) : null
    const html = await buildEmail(sample(kind?.name ?? null), { req, theme: themeByKey(preview) })
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ look: await currentLook(), themes: THEMES.map(t => ({ key: t.key, name: t.name, from: t.from, bar: t.bar, page: t.page, rule: t.rule, band: t.band?.bg ?? null })), kinds: EMAIL_KINDS, audiences: AUDIENCES })
}

export async function POST(req: NextRequest) {
  const who = await requireAdministrator(req)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const keys = new Set(THEMES.map(t => t.key))
  const l = b.look ?? {}
  const look: EmailLook = {
    default: keys.has(l.default) ? l.default : 'house',
    schedule: (Array.isArray(l.schedule) ? l.schedule : []).filter((x: any) => keys.has(x?.theme) && ISO.test(x?.from) && ISO.test(x?.to) && x.from <= x.to).slice(0, 12)
      .map((x: any) => ({ theme: x.theme, from: x.from, to: x.to })),
    perEmail: Object.fromEntries(Object.entries(l.perEmail ?? {}).filter(([k, v]) => kindByKey(k)?.own && keys.has(String(v))).map(([k, v]) => [k, String(v)])),
  }
  const { error } = await createServiceClient().from('system_settings').upsert({ key: LOOK_SETTING, value: JSON.stringify(look), updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  forgetLook()
  return NextResponse.json({ ok: true, look })
}
